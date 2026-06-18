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

describe('material-type-specific fields', () => {
  it('persists and reads back Thesis fields', async () => {
    const { id } = await db.adminCreateBook(iid, {
      title: 'A Study of Things', material_type: 'THESIS', author: 'Doe, Jane',
      thesis_degree: 'PhD', thesis_institution: 'State University', thesis_advisor: 'Smith, John',
    }, []);
    const got = await db.adminGetBook(id) as Record<string, unknown>;
    expect(got.thesis_degree).toBe('PhD');
    expect(got.thesis_institution).toBe('State University');
    expect(got.thesis_advisor).toBe('Smith, John');
  });

  it('persists Serial frequency and an empty author', async () => {
    const { id } = await db.adminCreateBook(iid, {
      title: 'Journal of Examples', material_type: 'SERIAL', author: '',
      frequency: 'Quarterly',
    }, []);
    const got = await db.adminGetBook(id) as Record<string, unknown>;
    expect(got.frequency).toBe('Quarterly');
    expect(got.author).toBe('');
  });

  it('persists Article container_title and pages', async () => {
    const { id } = await db.adminCreateBook(iid, {
      title: 'On Examples', material_type: 'ARTICLE', author: 'Roe, Sam',
      container_title: 'Journal of Examples', pages: '44-58', volume: '12', issue_number: '3',
    }, []);
    const got = await db.adminGetBook(id) as Record<string, unknown>;
    expect(got.container_title).toBe('Journal of Examples');
    expect(got.pages).toBe('44-58');
    expect(got.volume).toBe('12');
    expect(got.issue_number).toBe('3');
  });

  it('updates the new fields', async () => {
    const { id } = await db.adminCreateBook(iid, { title: 'T', material_type: 'THESIS', author: 'A' }, []);
    await db.adminUpdateBook(id, { title: 'T', material_type: 'THESIS', author: 'A', thesis_degree: 'MSc' });
    const got = await db.adminGetBook(id) as Record<string, unknown>;
    expect(got.thesis_degree).toBe('MSc');
  });
});
