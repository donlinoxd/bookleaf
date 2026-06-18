import { describe, it, expect, beforeEach } from 'vitest';
import { PolicyError } from './loanPolicy';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createSqliteAdapter } from './sqlite';

const drizzleDir = join(__dirname, '../../../db/drizzle');
function migrationSqls(): string[] {
  return readdirSync(drizzleDir)
    .filter(f => /^\d+_.*\.sql$/.test(f))
    .sort()
    .map(f => readFileSync(join(drizzleDir, f), 'utf8'));
}

let db: ReturnType<typeof createSqliteAdapter>;
let iid: number;
let raw: { prepare(sql: string): { get(...a: unknown[]): unknown; all(...a: unknown[]): unknown[]; run(...a: unknown[]): unknown } };

beforeEach(() => {
  db = createSqliteAdapter(':memory:', ...migrationSqls());
  iid = (db as unknown as { __seedTestInstitution(): number }).__seedTestInstitution();
  raw = (db as unknown as { __raw(): typeof raw }).__raw();
});

describe('0005 migration', () => {
  it('creates the loan_rules, category_limits, and circ_overrides tables', () => {
    const names = (raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name);
    expect(names).toEqual(expect.arrayContaining(['loan_rules', 'category_limits', 'circ_overrides']));
  });
});

describe('policy resolution', () => {
  async function makeMember(user_type: string | null) {
    const r = raw.prepare(
      "INSERT INTO users (institution_id, name, role, id_number, pin_hash, user_type) VALUES (?, 'M', 'member', ?, 'x', ?)",
    ).run(iid, 'ID' + Math.floor(performance.now() * 1000), user_type) as { lastInsertRowid: number };
    return Number(r.lastInsertRowid);
  }

  it('returns the seeded default (== old global settings) when no rules were added', async () => {
    const uid = await makeMember('student');
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', material_type: 'BOOK' }, []);
    const p = await db.adminResolvePolicy(iid, uid, id);
    expect(p.loan_period_days).toBe(7);       // DEFAULT_SETTINGS.max_borrow_days
    expect(p.fine_per_day).toBe(5);           // DEFAULT_SETTINGS.fine_per_day
    expect(p.max_renewals).toBe(2);           // DEFAULT_SETTINGS.max_renewals
    expect(p.overall_limit).toBe(3);          // DEFAULT_SETTINGS.max_books_per_member
    expect(p.fines_block_threshold).toBe(0);  // disabled by default
  });

  it('applies a per-item loan_period_days override for the period only', async () => {
    const uid = await makeMember('student');
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', material_type: 'BOOK', loan_period_days: 21 }, []);
    const p = await db.adminResolvePolicy(iid, uid, id);
    expect(p.loan_period_days).toBe(21);
    expect(p.fine_per_day).toBe(5);
  });

  it('prefers a specific (faculty, AUDIOVISUAL) rule over the default', async () => {
    raw.prepare(
      "INSERT INTO loan_rules (institution_id, user_type, material_type, loan_period_days, max_renewals, fine_per_day) VALUES (?, 'faculty', 'AUDIOVISUAL', 3, 0, 10)",
    ).run(iid);
    const uid = await makeMember('faculty');
    const { id } = await db.adminCreateBook(iid, { title: 'DVD', author: 'A', material_type: 'AUDIOVISUAL' }, []);
    const p = await db.adminResolvePolicy(iid, uid, id);
    expect(p.loan_period_days).toBe(3);
    expect(p.fine_per_day).toBe(10);
  });
});

describe('checkout enforcement', () => {
  async function member(user_type: string) {
    const r = raw.prepare("INSERT INTO users (institution_id, name, role, id_number, pin_hash, user_type) VALUES (?, 'M', 'member', ?, 'x', ?)")
      .run(iid, 'EID' + Math.floor(performance.now() * 1000), user_type) as { lastInsertRowid: number };
    return Number(r.lastInsertRowid);
  }
  async function bookWithCopy() {
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', material_type: 'BOOK' }, [{ barcode: 'BC' + Math.floor(performance.now() * 1000) }]);
    const copy = raw.prepare('SELECT id FROM resource_copies WHERE resource_id = ? LIMIT 1').get(id) as { id: number };
    return { resourceId: id, copyId: copy.id };
  }

  it('allows a normal checkout under the default policy', async () => {
    const uid = await member('student');
    const { copyId } = await bookWithCopy();
    const res = await db.adminCheckout(copyId, uid);
    expect(res.borrowingId).toBeGreaterThan(0);
  });

  it('blocks checkout over the overall limit and does NOT claim the copy', async () => {
    // overall_limit defaults to 3; give this category a limit of 1 for a sharp test
    raw.prepare("INSERT INTO category_limits (institution_id, user_type, overall_limit, fines_block_threshold) VALUES (?, 'student', 1, 0)").run(iid);
    const uid = await member('student');
    const a = await bookWithCopy();
    const b = await bookWithCopy();
    await db.adminCheckout(a.copyId, uid);
    await expect(db.adminCheckout(b.copyId, uid)).rejects.toBeInstanceOf(PolicyError);
    const status = raw.prepare('SELECT status FROM resource_copies WHERE id = ?').get(b.copyId) as { status: string };
    expect(status.status).toBe('available');
  });

  it('proceeds when overridden and writes a circ_overrides row', async () => {
    raw.prepare("INSERT INTO category_limits (institution_id, user_type, overall_limit, fines_block_threshold) VALUES (?, 'student', 1, 0)").run(iid);
    const uid = await member('student');
    const a = await bookWithCopy();
    const b = await bookWithCopy();
    await db.adminCheckout(a.copyId, uid);
    const res = await db.adminCheckout(b.copyId, uid, { override: true, actedByUserId: uid, institutionId: iid, note: 'dean approved' });
    expect(res.borrowingId).toBeGreaterThan(0);
    const row = raw.prepare('SELECT reason_code, note FROM circ_overrides WHERE patron_user_id = ?').get(uid) as { reason_code: string; note: string };
    expect(row.reason_code).toBe('over_overall_limit');
    expect(row.note).toBe('dean approved');
  });

  it('not_loanable blocks at checkout end-to-end', async () => {
    const uid = await member('student');
    const { resourceId, copyId } = await bookWithCopy();
    raw.prepare('UPDATE resources SET is_loanable = 0 WHERE id = ?').run(resourceId);

    let err: unknown;
    try { await db.adminCheckout(copyId, uid); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(PolicyError);
    expect((err as PolicyError).violations.map(v => v.reason_code)).toContain('not_loanable');

    const status = raw.prepare('SELECT status FROM resource_copies WHERE id = ?').get(copyId) as { status: string };
    expect(status.status).toBe('available');
  });

  it('a checkout tripping TWO violations writes TWO circ_overrides rows on override', async () => {
    raw.prepare("INSERT INTO category_limits (institution_id, user_type, overall_limit, fines_block_threshold) VALUES (?, 'student', 1, 0)").run(iid);
    const uid = await member('student');

    // Check out one loanable item to consume the overall limit
    const a = await bookWithCopy();
    await db.adminCheckout(a.copyId, uid);

    // Create a second book and mark it non-loanable
    const b = await bookWithCopy();
    raw.prepare('UPDATE resources SET is_loanable = 0 WHERE id = ?').run(b.resourceId);

    // Should trip BOTH over_overall_limit AND not_loanable
    const res = await db.adminCheckout(b.copyId, uid, { override: true, actedByUserId: uid, institutionId: iid, note: 'approved' });
    expect(res.borrowingId).toBeGreaterThan(0);

    const rows = raw.prepare('SELECT reason_code FROM circ_overrides WHERE patron_user_id = ?').all(uid) as { reason_code: string }[];
    expect(rows.length).toBe(2);
    expect(rows.map(r => r.reason_code).sort()).toEqual(['not_loanable', 'over_overall_limit']);
  });
});

describe('renewal + return use resolved policy', () => {
  async function member(user_type: string) {
    const r = raw.prepare("INSERT INTO users (institution_id, name, role, id_number, pin_hash, user_type) VALUES (?, 'M', 'member', ?, 'x', ?)")
      .run(iid, 'RID' + Math.floor(performance.now() * 1000), user_type) as { lastInsertRowid: number };
    return Number(r.lastInsertRowid);
  }
  async function bookCopy(material_type = 'BOOK') {
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', material_type }, [{ barcode: 'RB' + Math.floor(performance.now() * 1000) }]);
    const copy = raw.prepare('SELECT id FROM resource_copies WHERE resource_id = ? LIMIT 1').get(id) as { id: number };
    return copy.id;
  }

  it('blocks renewal past the rule max_renewals', async () => {
    raw.prepare("INSERT INTO loan_rules (institution_id, user_type, material_type, loan_period_days, max_renewals, fine_per_day) VALUES (?, 'student', 'BOOK', 7, 0, 5)").run(iid);
    const uid = await member('student');
    const copyId = await bookCopy('BOOK');
    const { borrowingId } = await db.adminCheckout(copyId, uid);
    await expect(db.renewBorrow(borrowingId, uid)).rejects.toThrow(/renewal/i);
  });

  it('computes the return fine from the rule fine_per_day and caps at fine_max', async () => {
    // student/BOOK: ₱10/day, capped at ₱15
    raw.prepare("INSERT INTO loan_rules (institution_id, user_type, material_type, loan_period_days, max_renewals, fine_per_day, grace_period_days, fine_max) VALUES (?, 'student', 'BOOK', 7, 2, 10, 0, 15)").run(iid);
    const uid = await member('student');
    const copyId = await bookCopy('BOOK');
    const { borrowingId } = await db.adminCheckout(copyId, uid);
    // Force the loan 5 days overdue.
    raw.prepare("UPDATE borrowing_records SET due_date = datetime('now', '-5 days') WHERE id = ?").run(borrowingId);
    const fine = await db.adminReturn(borrowingId, 'good') as { amount: number } | null;
    expect(fine?.amount).toBe(15); // 5×10=50 capped to 15
  });
});

describe('loan-rule CRUD', () => {
  it('lists (with the ensured default), upserts, and deletes a rule', async () => {
    const initial = await db.adminListLoanRules(iid);
    expect(initial.some(r => r.user_type === 'ANY' && r.material_type === 'ANY')).toBe(true);

    const { id } = await db.adminUpsertLoanRule(iid, {
      user_type: 'faculty', material_type: 'AUDIOVISUAL', loan_period_days: 3, type_limit: 2,
      max_renewals: 0, renewal_period_days: null, fine_per_day: 10, grace_period_days: 0,
      fine_max: 50, is_loanable: true, is_holdable: true,
    });
    expect(id).toBeGreaterThan(0);

    await db.adminUpsertLoanRule(iid, {
      id, user_type: 'faculty', material_type: 'AUDIOVISUAL', loan_period_days: 5, type_limit: 2,
      max_renewals: 1, renewal_period_days: null, fine_per_day: 10, grace_period_days: 0,
      fine_max: 50, is_loanable: true, is_holdable: true,
    });
    const updated = (await db.adminListLoanRules(iid)).find(r => r.id === id);
    expect(updated?.loan_period_days).toBe(5);

    await db.adminDeleteLoanRule(id);
    expect((await db.adminListLoanRules(iid)).some(r => r.id === id)).toBe(false);
  });

  it('upserts a category limit', async () => {
    await db.adminUpsertCategoryLimit(iid, { user_type: 'student', overall_limit: 8, fines_block_threshold: 100 });
    const got = (await db.adminGetCategoryLimits(iid)).find(l => l.user_type === 'student');
    expect(got?.overall_limit).toBe(8);
    expect(got?.fines_block_threshold).toBe(100);
  });
});
