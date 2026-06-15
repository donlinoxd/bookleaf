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

beforeEach(() => {
  db = createSqliteAdapter(':memory:', ...migrationSqls());
  iid = (db as unknown as { __seedTestInstitution(): number }).__seedTestInstitution();
});

describe('adminCreateAuthority (get-or-create)', () => {
  it('creates a new authority and returns its id', async () => {
    const { id } = await db.adminCreateAuthority({ institutionId: iid, name: 'Tolkien, J.R.R.', type: 'personal' });
    expect(id).toBeGreaterThan(0);
  });

  it('returns the existing id for a case/whitespace-equivalent name+type', async () => {
    const a = await db.adminCreateAuthority({ institutionId: iid, name: 'Tolkien', type: 'personal' });
    const b = await db.adminCreateAuthority({ institutionId: iid, name: '  TOLKIEN ', type: 'personal' });
    expect(b.id).toBe(a.id);
  });

  it('treats the same name under different types as distinct', async () => {
    const a = await db.adminCreateAuthority({ institutionId: iid, name: 'History', type: 'subject' });
    const b = await db.adminCreateAuthority({ institutionId: iid, name: 'History', type: 'publisher' });
    expect(b.id).not.toBe(a.id);
  });

  it('persists variants as a JSON array', async () => {
    const { id } = await db.adminCreateAuthority({ institutionId: iid, name: 'Twain, Mark', type: 'personal', variants: ['Clemens, Samuel'] });
    const got = await db.adminGetAuthority(id);
    expect(got?.variants).toEqual(['Clemens, Samuel']);
  });
});

describe('adminListAuthorities', () => {
  it('filters by type and matches name or variants on q', async () => {
    await db.adminCreateAuthority({ institutionId: iid, name: 'Twain, Mark', type: 'personal', variants: ['Clemens, Samuel'] });
    await db.adminCreateAuthority({ institutionId: iid, name: 'History', type: 'subject' });
    const persons = await db.adminListAuthorities(iid, { type: 'personal' });
    expect(persons).toHaveLength(1);
    const byVariant = await db.adminListAuthorities(iid, { q: 'clemens' });
    expect(byVariant.map(a => a.name)).toContain('Twain, Mark');
  });
});
