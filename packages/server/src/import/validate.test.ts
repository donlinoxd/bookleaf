import { describe, it, expect } from 'vitest';
import { validateRow } from './validate';
import type { ImportRow } from '@bookleaf/types';

function row(partial: Partial<ImportRow>): ImportRow {
  return { title: 'T', author: 'A', _rowIndex: 0, ...partial };
}

describe('validateRow', () => {
  it('rejects a row with a blank title', () => {
    const v = validateRow(row({ title: '   ' }));
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/title/i);
  });

  it('rejects a row with a blank author', () => {
    const v = validateRow(row({ author: '' }));
    expect(v.ok).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/author/i);
  });

  it('coerces year and defaults copies to 1', () => {
    const v = validateRow(row({ year: '2009' }));
    expect(v.ok).toBe(true);
    expect(v.normalized!.year).toBe(2009);
    expect(v.normalized!.copies).toBe(1);
  });

  it('warns and drops a non-numeric year but keeps the row valid', () => {
    const v = validateRow(row({ year: 'abcd' }));
    expect(v.ok).toBe(true);
    expect(v.normalized!.year).toBeNull();
    expect(v.reasons.join(' ')).toMatch(/year/i);
  });

  it('defaults an unknown material_type to BOOK with a warning', () => {
    const v = validateRow(row({ material_type: 'comic' }));
    expect(v.ok).toBe(true);
    expect(v.normalized!.material_type).toBe('BOOK');
    expect(v.reasons.join(' ')).toMatch(/material/i);
  });

  it('parses copies and splits subject headings', () => {
    const v = validateRow(row({ copies: '3', subject_headings: 'Math; Science' }));
    expect(v.normalized!.copies).toBe(3);
    expect(v.normalized!.subject_headings).toEqual(['Math', 'Science']);
  });

  it('stores a normalized ISBN-13 and sets the dedup key', () => {
    const v = validateRow(row({ isbn: '0-596-52068-9' }));
    expect(v.normalized!.isbn).toBe('9780596520687');
    expect(v.normalized!.isbnKey).toBe('9780596520687');
  });

  it('keeps a malformed ISBN as-is with no dedup key', () => {
    const v = validateRow(row({ isbn: '12345' }));
    expect(v.normalized!.isbn).toBe('12345');
    expect(v.normalized!.isbnKey).toBeNull();
  });
});
