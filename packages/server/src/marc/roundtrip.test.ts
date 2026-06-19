import { describe, it, expect } from 'vitest';
import { serializeResourceToRecord } from './serialize';
import { parseMarcXml } from './parse';
import { marcRecordToRow } from './toRows';

function roundtrip(row: Record<string, unknown>) {
  const xml = `<collection xmlns="http://www.loc.gov/MARC21/slim">${serializeResourceToRecord(row)}</collection>`;
  return marcRecordToRow(parseMarcXml(xml)[0], 0);
}

describe('serialize → parse → toRows round-trip', () => {
  it('preserves a book', () => {
    const r = roundtrip({ material_type: 'BOOK', title: 'Hobbit & Co', subtitle: 'There', author: 'Tolkien, J.R.R.', publisher: 'Allen', year: 1937, isbn: '9780000000000', subject_headings: ['Fantasy', 'Adventure'] });
    expect(r.material_type).toBe('BOOK');
    expect(r.title).toBe('Hobbit & Co');
    expect(r.subtitle).toBe('There');
    expect(r.author).toBe('Tolkien, J.R.R.');
    expect(r.publisher).toBe('Allen');
    expect(r.year).toBe('1937');
    expect(r.isbn).toBe('9780000000000');
    expect(r.subject_headings).toBe('Fantasy;Adventure');
  });

  it('preserves a serial (no author) and a thesis (502 → THESIS)', () => {
    const s = roundtrip({ material_type: 'SERIAL', title: 'J', author: '', issn: '1234-5678', frequency: 'Monthly' });
    expect(s.material_type).toBe('SERIAL');
    expect(s.author).toBe('');
    expect(s.frequency).toBe('Monthly');
    const t = roundtrip({ material_type: 'THESIS', title: 'D', author: 'Roe, Sam', thesis_degree: 'PhD', thesis_institution: 'State U' });
    expect(t.material_type).toBe('THESIS');
    expect(t.thesis_degree).toBe('PhD');
  });
});
