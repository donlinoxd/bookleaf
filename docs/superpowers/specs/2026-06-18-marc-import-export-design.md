# MARC Import / Export (MARCXML) — Design Spec

**Date:** 2026-06-18
**Status:** Approved
**Scope:** Desktop-only feature. The mobile server app (`apps/server`) must NOT change. Shared packages (`packages/types`, `packages/server`) and the desktop app (`apps/desktop`) may change.

## Goal

Let a librarian **import** MARC records into the catalog and **export** catalog records as MARC, using the **MARCXML** (MARC21) serialization. This is Slice 3 of the catalog roadmap and consumes the field→MARC mapping introduced in Slice 2 (material-type fields).

## Decisions (locked during brainstorming)

1. **Both directions** in v1: import and export.
2. **MARCXML only** (no binary ISO 2709 `.mrc` in v1 — deferred to a later slice).
3. **Auto-link authorities on import:** get-or-create author/publisher/subject authority records and link them, keeping denormalized text in sync (consistent with Slice 1). This extends the shared import pipeline.
4. **Leader-based material-type detection** on import, with a safe `BOOK` fallback.
5. **Export the current Books-page view** (respects the search box `q`; no filter → all books) as a single MARCXML `<collection>` written via the Tauri save dialog.

## Non-goals (v1)

- Binary ISO 2709 (`.mrc`).
- Byte-for-byte lossless round-trip of arbitrary external MARC. Unmapped MARC fields are dropped on import (v1 is lossy; documented).
- Copy-level holdings in export (export is bibliographic-only; `total_copies` and per-copy data are not encoded).
- Z39.50 / SRU fetching (separate concern).
- Any change to `apps/server`.

## Architecture

MARC logic lives **server-side** (`packages/server`, the Node sidecar): the import pipeline, authority get-or-create, and DB access are all there, and XML/MARC parsing is pure logic that unit-tests cleanly with Vitest (no DOM). The desktop only reads/writes files and calls tRPC.

**New dependency:** `fast-xml-parser` in `packages/server` (pure-JS, no native build) for MARCXML parse; serialization emits XML by string-building with proper escaping.

**Single source of truth for tags:** a `FIELD_MARC_TAGS` map (resource field key → primary MARC tag/subfield) is extracted into `packages/types`, consumed by BOTH the desktop `materialFields` `marc` display values AND the server MARC codec, so they cannot drift. The server codec layers on the richer logic the display strings cannot express: subfield parsing, the Leader, repeatable fields, and the three Article fields that share `773$g`.

### New units — `packages/server/src/marc/`

- `mapping.ts` — field↔MARC tag/subfield mapping (built on shared `FIELD_MARC_TAGS`) and the Leader↔`material_type` rules (used in BOTH directions from one table).
- `parse.ts` — MARCXML string → `MarcRecord[]` (`leader`, `controlfields[tag,value]`, `datafields[tag,ind1,ind2,subfields[code,value]]`). Pure.
- `toRows.ts` — `MarcRecord` → `ParsedMarcRow` (row columns + detected `material_type` + authority hints). Pure.
- `serialize.ts` — resource row → MARCXML `<record>`; `<collection>` wrapper for many rows. Pure.
- A test beside each.

### Reused / extended

- **Import pipeline** (`packages/server/src/import/`): `NormalizedRow` gains optional `authorAuthorityName`, `publisherAuthorityName`, `subjectNames: string[]`. `CommitPlan`/`commit` and the adapter resolve these via the existing get-or-create authority methods and `syncResourceSubjects`, keeping denormalized text in sync. CSV/XLSX rows leave these undefined → behavior unchanged.
- **tRPC** (`admin.books` router): `marcImportPreview({ institutionId, xml })` (parses server-side, then runs the existing preview/dedup/session), `marcImportCommit({ sessionId, duplicateStrategy, filename })`, and `marcExport({ institutionId, q })` → MARCXML string.
- **Desktop:** `ImportBooks.tsx` accepts `.xml` (sends file text to `marcImportPreview`, reuses the existing preview/commit UI); `Books.tsx` gains an "Export MARCXML" button that calls `marcExport` and writes via the Tauri save dialog.

## Import data flow

```
ImportBooks.tsx reads file text → marcImportPreview({ institutionId, xml })
  → parse.ts:   MARCXML string → MarcRecord[]
  → toRows.ts:  each MarcRecord → ParsedMarcRow { columns + material_type + authorityHints }
  → import service: existing validate → NormalizedRow → dedup vs catalog → session + preview verdicts
→ marcImportCommit({ sessionId, duplicateStrategy })
  → commit: per row, get-or-create authorities, create resource with links + denormalized text in sync
```

**Leader → material_type:** bib-level `s` → SERIAL; type `e`/`f` → MAP; type `g` → AUDIOVISUAL; type `t` with a `502` field → THESIS; otherwise → BOOK. Table-driven, well-tested, safe fallback.

**Fields → columns** (`mapping.ts`): `245$a/$b`→title/subtitle; `250$a`→edition; `020$a`→isbn; `022$a`→issn; `264$c`/`260$c`→year (4-digit parse); `490$a/$v`→series_title/volume; `300`/`773$g`→pages; `310$a`→frequency; `502$b/$c/$g`→thesis_degree/institution/advisor; `856$u`→url; `024$a`→doi; `520$a`→description; `041$a`→language; `082`/`050`→call_number(+call_number_type).

**Authority hints (auto-link):** `100$a`/`110$a`→author name; `264$b`/`260$b`→publisher name; each `650$a`→a subject name. Carried as names on `NormalizedRow`; resolved at commit via get-or-create + linking (the same path the book form uses).

**Dedup & strategy:** unchanged — MARC rows use the same ISBN/title+author dedup, the same `DuplicateStrategy`, and the same per-row preview verdicts.

**Error handling:**
- Malformed XML → `marcImportPreview` fails with a clear "could not parse MARCXML" message; no session created.
- A record missing `245$a` (title) or both `100`/`110` where author is required → that row gets a hard-error verdict (reusing existing required-field validation; Serial keeps the empty-author convention); other rows still import.
- Unmapped MARC fields are dropped (lossy v1, documented). No raw-MARC retention.

## Export data flow

```
Books page "Export MARCXML" → marcExport({ institutionId, q })
  → adapter: same query as adminListBooks(institutionId, q) but returns FULL resource rows
  → serialize.ts: each row → <record>; wrap all in <collection xmlns="http://www.loc.gov/MARC21/slim">
  → return xml string
→ desktop: Tauri save dialog (default bookleaf-export.xml) → write file; toast reports written/skipped counts
```

- **Which records:** current Books-page `q` (search box). No `q` → all books for the institution. One `<collection>`, one `<record>` per resource (bibliographic only; no copy-level holdings in v1).
- **Leader:** synthesize a minimal valid 24-byte leader, setting type/bib-level bytes from `material_type` (inverse of the import mapping — one shared table).
- **Fields:** emit datafields from populated columns via `mapping.ts`. Authority-linked author/publisher use the authority's canonical name; subjects emit one `650$a` per linked subject, falling back to denormalized `subject_headings` when no links exist. Empty columns emit no field. Sensible default indicators; XML special chars escaped.
- **Round-trip intent:** export→import of our own MARCXML reproduces the mapped fields and material type. Not lossless against arbitrary external MARC (v1 boundary).
- **Error handling:** empty result → valid empty `<collection/>` (not an error); a row that fails to serialize is skipped with a surfaced count (no silent loss).

## UI

- **Import** (`ImportBooks.tsx`): file `accept` adds `.xml`; an `.xml` file is read as text and sent to `marcImportPreview`; the existing preview table, duplicate-strategy selector, and Commit button are reused unchanged. Helper line notes "MARCXML (MARC21) records".
- **Export** (`Books.tsx`): an "Export MARCXML" button beside "Import from file"; calls `marcExport({ institutionId, q: search })`, opens the Tauri save dialog (default `bookleaf-export.xml`), writes the string, and toasts the written/skipped counts.

## Testing

Unit tests (Vitest, server):
- `mapping.test.ts` — field↔tag round-trips; Leader↔material_type both directions (BOOK fallback + SERIAL/MAP/AV/THESIS); consistency that shared `FIELD_MARC_TAGS` agrees with the desktop `materialFields` `marc` values where unambiguous.
- `parse.test.ts` — known MARCXML sample → expected record structure; malformed XML throws a clear error; missing subfields tolerated.
- `toRows.test.ts` — record → row with correct material_type + authority hints; missing `245$a` flagged.
- `serialize.test.ts` — resource row → expected `<record>`; XML escaping; empty collection.
- **Round-trip test** — fixture resource → serialize → parse → toRows yields the original mapped fields + material_type (headline correctness guarantee).
- Adapter `commit` test extended — authorities created+linked and denormalized text in sync for MARC rows; CSV-style rows (no authority hints) unchanged.

## Risks / notes

- The import pipeline extension (authority hints on `NormalizedRow`/`CommitPlan`/`commit`) is additive and shared with the CSV importer; CSV rows simply omit the new fields. This must be verified to not regress existing CSV import behavior.
- `FIELD_MARC_TAGS` in `packages/types` is the shared base; the server codec owns subfield/leader/repeatable logic. The `773$g` ambiguity (volume/issue_number/pages) means the server codec disambiguates on export by column and, on import, best-effort splits — documented and tested.
- This slice is larger than Slice 2 (~12–15 TDD tasks across types/server/desktop), but units are well-bounded and most import machinery is reused.
- Branch/worktree: `worktree-feat+marc-import-export` under `.claude/worktrees/feat+marc-import-export`, branched fresh from `origin/master` (includes merged Slices 1 & 2).
