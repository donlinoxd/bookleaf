import { MATERIAL_TYPES, type ImportRow, type MaterialType } from '@bookleaf/types';
import { normalizeIsbn } from './isbn';
import type { NormalizedRow, RowValidation } from './types';

function trimOrNull(v: string | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function coerceMaterialType(raw: string | undefined, warnings: string[]): MaterialType {
  const t = (raw ?? '').trim().toUpperCase();
  if (t === '') return 'BOOK';
  if ((MATERIAL_TYPES as readonly string[]).includes(t)) return t as MaterialType;
  warnings.push(`Unknown material_type "${raw}", defaulted to BOOK`);
  return 'BOOK';
}

function coerceCallNumberType(raw: string | undefined): 'DEWEY' | 'LC' | 'OTHER' | null {
  const t = (raw ?? '').trim().toUpperCase();
  if (t === 'DEWEY' || t === 'DDC') return 'DEWEY';
  if (t === 'LC' || t === 'LCC') return 'LC';
  if (t === '') return null;
  return 'OTHER';
}

export function validateRow(input: ImportRow): RowValidation {
  const reasons: string[] = [];
  const title = (input.title ?? '').trim();
  const author = (input.author ?? '').trim();

  if (title.length === 0) {
    return { rowIndex: input._rowIndex, ok: false, normalized: null, reasons: ['Missing title'] };
  }
  if (author.length === 0) {
    return { rowIndex: input._rowIndex, ok: false, normalized: null, reasons: ['Missing author'] };
  }

  // year
  let year: number | null = null;
  if (trimOrNull(input.year)) {
    const n = Number(input.year!.trim());
    if (Number.isInteger(n) && n > 0) year = n;
    else reasons.push(`Ignored non-numeric year "${input.year}"`);
  }

  // copies
  let copies = 1;
  if (trimOrNull(input.copies)) {
    const n = Number(input.copies!.trim());
    if (Number.isInteger(n) && n >= 1) copies = n;
    else reasons.push(`Invalid copies "${input.copies}", defaulted to 1`);
  }

  // isbn
  const rawIsbn = trimOrNull(input.isbn);
  const isbnKey = normalizeIsbn(rawIsbn);
  const isbn = isbnKey ?? rawIsbn; // store canonical when valid, else raw
  if (rawIsbn && !isbnKey) reasons.push(`ISBN "${rawIsbn}" is not valid; will not be used for matching`);

  // subject headings
  const subjectRaw = trimOrNull(input.subject_headings);
  const subject_headings = subjectRaw
    ? subjectRaw.split(';').map(s => s.trim()).filter(s => s.length > 0)
    : null;

  const normalized: NormalizedRow = {
    rowIndex: input._rowIndex,
    title,
    author,
    isbn,
    isbnKey,
    issn: trimOrNull(input.issn),
    publisher: trimOrNull(input.publisher),
    year,
    genre: trimOrNull(input.genre),
    description: trimOrNull(input.description),
    subtitle: trimOrNull(input.subtitle),
    edition: trimOrNull(input.edition),
    volume: trimOrNull(input.volume),
    series_title: trimOrNull(input.series_title),
    language: trimOrNull(input.language),
    call_number: trimOrNull(input.call_number),
    call_number_type: coerceCallNumberType(input.call_number_type),
    material_type: coerceMaterialType(input.material_type, reasons),
    subject_headings: subject_headings && subject_headings.length > 0 ? subject_headings : null,
    copies,
    accession_number: trimOrNull(input.accession_number),
    barcode: trimOrNull(input.barcode),
    shelf_location: trimOrNull(input.shelf_location),
  };

  return { rowIndex: input._rowIndex, ok: true, normalized, reasons };
}
