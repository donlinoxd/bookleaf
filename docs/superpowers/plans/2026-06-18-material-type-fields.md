# Material-Type-Aware Cataloging Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a librarian adds/edits a catalog record, the form's input fields adapt to the selected material type (Book, Serial, Article, Thesis get full type-specific fields; the rest fall back to a generic form), with each field carrying its MARC tag as data for a future import/export slice.

**Architecture:** A declarative field-descriptor config (`materialFields.ts`) maps each material type to an ordered list of `{ key, label, kind, marc, options?, required? }`. A generic form renderer reads `fieldsFor(type)` and renders inputs (authority pickers slot in via special kinds). Six new nullable columns on `resources` back the type-specific fields. The adapter already spreads all columns on read, so only the write path changes.

**Tech Stack:** TypeScript, React + Vite (desktop), react-hook-form + zod, Drizzle ORM + better-sqlite3, tRPC v11, Vitest.

## Global Constraints

- **Desktop only.** Do NOT modify anything under `apps/server`. After implementation, `git diff --name-only master...HEAD -- apps/server` MUST be empty.
- **Branch:** `feat/material-type-fields` (already created, stacked on `feat/authority-control-completion` / PR #7). Commit every task to this branch in the main working directory — do NOT create git worktrees or new branches.
- **Migration numbering:** next migration is `0004` (0003 already exists).
- **In-scope types:** `BOOK`, `SERIAL`, `ARTICLE`, `THESIS`. All other material types use the generic field set.
- **Six new nullable TEXT columns** on `resources`: `frequency`, `container_title`, `pages`, `thesis_degree`, `thesis_institution`, `thesis_advisor`. `volume`, `issue_number`, and the `call_number_type` enum already exist — do NOT re-add them.
- **TDD:** write the failing test first where a runtime test exists. Type/schema/migration tasks are verified by typecheck + the round-trip test in Task 4.
- **Pre-existing typecheck baselines (NOT regressions):** server = 4 errors; desktop = 5 errors. A task is clean if it does not increase these.
- **Spec:** `docs/superpowers/specs/2026-06-18-material-type-fields-design.md`.

---

### Task 1: Shared `CALL_NUMBER_TYPES` const + `Resource` type fields

**Files:**
- Modify: `packages/types/src/index.ts:14` (CallNumberType) and `packages/types/src/index.ts:91-94` (Resource fields)

**Interfaces:**
- Produces: `export const CALL_NUMBER_TYPES = ['DEWEY','LC','OTHER'] as const;` and `Resource` gains optional fields `frequency`, `container_title`, `pages`, `thesis_degree`, `thesis_institution`, `thesis_advisor` (all `string | null`, optional).

- [ ] **Step 1: Replace the `CallNumberType` literal with a const-derived type**

In `packages/types/src/index.ts`, replace line 14:

```ts
export type CallNumberType = 'DEWEY' | 'LC' | 'OTHER';
```

with:

```ts
/** Single source of truth: referenced by the db schema enum and the form's call_number_type select. */
export const CALL_NUMBER_TYPES = ['DEWEY', 'LC', 'OTHER'] as const;
export type CallNumberType = (typeof CALL_NUMBER_TYPES)[number];
```

- [ ] **Step 2: Add the six new optional fields to the `Resource` interface**

In `packages/types/src/index.ts`, immediately after the `publisher_authority_id?: number | null;` line (currently line 94), add:

```ts
  // Material-type-specific fields (desktop cataloging). Optional so existing
  // Resource constructions remain valid; the desktop columns always exist.
  frequency?: string | null;          // SERIAL — MARC 310$a (display value)
  container_title?: string | null;    // ARTICLE — MARC 773$t
  pages?: string | null;              // ARTICLE — MARC 773$g
  thesis_degree?: string | null;      // THESIS — MARC 502$b
  thesis_institution?: string | null; // THESIS — MARC 502$c
  thesis_advisor?: string | null;     // THESIS — MARC 502$g
```

- [ ] **Step 3: Verify the types package typechecks**

Run: `cd packages/types && npx tsc --noEmit`
Expected: no output (clean). If the package has no standalone tsconfig, run `cd packages/server && npx tsc --noEmit` and confirm the error count stays at the baseline of 4.

- [ ] **Step 4: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): CALL_NUMBER_TYPES const + material-type-specific Resource fields"
```

---

### Task 2: DB schema — new columns + wire `CALL_NUMBER_TYPES`

**Files:**
- Modify: `packages/db/src/schema.ts:1-2` (import), `:67` (call_number_type enum), `:71-73` (add columns after subject_headings/authority ids)
- Modify: `packages/db/package.json` (add `@bookleaf/types` dependency)

**Interfaces:**
- Consumes: `CALL_NUMBER_TYPES` from `@bookleaf/types` (Task 1).
- Produces: `resources` table has six new nullable `text` columns: `frequency`, `container_title`, `pages`, `thesis_degree`, `thesis_institution`, `thesis_advisor`.

- [ ] **Step 1: Add `@bookleaf/types` to the db package dependencies**

In `packages/db/package.json`, add a `dependencies` block (it currently has none) above `peerDependencies`:

```json
  "dependencies": {
    "@bookleaf/types": "workspace:*"
  },
```

Then run `pnpm install` from the repo root so the workspace link resolves.

- [ ] **Step 2: Import the const and wire it into the enum**

In `packages/db/src/schema.ts`, add after line 2 (`import { sql } from 'drizzle-orm';`):

```ts
import { CALL_NUMBER_TYPES } from '@bookleaf/types';
```

Then change the `call_number_type` column (currently line 67):

```ts
  call_number_type: text('call_number_type', { enum: ['DEWEY', 'LC', 'OTHER'] }),
```

to:

```ts
  call_number_type: text('call_number_type', { enum: CALL_NUMBER_TYPES }),
```

- [ ] **Step 3: Add the six new columns to the `resources` table**

In `packages/db/src/schema.ts`, immediately after the `publisher_authority_id` line (currently line 73), add:

```ts
  // Material-type-specific fields (desktop cataloging)
  frequency: text('frequency'),
  container_title: text('container_title'),
  pages: text('pages'),
  thesis_degree: text('thesis_degree'),
  thesis_institution: text('thesis_institution'),
  thesis_advisor: text('thesis_advisor'),
```

- [ ] **Step 4: Verify the db package typechecks**

Run: `cd packages/db && npx tsc --noEmit`
Expected: no output (clean). Drizzle's `text(..., { enum })` accepts a readonly string tuple, so `CALL_NUMBER_TYPES` is valid.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/package.json pnpm-lock.yaml
git commit -m "feat(db): material-type columns on resources; source call_number_type from @bookleaf/types"
```

---

### Task 3: Migration `0004` + wire into desktop adapter

**Files:**
- Create: `packages/db/drizzle/0004_material_fields.sql`
- Modify: `packages/server/src/index.desktop.ts:16` (import) and `:27` (createSqliteAdapter call)

**Interfaces:**
- Consumes: nothing new.
- Produces: applied migration adding the six columns; test harness auto-discovers `0004_*.sql`.

- [ ] **Step 1: Create the migration file**

Create `packages/db/drizzle/0004_material_fields.sql`:

```sql
-- Material-type-specific cataloging fields (desktop).
-- volume, issue_number, and call_number_type already exist (0000) — not re-added.
ALTER TABLE resources ADD COLUMN frequency TEXT;
ALTER TABLE resources ADD COLUMN container_title TEXT;
ALTER TABLE resources ADD COLUMN pages TEXT;
ALTER TABLE resources ADD COLUMN thesis_degree TEXT;
ALTER TABLE resources ADD COLUMN thesis_institution TEXT;
ALTER TABLE resources ADD COLUMN thesis_advisor TEXT;
```

- [ ] **Step 2: Wire the migration into the desktop entrypoint**

In `packages/server/src/index.desktop.ts`, add after line 16 (`import sql_0003 ...`):

```ts
// @ts-expect-error - .sql files are bundled as text by esbuild
import sql_0004 from '../../../packages/db/drizzle/0004_material_fields.sql';
```

(Match the exact import style already used for `sql_0003` in this file — if the existing imports do not use `@ts-expect-error`, omit it here too.)

Then change the `createSqliteAdapter(...)` call (currently line 27) to append `sql_0004`:

```ts
const db = createSqliteAdapter(dbPath, sql_0000 as string, sql_0001 as string, sql_0002 as string, sql_0003 as string, sql_0004 as string);
```

- [ ] **Step 3: Verify the existing server suite still passes (migration applies cleanly)**

Run: `cd packages/server && npm test`
Expected: all tests PASS (the auto-discovered `0004` migration runs in `:memory:` without error). Same count as before (50).

- [ ] **Step 4: Verify the desktop entry typechecks**

Run: `cd packages/server && npx tsc --noEmit`
Expected: error count stays at baseline 4.

- [ ] **Step 5: Commit**

```bash
git add packages/db/drizzle/0004_material_fields.sql packages/server/src/index.desktop.ts
git commit -m "feat(db): 0004 material-fields migration, wired into desktop adapter"
```

---

### Task 4: Adapter persists + round-trips the new columns (TDD)

**Files:**
- Create: `packages/server/src/adapter/sqlite.materialFields.test.ts`
- Modify: `packages/server/src/adapter/sqlite.ts:798-849` (adminCreateBook) and `:851-885` (adminUpdateBook)

**Interfaces:**
- Consumes: existing `db.adminCreateBook(institutionId, data, copies)`, `db.adminUpdateBook(id, data)`, `db.adminGetBook(id)` (returns the full resource row via `mapResourceRow`, which spreads all columns).
- Produces: create/update persist `frequency`, `container_title`, `pages`, `thesis_degree`, `thesis_institution`, `thesis_advisor`.

- [ ] **Step 1: Write the failing round-trip test**

Create `packages/server/src/adapter/sqlite.materialFields.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createSqliteAdapter } from './sqlite';

const drizzleDir = join(__dirname, '../../../db/drizzle');
function migrationSqls(): string[] {
  return readdirSync(drizzleDir)
    .filter(f => /^\d+_.*\.sql$/.test(f))
    .sort()
    .map(f => readFileSync(join(drizzleDir, f), 'utf8'));
}

let db: ReturnType<typeof createSqliteAdapter>;
let iid: number;

beforeEach(() => {
  db = createSqliteAdapter(':memory:', ...migrationSqls());
  iid = (db as unknown as { __seedTestInstitution(): number }).__seedTestInstitution();
});

describe('material-type-specific fields', () => {
  it('persists and reads back Thesis fields', async () => {
    const { id } = await db.adminCreateBook(iid, {
      title: 'A Study of Things', material_type: 'THESIS', author: 'Doe, Jane',
      thesis_degree: 'PhD', thesis_institution: 'State University', thesis_advisor: 'Smith, John',
    }, []);
    const got = await db.adminGetBook(id) as Record<string, unknown>;
    expect(got.thesis_degree).toBe('PhD');
    expect(got.thesis_institution).toBe('State University');
    expect(got.thesis_advisor).toBe('Smith, John');
  });

  it('persists Serial frequency and an empty author', async () => {
    const { id } = await db.adminCreateBook(iid, {
      title: 'Journal of Examples', material_type: 'SERIAL', author: '',
      frequency: 'Quarterly',
    }, []);
    const got = await db.adminGetBook(id) as Record<string, unknown>;
    expect(got.frequency).toBe('Quarterly');
    expect(got.author).toBe('');
  });

  it('persists Article container_title and pages', async () => {
    const { id } = await db.adminCreateBook(iid, {
      title: 'On Examples', material_type: 'ARTICLE', author: 'Roe, Sam',
      container_title: 'Journal of Examples', pages: '44-58', volume: '12', issue_number: '3',
    }, []);
    const got = await db.adminGetBook(id) as Record<string, unknown>;
    expect(got.container_title).toBe('Journal of Examples');
    expect(got.pages).toBe('44-58');
    expect(got.volume).toBe('12');
    expect(got.issue_number).toBe('3');
  });

  it('updates the new fields', async () => {
    const { id } = await db.adminCreateBook(iid, { title: 'T', material_type: 'THESIS', author: 'A' }, []);
    await db.adminUpdateBook(id, { title: 'T', material_type: 'THESIS', author: 'A', thesis_degree: 'MSc' });
    const got = await db.adminGetBook(id) as Record<string, unknown>;
    expect(got.thesis_degree).toBe('MSc');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/server && npx vitest run src/adapter/sqlite.materialFields.test.ts`
Expected: FAIL — `got.thesis_degree` etc. are `undefined` (columns exist but the adapter never writes them).

- [ ] **Step 3: Persist the new columns in `adminCreateBook`**

In `packages/server/src/adapter/sqlite.ts`, inside the `db.insert(resources).values({ ... })` object in `adminCreateBook` (after the `carrier_type: d.carrier_type ?? null,` line, ~line 825), add:

```ts
        frequency: d.frequency ?? null,
        container_title: d.container_title ?? null,
        pages: d.pages ?? null,
        thesis_degree: d.thesis_degree ?? null,
        thesis_institution: d.thesis_institution ?? null,
        thesis_advisor: d.thesis_advisor ?? null,
```

- [ ] **Step 4: Persist the new columns in `adminUpdateBook`**

In the same file, inside the `db.update(resources).set({ ... })` object in `adminUpdateBook` (after `carrier_type: d.carrier_type ?? null,`, ~line 877), add the identical six lines:

```ts
        frequency: d.frequency ?? null,
        container_title: d.container_title ?? null,
        pages: d.pages ?? null,
        thesis_degree: d.thesis_degree ?? null,
        thesis_institution: d.thesis_institution ?? null,
        thesis_advisor: d.thesis_advisor ?? null,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/server && npx vitest run src/adapter/sqlite.materialFields.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/adapter/sqlite.ts packages/server/src/adapter/sqlite.materialFields.test.ts
git commit -m "feat(catalog): persist material-type-specific fields in book create/update"
```

---

### Task 5: `materialFields` config + unit tests (TDD)

**Files:**
- Create: `apps/desktop/src/lib/materialFields.ts`
- Create: `apps/desktop/src/lib/materialFields.test.ts`

**Interfaces:**
- Consumes: `CALL_NUMBER_TYPES`, `MaterialType` from `@bookleaf/types`.
- Produces:
  - `type FieldKind = 'text' | 'number' | 'textarea' | 'select' | 'author-authority' | 'publisher-authority' | 'subjects'`
  - `interface FieldDescriptor { key: string; label: string; kind: FieldKind; marc: string; required?: boolean; options?: readonly string[]; group?: string }`
  - `MATERIAL_FIELDS: Partial<Record<MaterialType, FieldDescriptor[]>>`
  - `GENERIC_FIELDS: FieldDescriptor[]`
  - `SERIAL_FREQUENCIES: readonly string[]`
  - `fieldsFor(materialType: string): FieldDescriptor[]`

- [ ] **Step 1: Write the failing config tests**

Create `apps/desktop/src/lib/materialFields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CALL_NUMBER_TYPES } from '@bookleaf/types';
import { MATERIAL_FIELDS, GENERIC_FIELDS, fieldsFor } from './materialFields';

const IN_SCOPE = ['BOOK', 'SERIAL', 'ARTICLE', 'THESIS'] as const;

describe('materialFields config', () => {
  it('defines a field set for every in-scope type', () => {
    for (const t of IN_SCOPE) expect(MATERIAL_FIELDS[t], t).toBeDefined();
  });

  it('every in-scope type requires a Title field', () => {
    for (const t of IN_SCOPE) {
      const title = MATERIAL_FIELDS[t]!.find(f => f.key === 'title');
      expect(title, t).toBeDefined();
      expect(title!.required, t).toBe(true);
    }
  });

  it('has no duplicate field keys within any type or the generic set', () => {
    const sets = [...Object.values(MATERIAL_FIELDS), GENERIC_FIELDS];
    for (const fields of sets) {
      const keys = fields!.map(f => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('every descriptor has a non-empty marc tag', () => {
    const all = [...Object.values(MATERIAL_FIELDS).flat(), ...GENERIC_FIELDS];
    for (const f of all) expect(f!.marc.length, f!.key).toBeGreaterThan(0);
  });

  it('every select descriptor has non-empty options', () => {
    const all = [...Object.values(MATERIAL_FIELDS).flat(), ...GENERIC_FIELDS];
    for (const f of all.filter(f => f!.kind === 'select')) {
      expect(f!.options && f!.options.length, f!.key).toBeGreaterThan(0);
    }
  });

  it('call_number_type select options equal CALL_NUMBER_TYPES (no enum drift)', () => {
    const all = [...Object.values(MATERIAL_FIELDS).flat(), ...GENERIC_FIELDS];
    const cnt = all.find(f => f!.key === 'call_number_type');
    expect(cnt, 'call_number_type descriptor').toBeDefined();
    expect([...cnt!.options!]).toEqual([...CALL_NUMBER_TYPES]);
  });

  it('resolves in-scope types to their specific sets', () => {
    expect(fieldsFor('THESIS')).toBe(MATERIAL_FIELDS.THESIS);
  });

  it('falls back to GENERIC_FIELDS for a non-scoped enum and a non-enum string', () => {
    expect(fieldsFor('MAP')).toBe(GENERIC_FIELDS);
    expect(fieldsFor('GARBAGE')).toBe(GENERIC_FIELDS);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/desktop && npx vitest run src/lib/materialFields.test.ts`
Expected: FAIL — cannot resolve `./materialFields`.

- [ ] **Step 3: Implement the config module**

Create `apps/desktop/src/lib/materialFields.ts`:

```ts
import { CALL_NUMBER_TYPES, type MaterialType } from '@bookleaf/types';

export type FieldKind =
  | 'text' | 'number' | 'textarea' | 'select'
  | 'author-authority' | 'publisher-authority' | 'subjects';

export interface FieldDescriptor {
  key: string;            // resources column name
  label: string;
  kind: FieldKind;
  marc: string;           // under-the-hood mapping, e.g. '245$a'
  required?: boolean;
  options?: readonly string[]; // required when kind === 'select'
  group?: string;
}

export const SERIAL_FREQUENCIES = [
  'Daily', 'Weekly', 'Biweekly', 'Monthly', 'Bimonthly',
  'Quarterly', 'Semiannual', 'Annual', 'Irregular',
] as const;

// Shared building blocks
const TITLE: FieldDescriptor = { key: 'title', label: 'Title', kind: 'text', marc: '245$a', required: true, group: 'Identity' };
const SUBTITLE: FieldDescriptor = { key: 'subtitle', label: 'Subtitle', kind: 'text', marc: '245$b', group: 'Identity' };
const LANGUAGE: FieldDescriptor = { key: 'language', label: 'Language', kind: 'text', marc: '041$a', group: 'Details' };
const CALL_NUMBER: FieldDescriptor = { key: 'call_number', label: 'Call number', kind: 'text', marc: '082', group: 'Shelving' };
const CALL_NUMBER_TYPE: FieldDescriptor = { key: 'call_number_type', label: 'Call number type', kind: 'select', marc: '082', options: CALL_NUMBER_TYPES, group: 'Shelving' };
const SUBJECTS: FieldDescriptor = { key: 'subject_authority_ids', label: 'Subjects', kind: 'subjects', marc: '650$a', group: 'Subjects' };
const DESCRIPTION: FieldDescriptor = { key: 'description', label: 'Notes / description', kind: 'textarea', marc: '520$a', group: 'Details' };
const COPIES: FieldDescriptor = { key: 'total_copies', label: 'Copies', kind: 'number', marc: '', group: 'Inventory' };
const AUTHOR: FieldDescriptor = { key: 'author', label: 'Author', kind: 'author-authority', marc: '100$a', group: 'Identity' };
const PUBLISHER: FieldDescriptor = { key: 'publisher', label: 'Publisher', kind: 'publisher-authority', marc: '264$b', group: 'Publication' };

export const GENERIC_FIELDS: FieldDescriptor[] = [
  TITLE,
  AUTHOR,
  { key: 'isbn', label: 'ISBN', kind: 'text', marc: '020$a', group: 'Identity' },
  { key: 'genre', label: 'Genre', kind: 'text', marc: '655$a', group: 'Details' },
  { key: 'year', label: 'Year', kind: 'number', marc: '264$c', group: 'Publication' },
  PUBLISHER,
  LANGUAGE,
  CALL_NUMBER, CALL_NUMBER_TYPE,
  SUBJECTS,
  COPIES,
];

export const MATERIAL_FIELDS: Partial<Record<MaterialType, FieldDescriptor[]>> = {
  BOOK: [
    TITLE, SUBTITLE, AUTHOR,
    { key: 'edition', label: 'Edition', kind: 'text', marc: '250$a', group: 'Identity' },
    PUBLISHER,
    { key: 'year', label: 'Year', kind: 'number', marc: '264$c', group: 'Publication' },
    { key: 'isbn', label: 'ISBN', kind: 'text', marc: '020$a', group: 'Identity' },
    { key: 'genre', label: 'Genre', kind: 'text', marc: '655$a', group: 'Details' },
    { key: 'series_title', label: 'Series title', kind: 'text', marc: '490$a', group: 'Details' },
    { key: 'volume', label: 'Volume', kind: 'text', marc: '490$v', group: 'Details' },
    LANGUAGE, CALL_NUMBER, CALL_NUMBER_TYPE, DESCRIPTION, SUBJECTS, COPIES,
  ],
  SERIAL: [
    TITLE, SUBTITLE, PUBLISHER,
    { key: 'year', label: 'Year began', kind: 'number', marc: '264$c', group: 'Publication' },
    { key: 'issn', label: 'ISSN', kind: 'text', marc: '022$a', group: 'Identity' },
    { key: 'frequency', label: 'Frequency', kind: 'select', marc: '310$a', options: SERIAL_FREQUENCIES, group: 'Publication' },
    { key: 'volume', label: 'Volume', kind: 'text', marc: '362', group: 'Details' },
    LANGUAGE, CALL_NUMBER, CALL_NUMBER_TYPE, DESCRIPTION, SUBJECTS, COPIES,
  ],
  ARTICLE: [
    TITLE, AUTHOR,
    { key: 'container_title', label: 'Container / journal title', kind: 'text', marc: '773$t', group: 'Publication' },
    { key: 'volume', label: 'Volume', kind: 'text', marc: '773$g', group: 'Publication' },
    { key: 'issue_number', label: 'Issue number', kind: 'text', marc: '773$g', group: 'Publication' },
    { key: 'pages', label: 'Pages', kind: 'text', marc: '773$g', group: 'Publication' },
    { key: 'year', label: 'Year', kind: 'number', marc: '264$c', group: 'Publication' },
    { key: 'doi', label: 'DOI', kind: 'text', marc: '024$a', group: 'Identity' },
    { key: 'url', label: 'URL', kind: 'text', marc: '856$u', group: 'Identity' },
    LANGUAGE, SUBJECTS, COPIES,
  ],
  THESIS: [
    TITLE, AUTHOR,
    { key: 'year', label: 'Year', kind: 'number', marc: '264$c', group: 'Publication' },
    { key: 'thesis_degree', label: 'Degree', kind: 'text', marc: '502$b', group: 'Thesis' },
    { key: 'thesis_institution', label: 'Granting institution', kind: 'text', marc: '502$c', group: 'Thesis' },
    { key: 'thesis_advisor', label: 'Advisor', kind: 'text', marc: '502$g', group: 'Thesis' },
    { key: 'isbn', label: 'ISBN', kind: 'text', marc: '020$a', group: 'Identity' },
    LANGUAGE, CALL_NUMBER, CALL_NUMBER_TYPE, DESCRIPTION, SUBJECTS, COPIES,
  ],
};

export function fieldsFor(materialType: string): FieldDescriptor[] {
  return MATERIAL_FIELDS[materialType as MaterialType] ?? GENERIC_FIELDS;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/desktop && npx vitest run src/lib/materialFields.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/materialFields.ts apps/desktop/src/lib/materialFields.test.ts
git commit -m "feat(desktop): declarative material-type field config + tests"
```

---

### Task 6: Dynamic zod schema builder (TDD)

**Files:**
- Create: `apps/desktop/src/lib/materialFormSchema.ts`
- Create: `apps/desktop/src/lib/materialFormSchema.test.ts`

**Interfaces:**
- Consumes: `FieldDescriptor` (Task 5).
- Produces: `buildMaterialSchema(fields: FieldDescriptor[]): z.ZodType<Record<string, unknown>>` — Title always required; descriptors with `required: true` are required strings; `select` fields are `z.enum(options).optional()`; everything else optional. Non-form keys (`subject_authority_ids`) are excluded from the schema (handled by the picker state, not react-hook-form).

- [ ] **Step 1: Write the failing schema-builder tests**

Create `apps/desktop/src/lib/materialFormSchema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildMaterialSchema } from './materialFormSchema';
import type { FieldDescriptor } from './materialFields';

const fields: FieldDescriptor[] = [
  { key: 'title', label: 'Title', kind: 'text', marc: '245$a', required: true },
  { key: 'frequency', label: 'Frequency', kind: 'select', marc: '310$a', options: ['Monthly', 'Quarterly'] },
  { key: 'isbn', label: 'ISBN', kind: 'text', marc: '020$a' },
];

describe('buildMaterialSchema', () => {
  it('rejects an empty title', () => {
    const r = buildMaterialSchema(fields).safeParse({ title: '' });
    expect(r.success).toBe(false);
  });

  it('accepts a valid title with everything else omitted', () => {
    const r = buildMaterialSchema(fields).safeParse({ title: 'Hello' });
    expect(r.success).toBe(true);
  });

  it('allows an unselected (empty) frequency', () => {
    const r = buildMaterialSchema(fields).safeParse({ title: 'Hello', frequency: '' });
    expect(r.success).toBe(true);
  });

  it('rejects a frequency outside its options', () => {
    const r = buildMaterialSchema(fields).safeParse({ title: 'Hello', frequency: 'Hourly' });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/desktop && npx vitest run src/lib/materialFormSchema.test.ts`
Expected: FAIL — cannot resolve `./materialFormSchema`.

- [ ] **Step 3: Implement the schema builder**

Create `apps/desktop/src/lib/materialFormSchema.ts`:

```ts
import { z } from 'zod';
import type { FieldDescriptor } from './materialFields';

// Field kinds that the authority pickers own (their state lives outside RHF).
const PICKER_KINDS = new Set(['author-authority', 'publisher-authority', 'subjects']);

export function buildMaterialSchema(fields: FieldDescriptor[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    if (PICKER_KINDS.has(f.kind)) continue; // handled by picker state, not RHF
    if (f.key === 'title') {
      shape[f.key] = z.string().min(1, 'Title is required');
      continue;
    }
    if (f.kind === 'select' && f.options && f.options.length > 0) {
      // Allow empty (unselected) OR one of the options.
      shape[f.key] = z.union([z.literal(''), z.enum([...f.options] as [string, ...string[]])]).optional();
      continue;
    }
    if (f.kind === 'number') {
      shape[f.key] = z.coerce.number().optional();
      continue;
    }
    shape[f.key] = f.required ? z.string().min(1, `${f.label} is required`) : z.string().optional();
  }
  return z.object(shape).passthrough();
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/desktop && npx vitest run src/lib/materialFormSchema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/materialFormSchema.ts apps/desktop/src/lib/materialFormSchema.test.ts
git commit -m "feat(desktop): dynamic zod schema builder for material forms + tests"
```

---

### Task 7: Render the generic material form in `Books.tsx`

**Files:**
- Modify: `apps/desktop/src/pages/Books.tsx` (replace the static `BookDialog` body with a config-driven renderer)

**Interfaces:**
- Consumes: `fieldsFor`, `FieldDescriptor` (Task 5); `buildMaterialSchema` (Task 6); existing `AuthorityPicker`, `AuthorityMultiPicker`.
- Produces: a `BookDialog` whose fields re-derive from the selected `material_type`.

> This task has no runtime unit test (no RTL/jsdom harness for dialogs in this repo). It is verified by typecheck + the manual checklist in Step 4. Keep the existing submit-enrichment pattern (author/publisher name + authority id, conditional `subject_authority_ids`).

- [ ] **Step 1: Replace the `BookDialog` component**

In `apps/desktop/src/pages/Books.tsx`, replace the entire `BookDialog` function (currently lines 116-179) with the config-driven version below. Keep the imports already present and add the two new imports at the top of the file (near line 20):

```tsx
import { fieldsFor, type FieldDescriptor } from '@/lib/materialFields';
import { buildMaterialSchema } from '@/lib/materialFormSchema';
```

Also add a Select import if the UI kit provides one; otherwise the `select` kind renders a native `<select>` (used below to avoid a new dependency).

Replace `BookDialog` with:

```tsx
const MATERIAL_TYPES = ['BOOK', 'SERIAL', 'ARTICLE', 'AUDIOVISUAL', 'MAP', 'MANUSCRIPT', 'DIGITAL', 'THESIS', 'OTHER'] as const;

function BookDialog({ open, onClose, editing, defaultValues, onSubmit, isPending, error, title }: { open: boolean; onClose: () => void; editing?: Book | null; defaultValues?: Partial<BookForm>; onSubmit: (d: Record<string, unknown>) => void; isPending: boolean; error: unknown; title: string }) {
  const [materialType, setMaterialType] = useState<string>(editing?.material_type ?? 'BOOK');
  const fields = fieldsFor(materialType);
  const schema = buildMaterialSchema(fields);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Record<string, unknown>>({ resolver: zodResolver(schema) });

  const [authorAuthority, setAuthorAuthority] = useState<{ id: number | null; name: string | null }>({ id: null, name: null });
  const [publisherAuthority, setPublisherAuthority] = useState<{ id: number | null; name: string | null }>({ id: null, name: null });
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([]);
  const [subjectsTouched, setSubjectsTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMaterialType(editing?.material_type ?? 'BOOK');
    reset({ ...(defaultValues as Record<string, unknown> | undefined), total_copies: defaultValues?.total_copies ?? 1 });
    setAuthorAuthority({ id: editing?.author_authority_id ?? null, name: editing?.author ?? null });
    setPublisherAuthority({ id: editing?.publisher_authority_id ?? null, name: editing?.publisher ?? null });
    setSubjects([]);
    setSubjectsTouched(false);
  }, [open]);

  function renderField(f: FieldDescriptor) {
    if (f.kind === 'author-authority') {
      return (
        <div key={f.key} className="col-span-2 space-y-1"><Label>{f.label}</Label>
          <AuthorityPicker type="personal" valueName={authorAuthority.name ?? undefined}
            placeholder={`Search or create ${f.label.toLowerCase()}…`}
            onChange={(id, name) => setAuthorAuthority({ id, name })} />
        </div>
      );
    }
    if (f.kind === 'publisher-authority') {
      return (
        <div key={f.key} className="col-span-2 space-y-1"><Label>{f.label}</Label>
          <AuthorityPicker type="publisher" valueName={publisherAuthority.name ?? undefined}
            placeholder={`Search or create ${f.label.toLowerCase()}…`}
            onChange={(id, name) => setPublisherAuthority({ id, name })} />
        </div>
      );
    }
    if (f.kind === 'subjects') {
      return (
        <div key={f.key} className="col-span-2 space-y-1"><Label>{f.label}</Label>
          <AuthorityMultiPicker type="subject" value={subjects}
            onChange={(next) => { setSubjects(next); setSubjectsTouched(true); }}
            placeholder="Add controlled subjects…" />
        </div>
      );
    }
    if (f.kind === 'select') {
      return (
        <div key={f.key} className="space-y-1"><Label>{f.label}</Label>
          <select {...register(f.key)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">—</option>
            {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    }
    const span = f.kind === 'textarea' ? 'col-span-2' : '';
    return (
      <div key={f.key} className={`${span} space-y-1`}><Label>{f.label}{f.required ? ' *' : ''}</Label>
        {f.kind === 'textarea'
          ? <textarea {...register(f.key)} className="min-h-16 w-full rounded-md border bg-background px-2 py-1 text-sm" />
          : <Input type={f.kind === 'number' ? 'number' : 'text'} {...register(f.key)} />}
        {errors[f.key] && <p className="text-xs text-destructive">{String(errors[f.key]?.message)}</p>}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((data) => onSubmit({
          ...data,
          material_type: materialType,
          author: authorAuthority.name ?? (data.author as string | undefined) ?? '',
          publisher: publisherAuthority.name ?? (data.publisher as string | undefined),
          author_authority_id: authorAuthority.id,
          publisher_authority_id: publisherAuthority.id,
          is_loanable: true,
          ...(subjectsTouched ? { subject_authority_ids: subjects.map((s) => s.id) } : {}),
        }))} className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Material type</Label>
            <select value={materialType} onChange={(e) => setMaterialType(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {MATERIAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {fields.map(renderField)}
          </div>
          {error && <p className="text-xs text-destructive">{getTRPCErrorMessage(error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset(); }}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Note on the `author` field: descriptors that lack an author field (Serial) leave `authorAuthority` null and `data.author` undefined, so the submit defaults `author` to `''` — matching the NOT-NULL "no personal author" convention. Add this comment above the `author:` line in the submit handler:

```tsx
          // Serial has no author field → persist '' (means "no personal author", not "unknown");
          // a future MARC exporter must not emit an empty 100$a for these.
```

- [ ] **Step 2: Remove the now-unused static `bookSchema`/`BookForm` if no longer referenced**

If `bookSchema` (line 22-34) and `BookForm` are only used by the old `BookDialog`, keep `BookForm` only if still referenced by `defaultValues` typing; otherwise change `defaultValues?: Partial<BookForm>` to `defaultValues?: Record<string, unknown>` and delete `bookSchema`. Verify with the typecheck in Step 3 (remove whatever it reports as unused).

- [ ] **Step 3: Typecheck the desktop app**

Run: `cd apps/desktop && npx tsc --noEmit 2>&1 | grep -E "error TS" | wc -l`
Expected: `5` (baseline unchanged — no new errors). If higher, inspect the new errors and fix.

- [ ] **Step 4: Manual smoke checklist (record results in the commit body or PR)**

Rebuild the sidecar and launch: `cd packages/server && npm run build:desktop` then `cd apps/desktop && pnpm tauri dev`. Then:
- Add Book → fields show Edition/Series/Volume; save; appears in list.
- Switch type to Serial → ISSN + Frequency (dropdown) + Year began appear; Author disappears; save; no NOT-NULL error.
- Switch to Article → Container title / Volume / Issue / Pages / DOI / URL appear; save.
- Switch to Thesis → Degree / Institution / Advisor appear; save; reopen Edit and confirm values persisted.
- Switch to Map (generic) → today's basic fields render.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/pages/Books.tsx
git commit -m "feat(desktop): material-type-driven cataloging form"
```

---

### Task 8: Regression pass

**Files:** none (verification only).

- [ ] **Step 1: Full server test suite**

Run: `cd packages/server && npm test`
Expected: all PASS (50 prior + 4 new round-trip = 54).

- [ ] **Step 2: Desktop config/schema tests**

Run: `cd apps/desktop && npx vitest run src/lib/materialFields.test.ts src/lib/materialFormSchema.test.ts`
Expected: 12 PASS.

- [ ] **Step 3: Typechecks at baseline**

Run: `cd packages/server && npx tsc --noEmit 2>&1 | grep -c "error TS"` → expect `4`
Run: `cd apps/desktop && npx tsc --noEmit 2>&1 | grep -c "error TS"` → expect `5`
Run: `cd packages/db && npx tsc --noEmit` → expect clean

- [ ] **Step 4: Prove no mobile changes**

Run: `git diff --name-only master...HEAD -- apps/server`
Expected: empty output.

- [ ] **Step 5: Commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "chore(catalog): regression fixups for material-type fields" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Field sets per in-scope type → Task 5 (`MATERIAL_FIELDS`).
- Generic fallback for other types → Task 5 (`GENERIC_FIELDS` + `fieldsFor`).
- Six new columns → Tasks 2 (schema) + 3 (migration) + 4 (persistence).
- `volume`/`issue_number` reuse → Task 5 (Article descriptors) + Task 4 (round-trip asserts them).
- `CALL_NUMBER_TYPES` single source + drift test → Task 1 (const) + Task 2 (schema wiring) + Task 5 (drift test).
- frequency controlled select, display value → Task 5 (`SERIAL_FREQUENCIES`).
- Serial empty-string author + comment → Task 4 (test) + Task 7 (comment).
- Dynamic zod schema, only Title required, select optional → Task 6.
- call_number split into two descriptors → Task 5.
- `fieldsFor('GARBAGE')` test → Task 5.
- Generic renderer reading `fieldsFor` → Task 7.
- Backend permissive (`z.record`) so no router change → noted in plan intro; no task needed.
- Desktop-only / mobile untouched → Global Constraints + Task 8 Step 4.

**Placeholder scan:** none — all steps carry full code and exact commands.

**Type consistency:** `FieldDescriptor`, `FieldKind`, `fieldsFor`, `buildMaterialSchema`, `CALL_NUMBER_TYPES`, `SERIAL_FREQUENCIES` are defined in Tasks 1/5/6 and used consistently in Tasks 5/6/7. `subject_authority_ids` is the agreed payload key (matches existing adapter `syncResourceSubjects`).
