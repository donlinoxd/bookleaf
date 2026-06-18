import { describe, it, expect } from 'vitest';
import { marcRecordToRow } from './toRows';
import type { MarcRecord } from './types';

const rec = (leader: string, fields: [string, [string, string][]][]): MarcRecord => ({
  leader,
  controlfields: [],
  datafields: fields.map(([tag, subs]) => ({ tag, ind1: ' ', ind2: ' ', subfields: subs.map(([code, value]) => ({ code, value })) })),
});

describe('marcRecordToRow', () => {
  it('maps title/author/publisher/subjects and detects BOOK', () => {
    const r = marcRecordToRow(rec('00000nam a2200000zu 4500', [
      ['245', [['a', 'The Title'], ['b', 'sub']]],
      ['100', [['a', 'Doe, Jane']]],
      ['264', [['b', 'Acme'], ['c', '2001']]],
      ['650', [['a', 'History']]],
      ['650', [['a', 'War']]],
    ]), 5);
    expect(r._rowIndex).toBe(5);
    expect(r.title).toBe('The Title');
    expect(r.subtitle).toBe('sub');
    expect(r.author).toBe('Doe, Jane');
    expect(r.publisher).toBe('Acme');
    expect(r.year).toBe('2001');
    expect(r.material_type).toBe('BOOK');
    expect(r.subject_headings).toBe('History;War');
  });

  it('detects THESIS from a 502 and maps thesis subfields', () => {
    const r = marcRecordToRow(rec('00000nam a2200000zu 4500', [
      ['245', [['a', 'A Dissertation']]],
      ['100', [['a', 'Roe, Sam']]],
      ['502', [['b', 'PhD'], ['c', 'State U'], ['g', 'Dr. Adviser']]],
    ]), 0);
    expect(r.material_type).toBe('THESIS');
    expect(r.thesis_degree).toBe('PhD');
    expect(r.thesis_institution).toBe('State U');
    expect(r.thesis_advisor).toBe('Dr. Adviser');
  });

  it('detects SERIAL and leaves author empty', () => {
    const r = marcRecordToRow(rec('00000nas a2200000zu 4500', [
      ['245', [['a', 'A Journal']]],
      ['022', [['a', '1234-5678']]],
      ['310', [['a', 'Monthly']]],
    ]), 0);
    expect(r.material_type).toBe('SERIAL');
    expect(r.author).toBe('');
    expect(r.issn).toBe('1234-5678');
    expect(r.frequency).toBe('Monthly');
  });
});
