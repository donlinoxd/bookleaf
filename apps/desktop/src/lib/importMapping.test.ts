import { describe, it, expect } from 'vitest';
import { autoGuessMapping, applyMapping, IGNORE } from './importMapping';

describe('autoGuessMapping', () => {
  it('maps common header synonyms to fields', () => {
    const m = autoGuessMapping(['Book Title', 'Writer', 'ISBN13', 'Qty', 'Mystery Column']);
    expect(m['Book Title']).toBe('title');
    expect(m['Writer']).toBe('author');
    expect(m['ISBN13']).toBe('isbn');
    expect(m['Qty']).toBe('copies');
    expect(m['Mystery Column']).toBe(IGNORE);
  });
});

describe('applyMapping', () => {
  it('builds ImportRow objects with a _rowIndex, ignoring unmapped columns', () => {
    const rows = [{ 'Book Title': 'Dune', Writer: 'Herbert', Junk: 'x' }];
    const mapping = { 'Book Title': 'title', Writer: 'author', Junk: IGNORE } as Record<string, string>;
    const result = applyMapping(rows, mapping);
    expect(result[0]).toEqual({ title: 'Dune', author: 'Herbert', _rowIndex: 0 });
  });
});
