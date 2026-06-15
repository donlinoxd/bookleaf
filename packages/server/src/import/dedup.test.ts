import { describe, it, expect } from 'vitest';
import { buildVerdicts } from './dedup';
import { validateRow } from './validate';
import type { ImportRow } from '@bookleaf/types';
import type { ImportContext } from './types';

function v(partial: Partial<ImportRow>, i: number) {
  return validateRow({ title: 'T', author: 'A', _rowIndex: i, ...partial });
}
const emptyCtx: ImportContext = { catalog: [], barcodes: [], accessions: [] };

describe('buildVerdicts', () => {
  it('flags an in-file duplicate by isbn against the earlier row', () => {
    const rows = [v({ isbn: '9780596520687' }, 0), v({ isbn: '978-0-596-52068-7' }, 1)];
    const verdicts = buildVerdicts(rows, emptyCtx);
    expect(verdicts[0].status).toBe('valid');
    expect(verdicts[1].status).toBe('duplicate_file');
    expect(verdicts[1].firstRowIndex).toBe(0);
  });

  it('flags an in-file duplicate by title+author when isbn is blank', () => {
    const rows = [v({ title: 'Dune', author: 'Herbert' }, 0), v({ title: 'dune', author: 'HERBERT' }, 1)];
    const verdicts = buildVerdicts(rows, emptyCtx);
    expect(verdicts[1].status).toBe('duplicate_file');
  });

  it('flags an existing-catalog duplicate and records matchedBy', () => {
    const ctx: ImportContext = {
      catalog: [{ id: 7, isbn: '9780596520687', title: 'X', author: 'Y' }],
      barcodes: [], accessions: [],
    };
    const verdicts = buildVerdicts([v({ isbn: '0-596-52068-9' }, 0)], ctx);
    expect(verdicts[0].status).toBe('duplicate_existing');
    expect(verdicts[0].matchedResourceId).toBe(7);
    expect(verdicts[0].matchedBy).toBe('isbn');
  });

  it('marks a barcode that collides with an existing copy as invalid', () => {
    const ctx: ImportContext = { catalog: [], barcodes: ['BK001'], accessions: [] };
    const verdicts = buildVerdicts([v({ barcode: 'BK001' }, 0)], ctx);
    expect(verdicts[0].status).toBe('invalid');
    expect(verdicts[0].reasons!.join(' ')).toMatch(/barcode/i);
  });

  it('marks a barcode duplicated within the file as invalid', () => {
    const rows = [v({ barcode: 'DUP' }, 0), v({ barcode: 'DUP' }, 1)];
    const verdicts = buildVerdicts(rows, emptyCtx);
    expect(verdicts[1].status).toBe('invalid');
  });

  it('passes invalid validation rows straight through', () => {
    const rows = [v({ title: '' }, 0)];
    const verdicts = buildVerdicts(rows, emptyCtx);
    expect(verdicts[0].status).toBe('invalid');
  });
});
