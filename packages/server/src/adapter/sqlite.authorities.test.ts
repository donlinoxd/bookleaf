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

describe('adminUpdateAuthority', () => {
  it('updates name and recomputes the dedupe key', async () => {
    const { id } = await db.adminCreateAuthority({ institutionId: iid, name: 'Old Name', type: 'subject' });
    await db.adminUpdateAuthority(id, { name: 'New Name' });
    const got = await db.adminGetAuthority(id);
    expect(got?.name).toBe('New Name');
    expect(got?.normalized_name).toBe('new name');
  });
});

describe('adminDeleteAuthority', () => {
  it('deletes an unreferenced authority', async () => {
    const { id } = await db.adminCreateAuthority({ institutionId: iid, name: 'Orphan', type: 'subject' });
    await db.adminDeleteAuthority(id);
    expect(await db.adminGetAuthority(id)).toBeNull();
  });

  it('refuses to delete an authority still in use', async () => {
    const { id } = await db.adminCreateAuthority({ institutionId: iid, name: 'Used Subject', type: 'subject' });
    await db.adminCreateBook(iid, { title: 'T', author: 'A', subject_authority_ids: [id] }, []);
    await expect(db.adminDeleteAuthority(id)).rejects.toThrow(/in use/i);
  });
});

describe('adminMergeAuthorities', () => {
  it('repoints author links, folds loser names into survivor variants, deletes losers, and re-syncs denormalized author text', async () => {
    const survivor = await db.adminCreateAuthority({ institutionId: iid, name: 'Twain, Mark', type: 'personal' });
    const loser = await db.adminCreateAuthority({ institutionId: iid, name: 'Clemens, Samuel', type: 'personal' });
    const { id: bookId } = await db.adminCreateBook(iid, { title: 'Tom Sawyer', author: 'Clemens, Samuel', author_authority_id: loser.id }, []);

    await db.adminMergeAuthorities(survivor.id, [loser.id]);

    expect(await db.adminGetAuthority(loser.id)).toBeNull();
    const merged = await db.adminGetAuthority(survivor.id);
    expect(merged?.variants).toContain('Clemens, Samuel');
    const book = await db.adminGetBook(bookId) as { author_authority_id: number; author: string };
    expect(book.author_authority_id).toBe(survivor.id);
    expect(book.author).toBe('Twain, Mark'); // denormalized text re-synced
  });

  it('drops redundant subject links when both survivor and loser are attached to the same resource', async () => {
    const survivor = await db.adminCreateAuthority({ institutionId: iid, name: 'WWII', type: 'subject' });
    const loser = await db.adminCreateAuthority({ institutionId: iid, name: 'World War 2', type: 'subject' });
    await db.adminCreateBook(iid, { title: 'History', author: 'A', subject_authority_ids: [survivor.id, loser.id] }, []);

    await db.adminMergeAuthorities(survivor.id, [loser.id]);

    const merged = await db.adminGetAuthority(survivor.id);
    expect(merged?.usage_count).toBe(1); // single subject link remains after dedupe
  });
});

describe('book ↔ authority linking', () => {
  it('writes subject links and denormalized subject_headings on create', async () => {
    const s1 = await db.adminCreateAuthority({ institutionId: iid, name: 'History', type: 'subject' });
    const s2 = await db.adminCreateAuthority({ institutionId: iid, name: 'War', type: 'subject' });
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', subject_authority_ids: [s1.id, s2.id] }, []);
    const book = await db.adminGetBook(id) as { subject_headings: string[] | null };
    expect(book.subject_headings?.sort()).toEqual(['History', 'War']);
    expect((await db.adminGetAuthority(s1.id))?.usage_count).toBe(1);
  });

  it('replaces subject links on update', async () => {
    const s1 = await db.adminCreateAuthority({ institutionId: iid, name: 'History', type: 'subject' });
    const s2 = await db.adminCreateAuthority({ institutionId: iid, name: 'Science', type: 'subject' });
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', subject_authority_ids: [s1.id] }, []);
    await db.adminUpdateBook(id, { title: 'T', author: 'A', is_loanable: true, subject_authority_ids: [s2.id] });
    expect((await db.adminGetAuthority(s1.id))?.usage_count).toBe(0);
    expect((await db.adminGetAuthority(s2.id))?.usage_count).toBe(1);
  });

  it('syncs publisher text from a linked publisher authority on create', async () => {
    const p = await db.adminCreateAuthority({ institutionId: iid, name: 'Penguin', type: 'publisher' });
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', publisher_authority_id: p.id }, []);
    const book = await db.adminGetBook(id) as { publisher: string; publisher_authority_id: number };
    expect(book.publisher).toBe('Penguin');
    expect(book.publisher_authority_id).toBe(p.id);
  });
});
