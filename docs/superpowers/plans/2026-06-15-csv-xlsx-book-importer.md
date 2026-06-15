# CSV / XLSX Bulk Book Importer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a librarian bulk-import an existing `.csv`/`.xlsx` catalog into an institution from the Bookleaf desktop app, with column mapping, robust duplicate detection, barcode-collision safety, a dry-run preview, and an audit record.

**Architecture:** The renderer parses the file (SheetJS) and maps columns to a canonical `ImportRow` shape. Two new tRPC procedures (`adminBooks.importPreview` / `importCommit`) run all validation, deduplication, and the transactional write in the server package. Pure logic (ISBN normalization, validation, dedup, stats, session cache) lives in small, individually unit-tested modules under `packages/server/src/import/`. Database access is confined to two new `DbAdapter` methods implemented only in the desktop sqlite adapter (the Android bridge gets throwing stubs — this feature is desktop-only).

**Tech Stack:** TypeScript, tRPC v11, Drizzle + better-sqlite3, Zod, React 19 + TanStack Query, SheetJS (`xlsx`), Vitest (added by this plan).

**Reference spec:** `docs/superpowers/specs/2026-06-15-csv-xlsx-book-importer-design.md`

---

## File Structure

**`packages/types`** (shared contracts)
- Create `src/import.ts` — Zod schemas + TS types: `ImportRow`, `RowStatus`, `RowVerdict`, `DuplicateStrategy`, `PreviewStats`, `MAX_IMPORT_ROWS`, `MATERIAL_TYPES`. Re-exported from `src/index.ts`.

**`packages/server`** (logic + data access)
- Create `src/import/isbn.ts` — ISBN strip + ISBN-10→13 + checksum validation.
- Create `src/import/validate.ts` — per-row coercion/validation → `NormalizedRow`.
- Create `src/import/dedup.ts` — in-file dedup, existing-catalog dedup, barcode/accession collision → verdicts.
- Create `src/import/stats.ts` — compute `PreviewStats` from verdicts + normalized rows.
- Create `src/import/session.ts` — in-memory TTL session cache.
- Create `src/import/service.ts` — orchestrates preview + commit against an `ImportRepo` port.
- Create `src/import/types.ts` — server-internal types (`NormalizedRow`, `ImportRepo`, `CommitPlan`, `CatalogKey`).
- Modify `src/adapter/types.ts` — add 2 methods to `DbAdapter`.
- Modify `src/adapter/sqlite.ts` — implement the 2 methods (real).
- Modify `src/adapter/bridge.ts` — add throwing stubs for the 2 methods.
- Modify `src/router/admin/books.ts` — add `importPreview` / `importCommit` procedures.

**`packages/db`** (schema)
- Modify `src/schema.ts` — add `import_jobs` table.
- Generate `drizzle/0002_import_jobs.sql` (via `npm run db:generate`).

**`packages/server` desktop wiring**
- Modify `src/index.desktop.ts` — import + pass the new migration SQL string.

**`apps/desktop`** (renderer)
- Create `src/lib/importParse.ts` — `parseSpreadsheet(buf, filename)` via SheetJS.
- Create `src/lib/importMapping.ts` — synonym auto-guess + `applyMapping`.
- Create `src/pages/ImportBooks.tsx` — the 4-step wizard.
- Modify the desktop route config + `src/pages/Books.tsx` — add an "Import" entry point.

**Test tooling**
- Add Vitest to `packages/server`, `packages/types`, and `apps/desktop`.

---

## Task 0: Add Vitest test tooling

**Files:**
- Modify: `packages/server/package.json`
- Create: `packages/server/vitest.config.ts`
- Create: `packages/server/src/import/__tests__/smoke.test.ts` (temporary sanity test, deleted in Step 5)

- [ ] **Step 1: Add vitest dependency and test script to `packages/server/package.json`**

Add to `devDependencies`: `"vitest": "^2.1.0"`. Add to `scripts`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 2: Create `packages/server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: Install and write a smoke test `packages/server/src/import/__tests__/smoke.test.ts`**

Run: `pnpm install` (from repo root).

```ts
import { describe, it, expect } from 'vitest';

describe('vitest wiring', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: Run the smoke test**

Run: `pnpm --filter @bookleaf/server test`
Expected: PASS (1 test passed).

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm packages/server/src/import/__tests__/smoke.test.ts
git add packages/server/package.json packages/server/vitest.config.ts pnpm-lock.yaml
git commit -m "chore(server): add vitest test runner"
```

---

## Task 1: Shared import types (`packages/types`)

**Files:**
- Create: `packages/types/src/import.ts`
- Modify: `packages/types/src/index.ts`

- [ ] **Step 1: Create `packages/types/src/import.ts`**

```ts
import { z } from 'zod';

export const MAX_IMPORT_ROWS = 10_000;

export const MATERIAL_TYPES = [
  'BOOK', 'SERIAL', 'ARTICLE', 'AUDIOVISUAL', 'MAP',
  'MANUSCRIPT', 'DIGITAL', 'THESIS', 'OTHER',
] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

/** A row after column-mapping in the renderer. All cell values are raw strings. */
export const importRowSchema = z.object({
  title: z.string(),
  author: z.string(),
  isbn: z.string().optional(),
  issn: z.string().optional(),
  publisher: z.string().optional(),
  year: z.string().optional(),
  genre: z.string().optional(),
  description: z.string().optional(),
  subtitle: z.string().optional(),
  edition: z.string().optional(),
  volume: z.string().optional(),
  series_title: z.string().optional(),
  language: z.string().optional(),
  call_number: z.string().optional(),
  call_number_type: z.string().optional(),
  material_type: z.string().optional(),
  subject_headings: z.string().optional(),
  copies: z.string().optional(),
  accession_number: z.string().optional(),
  barcode: z.string().optional(),
  shelf_location: z.string().optional(),
  _rowIndex: z.number().int(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export type RowStatus = 'valid' | 'invalid' | 'duplicate_existing' | 'duplicate_file';

export interface RowVerdict {
  rowIndex: number;
  status: RowStatus;
  reasons?: string[];
  matchedResourceId?: number;
  matchedBy?: 'isbn' | 'title_author';
  firstRowIndex?: number;
}

export type DuplicateStrategy = 'skip' | 'add_copies' | 'force_create_duplicate';

export interface StrategyProjection {
  resources: number;
  copies: number;
}

export interface PreviewStats {
  rows: number;
  valid: number;
  duplicateExisting: number;
  duplicateFile: number;
  invalid: number;
  willCreateResources: number;
  willCreateCopies: number;
  perStrategy: {
    skip: StrategyProjection;
    add_copies: StrategyProjection;
    force_create_duplicate: StrategyProjection;
  };
}

export const importPreviewInput = z.object({
  institutionId: z.number().int(),
  rows: z.array(importRowSchema),
});

export const importCommitInput = z.object({
  sessionId: z.string(),
  duplicateStrategy: z.enum(['skip', 'add_copies', 'force_create_duplicate']),
  filename: z.string().default('import'),
});

export interface ImportPreviewResult {
  sessionId: string;
  verdicts: RowVerdict[];
  stats: PreviewStats;
}

export interface ImportCommitResult {
  created: number;
  copiesAdded: number;
  skipped: { rowIndex: number; reasons: string[] }[];
  jobId: number;
}
```

- [ ] **Step 2: Re-export from `packages/types/src/index.ts`**

Add at the end of the file:

```ts
export * from './import';
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bookleaf/types typecheck` (or `pnpm --filter @bookleaf/types exec tsc --noEmit`)
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/import.ts packages/types/src/index.ts
git commit -m "feat(types): add bulk import contracts"
```

---

## Task 2: ISBN normalization module

**Files:**
- Create: `packages/server/src/import/isbn.ts`
- Test: `packages/server/src/import/isbn.test.ts`

- [ ] **Step 1: Write the failing test `packages/server/src/import/isbn.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeIsbn } from './isbn';

describe('normalizeIsbn', () => {
  it('strips hyphens and spaces from a valid ISBN-13', () => {
    expect(normalizeIsbn('978-0-596-52068-7')).toBe('9780596520687');
  });

  it('converts a valid ISBN-10 to ISBN-13', () => {
    expect(normalizeIsbn('0-596-52068-9')).toBe('9780596520687');
  });

  it('treats an ISBN-10 with X check digit', () => {
    expect(normalizeIsbn('080442957X')).toBe('9780804429573');
  });

  it('returns null for a malformed ISBN', () => {
    expect(normalizeIsbn('not-an-isbn')).toBeNull();
    expect(normalizeIsbn('1234567890')).toBeNull(); // bad checksum
    expect(normalizeIsbn('')).toBeNull();
    expect(normalizeIsbn(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bookleaf/server exec vitest run src/import/isbn.test.ts`
Expected: FAIL ("Cannot find module './isbn'").

- [ ] **Step 3: Implement `packages/server/src/import/isbn.ts`**

```ts
/** Strip to bare digits (keeping a trailing X for ISBN-10), upper-cased. */
function clean(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

function isValidIsbn13(s: string): boolean {
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}

function isValidIsbn10(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = s[i];
    const v = c === 'X' ? 10 : Number(c);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

function isbn10to13(s: string): string {
  const core = '978' + s.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return core + String(check);
}

/**
 * Normalize an ISBN to canonical ISBN-13 digits, or null if it is not a
 * structurally valid ISBN-10/13. Used as the deduplication key.
 */
export function normalizeIsbn(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = clean(raw);
  if (isValidIsbn13(s)) return s;
  if (isValidIsbn10(s)) return isbn10to13(s);
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bookleaf/server exec vitest run src/import/isbn.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/import/isbn.ts packages/server/src/import/isbn.test.ts
git commit -m "feat(server): add ISBN normalization for import dedup"
```

---

## Task 3: Row validation & coercion

**Files:**
- Create: `packages/server/src/import/types.ts`
- Create: `packages/server/src/import/validate.ts`
- Test: `packages/server/src/import/validate.test.ts`

- [ ] **Step 1: Create server-internal types `packages/server/src/import/types.ts`**

```ts
import type { MaterialType, RowVerdict, DuplicateStrategy } from '@bookleaf/types';

/** A row after coercion, ready to become a resource + copies. */
export interface NormalizedRow {
  rowIndex: number;
  title: string;
  author: string;
  isbn: string | null;        // stored value (canonical when valid, raw when malformed)
  isbnKey: string | null;     // dedup key: canonical ISBN-13 or null
  issn: string | null;
  publisher: string | null;
  year: number | null;
  genre: string | null;
  description: string | null;
  subtitle: string | null;
  edition: string | null;
  volume: string | null;
  series_title: string | null;
  language: string | null;
  call_number: string | null;
  call_number_type: 'DEWEY' | 'LC' | 'OTHER' | null;
  material_type: MaterialType;
  subject_headings: string[] | null;
  copies: number;             // >= 1
  accession_number: string | null;
  barcode: string | null;
  shelf_location: string | null;
}

/** Validation outcome for a single row. */
export interface RowValidation {
  rowIndex: number;
  ok: boolean;
  normalized: NormalizedRow | null;  // null when ok === false
  reasons: string[];                 // hard errors when !ok; warnings when ok
}

/** Existing-catalog key loaded for dedup. */
export interface CatalogKey {
  id: number;
  isbn: string | null;
  title: string;
  author: string;
}

/** Everything the preview needs from the database, loaded in one shot. */
export interface ImportContext {
  catalog: CatalogKey[];
  barcodes: string[];
  accessions: string[];
}

/** A plan the adapter executes atomically. */
export interface CommitPlan {
  creates: NormalizedRow[];                          // new resources (+ their copies)
  copyAdds: { resourceId: number; copies: number }[]; // copies appended to existing resources
}

export interface ImportJobInput {
  institutionId: number;
  importedByUserId: number;
  filename: string;
  duplicateStrategy: DuplicateStrategy;
  rowCount: number;
  createdCount: number;
  copiesAddedCount: number;
  skippedCount: number;
}

/** Narrow DB port the import service depends on (so it is testable with a fake). */
export interface ImportRepo {
  loadContext(institutionId: number): Promise<ImportContext>;
  commit(
    institutionId: number,
    plan: CommitPlan,
    job: ImportJobInput,
  ): Promise<{ created: number; copiesAdded: number; jobId: number }>;
}

export type { RowVerdict };
```

- [ ] **Step 2: Write the failing test `packages/server/src/import/validate.test.ts`**

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @bookleaf/server exec vitest run src/import/validate.test.ts`
Expected: FAIL ("Cannot find module './validate'").

- [ ] **Step 4: Implement `packages/server/src/import/validate.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bookleaf/server exec vitest run src/import/validate.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/import/types.ts packages/server/src/import/validate.ts packages/server/src/import/validate.test.ts
git commit -m "feat(server): add import row validation and coercion"
```

---

## Task 4: Deduplication & collision detection

**Files:**
- Create: `packages/server/src/import/dedup.ts`
- Test: `packages/server/src/import/dedup.test.ts`

`buildVerdicts` takes the validated rows plus the loaded `ImportContext` and returns one `RowVerdict` per input row, in input order. Order of precedence per row: invalid (validation) → barcode/accession collision (invalid) → in-file duplicate → existing-catalog duplicate → valid.

- [ ] **Step 1: Write the failing test `packages/server/src/import/dedup.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bookleaf/server exec vitest run src/import/dedup.test.ts`
Expected: FAIL ("Cannot find module './dedup'").

- [ ] **Step 3: Implement `packages/server/src/import/dedup.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bookleaf/server exec vitest run src/import/dedup.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/import/dedup.ts packages/server/src/import/dedup.test.ts
git commit -m "feat(server): add import dedup and barcode collision detection"
```

---

## Task 5: Preview statistics

**Files:**
- Create: `packages/server/src/import/stats.ts`
- Test: `packages/server/src/import/stats.test.ts`

`computeStats` projects what a commit would do. `valid` rows always create a resource + their copies. For `duplicate_existing` rows the projection depends on strategy: `skip` does nothing; `add_copies` adds that row's copies to the existing resource; `force_create_duplicate` creates a new resource **only** when `matchedBy === 'title_author'` (ISBN matches are treated as skip).

- [ ] **Step 1: Write the failing test `packages/server/src/import/stats.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { computeStats } from './stats';
import type { RowVerdict } from '@bookleaf/types';
import type { NormalizedRow } from './types';

function norm(rowIndex: number, copies: number): NormalizedRow {
  return {
    rowIndex, title: 'T', author: 'A', isbn: null, isbnKey: null, issn: null, publisher: null,
    year: null, genre: null, description: null, subtitle: null, edition: null, volume: null,
    series_title: null, language: null, call_number: null, call_number_type: null,
    material_type: 'BOOK', subject_headings: null, copies, accession_number: null,
    barcode: null, shelf_location: null,
  };
}

describe('computeStats', () => {
  it('counts statuses and projects valid creations', () => {
    const verdicts: RowVerdict[] = [
      { rowIndex: 0, status: 'valid' },
      { rowIndex: 1, status: 'valid' },
      { rowIndex: 2, status: 'invalid', reasons: ['x'] },
      { rowIndex: 3, status: 'duplicate_file', firstRowIndex: 0 },
    ];
    const norms = new Map([[0, norm(0, 2)], [1, norm(1, 1)]]);
    const stats = computeStats(verdicts, norms);
    expect(stats.rows).toBe(4);
    expect(stats.valid).toBe(2);
    expect(stats.invalid).toBe(1);
    expect(stats.duplicateFile).toBe(1);
    expect(stats.willCreateResources).toBe(2);
    expect(stats.willCreateCopies).toBe(3);
  });

  it('projects per-strategy outcomes for existing duplicates', () => {
    const verdicts: RowVerdict[] = [
      { rowIndex: 0, status: 'duplicate_existing', matchedResourceId: 9, matchedBy: 'isbn' },
      { rowIndex: 1, status: 'duplicate_existing', matchedResourceId: 8, matchedBy: 'title_author' },
    ];
    const norms = new Map([[0, norm(0, 3)], [1, norm(1, 2)]]);
    const stats = computeStats(verdicts, norms);
    expect(stats.duplicateExisting).toBe(2);
    expect(stats.perStrategy.skip).toEqual({ resources: 0, copies: 0 });
    expect(stats.perStrategy.add_copies).toEqual({ resources: 0, copies: 5 });
    // force_create_duplicate: only the title_author match creates a resource
    expect(stats.perStrategy.force_create_duplicate).toEqual({ resources: 1, copies: 2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bookleaf/server exec vitest run src/import/stats.test.ts`
Expected: FAIL ("Cannot find module './stats'").

- [ ] **Step 3: Implement `packages/server/src/import/stats.ts`**

```ts
import type { PreviewStats, RowVerdict } from '@bookleaf/types';
import type { NormalizedRow } from './types';

export function computeStats(
  verdicts: RowVerdict[],
  norms: Map<number, NormalizedRow>,
): PreviewStats {
  const stats: PreviewStats = {
    rows: verdicts.length,
    valid: 0, duplicateExisting: 0, duplicateFile: 0, invalid: 0,
    willCreateResources: 0, willCreateCopies: 0,
    perStrategy: {
      skip: { resources: 0, copies: 0 },
      add_copies: { resources: 0, copies: 0 },
      force_create_duplicate: { resources: 0, copies: 0 },
    },
  };

  for (const v of verdicts) {
    const copies = norms.get(v.rowIndex)?.copies ?? 0;
    switch (v.status) {
      case 'valid':
        stats.valid++;
        stats.willCreateResources++;
        stats.willCreateCopies += copies;
        break;
      case 'invalid':
        stats.invalid++;
        break;
      case 'duplicate_file':
        stats.duplicateFile++;
        break;
      case 'duplicate_existing':
        stats.duplicateExisting++;
        // skip: nothing
        stats.perStrategy.add_copies.copies += copies;
        if (v.matchedBy === 'title_author') {
          stats.perStrategy.force_create_duplicate.resources++;
          stats.perStrategy.force_create_duplicate.copies += copies;
        }
        break;
    }
  }

  return stats;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bookleaf/server exec vitest run src/import/stats.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/import/stats.ts packages/server/src/import/stats.test.ts
git commit -m "feat(server): add import preview statistics"
```

---

## Task 6: In-memory session cache

**Files:**
- Create: `packages/server/src/import/session.ts`
- Test: `packages/server/src/import/session.test.ts`

The store keeps normalized rows + verdicts keyed by an opaque id, with a TTL. `now` is injected for testability. The id generator is injected too (avoids `Math.random` non-determinism in tests).

- [ ] **Step 1: Write the failing test `packages/server/src/import/session.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createSessionStore } from './session';
import type { NormalizedRow } from './types';

const payload = { institutionId: 1, norms: new Map<number, NormalizedRow>(), verdicts: [] };

describe('session store', () => {
  it('stores and retrieves a session', () => {
    let t = 1000;
    let n = 0;
    const store = createSessionStore({ ttlMs: 5000, now: () => t, genId: () => `s${++n}` });
    const id = store.create(payload);
    expect(id).toBe('s1');
    expect(store.get(id)?.institutionId).toBe(1);
  });

  it('expires a session past its TTL', () => {
    let t = 1000;
    const store = createSessionStore({ ttlMs: 5000, now: () => t, genId: () => 'x' });
    const id = store.create(payload);
    t = 7000;
    expect(store.get(id)).toBeNull();
  });

  it('evicts a session on demand', () => {
    const store = createSessionStore({ ttlMs: 5000, now: () => 0, genId: () => 'x' });
    const id = store.create(payload);
    store.evict(id);
    expect(store.get(id)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bookleaf/server exec vitest run src/import/session.test.ts`
Expected: FAIL ("Cannot find module './session'").

- [ ] **Step 3: Implement `packages/server/src/import/session.ts`**

```ts
import type { RowVerdict } from '@bookleaf/types';
import type { NormalizedRow } from './types';

export interface SessionPayload {
  institutionId: number;
  norms: Map<number, NormalizedRow>;
  verdicts: RowVerdict[];
}

interface Entry {
  payload: SessionPayload;
  expiresAt: number;
}

export interface SessionStoreOptions {
  ttlMs?: number;
  now?: () => number;
  genId?: () => string;
}

export interface SessionStore {
  create(payload: SessionPayload): string;
  get(id: string): SessionPayload | null;
  evict(id: string): void;
}

let counter = 0;
function defaultId(): string {
  counter += 1;
  return `imp_${counter.toString(36)}_${counter}`;
}

export function createSessionStore(opts: SessionStoreOptions = {}): SessionStore {
  const ttlMs = opts.ttlMs ?? 15 * 60 * 1000;
  const now = opts.now ?? (() => Date.now());
  const genId = opts.genId ?? defaultId;
  const entries = new Map<string, Entry>();

  function sweep(): void {
    const t = now();
    for (const [id, e] of entries) if (e.expiresAt <= t) entries.delete(id);
  }

  return {
    create(payload) {
      sweep();
      const id = genId();
      entries.set(id, { payload, expiresAt: now() + ttlMs });
      return id;
    },
    get(id) {
      const e = entries.get(id);
      if (!e) return null;
      if (e.expiresAt <= now()) { entries.delete(id); return null; }
      return e.payload;
    },
    evict(id) { entries.delete(id); },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bookleaf/server exec vitest run src/import/session.test.ts`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/import/session.ts packages/server/src/import/session.test.ts
git commit -m "feat(server): add in-memory import session store"
```

---

## Task 7: `import_jobs` table + migration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Generate: `packages/db/drizzle/0002_import_jobs.sql`
- Modify: `packages/server/src/index.desktop.ts`

- [ ] **Step 1: Add the `import_jobs` table to `packages/db/src/schema.ts`**

Add after the `resourceCopies` table definition (follow the existing column style; `institutions` and `users` are already declared above in the file):

```ts
export const importJobs = sqliteTable('import_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  institution_id: integer('institution_id').notNull().references(() => institutions.id),
  imported_by_user_id: integer('imported_by_user_id').notNull().references(() => users.id),
  filename: text('filename').notNull(),
  duplicate_strategy: text('duplicate_strategy').notNull(),
  row_count: integer('row_count').notNull(),
  created_count: integer('created_count').notNull(),
  copies_added_count: integer('copies_added_count').notNull(),
  skipped_count: integer('skipped_count').notNull(),
  started_at: text('started_at').notNull().default(sql`(datetime('now'))`),
  completed_at: text('completed_at'),
});
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate` (from repo root, as documented in AGENTS.md)
Expected: a new file `packages/db/drizzle/0002_*.sql` containing `CREATE TABLE \`import_jobs\``. If the generator names it differently, note the exact filename for Step 3.

- [ ] **Step 3: Verify the generated SQL**

Run: `cat packages/db/drizzle/0002_*.sql`
Expected: a `CREATE TABLE` statement for `import_jobs` with all 11 columns.

- [ ] **Step 4: Wire the migration into the desktop server `packages/server/src/index.desktop.ts`**

Add the import alongside the existing `sql_0000` / `sql_0001` imports (use the actual generated filename):

```ts
// @ts-expect-error — imported as plain text by esbuild
import sql_0002 from '../../../packages/db/drizzle/0002_import_jobs.sql';
```

Change the adapter construction to pass it:

```ts
const db = createSqliteAdapter(dbPath, sql_0000 as string, sql_0001 as string, sql_0002 as string);
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @bookleaf/db typecheck && pnpm --filter @bookleaf/server typecheck`
Expected: no new errors (the pre-existing errors listed in AGENTS.md may remain).

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/ packages/server/src/index.desktop.ts
git commit -m "feat(db): add import_jobs audit table and wire desktop migration"
```

---

## Task 8: Adapter methods (`loadImportContext` + `bulkImport`)

**Files:**
- Modify: `packages/server/src/adapter/types.ts`
- Modify: `packages/server/src/adapter/sqlite.ts`
- Modify: `packages/server/src/adapter/bridge.ts`
- Test: `packages/server/src/adapter/sqlite.import.test.ts`

These are the only DB touchpoints. `adminLoadImportContext` returns dedup keys + existing codes; `adminBulkImport` writes the whole plan + audit row in one transaction.

- [ ] **Step 1: Add the two methods to the `DbAdapter` interface in `packages/server/src/adapter/types.ts`**

Add inside the `// ── Admin: Books ──` section:

```ts
  adminLoadImportContext(institutionId: number): Promise<{
    catalog: { id: number; isbn: string | null; title: string; author: string }[];
    barcodes: string[];
    accessions: string[];
  }>;
  adminBulkImport(
    institutionId: number,
    plan: {
      creates: import('../import/types').NormalizedRow[];
      copyAdds: { resourceId: number; copies: number }[];
    },
    job: import('../import/types').ImportJobInput,
  ): Promise<{ created: number; copiesAdded: number; jobId: number }>;
```

- [ ] **Step 2: Write the failing test `packages/server/src/adapter/sqlite.import.test.ts`**

This test builds an in-memory database by running the bundled migration SQL, then exercises both methods. It reads the migration SQL files from disk.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createSqliteAdapter } from './sqlite';
import type { NormalizedRow, ImportJobInput } from '../import/types';

const drizzleDir = join(__dirname, '../../../db/drizzle');

function migrationSqls(): string[] {
  return readdirSync(drizzleDir)
    .filter(f => /^\d+_.*\.sql$/.test(f))
    .sort()
    .map(f => readFileSync(join(drizzleDir, f), 'utf8'));
}

function norm(over: Partial<NormalizedRow>): NormalizedRow {
  return {
    rowIndex: 0, title: 'T', author: 'A', isbn: null, isbnKey: null, issn: null, publisher: null,
    year: null, genre: null, description: null, subtitle: null, edition: null, volume: null,
    series_title: null, language: null, call_number: null, call_number_type: null,
    material_type: 'BOOK', subject_headings: null, copies: 1, accession_number: null,
    barcode: null, shelf_location: null, ...over,
  };
}

let db: ReturnType<typeof createSqliteAdapter>;
let institutionId: number;

beforeEach(async () => {
  // ':memory:' fresh DB; createSqliteAdapter runs migrations + seeds settings.
  db = createSqliteAdapter(':memory:', ...migrationSqls());
  // Minimal institution + user rows are needed for FK integrity.
  // adminLoadImportContext / adminBulkImport are scoped by institutionId.
  institutionId = await seedInstitutionAndUser(db);
});

// Helper: insert one institution + one librarian user, return institutionId.
// Implemented inline via the adapter's existing create methods where available,
// or via a raw insert exposed for tests. See Step 4 note.
async function seedInstitutionAndUser(adapter: typeof db): Promise<number> {
  // adminCreateMember requires an institution; institutions are seeded by Setup
  // in the real app. For this test we rely on a tiny test-only helper added in Step 4.
  return (adapter as unknown as { __seedTestInstitution(): number }).__seedTestInstitution();
}

describe('adminLoadImportContext', () => {
  it('returns existing isbn/title/author keys and codes', async () => {
    await db.adminBulkImport(
      institutionId,
      { creates: [norm({ isbn: '9780596520687', isbnKey: '9780596520687', barcode: 'BK1', accession_number: 'AC1' })], copyAdds: [] },
      job(institutionId),
    );
    const ctx = await db.adminLoadImportContext(institutionId);
    expect(ctx.catalog).toHaveLength(1);
    expect(ctx.catalog[0].isbn).toBe('9780596520687');
    expect(ctx.barcodes).toContain('BK1');
    expect(ctx.accessions).toContain('AC1');
  });
});

describe('adminBulkImport', () => {
  it('creates resources with copies and writes an audit row', async () => {
    const res = await db.adminBulkImport(
      institutionId,
      { creates: [norm({ copies: 3 }), norm({ rowIndex: 1, title: 'B' })], copyAdds: [] },
      job(institutionId),
    );
    expect(res.created).toBe(2);
    expect(res.copiesAdded).toBe(0);
    expect(res.jobId).toBeGreaterThan(0);
    const ctx = await db.adminLoadImportContext(institutionId);
    expect(ctx.catalog).toHaveLength(2);
  });

  it('appends copies to an existing resource', async () => {
    const first = await db.adminBulkImport(
      institutionId, { creates: [norm({ copies: 1 })], copyAdds: [] }, job(institutionId),
    );
    void first;
    const created = await db.adminGetBookWithCopies(1) as { total_copies: number };
    const before = created.total_copies;
    const res = await db.adminBulkImport(
      institutionId, { creates: [], copyAdds: [{ resourceId: 1, copies: 2 }] }, job(institutionId),
    );
    expect(res.copiesAdded).toBe(2);
    const after = await db.adminGetBookWithCopies(1) as { total_copies: number };
    expect(after.total_copies).toBe(before + 2);
  });
});

function job(institutionId: number): ImportJobInput {
  return {
    institutionId, importedByUserId: 1, filename: 'test.csv', duplicateStrategy: 'skip',
    rowCount: 1, createdCount: 0, copiesAddedCount: 0, skippedCount: 0,
  };
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @bookleaf/server exec vitest run src/adapter/sqlite.import.test.ts`
Expected: FAIL (methods `adminLoadImportContext` / `adminBulkImport` / `__seedTestInstitution` not defined).

- [ ] **Step 4: Implement the methods in `packages/server/src/adapter/sqlite.ts`**

Add a tiny test-only seed helper plus the two real methods to the returned adapter object. Place them inside the `// ── Admin: Books ──` area of the returned object. `rawDb` and `db` (drizzle) are already in scope from `createSqliteAdapter`. Reuse `serializeSubjectHeadings` (already defined at top of file).

```ts
    // Test-only: insert one institution + librarian so import tests have FKs.
    __seedTestInstitution(): number {
      const inst = rawDb.prepare(
        "INSERT INTO institutions (name) VALUES ('Test Inst')",
      ).run();
      const institutionId = Number(inst.lastInsertRowid);
      rawDb.prepare(
        "INSERT INTO users (institution_id, name, role, id_number, pin_hash, user_type) " +
        "VALUES (?, 'Lib', 'librarian', 'L1', 'x', 'faculty')",
      ).run(institutionId);
      return institutionId;
    },

    async adminLoadImportContext(institutionId) {
      const catalog = rawDb.prepare(
        'SELECT id, isbn, title, author FROM resources WHERE institution_id = ?',
      ).all(institutionId) as { id: number; isbn: string | null; title: string; author: string }[];
      const codes = rawDb.prepare(
        'SELECT rc.barcode AS barcode, rc.accession_number AS accession ' +
        'FROM resource_copies rc JOIN resources r ON r.id = rc.resource_id ' +
        'WHERE r.institution_id = ?',
      ).all(institutionId) as { barcode: string | null; accession: string | null }[];
      return {
        catalog,
        barcodes: codes.map(c => c.barcode).filter((b): b is string => !!b),
        accessions: codes.map(c => c.accession).filter((a): a is string => !!a),
      };
    },

    async adminBulkImport(institutionId, plan, job) {
      const tx = rawDb.transaction(() => {
        let created = 0;
        let copiesAdded = 0;

        const insertResource = rawDb.prepare(
          `INSERT INTO resources
            (institution_id, material_type, isbn, issn, title, author, publisher, year, genre,
             description, subtitle, edition, volume, series_title, language, call_number,
             call_number_type, subject_headings, total_copies, available_copies)
           VALUES (@institution_id, @material_type, @isbn, @issn, @title, @author, @publisher,
             @year, @genre, @description, @subtitle, @edition, @volume, @series_title, @language,
             @call_number, @call_number_type, @subject_headings, @total_copies, @available_copies)`,
        );
        const insertCopy = rawDb.prepare(
          `INSERT INTO resource_copies (resource_id, copy_number, barcode, accession_number, shelf_location)
           VALUES (?, ?, ?, ?, ?)`,
        );
        const maxCopyNo = rawDb.prepare(
          'SELECT COALESCE(MAX(copy_number), 0) AS m FROM resource_copies WHERE resource_id = ?',
        );
        const bumpCopies = rawDb.prepare(
          'UPDATE resources SET total_copies = total_copies + ?, available_copies = available_copies + ? WHERE id = ?',
        );

        for (const n of plan.creates) {
          const r = insertResource.run({
            institution_id: institutionId,
            material_type: n.material_type,
            isbn: n.isbn, issn: n.issn, title: n.title, author: n.author, publisher: n.publisher,
            year: n.year, genre: n.genre, description: n.description, subtitle: n.subtitle,
            edition: n.edition, volume: n.volume, series_title: n.series_title, language: n.language,
            call_number: n.call_number, call_number_type: n.call_number_type,
            subject_headings: serializeSubjectHeadings(n.subject_headings),
            total_copies: n.copies, available_copies: n.copies,
          });
          const resourceId = Number(r.lastInsertRowid);
          for (let i = 0; i < n.copies; i++) {
            // accession/barcode only meaningful for a single-copy row; apply to copy 1.
            const bc = i === 0 ? n.barcode : null;
            const ac = i === 0 ? n.accession_number : null;
            insertCopy.run(resourceId, i + 1, bc, ac, n.shelf_location);
          }
          created += 1;
        }

        for (const add of plan.copyAdds) {
          const startNo = (maxCopyNo.get(add.resourceId) as { m: number }).m;
          for (let i = 0; i < add.copies; i++) {
            insertCopy.run(add.resourceId, startNo + i + 1, null, null, null);
          }
          bumpCopies.run(add.copies, add.copies, add.resourceId);
          copiesAdded += add.copies;
        }

        const j = rawDb.prepare(
          `INSERT INTO import_jobs
            (institution_id, imported_by_user_id, filename, duplicate_strategy, row_count,
             created_count, copies_added_count, skipped_count, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        ).run(
          institutionId, job.importedByUserId, job.filename, job.duplicateStrategy,
          job.rowCount, created, copiesAdded, job.skippedCount,
        );

        return { created, copiesAdded, jobId: Number(j.lastInsertRowid) };
      });

      return tx();
    },
```

Note: `__seedTestInstitution` is a test affordance. If the project lints against extra adapter members, mark it with a leading comment; it is harmless in production (never called). If a stricter boundary is preferred, the reviewer may move seeding into the test via a separate exported helper — but inline keeps the adapter the single source of raw SQL.

- [ ] **Step 5: Add throwing stubs to `packages/server/src/adapter/bridge.ts`**

Add before the closing `};` of the returned object (this feature is desktop-only; Android never calls these):

```ts
    adminLoadImportContext: () => {
      throw new Error('Bulk import is not supported on mobile');
    },
    adminBulkImport: () => {
      throw new Error('Bulk import is not supported on mobile');
    },
```

- [ ] **Step 6: Run the adapter test**

Run: `pnpm --filter @bookleaf/server exec vitest run src/adapter/sqlite.import.test.ts`
Expected: PASS (all tests).

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm --filter @bookleaf/server typecheck`
Expected: no new errors.

```bash
git add packages/server/src/adapter/types.ts packages/server/src/adapter/sqlite.ts packages/server/src/adapter/bridge.ts packages/server/src/adapter/sqlite.import.test.ts
git commit -m "feat(server): add import context + bulk import adapter methods"
```

---

## Task 9: Import service (orchestration)

**Files:**
- Create: `packages/server/src/import/service.ts`
- Test: `packages/server/src/import/service.test.ts`

The service ties together validate → dedup → stats → session for preview, and session → light re-check → plan → adapter for commit. It depends on the `ImportRepo` port and a `SessionStore`, both injected.

- [ ] **Step 1: Write the failing test `packages/server/src/import/service.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { createImportService } from './service';
import { createSessionStore } from './session';
import type { ImportRow } from '@bookleaf/types';
import type { ImportContext, CommitPlan, ImportJobInput, ImportRepo } from './types';

function fakeRepo(ctx: ImportContext): { repo: ImportRepo; lastPlan?: CommitPlan; lastJob?: ImportJobInput } {
  const holder: { repo: ImportRepo; lastPlan?: CommitPlan; lastJob?: ImportJobInput } = {
    repo: {
      loadContext: async () => ctx,
      commit: async (_iid, plan, jobInput) => {
        holder.lastPlan = plan;
        holder.lastJob = jobInput;
        return { created: plan.creates.length, copiesAdded: plan.copyAdds.reduce((a, c) => a + c.copies, 0), jobId: 1 };
      },
    },
  };
  return holder;
}

function row(p: Partial<ImportRow>, i: number): ImportRow {
  return { title: 'T', author: 'A', _rowIndex: i, ...p };
}

const emptyCtx: ImportContext = { catalog: [], barcodes: [], accessions: [] };

describe('import service', () => {
  it('rejects payloads over the row cap', async () => {
    const svc = createImportService(fakeRepo(emptyCtx).repo, createSessionStore());
    const rows = Array.from({ length: 10_001 }, (_, i) => row({}, i));
    await expect(svc.preview(1, rows)).rejects.toThrow(/10,?000/);
  });

  it('previews and then commits valid rows', async () => {
    const holder = fakeRepo(emptyCtx);
    const svc = createImportService(holder.repo, createSessionStore({ genId: () => 'sess1' }));
    const { sessionId, stats } = await svc.preview(1, [row({ title: 'Dune', author: 'Herbert', copies: '2' }, 0)]);
    expect(sessionId).toBe('sess1');
    expect(stats.willCreateResources).toBe(1);
    const res = await svc.commit('sess1', 'skip', 'f.csv');
    expect(res.created).toBe(1);
    expect(holder.lastPlan!.creates).toHaveLength(1);
  });

  it('downgrades force_create_duplicate to skip on an ISBN match', async () => {
    const ctx: ImportContext = {
      catalog: [{ id: 5, isbn: '9780596520687', title: 'X', author: 'Y' }], barcodes: [], accessions: [],
    };
    const holder = fakeRepo(ctx);
    const svc = createImportService(holder.repo, createSessionStore({ genId: () => 's' }));
    await svc.preview(1, [row({ isbn: '0-596-52068-9' }, 0)]);
    const res = await svc.commit('s', 'force_create_duplicate', 'f.csv');
    expect(res.created).toBe(0);              // ISBN match never force-creates
    expect(holder.lastPlan!.creates).toHaveLength(0);
  });

  it('add_copies appends to the matched resource', async () => {
    const ctx: ImportContext = {
      catalog: [{ id: 5, isbn: null, title: 'Dune', author: 'Herbert' }], barcodes: [], accessions: [],
    };
    const holder = fakeRepo(ctx);
    const svc = createImportService(holder.repo, createSessionStore({ genId: () => 's' }));
    await svc.preview(1, [row({ title: 'Dune', author: 'Herbert', copies: '4' }, 0)]);
    const res = await svc.commit('s', 'add_copies', 'f.csv');
    expect(res.copiesAdded).toBe(4);
    expect(holder.lastPlan!.copyAdds).toEqual([{ resourceId: 5, copies: 4 }]);
  });

  it('throws on an expired/unknown session', async () => {
    const svc = createImportService(fakeRepo(emptyCtx).repo, createSessionStore());
    await expect(svc.commit('nope', 'skip', 'f.csv')).rejects.toThrow(/session/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bookleaf/server exec vitest run src/import/service.test.ts`
Expected: FAIL ("Cannot find module './service'").

- [ ] **Step 3: Implement `packages/server/src/import/service.ts`**

```ts
import {
  MAX_IMPORT_ROWS,
  type ImportRow, type DuplicateStrategy,
  type ImportPreviewResult, type ImportCommitResult, type RowVerdict,
} from '@bookleaf/types';
import { validateRow } from './validate';
import { buildVerdicts } from './dedup';
import { computeStats } from './stats';
import type { SessionStore } from './session';
import type { ImportRepo, NormalizedRow, CommitPlan, ImportContext } from './types';

export interface ImportService {
  preview(institutionId: number, rows: ImportRow[]): Promise<ImportPreviewResult>;
  commit(sessionId: string, strategy: DuplicateStrategy, filename: string): Promise<ImportCommitResult & { _institutionId: number }>;
}

/** Build verdicts + a normalized-row map from raw rows against a context. */
function evaluate(rows: ImportRow[], ctx: ImportContext) {
  const validations = rows.map(validateRow);
  const norms = new Map<number, NormalizedRow>();
  for (const v of validations) if (v.normalized) norms.set(v.rowIndex, v.normalized);
  const verdicts = buildVerdicts(validations, ctx);
  return { verdicts, norms };
}

function buildPlan(
  verdicts: RowVerdict[],
  norms: Map<number, NormalizedRow>,
  strategy: DuplicateStrategy,
): { plan: CommitPlan; skipped: { rowIndex: number; reasons: string[] }[] } {
  const creates: NormalizedRow[] = [];
  const copyAdds: { resourceId: number; copies: number }[] = [];
  const skipped: { rowIndex: number; reasons: string[] }[] = [];

  for (const v of verdicts) {
    const n = norms.get(v.rowIndex);
    switch (v.status) {
      case 'valid':
        if (n) creates.push(n);
        break;
      case 'invalid':
      case 'duplicate_file':
        skipped.push({ rowIndex: v.rowIndex, reasons: v.reasons ?? [] });
        break;
      case 'duplicate_existing':
        if (!n) { skipped.push({ rowIndex: v.rowIndex, reasons: v.reasons ?? [] }); break; }
        if (strategy === 'add_copies' && v.matchedResourceId != null) {
          copyAdds.push({ resourceId: v.matchedResourceId, copies: n.copies });
        } else if (strategy === 'force_create_duplicate' && v.matchedBy === 'title_author') {
          creates.push(n);
        } else {
          // skip, or force_create on an ISBN match (downgraded to skip)
          skipped.push({ rowIndex: v.rowIndex, reasons: v.reasons ?? ['Duplicate of an existing record'] });
        }
        break;
    }
  }
  return { plan: { creates, copyAdds }, skipped };
}

export function createImportService(repo: ImportRepo, sessions: SessionStore): ImportService {
  return {
    async preview(institutionId, rows) {
      if (rows.length > MAX_IMPORT_ROWS) {
        throw new Error(`Too many rows: ${rows.length}. The limit is ${MAX_IMPORT_ROWS.toLocaleString()} per import.`);
      }
      const ctx = await repo.loadContext(institutionId);
      const { verdicts, norms } = evaluate(rows, ctx);
      const stats = computeStats(verdicts, norms);
      const sessionId = sessions.create({ institutionId, norms, verdicts });
      return { sessionId, verdicts, stats };
    },

    async commit(sessionId, strategy, filename) {
      const payload = sessions.get(sessionId);
      if (!payload) throw new Error('Import session not found or expired. Please re-run the preview.');

      // Light re-check: reload context and re-derive verdicts so codes/ISBNs that
      // appeared since the preview cannot slip through. Validation is NOT repeated
      // (the normalized rows in the session are reused as the source of truth).
      const ctx = await repo.loadContext(payload.institutionId);
      const recheck = reverify(payload.verdicts, payload.norms, ctx);

      const { plan, skipped } = buildPlan(recheck, payload.norms, strategy);
      const result = await repo.commit(payload.institutionId, plan, {
        institutionId: payload.institutionId,
        importedByUserId: 0, // set by the router from the authenticated principal
        filename,
        duplicateStrategy: strategy,
        rowCount: payload.verdicts.length,
        createdCount: 0,
        copiesAddedCount: 0,
        skippedCount: skipped.length,
      });
      sessions.evict(sessionId);
      return {
        created: result.created,
        copiesAdded: result.copiesAdded,
        skipped,
        jobId: result.jobId,
        _institutionId: payload.institutionId,
      };
    },
  };
}

/**
 * Re-derive verdicts at commit time using the cached normalized rows and the
 * freshly-loaded context. Reuses the same dedup engine by reconstructing
 * minimal validations from the cached normalized rows.
 */
function reverify(
  prior: RowVerdict[],
  norms: Map<number, NormalizedRow>,
  ctx: ImportContext,
): RowVerdict[] {
  const validations = prior.map(v => {
    const n = norms.get(v.rowIndex);
    if (!n) return { rowIndex: v.rowIndex, ok: false as const, normalized: null, reasons: v.reasons ?? [] };
    return { rowIndex: v.rowIndex, ok: true as const, normalized: n, reasons: v.reasons ?? [] };
  });
  return buildVerdicts(validations, ctx);
}
```

Note on `importedByUserId`: the service sets a placeholder `0`; the tRPC procedure in Task 10 overrides it via the repo wrapper using the authenticated principal. The fake repo in the test ignores it.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bookleaf/server exec vitest run src/import/service.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/import/service.ts packages/server/src/import/service.test.ts
git commit -m "feat(server): add import orchestration service"
```

---

## Task 10: tRPC procedures `importPreview` / `importCommit`

**Files:**
- Modify: `packages/server/src/router/admin/books.ts`

The router owns the singleton `SessionStore` and binds the adapter to the `ImportRepo` port, injecting the authenticated `imported_by_user_id` at commit.

- [ ] **Step 1: Add the procedures to `packages/server/src/router/admin/books.ts`**

Add imports at the top:

```ts
import { importPreviewInput, importCommitInput } from '@bookleaf/types';
import { createImportService } from '../../import/service';
import { createSessionStore } from '../../import/session';
import type { ImportRepo } from '../../import/types';

// Process-wide session store (desktop server is single-process).
const importSessions = createSessionStore();
```

Add these procedures inside the `router({ ... })` object (after `addCopy`):

```ts
  importPreview: librarianProcedure
    .input(importPreviewInput)
    .mutation(async ({ input, ctx }) => {
      const repo: ImportRepo = {
        loadContext: (iid) => ctx.db.adminLoadImportContext(iid),
        commit: (iid, plan, job) => ctx.db.adminBulkImport(iid, plan, job),
      };
      const svc = createImportService(repo, importSessions);
      try {
        return await svc.preview(input.institutionId, input.rows);
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Preview failed' });
      }
    }),

  importCommit: librarianProcedure
    .input(importCommitInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.principal.user_id;
      const repo: ImportRepo = {
        loadContext: (iid) => ctx.db.adminLoadImportContext(iid),
        // Inject the authenticated user as the importer.
        commit: (iid, plan, job) => ctx.db.adminBulkImport(iid, plan, { ...job, importedByUserId: userId }),
      };
      const svc = createImportService(repo, importSessions);
      try {
        const { _institutionId, ...result } = await svc.commit(input.sessionId, input.duplicateStrategy, input.filename);
        void _institutionId;
        return result;
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Import failed' });
      }
    }),
```

- [ ] **Step 2: Typecheck the server**

Run: `pnpm --filter @bookleaf/server typecheck`
Expected: no new errors. `ctx.principal` is non-null inside `librarianProcedure` (see `trpc.ts`).

- [ ] **Step 3: Build the server to confirm the router compiles end-to-end**

Run: `pnpm --filter @bookleaf/server build:desktop`
Expected: build succeeds (esbuild bundles the new modules and the `.sql` text import).

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/router/admin/books.ts
git commit -m "feat(server): expose importPreview/importCommit tRPC procedures"
```

---

## Task 11: Renderer — spreadsheet parsing

**Files:**
- Modify: `apps/desktop/package.json` (add `xlsx`)
- Create: `apps/desktop/vitest.config.ts`
- Create: `apps/desktop/src/lib/importParse.ts`
- Test: `apps/desktop/src/lib/importParse.test.ts`

`parseSpreadsheet` accepts an `ArrayBuffer` + filename (so it is testable in Node) and returns `{ headers, rows }` where each row is a `Record<header, string>`. The React component reads the picked `File` into an `ArrayBuffer` before calling it.

- [ ] **Step 1: Add `xlsx` and vitest to `apps/desktop/package.json`**

Add to `dependencies`: `"xlsx": "^0.18.5"`. Add to `devDependencies`: `"vitest": "^2.1.0"`. Add to `scripts`: `"test": "vitest run"`.

- [ ] **Step 2: Create `apps/desktop/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
});
```

- [ ] **Step 3: Write the failing test `apps/desktop/src/lib/importParse.test.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm install` then `pnpm --filter @bookleaf/desktop-app exec vitest run src/lib/importParse.test.ts`
Expected: FAIL ("Cannot find module './importParse'").

- [ ] **Step 5: Implement `apps/desktop/src/lib/importParse.ts`**

```ts
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @bookleaf/desktop-app exec vitest run src/lib/importParse.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/package.json apps/desktop/vitest.config.ts apps/desktop/src/lib/importParse.ts apps/desktop/src/lib/importParse.test.ts pnpm-lock.yaml
git commit -m "feat(desktop): add spreadsheet parsing for book import"
```

---

## Task 12: Renderer — column auto-guess & mapping

**Files:**
- Create: `apps/desktop/src/lib/importMapping.ts`
- Test: `apps/desktop/src/lib/importMapping.test.ts`

- [ ] **Step 1: Write the failing test `apps/desktop/src/lib/importMapping.test.ts`**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bookleaf/desktop-app exec vitest run src/lib/importMapping.test.ts`
Expected: FAIL ("Cannot find module './importMapping'").

- [ ] **Step 3: Implement `apps/desktop/src/lib/importMapping.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bookleaf/desktop-app exec vitest run src/lib/importMapping.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/importMapping.ts apps/desktop/src/lib/importMapping.test.ts
git commit -m "feat(desktop): add column auto-guess and mapping"
```

---

## Task 13: Renderer — import wizard page & entry point

**Files:**
- Create: `apps/desktop/src/pages/ImportBooks.tsx`
- Modify: the desktop route registration (locate the `react-router-dom` route table; search for where `Books` is registered)
- Modify: `apps/desktop/src/pages/Books.tsx` (add an "Import from file" button → navigates to the import route)

This task is UI; it is verified manually (Task 14) rather than with unit tests. Use existing `@bookleaf/ui` components and the `useTRPC()` hook (see `apps/desktop/src/lib/trpc.ts` and existing pages for patterns).

- [ ] **Step 1: Locate the route table and the institution id source**

Run: `git grep -n "Books" apps/desktop/src` and `git grep -n "institutionId\|institution_id\|useAuthStore" apps/desktop/src`
Expected: identify (a) where routes are declared (e.g. `App.tsx` or a routes file) and (b) how the current institution id is obtained (e.g. `useAuthStore`). Use those exact sources below.

- [ ] **Step 2: Create `apps/desktop/src/pages/ImportBooks.tsx`**

A four-step wizard. Replace `useInstitutionId()` and the auth/institution source with the actual hook found in Step 1. The component reads a `File` via a hidden `<input type="file">`, converts to `ArrayBuffer`, then drives parse → map → preview → commit.

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { parseSpreadsheet } from '@/lib/importParse';
import { autoGuessMapping, applyMapping, IMPORT_FIELDS, IGNORE } from '@/lib/importMapping';
import type { ImportField } from '@/lib/importMapping';
import type { DuplicateStrategy, ImportRow, PreviewStats, RowVerdict } from '@bookleaf/types';
import { useAuthStore } from '@/store/useAuthStore'; // adjust to the real institution source

type Step = 'upload' | 'map' | 'preview' | 'result';

export default function ImportBooks() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const institutionId = useAuthStore(s => s.institutionId); // adjust per Step 1

  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState('import');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, ImportField | typeof IGNORE>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<RowVerdict[]>([]);
  const [stats, setStats] = useState<PreviewStats | null>(null);
  const [strategy, setStrategy] = useState<DuplicateStrategy>('skip');

  const previewMut = useMutation(trpc.adminBooks.importPreview.mutationOptions());
  const commitMut = useMutation(trpc.adminBooks.importCommit.mutationOptions());

  const hasIsbnMatch = verdicts.some(v => v.status === 'duplicate_existing' && v.matchedBy === 'isbn');

  async function onFile(file: File) {
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const { headers, rows } = await parseSpreadsheet(buf, file.name);
      setFilename(file.name);
      setHeaders(headers);
      setRawRows(rows);
      setMapping(autoGuessMapping(headers));
      setStep('map');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file.');
    }
  }

  const requiredMapped =
    Object.values(mapping).includes('title') && Object.values(mapping).includes('author');

  async function runPreview() {
    setError(null);
    const rows: ImportRow[] = applyMapping(rawRows, mapping as Record<string, string>);
    try {
      const res = await previewMut.mutateAsync({ institutionId, rows });
      setSessionId(res.sessionId);
      setVerdicts(res.verdicts);
      setStats(res.stats);
      setStep('preview');
    } catch (e) {
      setError(getTRPCErrorMessage(e));
    }
  }

  async function runCommit() {
    if (!sessionId) return;
    setError(null);
    try {
      await commitMut.mutateAsync({ sessionId, duplicateStrategy: strategy, filename });
      setStep('result');
    } catch (e) {
      setError(getTRPCErrorMessage(e));
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-brand">Import Books</h1>
      {error && <p className="text-red-600">{error}</p>}

      {step === 'upload' && (
        <div className="space-y-2">
          <p>Choose a .csv or .xlsx file (up to 10,000 rows).</p>
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
          />
        </div>
      )}

      {step === 'map' && (
        <div className="space-y-3">
          <p>{rawRows.length} rows detected. Map each column:</p>
          <div className="grid grid-cols-2 gap-2 max-w-xl">
            {headers.map(h => (
              <div key={h} className="contents">
                <span className="font-medium">{h}</span>
                <select
                  value={mapping[h]}
                  onChange={e => setMapping({ ...mapping, [h]: e.target.value as ImportField | typeof IGNORE })}
                >
                  <option value={IGNORE}>(Ignore)</option>
                  {IMPORT_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            ))}
          </div>
          {!requiredMapped && <p className="text-amber-600">Map both Title and Author to continue.</p>}
          <button disabled={!requiredMapped || previewMut.isPending} onClick={() => void runPreview()}>
            {previewMut.isPending ? 'Checking…' : 'Preview'}
          </button>
        </div>
      )}

      {step === 'preview' && stats && (
        <div className="space-y-3">
          <div className="flex gap-4">
            <Stat label="Valid" value={stats.valid} />
            <Stat label="Duplicate (existing)" value={stats.duplicateExisting} />
            <Stat label="Duplicate (in file)" value={stats.duplicateFile} />
            <Stat label="Invalid" value={stats.invalid} />
          </div>
          <p>Will create <b>{stats.willCreateResources}</b> books and <b>{stats.willCreateCopies}</b> copies.</p>

          <fieldset className="space-y-1">
            <legend className="font-medium">For books already in the catalog:</legend>
            {(['skip', 'add_copies', 'force_create_duplicate'] as DuplicateStrategy[]).map(s => (
              <label key={s} className="block">
                <input
                  type="radio" name="strategy" value={s} checked={strategy === s}
                  disabled={s === 'force_create_duplicate' && hasIsbnMatch}
                  onChange={() => setStrategy(s)}
                />{' '}
                {s === 'skip' && `Skip them (skip ${stats.duplicateExisting} rows)`}
                {s === 'add_copies' && `Add copies to existing (${stats.perStrategy.add_copies.copies} copies)`}
                {s === 'force_create_duplicate' &&
                  `Import as new${hasIsbnMatch ? ' — unavailable: some matches are by ISBN' : ` (${stats.perStrategy.force_create_duplicate.resources} new books)`}`}
              </label>
            ))}
          </fieldset>

          <button disabled={commitMut.isPending} onClick={() => void runCommit()}>
            {commitMut.isPending ? 'Importing…' : 'Import'}
          </button>
        </div>
      )}

      {step === 'result' && commitMut.data && (
        <div className="space-y-2">
          <p className="text-brand font-medium">Import complete.</p>
          <p>Created {commitMut.data.created} books, added {commitMut.data.copiesAdded} copies, skipped {commitMut.data.skipped.length} rows.</p>
          {commitMut.data.skipped.length > 0 && (
            <details>
              <summary>Skipped rows</summary>
              <ul className="list-disc ml-6">
                {commitMut.data.skipped.map(s => (
                  <li key={s.rowIndex}>Row {s.rowIndex + 2}: {s.reasons.join('; ')}</li>
                ))}
              </ul>
            </details>
          )}
          <button onClick={() => navigate(-1)}>Back to Books</button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-mint-dark px-3 py-2">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
    </div>
  );
}
```

Note: `trpc.adminBooks.importPreview.mutationOptions()` follows the `@trpc/tanstack-react-query` pattern already used in this app; if existing pages call mutations differently, match the established pattern found in Step 1. The skipped-row label uses `rowIndex + 2` to map a zero-based data row back to a spreadsheet line (header + 1-based).

- [ ] **Step 3: Register the route**

In the route table found in Step 1, add a route (e.g. path `/books/import`) rendering `ImportBooks`. Match the existing route declaration style exactly.

- [ ] **Step 4: Add the entry point in `apps/desktop/src/pages/Books.tsx`**

Add a button near the existing "add book" affordance that navigates to the import route, e.g.:

```tsx
<button onClick={() => navigate('/books/import')} className="...match existing button styles...">
  Import from file
</button>
```

Use the page's existing `useNavigate()` (add the import if not present).

- [ ] **Step 5: Typecheck the desktop app**

Run: `pnpm --filter @bookleaf/desktop-app exec tsc --noEmit`
Expected: no errors. Fix any mismatch between the placeholder hook/route names and the real ones.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/pages/ImportBooks.tsx apps/desktop/src/pages/Books.tsx apps/desktop/src/App.tsx
git commit -m "feat(desktop): add bulk book import wizard"
```

---

## Task 14: End-to-end verification

**Files:** none (manual verification)

- [ ] **Step 1: Run the full server test suite**

Run: `pnpm --filter @bookleaf/server test`
Expected: all import tests pass (isbn, validate, dedup, stats, session, service, adapter).

- [ ] **Step 2: Run the desktop test suite**

Run: `pnpm --filter @bookleaf/desktop-app test`
Expected: importParse + importMapping tests pass.

- [ ] **Step 3: Typecheck the whole repo**

Run: `pnpm typecheck`
Expected: no new errors beyond the pre-existing ones documented in AGENTS.md.

- [ ] **Step 4: Manual smoke test (desktop)**

Run the desktop app (`pnpm --filter @bookleaf/desktop-app tauri dev` or the project's usual desktop run command). Then:
1. Create a small `books.csv` with headers `Title,Author,ISBN,Copies` and ~5 rows, including one duplicate row and one row that matches a book already in the catalog.
2. Books → "Import from file" → pick the CSV.
3. Confirm auto-mapping is correct; click Preview.
4. Confirm counts: the in-file duplicate shows as "Duplicate (in file)", the catalog match as "Duplicate (existing)".
5. Pick a duplicate strategy; click Import.
6. Confirm the result counts and that the new books appear in the Books list.
7. (Optional) Inspect the `import_jobs` table in the SQLite DB to confirm an audit row was written.

- [ ] **Step 5: Final commit (if any cleanup was needed)**

```bash
git add -A
git commit -m "chore: bulk import end-to-end verification cleanup" || echo "nothing to commit"
```

---

## Self-Review notes (for the implementer)

- **Spec coverage:** formats (Task 11), mapping (Task 12), row=title+copies (Tasks 3/8), in-file + existing dedup with ISBN-13 (Tasks 2/4), barcode collision (Task 4/8), dry-run stats (Task 5), session (Task 6/9), transactional commit + audit (Tasks 7/8/9), 10k cap (Tasks 9/11), `force_create_duplicate` rename + ISBN downgrade (Tasks 5/9), wizard + entry point (Task 13).
- **Out of scope (do not build):** Dublin Core/MARC, field-update on duplicate, saved mapping templates, streaming >10k, a DB unique constraint on barcode/accession, any UI reading `import_jobs`.
- **If `mutationOptions()` is not the pattern in this app,** adapt Task 13 to the real `useTRPC` usage you find — do not invent an API.
