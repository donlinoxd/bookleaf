# Authority Control Completion (Desktop) — Design

**Date:** 2026-06-15
**Status:** Approved (pending spec review)
**Slice:** 1 of 5 in the Catalog Management module decomposition

## Context

Bookleaf's catalog already supports ISBN lookup, per-copy holdings, RDA descriptors,
DDC/LC call numbers, bulk CSV/XLSX import, and import-time duplicate detection. Authority
control is only partially present: a single `authority_names` table (types
`personal | corporate | geographic`) with a `variants` column, linked to resources via
`resources.author_authority_id`. Subjects are stored as a free-text JSON array on the
resource; publishers are free text.

This slice completes authority control: subjects and publishers come under authority
control, plus name normalization, variant/cross-reference handling, and merging of
duplicate authority records.

### Hard constraints

- **Desktop app only.** Backend logic lives in `packages/server` + `packages/db`; UI lives
  in `apps/desktop`. No new screens, fields, or service changes in the mobile app
  (`apps/server`), including its existing `apps/server/src/services/AuthorityService.ts`.
- The desktop tRPC backend (`packages/server`) currently has **no** authority router — this
  must be built fresh. The mobile `AuthorityService` is not reused.
- **No backfill** of existing catalog data into authority records. Authorities are created
  only from new/edited records going forward ("start fresh").

## Data Model (`packages/db/src/schema.ts` — shared, backward-compatible)

### `authority_names` (extended; table name unchanged to avoid churn / mobile breakage)

- `name_type` enum extended to: `personal | corporate | geographic | subject | publisher`.
- `variants` (existing, text, nullable): JSON array of cross-reference / "use for" strings.
- **New** `normalized_name` (text, **nullable**): lowercased, whitespace-collapsed, NFC key
  used for dedupe and unique matching.
- **New** unique index on `(institution_id, name_type, normalized_name)`.
  - Nullable so mobile-created rows (which will not set it) remain valid. SQLite treats NULL
    values as distinct in unique indexes, so the constraint only enforces uniqueness for
    desktop-created records — the intended behavior. Mobile bypassing dedupe is an accepted
    trade-off (mobile barely uses authorities and is out of scope).

### `resources` (extended)

- **New** `publisher_authority_id` (integer, nullable) → `authority_names.id`. The existing
  `publisher` text column is kept in sync (denormalized) with the linked authority's
  preferred name so mobile/patron views render without joins.
- `author_authority_id` (existing) → `authority_names.id`. The existing `author` text column
  is kept in sync the same way.

### `resource_subjects` (new link table)

- Columns: `id` (PK), `resource_id` (FK → resources), `authority_id` (FK → authority_names),
  `UNIQUE(resource_id, authority_id)`.
- Many-to-many between resources and subject authorities.
- The existing `resources.subject_headings` JSON column is kept in sync (denormalized list of
  linked subjects' preferred names) for mobile/patron display.

### Migration

A one-time migration backfills `normalized_name` for **existing `authority_names` rows**
(computed from `name`) for internal consistency. This is NOT the declined catalog backfill —
no new authorities are derived from resource free-text data.

## Backend (`packages/server`)

New `authorities/` module, mirroring the existing `import/` module's repo + service split.

- **`normalize.ts`** (pure, unit-tested): `normalizeAuthorityName(raw)` → trim, collapse
  internal whitespace, NFC, lowercase → `normalized_name` key. The display `name` preserves
  the librarian's original casing. **No** auto-reordering of personal names to "Last, First"
  (too opinionated and lossy); names are stored as entered.
- **get-or-create dedupe**: `create()` computes the key and returns the existing record's id
  when `(institution_id, name_type, normalized_name)` already matches, instead of inserting a
  duplicate.
- **`merge.ts`** (transactional): given a survivor id and one or more loser ids — repoint
  `resources.author_authority_id`, `resources.publisher_authority_id`, and
  `resource_subjects.authority_id` (resolving `UNIQUE(resource_id, authority_id)` conflicts by
  dropping the redundant link); fold losers' names + variants into the survivor's "use for"
  variants list; re-sync denormalized text columns on affected resources; delete the losers.
- **delete guard**: block deletion of an authority that is still referenced (by author,
  publisher, or subject link) with a clear error suggesting merge/unlink instead.
- **list / get / update**: `list(institutionId, { type?, q? })` filters by type and matches
  the query against both `name` and `variants`; `get(id)` returns a usage count.

## tRPC API (`packages/server/src/router/admin/`)

New `admin.authorities` router (all `librarianProcedure`):

- `list` — `{ institutionId, type?, q? }` → `Authority[]` (+ usage count where cheap)
- `get` — `{ id }` → authority + usage count + (optionally) linked-resource summary
- `create` — get-or-create; returns `{ id }`
- `update` — `{ id, data }` (name / type / variants); recomputes `normalized_name`
- `delete` — `{ id }`; guarded against in-use records
- `merge` — `{ survivorId, loserIds[] }`

Extend `admin.books.create` / `admin.books.update` inputs to accept `author_authority_id`,
`publisher_authority_id`, and `subject_authority_ids: number[]`. The sqlite adapter writes the
`resource_subjects` link rows and keeps the denormalized `author` / `publisher` /
`subject_headings` columns in sync.

## Desktop UI (`apps/desktop`)

- **New route `/authorities`** (React Router, hash-based, registered in `App.tsx`) →
  `Authorities.tsx`:
  - Type tabs: Names / Subjects / Publishers.
  - Searchable TanStack table with a usage-count column.
  - Create/edit dialog: name, type, variants (tag input). Follows existing shadcn/Radix +
    React Hook Form + Zod patterns.
  - Delete action (guarded — surfaces the in-use error).
  - **Merge** action: select 2+ rows, choose the survivor, confirm.
- **Book form** (`Books.tsx` add/edit dialog):
  - Replace free-text author with a reusable `<AuthorityCombobox>` (search existing or
    create-on-the-fly).
  - Add a publisher combobox (same component, `publisher` type).
  - Add a subjects multi-select (same component, `subject` type, multiple).
- All mutations use the existing tRPC `.mutationOptions()` pattern with query invalidation.

## Shared Types (`packages/types`)

- Extend `AuthorityNameType` with `subject | publisher` (consider a broader `AuthorityType`
  alias).
- Add link/usage types as needed (e.g., merge input, usage count).

## Testing

TDD per project norms:

- Pure functions first — `normalizeAuthorityName`, the dedupe key, and merge repoint planning
  get unit tests written before implementation.
- Router/adapter behavior (get-or-create, delete guard, merge transaction, denormalized sync)
  covered following the repo's existing test conventions (as the `import/` module does).

## Out of Scope (explicit)

- Any change to the mobile app (`apps/server`) screens or its `AuthorityService`.
- Backfilling existing catalog free-text data into authority records.
- MARC21 / Dublin Core / Z39.50 (slice 4).
- Classification systems (UDC) and call-number generation (slice 3).
- Catalog-wide duplicate detection, record merging of resources, batch editing (slice 2).

## Decisions Locked During Brainstorming

1. **Unified authority table** (extend `authority_names`) rather than separate tables per type.
2. **All four capability groups** in this slice: management page; author + publisher pickers;
   controlled subjects; variants + normalization + merge.
3. **Start fresh** — no backfill of existing data.
4. **Keep denormalized text** (`author` / `publisher` / `subject_headings`) in sync for mobile
   compatibility.
5. **Block delete** of in-use authorities (suggest merge/unlink) rather than cascade-unlink.
6. **No personal-name reordering** during normalization — store names as entered.
