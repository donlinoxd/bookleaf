import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createSqliteAdapter } from './sqlite';

const drizzleDir = join(__dirname, '../../../db/drizzle');
function migrationSqls(): string[] {
  return readdirSync(drizzleDir).filter(f => /^\d+_.*\.sql$/.test(f)).sort()
    .map(f => readFileSync(join(drizzleDir, f), 'utf8'));
}

let db: ReturnType<typeof createSqliteAdapter>;
let iid: number;
let raw: { prepare(sql: string): { get(...a: unknown[]): unknown; run(...a: unknown[]): { lastInsertRowid: number | bigint }; all(...a: unknown[]): unknown[] } };

beforeEach(() => {
  db = createSqliteAdapter(':memory:', ...migrationSqls());
  iid = (db as unknown as { __seedTestInstitution(): number }).__seedTestInstitution();
  raw = (db as unknown as { __raw(): typeof raw }).__raw();
});

function makeMember(idNumber: string, isActive = 1, userType = 'student'): number {
  const r = raw.prepare(
    "INSERT INTO users (institution_id, name, role, id_number, pin_hash, user_type, is_active) VALUES (?, 'Pat', 'member', ?, 'x', ?, ?)",
  ).run(iid, idNumber, userType, isActive);
  return Number(r.lastInsertRowid);
}
// Creates a resource + one copy with the given accession, returns { resourceId, copyId }.
function makeCopy(accession: string): { resourceId: number; copyId: number } {
  const res = raw.prepare(
    "INSERT INTO resources (institution_id, material_type, title, author, total_copies, available_copies) VALUES (?, 'BOOK', 'T', 'A', 1, 1)",
  ).run(iid);
  const resourceId = Number(res.lastInsertRowid);
  const copy = raw.prepare(
    "INSERT INTO resource_copies (resource_id, copy_number, accession_number) VALUES (?, 1, ?)",
  ).run(resourceId, accession);
  return { resourceId, copyId: Number(copy.lastInsertRowid) };
}

describe('adminResolvePatron', () => {
  it('returns a summary with active loans and unpaid fines', async () => {
    const uid = makeMember('CARD-1');
    const { copyId } = makeCopy('ACC-1');
    await db.adminCheckout(copyId, uid); // 1 active loan
    raw.prepare("INSERT INTO borrowing_records (copy_id, user_id, due_date, returned_at) VALUES (?, ?, datetime('now','-1 day'), datetime('now'))").run(copyId, uid);
    const lastBorrow = raw.prepare('SELECT id FROM borrowing_records ORDER BY id DESC LIMIT 1').get() as { id: number };
    raw.prepare('INSERT INTO fines (borrowing_id, amount, paid) VALUES (?, 12, 0)').run(lastBorrow.id);

    const p = await db.adminResolvePatron(iid, 'CARD-1');
    expect(p).not.toBeNull();
    expect(p!.userId).toBe(uid);
    expect(p!.is_active).toBe(true);
    expect(p!.active_loans).toBe(1);
    expect(p!.unpaid_fines).toBe(12);
  });

  it('returns null for an unknown card', async () => {
    expect(await db.adminResolvePatron(iid, 'NOPE')).toBeNull();
  });

  it('flags an inactive patron (returned, not null)', async () => {
    makeMember('CARD-OFF', 0);
    const p = await db.adminResolvePatron(iid, 'CARD-OFF');
    expect(p).not.toBeNull();
    expect(p!.is_active).toBe(false);
  });
});
