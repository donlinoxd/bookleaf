import type { ImportRow } from '@bookleaf/types';

export const IGNORE = '__ignore__';

/** Bookleaf fields a column can map to (keys of ImportRow minus _rowIndex). */
export const IMPORT_FIELDS = [
  'title', 'author', 'isbn', 'issn', 'publisher', 'year', 'genre', 'description',
  'subtitle', 'edition', 'volume', 'series_title', 'language', 'call_number',
  'call_number_type', 'material_type', 'subject_headings', 'copies',
  'accession_number', 'barcode', 'shelf_location',
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

const SYNONYMS: Record<ImportField, string[]> = {
  title: ['title', 'book title', 'name', 'book name'],
  author: ['author', 'writer', 'by', 'authors'],
  isbn: ['isbn', 'isbn13', 'isbn10', 'isbn 13'],
  issn: ['issn'],
  publisher: ['publisher', 'pub'],
  year: ['year', 'published', 'pub year', 'publication year'],
  genre: ['genre', 'category', 'subject'],
  description: ['description', 'summary', 'abstract'],
  subtitle: ['subtitle'],
  edition: ['edition', 'ed'],
  volume: ['volume', 'vol'],
  series_title: ['series', 'series title'],
  language: ['language', 'lang'],
  call_number: ['call number', 'call no', 'callnumber'],
  call_number_type: ['call number type', 'classification'],
  material_type: ['material type', 'material', 'type', 'format'],
  subject_headings: ['subject headings', 'subjects', 'tags'],
  copies: ['copies', 'quantity', 'qty', 'count', 'number of copies'],
  accession_number: ['accession number', 'accession', 'accession no'],
  barcode: ['barcode', 'bar code'],
  shelf_location: ['shelf location', 'shelf', 'location'],
};

function norm(h: string): string {
  return h.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

/** Guess a field per header; unmatched headers map to IGNORE. */
export function autoGuessMapping(headers: string[]): Record<string, ImportField | typeof IGNORE> {
  const result: Record<string, ImportField | typeof IGNORE> = {};
  const taken = new Set<ImportField>();
  for (const header of headers) {
    const h = norm(header);
    let match: ImportField | typeof IGNORE = IGNORE;
    for (const field of IMPORT_FIELDS) {
      if (taken.has(field)) continue;
      if (SYNONYMS[field].some(s => s === h)) { match = field; break; }
    }
    if (match !== IGNORE) taken.add(match);
    result[header] = match;
  }
  return result;
}

/** Apply a header→field mapping to raw rows, producing ImportRow objects. */
export function applyMapping(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): ImportRow[] {
  return rows.map((raw, i) => {
    const out: Record<string, unknown> = { title: '', author: '', _rowIndex: i };
    for (const [header, field] of Object.entries(mapping)) {
      if (field === IGNORE) continue;
      out[field] = raw[header] ?? '';
    }
    return out as ImportRow;
  });
}
