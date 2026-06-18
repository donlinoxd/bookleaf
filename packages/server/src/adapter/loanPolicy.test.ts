import { describe, it, expect } from 'vitest';
import { resolvePolicy, evaluateCheckout } from './loanPolicy';
import type { LoanRule, CategoryLimit } from '@bookleaf/types';

function rule(p: Partial<LoanRule>): LoanRule {
  return {
    id: 0, institution_id: 1, user_type: 'ANY', material_type: 'ANY',
    loan_period_days: 7, type_limit: null, max_renewals: 2, renewal_period_days: null,
    fine_per_day: 5, grace_period_days: 0, fine_max: null, is_loanable: true, is_holdable: true,
    ...p,
  };
}
function limit(p: Partial<CategoryLimit>): CategoryLimit {
  return { id: 0, institution_id: 1, user_type: 'ANY', overall_limit: null, fines_block_threshold: 0, ...p };
}

describe('resolvePolicy', () => {
  it('picks the most specific (user_type, material_type) rule', () => {
    const rules = [
      rule({ id: 1, user_type: 'ANY', material_type: 'ANY', loan_period_days: 7 }),
      rule({ id: 2, user_type: 'faculty', material_type: 'ANY', loan_period_days: 30 }),
      rule({ id: 3, user_type: 'faculty', material_type: 'AUDIOVISUAL', loan_period_days: 3 }),
    ];
    const p = resolvePolicy(rules, [limit({})], { user_type: 'faculty' }, { material_type: 'AUDIOVISUAL', loan_period_days: null, is_loanable: true });
    expect(p.loan_period_days).toBe(3);
  });

  it('falls back through (ut,ANY) then (ANY,mt) then (ANY,ANY)', () => {
    const rules = [
      rule({ id: 1, user_type: 'ANY', material_type: 'ANY', loan_period_days: 7 }),
      rule({ id: 2, user_type: 'ANY', material_type: 'BOOK', loan_period_days: 14 }),
    ];
    const p = resolvePolicy(rules, [limit({})], { user_type: 'student' }, { material_type: 'BOOK', loan_period_days: null, is_loanable: true });
    expect(p.loan_period_days).toBe(14);
  });

  it('coalesces null user_type to ANY', () => {
    const rules = [rule({ id: 1, loan_period_days: 9 })];
    const p = resolvePolicy(rules, [limit({})], { user_type: null }, { material_type: 'BOOK', loan_period_days: null, is_loanable: true });
    expect(p.loan_period_days).toBe(9);
  });

  it('lets a per-item loan_period_days override the rule period only', () => {
    const rules = [rule({ id: 1, loan_period_days: 7, fine_per_day: 5 })];
    const p = resolvePolicy(rules, [limit({})], { user_type: 'student' }, { material_type: 'BOOK', loan_period_days: 21, is_loanable: true });
    expect(p.loan_period_days).toBe(21);
    expect(p.fine_per_day).toBe(5);
  });

  it('resolves renewal_period_days to the effective loan period when null', () => {
    const rules = [rule({ id: 1, loan_period_days: 7, renewal_period_days: null })];
    const p = resolvePolicy(rules, [limit({})], { user_type: 'student' }, { material_type: 'BOOK', loan_period_days: 21, is_loanable: true });
    expect(p.renewal_period_days).toBe(21);
  });

  it('ANDs rule.is_loanable with resource.is_loanable', () => {
    const rules = [rule({ id: 1, is_loanable: true })];
    const p = resolvePolicy(rules, [limit({})], { user_type: 'student' }, { material_type: 'BOOK', loan_period_days: null, is_loanable: false });
    expect(p.is_loanable).toBe(false);
  });

  it('reads overall_limit + threshold from the category-specific limit, else ANY', () => {
    const limits = [limit({ user_type: 'ANY', overall_limit: 3 }), limit({ user_type: 'student', overall_limit: 10, fines_block_threshold: 50 })];
    const p = resolvePolicy([rule({ id: 1 })], limits, { user_type: 'student' }, { material_type: 'BOOK', loan_period_days: null, is_loanable: true });
    expect(p.overall_limit).toBe(10);
    expect(p.fines_block_threshold).toBe(50);
  });
});

describe('evaluateCheckout', () => {
  const base = resolvePolicy([rule({ id: 1, type_limit: 2 })], [limit({ overall_limit: 5, fines_block_threshold: 100 })],
    { user_type: 'student' }, { material_type: 'BOOK', loan_period_days: null, is_loanable: true });

  it('flags not_loanable', () => {
    const p = { ...base, is_loanable: false };
    expect(evaluateCheckout(p, { activeTotal: 0, activeOfType: 0, unpaidFines: 0 }).map(v => v.reason_code)).toContain('not_loanable');
  });
  it('flags over_overall_limit at the cap', () => {
    expect(evaluateCheckout(base, { activeTotal: 5, activeOfType: 0, unpaidFines: 0 }).map(v => v.reason_code)).toContain('over_overall_limit');
  });
  it('flags over_type_limit at the type cap', () => {
    expect(evaluateCheckout(base, { activeTotal: 0, activeOfType: 2, unpaidFines: 0 }).map(v => v.reason_code)).toContain('over_type_limit');
  });
  it('flags fines_block only when threshold > 0 and exceeded', () => {
    expect(evaluateCheckout(base, { activeTotal: 0, activeOfType: 0, unpaidFines: 150 }).map(v => v.reason_code)).toContain('fines_block');
    const disabled = { ...base, fines_block_threshold: 0 };
    expect(evaluateCheckout(disabled, { activeTotal: 0, activeOfType: 0, unpaidFines: 999 })).toHaveLength(0);
  });
  it('passes cleanly under all limits', () => {
    expect(evaluateCheckout(base, { activeTotal: 1, activeOfType: 1, unpaidFines: 10 })).toHaveLength(0);
  });
});
