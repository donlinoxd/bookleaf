# CSV / XLSX Bulk Book Importer — Design

**Date:** 2026-06-15
**Scope:** `apps/desktop` (Tauri renderer) + `packages/server` (tRPC) + `packages/types` (shared zod) + `packages/db` (new `import_jobs` table)
**Status:** Revised after review, pending spec re-review

## Problem

A school or small institution adopting Bookleaf almost always already has its catalog
in a spreadsheet. Re-typing thousands of books on a phone is a non-starter, so the lack
of a bulk import is a concrete adoption blocker. The desktop app — with a keyboard, large
screen, and `@tanstack/react-table` — is the right place to solve it.

Goal: let a librarian import an existing `.csv` or `.xlsx` catalog into the institution's
collection in minutes, with forgiving column mapping, robust duplicate detection (against
the existing catalog *and* within the file), barcode-collision safety, a clear preview of
exactly what will happen, and a recorded audit of the import.

## Settled decisions

| Decision | Choice |
|---|---|
| Input formats (v1) | CSV **and** `.xlsx` (both via SheetJS) |
| Column mapping | Interactive UI with auto-guessed defaults |
| Row granularity | One row = one **title**, with an optional `copies` count |
| Duplicate handling | Detected before commit (existing catalog **and** in-file); user picks one batch action |
| Invalid rows | Valid rows commit in one transaction; skipped rows reported with reasons |
| Where parsing runs | Renderer (where the `File` is) |
| Where validation/dedup/commit run | Server package (where Drizzle + zod live) |
| Preview -> commit handoff | Server-side **import session** caches computed verdicts; commit writes from the cache |
| Size cap (v1) | Hard limit of 10,000 rows, enforced server-side |
| Audit | Every committed import writes an `import_jobs` row |

## Architecture & data flow

```
[Tauri dialog: pick .csv/.xlsx]
        v
[Renderer: SheetJS parse -> raw rows + detected headers]   (reject > 10,000 rows)
        v
[Mapping UI: header -> Bookleaf field, auto-guessed]
        v  rows mapped to canonical ImportRow shape (client-side)
[trpc adminBooks.importPreview]  -> server validates + dedups (read-only)
        |                            -> creates import session (caches verdicts + normalized rows)
        v  { sessionId, verdicts, stats } returned
[Preview UI: stats, skipped reasons, duplicate batch action]
        v  user confirms
[trpc adminBooks.importCommit(sessionId, duplicateStrategy)]
        |   -> load session, light re-check of collisions/existing-ISBN, write in one transaction
        v   -> write import_jobs audit row
[Result UI: created / copies added / skipped list]
```

Parsing lives in the renderer because that is where the picked `File` exists. Validation,
deduplication, and the transactional write live in the server package because that is where
Drizzle and the canonical zod schemas already are. This respects the existing package
boundaries (the shared server is not taught to read arbitrary filesystem paths, which would
matter for the Android build).

### Why a session (not re-send + re-validate everything)

`importCommit` does **not** re-run full validation/dedup over a client-resent payload. Instead
`importPreview` stores the computed verdicts and normalized rows in a server-side session
cache, and commit writes from that cache. This:

- avoids re-sending the entire (up to 10k-row) payload on commit;
- gives the audit job (`import_jobs`) a natural anchor;
- still does **not** trust client verdicts (they are never the source of truth).

Caveat handled at commit: the catalog may change between preview and commit (another
librarian adds a book). So commit performs a **light** re-check — existing-ISBN match plus
barcode/accession collisions only — which is cheap, and skips any row that would now collide.
Full re-validation is intentionally not repeated. No `previewHash` is used (the session
already pins the exact rows being committed).

Session cache: in-memory map in the desktop server process, keyed by `sessionId`, with a
short TTL (e.g. 15 minutes) and eviction on commit. Acceptable because the desktop server is
single-process and single-institution.

## Shared types (`packages/types`)

Canonical mapped-row shape, validated with zod and reused across procedures:

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

RowStatus =
  | 'valid'
  | 'invalid'
  | 'duplicate_existing'   // matches a book already in the catalog
  | 'duplicate_file'       // matches an earlier row in this same file

RowVerdict = {
  rowIndex: number
  status: RowStatus
  reasons?: string[]           // why invalid, coercion warnings, or which collision
  matchedResourceId?: number   // set for duplicate_existing
  matchedBy?: 'isbn' | 'title_author'   // strength of the existing match
  firstRowIndex?: number       // set for duplicate_file (the kept occurrence)
}

DuplicateStrategy = 'skip' | 'add_copies' | 'force_create_duplicate'

PreviewStats = {
  rows: number
  valid: number
  duplicateExisting: number
  duplicateFile: number
  invalid: number
  // dry-run projections
  willCreateResources: number
  willCreateCopies: number
  // per-strategy projection for duplicate_existing rows
  perStrategy: {
    skip:        { resources: number; copies: number }
    add_copies:  { resources: number; copies: number }
    force_create_duplicate: { resources: number; copies: number }
  }
}
```

## New tRPC procedures (`adminBooksRouter`, `librarianProcedure`)

### `importPreview({ institutionId, rows: ImportRow[] }) -> { sessionId, verdicts, stats }`

- Rejects payloads over 10,000 rows with a clear error before any work.
- Pure read; performs **no** writes to the catalog.
- Validates each row against the zod schema and the coercion rules below.
- **In-file dedup first:** walks rows in order; a row whose dedup key was already seen earlier
  in the file is marked `duplicate_file` with `firstRowIndex` pointing at the kept occurrence.
- **Existing-catalog dedup:** remaining rows are matched against the institution's catalog.
  Dedup key:
  - normalized ISBN when present (see ISBN rules below), else
  - `lower(trim(title)) + '|' + lower(trim(author))`.
  One batched query loads existing `(isbn, title, author, id)` for the institution; matching is
  in memory. `matchedBy` records whether the match was by ISBN or title+author.
- **Collision check:** any `barcode` / `accession_number` that collides with an existing copy,
  or with another row in the file, marks the row `invalid` with a reason.
- Computes `PreviewStats`, including the dry-run copy projections and the per-strategy outcome
  for `duplicate_existing` rows.
- Stores verdicts + normalized rows in a new import session; returns its `sessionId`.

### `importCommit({ sessionId, duplicateStrategy }) -> { created, copiesAdded, skipped, jobId }`

- Loads the session (error if missing/expired).
- Performs the **light** re-check (existing-ISBN + barcode/accession collisions) and drops any
  newly-colliding row to skipped.
- Runs inside a single DB transaction:
  - `valid` rows -> created via the existing `adminCreateBook` path (resource + N copies).
  - `duplicate_file` rows -> always skipped (collapsed into `firstRowIndex`).
  - `duplicate_existing` rows -> obey `duplicateStrategy`:
    - `skip` -> skipped.
    - `add_copies` -> add `copies` copy records to the matched resource and bump
      `total_copies` / `available_copies`.
    - `force_create_duplicate` -> create a new resource anyway. **Only honored when
      `matchedBy === 'title_author'`;** for an ISBN match this strategy is treated as `skip`
      (an exact-ISBN duplicate bib record is almost always a cataloging error). The UI also
      disables this option when any match is by ISBN.
  - `invalid` rows -> skipped, always.
- Writes one `import_jobs` audit row (see below).
- Returns `created` (resources), `copiesAdded` (copies added to existing resources),
  `skipped: { rowIndex, reasons }[]`, and `jobId`.
- Evicts the session.

## Audit table (`packages/db`, new)

```ts
import_jobs = {
  id: integer pk
  institution_id: integer -> institutions.id
  imported_by_user_id: integer -> users.id
  filename: text                 // original file name from the dialog
  duplicate_strategy: text
  row_count: integer             // rows submitted to preview
  created_count: integer         // resources created
  copies_added_count: integer    // copies added to existing resources
  skipped_count: integer
  started_at: text default datetime('now')
  completed_at: text
}
```

Written on every commit. No UI reads it in v1; it exists so "who imported these 4,000 books?"
is answerable later. Requires `npm run db:generate` to produce the migration.

## Mapping & validation rules

- **Required:** `title` and `author` (both `NOT NULL` in `resources`). Blank `title` ->
  invalid/skipped. Blank `author` -> invalid/skipped by default. (Optional future toggle:
  treat blank author as `"Unknown"`; not in v1.)
- **ISBN normalization:** strip hyphens/spaces, then **normalize ISBN-10 to ISBN-13** so
  `0-596-52068-9` and `9780596520687` dedup as the same book. A malformed ISBN is not fatal —
  it is kept as-is on the record but is not used as a dedup key (falls back to title+author).
- **Other coercions (row stays valid, warning attached):**
  - `year` -> int; non-numeric drops the field with a warning.
  - `material_type` -> upper-cased, checked against
    `BOOK | SERIAL | ARTICLE | AUDIOVISUAL | MAP | MANUSCRIPT | DIGITAL | THESIS | OTHER`;
    unknown value -> defaults to `BOOK` with a warning.
  - `call_number_type` -> mapped to `DEWEY | LC | OTHER`.
  - `copies` -> int >= 1, default 1.
  - `subject_headings` -> split on `;`, then serialized via the existing
    `serializeSubjectHeadings` helper.
- **Collision validation:** `barcode` and `accession_number` must be unique against existing
  copies and within the file. (Note: `resource_copies` has no DB unique constraint today;
  adding one is its own migration and is out of v1 scope — this validation is the v1 guard.)
- **Auto-guess:** headers are matched case-insensitively against a synonym table, e.g.
  `title | book title | name -> title`, `author | by | writer -> author`,
  `isbn | isbn13 -> isbn`, `copies | quantity | qty -> copies`. Every mapping is editable by
  the user, including an explicit "Ignore this column" option.

## UI — 4-step wizard

New route/page under `apps/desktop/src/pages`, launched from `Books.tsx`. Built with
`@bookleaf/ui` (shadcn) and `@tanstack/react-table`, matching existing Books patterns.

1. **Upload** — drag/drop or Tauri file dialog (`@tauri-apps/plugin-dialog`); parse with
   SheetJS; show detected row count and column headers. Reject > 10,000 rows here with a clear
   message before any server call.
2. **Map columns** — one dropdown per detected header -> Bookleaf field (auto-guessed);
   block "Next" until required fields (`title`, `author`) are mapped.
3. **Preview** — calls `importPreview`. Shows:
   - status counts (`valid · duplicate (existing) · duplicate (in file) · invalid`);
   - **dry-run projection**: "Will create N resources and M copies", plus the chosen
     strategy's effect on existing-duplicates ("would add K copies" / "would skip K rows");
   - expandable skipped/duplicate lists with reasons;
   - a radio for `DuplicateStrategy` (the `force_create_duplicate` option is disabled when any
     match is by ISBN).
4. **Result** — calls `importCommit`; shows created / copies-added / skipped counts and the
   skipped-row list (so the librarian can fix and re-import); invalidates the books React
   Query cache.

## Error handling

- Parse failures (corrupt file, zero rows, no headers, > 10,000 rows) -> friendly error on
  step 1, no server call.
- Expired/missing session on commit -> clear error asking the user to re-run the preview.
- `importCommit` is transactional: a DB error rolls back the whole batch and surfaces a
  failure message; nothing is partially written.
- Client verdicts are advisory; the session is the source of truth, and commit re-checks
  collisions/existing-ISBN.

## Testing

- **Server unit tests (core):**
  - validation + coercion rules (year, material_type, copies, subject split);
  - ISBN-10 -> ISBN-13 normalization and ISBN-based dedup;
  - in-file dedup (`duplicate_file`) vs existing-catalog dedup (`duplicate_existing`);
  - barcode/accession collision (against existing copies and within file);
  - each `DuplicateStrategy`, including `force_create_duplicate` being downgraded to `skip` on
    an ISBN match;
  - `PreviewStats` projections (resources/copies, per-strategy);
  - session lifecycle: preview -> commit writes from cache, expired session errors, light
    re-check drops a row that collides post-preview;
  - `import_jobs` row written with correct counts.
  All driven through `importPreview` / `importCommit` against an in-memory SQLite database.
- **Mapping/auto-guess unit tests:** synonym matching and "Ignore" handling.
- **Renderer:** small `.csv` and `.xlsx` fixtures exercise the SheetJS parse -> `ImportRow`
  transform and the > 10,000-row rejection. SheetJS itself is not re-tested.

## Scope boundaries (YAGNI)

**In v1:** CSV + xlsx parsing, interactive mapping, in-file + existing-catalog dedup with
ISBN-13 normalization, barcode/accession collision validation, preview with dry-run copy
stats, server-side import session, transactional commit, enforced 10k-row cap, and an
`import_jobs` audit row.

**Out of v1:** Dublin Core / MARC import; updating existing fields on a duplicate (only
skip / add-copies / force-create); saved/reusable mapping templates; chunked/streaming import
for very large files (> 10k rows); a DB unique constraint on barcode/accession; any UI that
reads `import_jobs`; cover-image fetch during import; treating blank author as "Unknown".

## New dependency

- SheetJS (`xlsx`) in `apps/desktop` — parses both CSV and `.xlsx` in the renderer.
