import { describe, it, expect, beforeEach } from 'vitest';
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
let raw: { prepare(sql: string): { get(...a: unknown[]): unknown; all(...a: unknown[]): unknown[] } };

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
