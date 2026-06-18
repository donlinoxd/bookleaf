import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createSqliteAdapter } from './sqlite';
import type { NormalizedRow, ImportJobInput } from '../import/types';

const drizzleDir = join(__dirname, '../../../db/drizzle');

function migrationSqls(): string[] {
  return readdirSync(drizzleDir)
    .filter(f => /^\d+_.*\.sql$/.test(f))
    .sort()
    .map(f => readFileSync(join(drizzleDir, f), 'utf8'));
}

function norm(over: Partial<NormalizedRow>): NormalizedRow {
  return {
    rowIndex: 0, title: 'T', author: 'A', isbn: null, isbnKey: null, issn: null, publisher: null,
    year: null, genre: null, description: null, subtitle: null, edition: null, volume: null,
    series_title: null, language: null, call_number: null, call_number_type: null,
    material_type: 'BOOK', subject_headings: null,
    issue_number: null, doi: null, url: null, frequency: null, container_title: null,
    pages: null, thesis_degree: null, thesis_institution: null, thesis_advisor: null,
    copies: 1, accession_number: null, barcode: null, shelf_location: null, ...over,
  };
}

let db: ReturnType<typeof createSqliteAdapter>;
let institutionId: number;

beforeEach(async () => {
  db = createSqliteAdapter(':memory:', ...migrationSqls());
  institutionId = await seedInstitutionAndUser(db);
});

async function seedInstitutionAndUser(adapter: typeof db): Promise<number> {
  return (adapter as unknown as { __seedTestInstitution(): number }).__seedTestInstitution();
}

describe('adminLoadImportContext', () => {
  it('returns existing isbn/title/author keys and codes', async () => {
    await db.adminBulkImport(
      institutionId,
      { creates: [norm({ isbn: '9780596520687', isbnKey: '9780596520687', barcode: 'BK1', accession_number: 'AC1' })], copyAdds: [] },
      job(institutionId),
    );
    const ctx = await db.adminLoadImportContext(institutionId);
    expect(ctx.catalog).toHaveLength(1);
    expect(ctx.catalog[0].isbn).toBe('9780596520687');
    expect(ctx.barcodes).toContain('BK1');
    expect(ctx.accessions).toContain('AC1');
  });
});

describe('adminBulkImport', () => {
  it('creates resources with copies and writes an audit row', async () => {
    const res = await db.adminBulkImport(
      institutionId,
      { creates: [norm({ copies: 3 }), norm({ rowIndex: 1, title: 'B' })], copyAdds: [] },
      job(institutionId),
    );
    expect(res.created).toBe(2);
    expect(res.copiesAdded).toBe(0);
    expect(res.jobId).toBeGreaterThan(0);
    const ctx = await db.adminLoadImportContext(institutionId);
    expect(ctx.catalog).toHaveLength(2);
  });

  it('appends copies to an existing resource', async () => {
    await db.adminBulkImport(
      institutionId, { creates: [norm({ copies: 1 })], copyAdds: [] }, job(institutionId),
    );
    const created = await db.adminGetBookWithCopies(1) as { total_copies: number };
    const before = created.total_copies;
    const res = await db.adminBulkImport(
      institutionId, { creates: [], copyAdds: [{ resourceId: 1, copies: 2 }] }, job(institutionId),
    );
    expect(res.copiesAdded).toBe(2);
    const after = await db.adminGetBookWithCopies(1) as { total_copies: number };
    expect(after.total_copies).toBe(before + 2);
  });
});

function job(institutionId: number): ImportJobInput {
  return {
    institutionId, importedByUserId: 1, filename: 'test.csv', duplicateStrategy: 'skip',
    rowCount: 1, createdCount: 0, copiesAddedCount: 0, skippedCount: 0,
  };
}
