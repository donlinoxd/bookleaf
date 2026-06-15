import type { RowVerdict } from '@bookleaf/types';
import type { RowValidation, ImportContext, CatalogKey } from './types';

function taKey(title: string, author: string): string {
  return `${title.trim().toLowerCase()}|${author.trim().toLowerCase()}`;
}

interface ExistingIndex {
  byIsbn: Map<string, number>;
  byTitleAuthor: Map<string, number>;
}

function indexCatalog(catalog: CatalogKey[]): ExistingIndex {
  const byIsbn = new Map<string, number>();
  const byTitleAuthor = new Map<string, number>();
  for (const c of catalog) {
    if (c.isbn) byIsbn.set(c.isbn, c.id);
    byTitleAuthor.set(taKey(c.title, c.author), c.id);
  }
  return { byIsbn, byTitleAuthor };
}

/**
 * Produce one verdict per validated row, in input order.
 * Precedence: invalid validation > barcode/accession collision >
 * in-file duplicate > existing-catalog duplicate > valid.
 */
export function buildVerdicts(rows: RowValidation[], ctx: ImportContext): RowVerdict[] {
  const existing = indexCatalog(ctx.catalog);
  const existingBarcodes = new Set(ctx.barcodes);
  const existingAccessions = new Set(ctx.accessions);

  const seenIsbn = new Map<string, number>();        // isbnKey -> firstRowIndex
  const seenTitleAuthor = new Map<string, number>(); // taKey   -> firstRowIndex
  const seenBarcodes = new Set<string>();
  const seenAccessions = new Set<string>();

  const verdicts: RowVerdict[] = [];

  for (const r of rows) {
    if (!r.ok || !r.normalized) {
      verdicts.push({ rowIndex: r.rowIndex, status: 'invalid', reasons: r.reasons });
      continue;
    }
    const n = r.normalized;
    const collisionReasons: string[] = [];

    if (n.barcode) {
      if (existingBarcodes.has(n.barcode) || seenBarcodes.has(n.barcode)) {
        collisionReasons.push(`Barcode "${n.barcode}" already exists`);
      }
    }
    if (n.accession_number) {
      if (existingAccessions.has(n.accession_number) || seenAccessions.has(n.accession_number)) {
        collisionReasons.push(`Accession number "${n.accession_number}" already exists`);
      }
    }
    if (collisionReasons.length > 0) {
      verdicts.push({ rowIndex: r.rowIndex, status: 'invalid', reasons: [...r.reasons, ...collisionReasons] });
      continue;
    }
    // reserve the codes only once the row is otherwise accepted as a candidate
    if (n.barcode) seenBarcodes.add(n.barcode);
    if (n.accession_number) seenAccessions.add(n.accession_number);

    // in-file dedup
    const ta = taKey(n.title, n.author);
    let fileFirst: number | undefined;
    if (n.isbnKey && seenIsbn.has(n.isbnKey)) fileFirst = seenIsbn.get(n.isbnKey);
    else if (!n.isbnKey && seenTitleAuthor.has(ta)) fileFirst = seenTitleAuthor.get(ta);
    if (fileFirst !== undefined) {
      verdicts.push({ rowIndex: r.rowIndex, status: 'duplicate_file', firstRowIndex: fileFirst, reasons: r.reasons });
      continue;
    }
    if (n.isbnKey) seenIsbn.set(n.isbnKey, r.rowIndex);
    else seenTitleAuthor.set(ta, r.rowIndex);

    // existing-catalog dedup
    if (n.isbnKey && existing.byIsbn.has(n.isbnKey)) {
      verdicts.push({
        rowIndex: r.rowIndex, status: 'duplicate_existing',
        matchedResourceId: existing.byIsbn.get(n.isbnKey), matchedBy: 'isbn', reasons: r.reasons,
      });
      continue;
    }
    if (existing.byTitleAuthor.has(ta)) {
      verdicts.push({
        rowIndex: r.rowIndex, status: 'duplicate_existing',
        matchedResourceId: existing.byTitleAuthor.get(ta), matchedBy: 'title_author', reasons: r.reasons,
      });
      continue;
    }

    verdicts.push({ rowIndex: r.rowIndex, status: 'valid', reasons: r.reasons });
  }

  return verdicts;
}
