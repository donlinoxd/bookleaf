import { describe, it, expect } from 'vitest';
import { computeStats } from './stats';
import type { RowVerdict } from '@bookleaf/types';
import type { NormalizedRow } from './types';

function norm(rowIndex: number, copies: number): NormalizedRow {
  return {
    rowIndex, title: 'T', author: 'A', isbn: null, isbnKey: null, issn: null, publisher: null,
    year: null, genre: null, description: null, subtitle: null, edition: null, volume: null,
    series_title: null, language: null, call_number: null, call_number_type: null,
    material_type: 'BOOK', subject_headings: null, copies, accession_number: null,
    barcode: null, shelf_location: null,
  };
}

describe('computeStats', () => {
  it('counts statuses and projects valid creations', () => {
    const verdicts: RowVerdict[] = [
      { rowIndex: 0, status: 'valid' },
      { rowIndex: 1, status: 'valid' },
      { rowIndex: 2, status: 'invalid', reasons: ['x'] },
      { rowIndex: 3, status: 'duplicate_file', firstRowIndex: 0 },
    ];
    const norms = new Map([[0, norm(0, 2)], [1, norm(1, 1)]]);
    const stats = computeStats(verdicts, norms);
    expect(stats.rows).toBe(4);
    expect(stats.valid).toBe(2);
    expect(stats.invalid).toBe(1);
    expect(stats.duplicateFile).toBe(1);
    expect(stats.willCreateResources).toBe(2);
    expect(stats.willCreateCopies).toBe(3);
  });

  it('projects per-strategy outcomes for existing duplicates', () => {
    const verdicts: RowVerdict[] = [
      { rowIndex: 0, status: 'duplicate_existing', matchedResourceId: 9, matchedBy: 'isbn' },
      { rowIndex: 1, status: 'duplicate_existing', matchedResourceId: 8, matchedBy: 'title_author' },
    ];
    const norms = new Map([[0, norm(0, 3)], [1, norm(1, 2)]]);
    const stats = computeStats(verdicts, norms);
    expect(stats.duplicateExisting).toBe(2);
    expect(stats.perStrategy.skip).toEqual({ resources: 0, copies: 0 });
    expect(stats.perStrategy.add_copies).toEqual({ resources: 0, copies: 5 });
    // force_create_duplicate: only the title_author match creates a resource
    expect(stats.perStrategy.force_create_duplicate).toEqual({ resources: 1, copies: 2 });
  });
});
