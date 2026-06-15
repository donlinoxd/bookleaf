import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSpreadsheet, MAX_IMPORT_ROWS } from './importParse';

function csvBuffer(text: string): ArrayBuffer {
  const u8 = new TextEncoder().encode(text);
  return u8.buffer.slice(0, u8.byteLength);
}

function xlsxBuffer(rows: string[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

describe('parseSpreadsheet', () => {
  it('parses CSV headers and rows', async () => {
    const buf = csvBuffer('Title,Author\nDune,Herbert\nFoundation,Asimov\n');
    const { headers, rows } = await parseSpreadsheet(buf, 'books.csv');
    expect(headers).toEqual(['Title', 'Author']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Title: 'Dune', Author: 'Herbert' });
  });

  it('parses an xlsx file', async () => {
    const buf = xlsxBuffer([['Title', 'Author'], ['Dune', 'Herbert']]);
    const { headers, rows } = await parseSpreadsheet(buf, 'books.xlsx');
    expect(headers).toEqual(['Title', 'Author']);
    expect(rows[0].Author).toBe('Herbert');
  });

  it('throws on an empty file', async () => {
    await expect(parseSpreadsheet(csvBuffer(''), 'empty.csv')).rejects.toThrow(/empty|no rows|header/i);
  });

  it('throws when the row count exceeds the cap', async () => {
    const lines = ['Title,Author', ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `T${i},A`)];
    await expect(parseSpreadsheet(csvBuffer(lines.join('\n')), 'big.csv')).rejects.toThrow(/10,?000/);
  });
});
