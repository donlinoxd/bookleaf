# Material-Type-Aware Cataloging Forms — Design Spec

**Date:** 2026-06-18
**Status:** Approved
**Scope:** Desktop app only (`apps/desktop`). The mobile server app (`apps/server`) must not change. Shared packages (`packages/db`, `packages/server`, `packages/types`) may change.

## Goal

When a librarian adds or edits a catalog record, the form's input fields adapt to the selected **material type**. Each in-scope type shows the fields that matter for that type (mapped conceptually to MARC/RDA, shown with friendly labels — not tag numbers). Each field carries its MARC tag underneath as pure data, so a later MARC import/export slice can reuse the mapping.

This is Slice 2 of the catalog roadmap. It builds on Slice 1 (authority control), reusing the existing `AuthorityPicker` / `AuthorityMultiPicker`.

## In scope

Full type-specific forms for: **Book, Serial, Article, Thesis**.
All other five `material_type` values (AUDIOVISUAL, MAP, MANUSCRIPT, DIGITAL, OTHER) fall back to a generic form equal to today's field set.

## Out of scope

- Working MARC import/export (the mapping is defined as data only; wiring is a future slice).
- Literal MARC-tag entry UI (tag numbers are not shown to the librarian).
- Any change to `apps/server`.

## Field sets

MARC tags are the under-the-hood mapping each field descriptor carries. Fields marked **(new column)** require a schema change; all others map to existing `resources` columns.

**Common to all in-scope types**
- Title — 245$a (required)
- Subtitle — 245$b
- Language — 041$a
- Call number — 082 (Dewey) / 050 (LC); rendered as two descriptors: `call_number` (text) + `call_number_type` (select: DEWEY / LC / OTHER)
- Subjects — 650$a (multi, subject authority)
- Description / notes — 520$a
- Copies — (inventory, not MARC)

**Book** — no new columns
- Author — 100$a (personal authority)
- Edition — 250$a
- Publisher — 264$b (publisher authority)
- Year — 264$c
- ISBN — 020$a
- Genre — 655$a
- Series title — 490$a
- Volume — 490$v

**Serial** — new column: `frequency`
- Publisher — 264$b (publisher authority)
- Year began — 264$c
- ISSN — 022$a
- **Frequency — 310$a (new column; controlled `select`, value stored as TEXT)**
- Volume — 362 (existing `volume` column)

**Article** — new columns: `container_title`, `pages`
- Author — 100$a (personal authority)
- **Container/journal title — 773$t (new column)**
- Volume — 773$g (existing `volume` column)
- Issue number — 773$g (existing `issue_number` column)
- **Pages — 773$g (new column)**
- Year — 264$c
- DOI — 024$a
- URL — 856$u

**Thesis** — new columns: `thesis_degree`, `thesis_institution`, `thesis_advisor`
- Author — 100$a (personal authority)
- Year — 264$c
- **Degree — 502$b (new column)**
- **Granting institution — 502$c (new column)**
- **Advisor — 502$g (new column)**
- ISBN — 020$a (optional)

**Generic (all other types)** — today's fields: title, author, isbn, genre, year, publisher, language, call number, subjects, copies.

### Depends on existing schema (verified against current `resources`)

This design reuses columns that already exist and are **not** added by this slice:
`volume`, `issue_number`, and the `call_number_type` enum (`DEWEY` / `LC` / `OTHER`).
Verified present in `packages/db/src/schema.ts` before scoping the migration. If any of
these were absent the six-column count would be wrong — they are confirmed present.

### New columns (migration `0004_material_fields.sql`)

Six nullable `TEXT` columns on `resources`: `frequency`, `container_title`, `pages`, `thesis_degree`, `thesis_institution`, `thesis_advisor`. All `ADD COLUMN` (idempotent-friendly, no backfill needed).

Article Volume and Issue number reuse the **existing** `volume` and `issue_number` columns — they are not new. Only `container_title` and `pages` are new for Article. The total stays six.

Note: `resources.author` is `NOT NULL`. For Serial (no author field) the form persists an empty string, matching existing behavior for type-less author input. The persisting code carries a comment flagging that a Serial's `author = ''` means "no personal author" (not "author unknown"), so a future MARC exporter does not emit an empty `100$a`.

## Architecture (Approach A — declarative config)

### Config module — `apps/desktop/src/lib/materialFields.ts`

Dependency-free (no React) so it can be lifted into `packages/server` unchanged when the MARC export slice arrives.

```ts
type FieldKind =
  | 'text' | 'number' | 'textarea' | 'select'
  | 'author-authority' | 'publisher-authority' | 'subjects';

type FieldDescriptor = {
  key: string;        // resources column name
  label: string;
  kind: FieldKind;
  marc: string;       // under-the-hood mapping, e.g. '245$a'
  required?: boolean;
  options?: string[]; // required when kind === 'select' (e.g. frequency, call_number_type)
  group?: string;     // optional section header
};

export const MATERIAL_FIELDS: Partial<Record<MaterialType, FieldDescriptor[]>>;
export const GENERIC_FIELDS: FieldDescriptor[];
export function fieldsFor(materialType: string): FieldDescriptor[]; // falls back to GENERIC_FIELDS
```

**Controlled `select` option lists:**
- `call_number_type`: `DEWEY`, `LC`, `OTHER`. **Single source of truth:** extract these into an exported `CALL_NUMBER_TYPES` const in `packages/types`, reference it from both the `resources.call_number_type` enum in `schema.ts` and the descriptor's `options`. This adds one acyclic dependency edge — `@bookleaf/db` → `@bookleaf/types` (types does not import db; verified no existing edge either way) — so `@bookleaf/types` must be added to `@bookleaf/db`'s dependencies. The config test asserts the descriptor options deep-equal `CALL_NUMBER_TYPES`, so the two can't drift and the form never offers a value the DB rejects. (Values unchanged → no migration needed for this refactor.)
- `frequency`: `Daily`, `Weekly`, `Biweekly`, `Monthly`, `Bimonthly`, `Quarterly`, `Semiannual`, `Annual`, `Irregular`. Stored as the **display value** (TEXT), deliberately — there is no DB enum for frequency, so no drift risk. Note: a future MARC `310$a` exporter will read these display strings, which is intended.

### Form — generic renderer (`MaterialDialog`, evolving from current `BookDialog`)

1. Material-type `<select>` is always visible at the top. Changing it re-derives visible fields via `fieldsFor(type)`.
2. Descriptors render grouped by `group`. `author-authority` / `publisher-authority` / `subjects` render the existing authority pickers (the escape hatch); other kinds render plain react-hook-form inputs via `register(key)`.
3. A zod schema is built dynamically from the active descriptor list: Title always required, plus any descriptor with `required: true`. Today only Title carries `required` (librarians catalog incrementally — no field beyond Title is mandatory); the mechanism is general so other types can mark fields required later without code changes. Validation stays in sync with visible fields automatically. A non-required `select` is built as `z.enum(options).optional()` (or equivalently allows empty), so an unselected frequency on a Serial passes validation — only Title is mandatory.
4. Submit builds the payload from the active field keys plus authority-picker state, following the same enrichment pattern already used in the form (author/publisher name + authority id, conditional subjects).

### Backend

- Extend the `admin.books` create/update input schema (zod) to accept the 6 new fields (all optional).
- Extend the sqlite adapter's `adminCreateBook` / `adminUpdateBook` insert/update to persist the 6 new columns.
- No new endpoints. Authority linking unchanged. Mobile bridge unchanged.

### Types

Extend the `Resource` type in `packages/types` with the 6 new optional string fields.

## Testing (TDD)

- **Config unit tests** (`materialFields.test.ts`): each in-scope type includes a required Title; no duplicate field keys within a type; every descriptor has a non-empty `marc` tag; every `select` descriptor has non-empty `options`; the `call_number_type` descriptor's `options` deep-equal the shared `CALL_NUMBER_TYPES` const (catches enum/descriptor drift); in-scope types resolve to their specific sets; `fieldsFor('MAP')` (valid non-scoped enum) and `fieldsFor('GARBAGE')` (non-enum string) both return the generic set.
- **Adapter round-trip tests**: create + read back a Thesis (degree/institution/advisor), a Serial (frequency), and an Article (container_title/pages), proving the new columns persist and load. Extends the existing sqlite adapter test suite.
- **Regression gate**: full server suite green; server/desktop/types/db typechecks at baseline (no new errors); `git diff --name-only master...HEAD -- apps/server` stays empty.

## Risks / notes

- The config lives in the desktop app for now (desktop-only constraint) but is dependency-free so a future server-side MARC exporter can import or relocate it without changes.
- `pages`, `volume`, `issue_number` all map to MARC 773$g for articles; that is expected — 773 (host item entry) aggregates them. The form keeps them as separate friendly fields.
- Branched from `feat/authority-control-completion` (PR #7), so this work stacks on the authority migration `0003`; migration here is `0004`.
