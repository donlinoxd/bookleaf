# CSV / XLSX Bulk Book Importer — Design

**Date:** 2026-06-15
**Scope:** `apps/desktop` (Tauri renderer) + `packages/server` (tRPC) + `packages/types` (shared zod)
**Status:** Approved design, pending spec review

## Problem

A school or small institution adopting Bookleaf almost always already has its catalog
in a spreadsheet. Re-typing thousands of books on a phone is a non-starter, so the lack
of a bulk import is a concrete adoption blocker. The desktop app — with a keyboard, large
screen, and `@tanstack/react-table` — is the right place to solve it.

Goal: let a librarian import an existing `.csv` or `.xlsx` catalog into the institution's
collection in minutes, with forgiving column mapping, duplicate detection, and a clear
report of anything skipped.

## Settled decisions

| Decision | Choice |
|---|---|
| Input formats (v1) | CSV **and** `.xlsx` (both via SheetJS) |
| Column mapping | Interactive UI with auto-guessed defaults |
| Row granularity | One row = one **title**, with an optional `copies` count |
| Duplicate handling | Detected before commit; user picks one batch action |
| Invalid rows | Valid rows commit in one transaction; skipped rows reported with reasons |
| Where parsing runs | Renderer (where the `File` is) |
| Where validation/dedup/commit run | Server package (where Drizzle + zod live) |

## Architecture & data flow

```
[Tauri dialog: pick .csv/.xlsx]
        v
[Renderer: SheetJS parse -> raw rows + detected headers]
        v
[Mapping UI: header -> Bookleaf field, auto-guessed]
        v  rows mapped to canonical ImportRow shape (client-side)
[trpc adminBooks.importPreview]  -> server validates + dedups (read-only)
        v  per-row verdict returned
[Preview UI: counts, skipped reasons, duplicate batch action]
        v  user confirms
[trpc adminBooks.importCommit] -> one transaction, reuses adminCreateBook
        v
[Result UI: created / copies added / skipped list]
```

Parsing lives in the renderer because that is where the picked `File` exists. Validation,
deduplication, and the transactional write live in the server package because that is where
Drizzle and the canonical zod schemas already are. This respects the existing package
boundaries (the shared server is not taught to read arbitrary filesystem paths, which would
matter for the Android build).

## Shared types (`packages/types`)

Canonical mapped-row shape, validated with zod and reused by both procedures:

```ts
ImportRow = {
  // required
  title: string
  author: string
  // optional bibliographic
  isbn?, issn?, publisher?, year?, genre?, description?,
  subtitle?, edition?, volume?, series_title?, language?,
  call_number?, call_number_type?, material_type?, subject_headings?,
  // copy-level (applies to a single-copy row)
  copies?, accession_number?, barcode?, shelf_location?,
  // provenance
  _rowIndex: number
}

RowVerdict = {
  rowIndex: number
  status: 'valid' | 'invalid' | 'duplicate'
  reasons?: string[]            // why invalid, or coercion warnings
  matchedResourceId?: number    // set when status === 'duplicate'
  matchedTitle?: string
}

DuplicateStrategy = 'skip' | 'add_copies' | 'import_new'
```

## New tRPC procedures (`adminBooksRouter`, `librarianProcedure`)

### `importPreview({ institutionId, rows: ImportRow[] }) -> { verdicts: RowVerdict[], summary }`

- Pure read; performs **no** writes.
- Validates each row against the zod schema and the coercion rules below.
- Deduplicates against the institution's existing catalog. Dedup key:
  - normalized `isbn` when present (strip hyphens/spaces), else
  - `lower(trim(title)) + '|' + lower(trim(author))`.
- One batched query loads existing `(isbn, title, author, id)` for the institution; matching
  is done in memory to avoid N queries.
- `summary` = counts of `valid | duplicate | invalid`.

### `importCommit({ institutionId, rows, duplicateStrategy }) -> { created, copiesAdded, skipped }`

- **Re-runs** the same validation + dedup server-side; the client's verdicts are advisory
  only, so a stale preview can never cause a bad write.
- Runs inside a single DB transaction:
  - `valid` and (under `import_new`) `duplicate` rows -> created via the existing
    `adminCreateBook` path (resource + N copy records).
  - `duplicate` rows under `add_copies` -> add `copies` copy records to the matched resource
    and bump `total_copies` / `available_copies`.
  - `duplicate` rows under `skip` -> skipped.
  - `invalid` rows -> skipped, always.
- Returns `created` (resource count), `copiesAdded` (copy count added to existing resources),
  and `skipped: { rowIndex, reasons }[]`.

## Mapping & validation rules

- **Required:** `title` and `author` (both `NOT NULL` in `resources`). Blank `title` ->
  invalid/skipped. Blank `author` -> invalid/skipped by default. (Optional future toggle:
  treat blank author as `"Unknown"`; not in v1.)
- **Coerced / normalized (row stays valid, warning attached):**
  - `year` -> int; non-numeric drops the field with a warning.
  - `material_type` -> upper-cased, checked against
    `BOOK | SERIAL | ARTICLE | AUDIOVISUAL | MAP | MANUSCRIPT | DIGITAL | THESIS | OTHER`;
    unknown value -> defaults to `BOOK` with a warning.
  - `call_number_type` -> mapped to `DEWEY | LC | OTHER`.
  - `copies` -> int >= 1, default 1.
  - `subject_headings` -> split on `;`, then serialized via the existing
    `serializeSubjectHeadings` helper.
- **Auto-guess:** headers are matched case-insensitively against a synonym table, e.g.
  `title | book title | name -> title`, `author | by | writer -> author`,
  `isbn | isbn13 -> isbn`, `copies | quantity | qty -> copies`. Every mapping is editable by
  the user, including an explicit "Ignore this column" option.

## UI — 4-step wizard

New route/page under `apps/desktop/src/pages`, launched from `Books.tsx`. Built with
`@bookleaf/ui` (shadcn) and `@tanstack/react-table`, matching existing Books patterns.

1. **Upload** — drag/drop or Tauri file dialog (`@tauri-apps/plugin-dialog`); parse with
   SheetJS; show detected row count and column headers.
2. **Map columns** — one dropdown per detected header -> Bookleaf field (auto-guessed);
   block "Next" until required fields (`title`, `author`) are mapped.
3. **Preview** — calls `importPreview`; summary cards (`N valid · M duplicates · K invalid`),
   an expandable skipped-rows list with reasons, and a radio for `DuplicateStrategy`.
4. **Result** — calls `importCommit`; shows created / copies-added / skipped counts and the
   skipped-row list (so the librarian can fix and re-import); invalidates the books React
   Query cache.

## Error handling

- Parse failures (corrupt file, zero rows, no headers) -> friendly error on step 1, no
  server call.
- `importCommit` is transactional: a DB error rolls back the whole batch and surfaces a
  failure message; nothing is partially written.
- Client verdicts are advisory; the server re-validates on commit.

## Testing

- **Server unit tests (core):** validation rules, dedup matching (ISBN vs title+author),
  each `DuplicateStrategy`, and the skipped-row report — driven through
  `importPreview` / `importCommit` against an in-memory SQLite database.
- **Mapping/coercion unit tests:** synonym auto-guess, and coercion of `year`,
  `material_type`, `copies`, and `subject_headings`.
- **Renderer:** small `.csv` and `.xlsx` fixtures exercise the SheetJS parse ->
  `ImportRow` transform. SheetJS itself is not re-tested.

## Scope boundaries (YAGNI)

**In v1:** CSV + xlsx parsing, interactive mapping, preview with dedup, transactional
commit, skipped-row report.

**Out of v1:** Dublin Core / MARC import; updating existing fields on a duplicate (only
skip / add-copies / import-new); saved/reusable mapping templates; background or streaming
import for very large files (>50k rows); cover-image fetch during import.

## New dependency

- SheetJS (`xlsx`) in `apps/desktop` — parses both CSV and `.xlsx` in the renderer.
