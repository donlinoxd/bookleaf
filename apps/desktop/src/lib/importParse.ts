import * as XLSX from 'xlsx';

export const MAX_IMPORT_ROWS = 10_000;

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Parse a CSV or XLSX file (as an ArrayBuffer) into headers + string rows.
 * Throws on empty input, a missing header row, or > MAX_IMPORT_ROWS data rows.
 */
export async function parseSpreadsheet(buf: ArrayBuffer, _filename: string): Promise<ParsedSheet> {
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('The file is empty.');
  const ws = wb.Sheets[sheetName];

  const matrix = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: false, defval: '', raw: false });
  if (matrix.length === 0) throw new Error('The file has no rows.');

  const headerRow = matrix[0].map(h => String(h ?? '').trim());
  if (headerRow.every(h => h === '')) throw new Error('No header row was found.');

  const dataRows = matrix.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`This file has ${dataRows.length.toLocaleString()} rows. The limit is ${MAX_IMPORT_ROWS.toLocaleString()} per import.`);
  }

  const rows = dataRows.map(cells => {
    const obj: Record<string, string> = {};
    headerRow.forEach((h, i) => { if (h !== '') obj[h] = String(cells[i] ?? '').trim(); });
    return obj;
  });

  return { headers: headerRow.filter(h => h !== ''), rows };
}
