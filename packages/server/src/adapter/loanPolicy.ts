import type {
  LoanRule, CategoryLimit, ResolvedPolicy, PolicyViolation,
  RuleUserType, RuleMaterialType,
} from '@bookleaf/types';

export interface PatronInput { user_type: string | null }
export interface ResourceInput { material_type: string; loan_period_days: number | null; is_loanable: boolean }
export interface CheckoutCounters { activeTotal: number; activeOfType: number; unpaidFines: number }

export class PolicyError extends Error {
  readonly violations: PolicyViolation[];
  constructor(violations: PolicyViolation[]) {
    super('Checkout blocked by loan policy');
    this.name = 'PolicyError';
    this.violations = violations;
  }
}

const ANY = 'ANY';

export function resolvePolicy(
  rules: LoanRule[],
  limits: CategoryLimit[],
  patron: PatronInput,
  resource: ResourceInput,
): ResolvedPolicy {
  const ut: RuleUserType = (patron.user_type ?? ANY) as RuleUserType;
  const mt = resource.material_type as RuleMaterialType;

  const find = (u: RuleUserType, m: RuleMaterialType) =>
    rules.find(r => r.user_type === u && r.material_type === m);
  const rule =
    find(ut, mt) ?? find(ut, ANY) ?? find(ANY, mt) ?? find(ANY, ANY);
  if (!rule) throw new Error('No loan rule resolved (missing ANY/ANY default)');

  const limitRow =
    limits.find(l => l.user_type === ut) ?? limits.find(l => l.user_type === ANY);

  const period = resource.loan_period_days ?? rule.loan_period_days;
  return {
    loan_period_days: period,
    type_limit: rule.type_limit,
    overall_limit: limitRow?.overall_limit ?? null,
    max_renewals: rule.max_renewals,
    renewal_period_days: rule.renewal_period_days ?? period,
    fine_per_day: rule.fine_per_day,
    grace_period_days: rule.grace_period_days,
    fine_max: rule.fine_max,
    is_loanable: rule.is_loanable && resource.is_loanable,
    is_holdable: rule.is_holdable,
    fines_block_threshold: limitRow?.fines_block_threshold ?? 0,
  };
}

export function evaluateCheckout(
  policy: ResolvedPolicy,
  counters: CheckoutCounters,
): PolicyViolation[] {
  const v: PolicyViolation[] = [];
  if (!policy.is_loanable) {
    v.push({ reason_code: 'not_loanable', message: 'This item is not loanable.' });
  }
  if (policy.overall_limit != null && counters.activeTotal >= policy.overall_limit) {
    v.push({ reason_code: 'over_overall_limit', message: `Borrowing limit reached (${policy.overall_limit} items).` });
  }
  if (policy.type_limit != null && counters.activeOfType >= policy.type_limit) {
    v.push({ reason_code: 'over_type_limit', message: `Limit for this material type reached (${policy.type_limit}).` });
  }
  if (policy.fines_block_threshold > 0 && counters.unpaidFines > policy.fines_block_threshold) {
    v.push({ reason_code: 'fines_block', message: `Unpaid fines (₱${counters.unpaidFines}) exceed the limit of ₱${policy.fines_block_threshold}.` });
  }
  return v;
}
