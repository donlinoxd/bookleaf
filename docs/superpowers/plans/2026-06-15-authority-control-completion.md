# Authority Control Completion (Desktop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete authority control in the Bookleaf desktop app — extend authority records to subjects and publishers (currently authors only), add name normalization, variant cross-references, duplicate-record merging, and wire authority pickers into the desktop cataloging form.

**Architecture:** A unified `authority_names` table gains a `normalized_name` key (for dedupe) and two new `name_type` values (`subject`, `publisher`). Resources link to a publisher authority via a new `publisher_authority_id` column and to subject authorities via a new `resource_subjects` join table. Denormalized text columns (`author`, `publisher`, `subject_headings`) stay in sync so the mobile/patron read paths are untouched. Backend logic is a new `authorities/` module in `packages/server` plus adapter methods and an `admin.authorities` tRPC router; UI is a new `/authorities` desktop page plus a reusable `<AuthorityCombobox>` wired into the book form. **No changes to the mobile app (`apps/server`).**

**Tech Stack:** TypeScript, Drizzle ORM + better-sqlite3 (desktop adapter), tRPC v11, Zod, Vitest, React 18 + React Router (hash), TanStack Query/Table, React Hook Form, shadcn-style UI in `packages/ui`, Tailwind.

---

## Conventions & Ground Rules

- **Test runner:** `cd packages/server && npm test` (Vitest). Run a single file with `npm test -- src/authorities/normalize.test.ts`.
- **Typecheck:** `cd packages/server && npm run typecheck`; desktop: `cd apps/desktop && npx tsc --noEmit`.
- **Migrations are positional.** The desktop adapter applies SQL files in the order they are passed to `createSqliteAdapter(...)` in `packages/server/src/index.desktop.ts`, naming them `migration_0000`, `migration_0001`, … by position. The integration test auto-discovers every `packages/db/drizzle/NNNN_*.sql` file (regex `^\d+_.*\.sql$`, sorted). So a new migration must (a) be a new file `0003_*.sql`, (b) be imported and appended **last** in `index.desktop.ts`.
- **`npm run db:generate` is intentionally NOT run in this slice.** Regenerating Drizzle migrations would also produce mobile (expo) migrations and risk touching the mobile pipeline. We hand-write the desktop SQL migration and edit `schema.ts` by hand so the Drizzle schema (used for query typing in the adapter) stays the source of truth. New columns are additive + nullable and the new table is unused by mobile, so the mobile app keeps working unchanged.
- **Denormalization rule:** whenever an authority link is set/changed/merged, the corresponding free-text column on `resources` is updated to the authority's preferred `name`: `author_authority_id`→`author`, `publisher_authority_id`→`publisher`, subject links→`subject_headings` (JSON array of linked subjects' names). Free text entered without a linked authority is left as-is.
- Commit after every task with the message shown in its final step.

---

## File Structure

**Create:**
- `packages/db/drizzle/0003_authority_control.sql` — desktop migration
- `packages/server/src/authorities/normalize.ts` — pure name-normalization
- `packages/server/src/authorities/normalize.test.ts`
- `packages/server/src/authorities/types.ts` — module-local types
- `packages/server/src/router/admin/authorities.ts` — tRPC router
- `packages/server/src/adapter/sqlite.authorities.test.ts` — adapter integration tests
- `apps/desktop/src/components/AuthorityCombobox.tsx` — reusable picker (single + multi)
- `apps/desktop/src/pages/Authorities.tsx` — management page

**Modify:**
- `packages/db/src/schema.ts` — extend `authorityNames`, add `publisher_authority_id`, add `resourceSubjects` table
- `packages/types/src/index.ts` — extend authority types
- `packages/server/src/index.desktop.ts` — import + append migration `0003`
- `packages/server/src/adapter/types.ts` — add authority methods to `DbAdapter`
- `packages/server/src/adapter/sqlite.ts` — implement authority methods + extend book create/update sync
- `packages/server/src/router/admin/index.ts` — mount `authorities` router
- `apps/desktop/src/App.tsx` — register `/authorities` route
- `apps/desktop/src/pages/Books.tsx` — wire pickers into the book form
- `apps/desktop/src/components/layout/AppShell.tsx` — add nav link (verify path during task)

---

## Phase A — Schema & Migration

### Task 1: Extend the Drizzle schema

**Files:**
- Modify: `packages/db/src/schema.ts:26-33` (authorityNames), `:67` (resources), and add a new table after `resourceCopies`

- [ ] **Step 1: Extend `authorityNames`**

Replace the `authorityNames` definition (lines 26-33) with:

```typescript
export const authorityNames = sqliteTable('authority_names', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  institution_id: integer('institution_id').notNull().references(() => institutions.id),
  name: text('name').notNull(),
  name_type: text('name_type', {
    enum: ['personal', 'corporate', 'geographic', 'subject', 'publisher'],
  }).notNull().default('personal'),
  variants: text('variants'),
  // Lowercased, whitespace-collapsed, NFC dedupe key. Nullable so mobile-created
  // rows (which never set it) stay valid and bypass the desktop unique index.
  normalized_name: text('normalized_name'),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

- [ ] **Step 2: Add `publisher_authority_id` to `resources`**

In the `resources` table, immediately after the `author_authority_id` line (line 67), add:

```typescript
  publisher_authority_id: integer('publisher_authority_id').references(() => authorityNames.id),
```

- [ ] **Step 3: Add the `resourceSubjects` join table**

Immediately after the `resourceCopies` table definition (after line 86), add:

```typescript
export const resourceSubjects = sqliteTable('resource_subjects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  resource_id: integer('resource_id').notNull().references(() => resources.id),
  authority_id: integer('authority_id').notNull().references(() => authorityNames.id),
});
```

- [ ] **Step 4: Typecheck the db package**

Run: `cd packages/db && npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts
git commit -m "feat(db): extend authority schema for subjects/publishers + resource_subjects"
```

---

### Task 2: Write the desktop SQL migration

**Files:**
- Create: `packages/db/drizzle/0003_authority_control.sql`
- Modify: `packages/server/src/index.desktop.ts:8-25`

- [ ] **Step 1: Write the migration SQL**

Create `packages/db/drizzle/0003_authority_control.sql`. Note the migration runner splits on `--> statement-breakpoint` and tolerates "already exists" errors, but `ALTER TABLE ... ADD COLUMN` is NOT idempotent — guard order is fine because the migration tracking table ensures each file runs once.

```sql
ALTER TABLE `resources` ADD COLUMN `publisher_authority_id` integer REFERENCES `authority_names`(`id`);
--> statement-breakpoint
ALTER TABLE `authority_names` ADD COLUMN `normalized_name` text;
--> statement-breakpoint
CREATE TABLE `resource_subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`resource_id` integer NOT NULL,
	`authority_id` integer NOT NULL,
	FOREIGN KEY (`resource_id`) REFERENCES `resources`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`authority_id`) REFERENCES `authority_names`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resource_subjects_unique` ON `resource_subjects` (`resource_id`, `authority_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `authority_names_unique` ON `authority_names` (`institution_id`, `name_type`, `normalized_name`);
--> statement-breakpoint
UPDATE `authority_names`
SET `normalized_name` = lower(trim(replace(replace(replace(`name`, char(9), ' '), char(10), ' '), char(13), ' ')))
WHERE `normalized_name` IS NULL;
```

Note: the final `UPDATE` backfills `normalized_name` for pre-existing authority rows. The SQL `replace` chain only collapses tab/newline to single spaces; it does NOT collapse repeated spaces (SQLite has no regex). This is acceptable for the one-time backfill — the canonical normalization used going forward lives in `normalize.ts` (Task 3) and will be applied on every create/update. If two legacy rows collide on the simplified key, the unique index creation could fail; if that happens in practice, dedupe legacy rows first. For the expected (near-empty) authority tables this is a non-issue.

- [ ] **Step 2: Wire the migration into the desktop entrypoint**

In `packages/server/src/index.desktop.ts`, after the `sql_0002` import (line 14) add:

```typescript
// @ts-expect-error — imported as plain text by esbuild
import sql_0003 from '../../../packages/db/drizzle/0003_authority_control.sql';
```

Then change the `createSqliteAdapter` call (line 25) to append it **last**:

```typescript
const db = createSqliteAdapter(dbPath, sql_0000 as string, sql_0001 as string, sql_0002 as string, sql_0003 as string);
```

- [ ] **Step 3: Verify the migration applies (integration smoke test)**

The existing import test (`sqlite.import.test.ts`) auto-discovers all `NNNN_*.sql` files and spins up an in-memory DB in `beforeEach`. Run it to confirm the new migration parses and applies cleanly:

Run: `cd packages/server && npm test -- src/adapter/sqlite.import.test.ts`
Expected: PASS (existing tests still green — proves `0003` applies without error).

- [ ] **Step 4: Commit**

```bash
git add packages/db/drizzle/0003_authority_control.sql packages/server/src/index.desktop.ts
git commit -m "feat(db): add 0003 authority control migration and wire into desktop adapter"
```

---

## Phase B — Shared Types

### Task 3: Extend shared authority types

**Files:**
- Modify: `packages/types/src/index.ts:1` and `:16-23`

- [ ] **Step 1: Add the broader authority type and extend the interface**

Replace line 1:

```typescript
export type AuthorityNameType = 'personal' | 'corporate' | 'geographic';
```

with:

```typescript
/** Name authorities (people/orgs/places). Kept for backward compatibility. */
export type AuthorityNameType = 'personal' | 'corporate' | 'geographic';
/** All authority record types in the unified authority table. */
export type AuthorityType = AuthorityNameType | 'subject' | 'publisher';
```

Replace the `AuthorityName` interface (lines 16-23) with:

```typescript
export interface AuthorityName {
  id: number;
  institution_id: number;
  name: string;
  name_type: AuthorityType;
  variants: string | null;
  normalized_name: string | null;
  created_at: string;
}

/** An authority row plus how many resources reference it. */
export interface AuthorityWithUsage extends AuthorityName {
  usage_count: number;
}

export interface MergeAuthoritiesInput {
  survivorId: number;
  loserIds: number[];
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/types && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/index.ts
git commit -m "feat(types): extend authority types for subjects/publishers, usage, merge"
```

---

## Phase C — Backend Pure Logic

### Task 4: Name normalization (pure, TDD)

**Files:**
- Create: `packages/server/src/authorities/normalize.ts`
- Test: `packages/server/src/authorities/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/authorities/normalize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeAuthorityName } from './normalize';

describe('normalizeAuthorityName', () => {
  it('trims and lowercases', () => {
    expect(normalizeAuthorityName('  Tolkien  ')).toBe('tolkien');
  });
  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeAuthorityName('Tolkien,   J.R.R.')).toBe('tolkien, j.r.r.');
  });
  it('normalizes tabs and newlines to spaces', () => {
    expect(normalizeAuthorityName('Foo\t\nBar')).toBe('foo bar');
  });
  it('applies Unicode NFC so composed/decomposed forms match', () => {
    const composed = 'Émile';          // U+00C9
    const decomposed = 'Émile';  // E + combining acute
    expect(normalizeAuthorityName(composed)).toBe(normalizeAuthorityName(decomposed));
  });
  it('returns empty string for whitespace-only input', () => {
    expect(normalizeAuthorityName('   ')).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/server && npm test -- src/authorities/normalize.test.ts`
Expected: FAIL — `Cannot find module './normalize'`.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/server/src/authorities/normalize.ts`:

```typescript
/**
 * Canonical dedupe key for an authority record's preferred name.
 * Trims, collapses internal whitespace, applies Unicode NFC, lowercases.
 * The display name (stored separately) preserves the librarian's casing.
 * Personal names are NOT reordered to "Last, First" — they are stored as entered.
 */
export function normalizeAuthorityName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/server && npm test -- src/authorities/normalize.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/authorities/normalize.ts packages/server/src/authorities/normalize.test.ts
git commit -m "feat(authorities): name normalization helper"
```

---

### Task 5: Authority module types

**Files:**
- Create: `packages/server/src/authorities/types.ts`

- [ ] **Step 1: Write the types**

Create `packages/server/src/authorities/types.ts`:

```typescript
import type { AuthorityType } from '@bookleaf/types';

export interface AuthorityCreateInput {
  institutionId: number;
  name: string;
  type: AuthorityType;
  variants?: string[] | null;
}

export interface AuthorityUpdateInput {
  name?: string;
  type?: AuthorityType;
  variants?: string[] | null;
}

export interface AuthorityListFilter {
  type?: AuthorityType;
  q?: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd packages/server && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/authorities/types.ts
git commit -m "feat(authorities): module input types"
```

---

## Phase D — Adapter Methods (integration-tested)

> All adapter authority methods are added to the `adapterImpl` object literal in `packages/server/src/adapter/sqlite.ts`, in a new section after the `// ── Admin: Books ──` block (after `adminAddCopy`, around line 832). They use the `db` (Drizzle) and `rawDb` (better-sqlite3) handles already in scope, plus the `authorityNames`, `resources`, and (newly destructured) `resourceSubjects` schema objects. Import `normalizeAuthorityName` at the top of the file. Variants are stored as a JSON string array in the `variants` column (helpers below mirror `serializeSubjectHeadings`).

### Task 6: Adapter — variant (de)serialization + get-or-create + list/get

**Files:**
- Modify: `packages/server/src/adapter/sqlite.ts` (imports ~line 8, destructure ~line 11-16, helpers ~line 28, methods ~line 832, `DbAdapter` cast at end already covers via `adapter/types.ts`)
- Modify: `packages/server/src/adapter/types.ts` (add method signatures)
- Test: `packages/server/src/adapter/sqlite.authorities.test.ts`

- [ ] **Step 1: Add the method signatures to the `DbAdapter` port**

In `packages/server/src/adapter/types.ts`, after the `// ── Admin: Books ──` block (after `adminAddCopy`, line 89) add:

```typescript
  // ── Admin: Authorities ────────────────────────────────────────────────────
  adminListAuthorities(
    institutionId: number,
    filter: { type?: string; q?: string },
  ): Promise<Array<Record<string, unknown> & { usage_count: number }>>;
  adminGetAuthority(id: number): Promise<(Record<string, unknown> & { usage_count: number }) | null>;
  adminCreateAuthority(input: {
    institutionId: number;
    name: string;
    type: string;
    variants?: string[] | null;
  }): Promise<{ id: number }>;
  adminUpdateAuthority(
    id: number,
    data: { name?: string; type?: string; variants?: string[] | null },
  ): Promise<void>;
  adminDeleteAuthority(id: number): Promise<void>;
  adminMergeAuthorities(survivorId: number, loserIds: number[]): Promise<void>;
```

- [ ] **Step 2: Add imports + helpers + destructure in `sqlite.ts`**

At the top, change the import on line 8 region to also import the normalizer (add a new import line after line 9):

```typescript
import { normalizeAuthorityName } from '../authorities/normalize';
```

Add `resourceSubjects` to the schema destructure (lines 11-16); the block becomes:

```typescript
const {
  institutions, users, resources, resourceCopies, borrowingRecords,
  reservations, fines, favorites, reviews, gateLogs, settings,
  authorityNames, resourceSubjects, scanSessions, scanEntries, sessions,
  DEFAULT_SETTINGS,
} = schema;
```

After the `parseSubjectHeadings` helper (after line 28) add variant helpers:

```typescript
function serializeVariants(variants: string[] | null | undefined): string | null {
  if (!variants || variants.length === 0) return null;
  return JSON.stringify(variants);
}

function parseVariants(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    // Legacy non-JSON variants (mobile stored comma-or-free text); treat as single.
    return [raw];
  }
}
```

- [ ] **Step 3: Write the failing test (get-or-create + list/get)**

Create `packages/server/src/adapter/sqlite.authorities.test.ts`:

```typescript
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

describe('adminCreateAuthority (get-or-create)', () => {
  it('creates a new authority and returns its id', async () => {
    const { id } = await db.adminCreateAuthority({ institutionId: iid, name: 'Tolkien, J.R.R.', type: 'personal' });
    expect(id).toBeGreaterThan(0);
  });

  it('returns the existing id for a case/whitespace-equivalent name+type', async () => {
    const a = await db.adminCreateAuthority({ institutionId: iid, name: 'Tolkien', type: 'personal' });
    const b = await db.adminCreateAuthority({ institutionId: iid, name: '  TOLKIEN ', type: 'personal' });
    expect(b.id).toBe(a.id);
  });

  it('treats the same name under different types as distinct', async () => {
    const a = await db.adminCreateAuthority({ institutionId: iid, name: 'History', type: 'subject' });
    const b = await db.adminCreateAuthority({ institutionId: iid, name: 'History', type: 'publisher' });
    expect(b.id).not.toBe(a.id);
  });

  it('persists variants as a JSON array', async () => {
    const { id } = await db.adminCreateAuthority({ institutionId: iid, name: 'Twain, Mark', type: 'personal', variants: ['Clemens, Samuel'] });
    const got = await db.adminGetAuthority(id);
    expect(got?.variants).toEqual(['Clemens, Samuel']);
  });
});

describe('adminListAuthorities', () => {
  it('filters by type and matches name or variants on q', async () => {
    await db.adminCreateAuthority({ institutionId: iid, name: 'Twain, Mark', type: 'personal', variants: ['Clemens, Samuel'] });
    await db.adminCreateAuthority({ institutionId: iid, name: 'History', type: 'subject' });
    const persons = await db.adminListAuthorities(iid, { type: 'personal' });
    expect(persons).toHaveLength(1);
    const byVariant = await db.adminListAuthorities(iid, { q: 'clemens' });
    expect(byVariant.map(a => a.name)).toContain('Twain, Mark');
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd packages/server && npm test -- src/adapter/sqlite.authorities.test.ts`
Expected: FAIL — `adminCreateAuthority is not a function`.

- [ ] **Step 5: Implement the create/list/get methods**

In `sqlite.ts`, after `adminAddCopy` (line 832, before `// ── Admin: Members ──`) insert:

```typescript
    // ── Admin: Authorities ─────────────────────────────────────────────────

    async adminCreateAuthority(input) {
      const name = input.name.trim();
      const normalized = normalizeAuthorityName(name);
      const existing = await db.select({ id: authorityNames.id })
        .from(authorityNames)
        .where(and(
          eq(authorityNames.institution_id, input.institutionId),
          eq(authorityNames.name_type, input.type as any),
          eq(authorityNames.normalized_name, normalized),
        ))
        .limit(1)
        .then(r => r[0] ?? null);
      if (existing) return { id: existing.id };

      const result = await db.insert(authorityNames).values({
        institution_id: input.institutionId,
        name,
        name_type: input.type as any,
        variants: serializeVariants(input.variants),
        normalized_name: normalized,
      }).returning({ id: authorityNames.id });
      return { id: result[0].id };
    },

    async adminListAuthorities(institutionId, filter) {
      const conditions: any[] = [eq(authorityNames.institution_id, institutionId)];
      if (filter.type) conditions.push(eq(authorityNames.name_type, filter.type as any));
      if (filter.q) {
        const qp = `%${filter.q}%`;
        conditions.push(or(like(authorityNames.name, qp), like(authorityNames.variants, qp)));
      }
      const rows = await db.select().from(authorityNames)
        .where(and(...conditions))
        .orderBy(asc(authorityNames.name));

      // Usage = author links + publisher links + subject links.
      const usage = rawDb.prepare(
        `SELECT a.id AS id,
           (SELECT COUNT(*) FROM resources r WHERE r.author_authority_id = a.id)
         + (SELECT COUNT(*) FROM resources r WHERE r.publisher_authority_id = a.id)
         + (SELECT COUNT(*) FROM resource_subjects rs WHERE rs.authority_id = a.id) AS usage_count
         FROM authority_names a WHERE a.institution_id = ?`,
      ).all(institutionId) as { id: number; usage_count: number }[];
      const usageMap = new Map(usage.map(u => [u.id, u.usage_count]));

      return rows.map(r => ({
        ...r,
        variants: parseVariants(r.variants),
        usage_count: usageMap.get(r.id) ?? 0,
      }));
    },

    async adminGetAuthority(id) {
      const row = await db.select().from(authorityNames).where(eq(authorityNames.id, id)).limit(1).then(r => r[0] ?? null);
      if (!row) return null;
      const usageRow = rawDb.prepare(
        `SELECT (SELECT COUNT(*) FROM resources r WHERE r.author_authority_id = ?)
              + (SELECT COUNT(*) FROM resources r WHERE r.publisher_authority_id = ?)
              + (SELECT COUNT(*) FROM resource_subjects rs WHERE rs.authority_id = ?) AS usage_count`,
      ).get(id, id, id) as { usage_count: number };
      return { ...row, variants: parseVariants(row.variants), usage_count: usageRow.usage_count };
    },
```

- [ ] **Step 6: Run to verify create/list/get pass**

Run: `cd packages/server && npm test -- src/adapter/sqlite.authorities.test.ts`
Expected: PASS (create/list/get describe blocks green; update/delete/merge not yet present).

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/adapter/sqlite.ts packages/server/src/adapter/types.ts packages/server/src/adapter/sqlite.authorities.test.ts
git commit -m "feat(authorities): adapter get-or-create, list (with usage), get"
```

---

### Task 7: Adapter — update + delete guard

**Files:**
- Modify: `packages/server/src/adapter/sqlite.ts` (authorities section)
- Test: `packages/server/src/adapter/sqlite.authorities.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `sqlite.authorities.test.ts`:

```typescript
describe('adminUpdateAuthority', () => {
  it('updates name and recomputes the dedupe key', async () => {
    const { id } = await db.adminCreateAuthority({ institutionId: iid, name: 'Old Name', type: 'subject' });
    await db.adminUpdateAuthority(id, { name: 'New Name' });
    const got = await db.adminGetAuthority(id);
    expect(got?.name).toBe('New Name');
    expect(got?.normalized_name).toBe('new name');
  });
});

describe('adminDeleteAuthority', () => {
  it('deletes an unreferenced authority', async () => {
    const { id } = await db.adminCreateAuthority({ institutionId: iid, name: 'Orphan', type: 'subject' });
    await db.adminDeleteAuthority(id);
    expect(await db.adminGetAuthority(id)).toBeNull();
  });

  it('refuses to delete an authority still in use', async () => {
    const { id } = await db.adminCreateAuthority({ institutionId: iid, name: 'Used Subject', type: 'subject' });
    await db.adminCreateBook(iid, { title: 'T', author: 'A', subject_authority_ids: [id] }, []);
    await expect(db.adminDeleteAuthority(id)).rejects.toThrow(/in use/i);
  });
});
```

(The delete-guard test depends on `adminCreateBook` writing subject links — implemented in Task 9. If running tasks strictly in order, this specific assertion will fail until Task 9; that is expected and called out in Step 2.)

- [ ] **Step 2: Run to verify the update/delete-unreferenced tests fail**

Run: `cd packages/server && npm test -- src/adapter/sqlite.authorities.test.ts`
Expected: FAIL — `adminUpdateAuthority is not a function`. (The "refuses to delete in use" case will remain red until Task 9 wires subject links into `adminCreateBook`; the other new cases must pass after Step 3.)

- [ ] **Step 3: Implement update + delete**

In the authorities section of `sqlite.ts`, after `adminGetAuthority`, add:

```typescript
    async adminUpdateAuthority(id, data) {
      const patch: Record<string, unknown> = {};
      if (data.name !== undefined) {
        patch.name = data.name.trim();
        patch.normalized_name = normalizeAuthorityName(data.name);
      }
      if (data.type !== undefined) patch.name_type = data.type;
      if (data.variants !== undefined) patch.variants = serializeVariants(data.variants);
      if (Object.keys(patch).length === 0) return;
      await db.update(authorityNames).set(patch as any).where(eq(authorityNames.id, id));
    },

    async adminDeleteAuthority(id) {
      const usage = rawDb.prepare(
        `SELECT (SELECT COUNT(*) FROM resources r WHERE r.author_authority_id = ?)
              + (SELECT COUNT(*) FROM resources r WHERE r.publisher_authority_id = ?)
              + (SELECT COUNT(*) FROM resource_subjects rs WHERE rs.authority_id = ?) AS c`,
      ).get(id, id, id) as { c: number };
      if (usage.c > 0) {
        throw new Error(`This authority is in use by ${usage.c} record(s). Merge it into another authority or unlink it first.`);
      }
      await db.delete(authorityNames).where(eq(authorityNames.id, id));
    },
```

- [ ] **Step 4: Run to verify update + delete-unreferenced pass**

Run: `cd packages/server && npm test -- src/adapter/sqlite.authorities.test.ts -t "adminUpdateAuthority"`
Expected: PASS.
Run: `cd packages/server && npm test -- src/adapter/sqlite.authorities.test.ts -t "deletes an unreferenced"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapter/sqlite.ts packages/server/src/adapter/sqlite.authorities.test.ts
git commit -m "feat(authorities): adapter update + delete guard"
```

---

### Task 8: Adapter — merge (transactional)

**Files:**
- Modify: `packages/server/src/adapter/sqlite.ts` (authorities section)
- Test: `packages/server/src/adapter/sqlite.authorities.test.ts`

- [ ] **Step 1: Add failing test**

Append to `sqlite.authorities.test.ts`:

```typescript
describe('adminMergeAuthorities', () => {
  it('repoints author links, folds loser names into survivor variants, deletes losers, and re-syncs denormalized author text', async () => {
    const survivor = await db.adminCreateAuthority({ institutionId: iid, name: 'Twain, Mark', type: 'personal' });
    const loser = await db.adminCreateAuthority({ institutionId: iid, name: 'Clemens, Samuel', type: 'personal' });
    const { id: bookId } = await db.adminCreateBook(iid, { title: 'Tom Sawyer', author: 'Clemens, Samuel', author_authority_id: loser.id }, []);

    await db.adminMergeAuthorities(survivor.id, [loser.id]);

    expect(await db.adminGetAuthority(loser.id)).toBeNull();
    const merged = await db.adminGetAuthority(survivor.id);
    expect(merged?.variants).toContain('Clemens, Samuel');
    const book = await db.adminGetBook(bookId) as { author_authority_id: number; author: string };
    expect(book.author_authority_id).toBe(survivor.id);
    expect(book.author).toBe('Twain, Mark'); // denormalized text re-synced
  });

  it('drops redundant subject links when both survivor and loser are attached to the same resource', async () => {
    const survivor = await db.adminCreateAuthority({ institutionId: iid, name: 'WWII', type: 'subject' });
    const loser = await db.adminCreateAuthority({ institutionId: iid, name: 'World War 2', type: 'subject' });
    const { id: bookId } = await db.adminCreateBook(iid, { title: 'History', author: 'A', subject_authority_ids: [survivor.id, loser.id] }, []);

    await db.adminMergeAuthorities(survivor.id, [loser.id]);

    const links = rawDbCount(`SELECT COUNT(*) AS c FROM resource_subjects WHERE resource_id = ${bookId}`);
    expect(links).toBe(1);
  });
});

function rawDbCount(_sql: string): number {
  // helper resolved below via the adapter's exposed test seam
  throw new Error('replaced in Step 3');
}
```

Note: replace the placeholder `rawDbCount` — query through the public API instead. Change the second test's assertion to use `adminGetBookWithCopies`-style access; simplest is to query subjects via a small read method. To avoid adding read plumbing just for the test, assert via `adminGetAuthority(survivor).usage_count`:

```typescript
    const merged = await db.adminGetAuthority(survivor.id);
    expect(merged?.usage_count).toBe(1); // single subject link remains after dedupe
```

Delete the `rawDbCount` helper and the `links`/`expect(links)` lines; use the `usage_count` assertion above.

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/server && npm test -- src/adapter/sqlite.authorities.test.ts -t "adminMergeAuthorities"`
Expected: FAIL — `adminMergeAuthorities is not a function`.

- [ ] **Step 3: Implement merge**

In the authorities section, after `adminDeleteAuthority`, add:

```typescript
    async adminMergeAuthorities(survivorId, loserIds) {
      const losers = loserIds.filter(id => id !== survivorId);
      if (losers.length === 0) return;

      const tx = rawDb.transaction(() => {
        const survivor = rawDb.prepare('SELECT id, name, variants FROM authority_names WHERE id = ?').get(survivorId) as
          { id: number; name: string; variants: string | null } | undefined;
        if (!survivor) throw new Error('Survivor authority not found');

        const placeholders = losers.map(() => '?').join(',');
        const loserRows = rawDb.prepare(
          `SELECT id, name, variants FROM authority_names WHERE id IN (${placeholders})`,
        ).all(...losers) as { id: number; name: string; variants: string | null }[];

        // 1. Repoint author + publisher FKs.
        rawDb.prepare(`UPDATE resources SET author_authority_id = ? WHERE author_authority_id IN (${placeholders})`).run(survivorId, ...losers);
        rawDb.prepare(`UPDATE resources SET publisher_authority_id = ? WHERE publisher_authority_id IN (${placeholders})`).run(survivorId, ...losers);

        // 2. Repoint subject links, dropping rows that would collide with an
        //    existing survivor link on the same resource (UNIQUE(resource_id, authority_id)).
        rawDb.prepare(
          `DELETE FROM resource_subjects
            WHERE authority_id IN (${placeholders})
              AND resource_id IN (SELECT resource_id FROM resource_subjects WHERE authority_id = ?)`,
        ).run(...losers, survivorId);
        rawDb.prepare(`UPDATE resource_subjects SET authority_id = ? WHERE authority_id IN (${placeholders})`).run(survivorId, ...losers);

        // 3. Fold loser names + variants into survivor variants (deduped).
        const folded = new Set(parseVariants(survivor.variants));
        for (const l of loserRows) {
          folded.add(l.name);
          for (const v of parseVariants(l.variants)) folded.add(v);
        }
        folded.delete(survivor.name);
        rawDb.prepare('UPDATE authority_names SET variants = ? WHERE id = ?')
          .run(serializeVariants([...folded]), survivorId);

        // 4. Re-sync denormalized text on resources now pointing at the survivor.
        rawDb.prepare('UPDATE resources SET author = ? WHERE author_authority_id = ?').run(survivor.name, survivorId);
        rawDb.prepare('UPDATE resources SET publisher = ? WHERE publisher_authority_id = ?').run(survivor.name, survivorId);

        // 5. Re-derive subject_headings JSON for every resource touched.
        const affected = rawDb.prepare('SELECT DISTINCT resource_id FROM resource_subjects WHERE authority_id = ?').all(survivorId) as { resource_id: number }[];
        const subjNames = rawDb.prepare(
          `SELECT an.name AS name FROM resource_subjects rs
             JOIN authority_names an ON an.id = rs.authority_id
            WHERE rs.resource_id = ? ORDER BY an.name`,
        );
        const setSubjects = rawDb.prepare('UPDATE resources SET subject_headings = ? WHERE id = ?');
        for (const a of affected) {
          const names = (subjNames.all(a.resource_id) as { name: string }[]).map(n => n.name);
          setSubjects.run(names.length ? JSON.stringify(names) : null, a.resource_id);
        }

        // 6. Delete losers.
        rawDb.prepare(`DELETE FROM authority_names WHERE id IN (${placeholders})`).run(...losers);
      });
      tx();
    },
```

- [ ] **Step 4: Run to verify merge passes**

Run: `cd packages/server && npm test -- src/adapter/sqlite.authorities.test.ts -t "adminMergeAuthorities"`
Expected: PASS (both merge cases). The subject-dedupe case depends on `adminCreateBook` subject links (Task 9); if running strictly in order it goes green after Task 9.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapter/sqlite.ts packages/server/src/adapter/sqlite.authorities.test.ts
git commit -m "feat(authorities): transactional merge with reference repoint + denormalized re-sync"
```

---

### Task 9: Adapter — wire authority links into book create/update

**Files:**
- Modify: `packages/server/src/adapter/sqlite.ts:733-816` (`adminCreateBook`, `adminUpdateBook`)
- Test: `packages/server/src/adapter/sqlite.authorities.test.ts`

- [ ] **Step 1: Add failing test**

Append to `sqlite.authorities.test.ts`:

```typescript
describe('book ↔ authority linking', () => {
  it('writes subject links and denormalized subject_headings on create', async () => {
    const s1 = await db.adminCreateAuthority({ institutionId: iid, name: 'History', type: 'subject' });
    const s2 = await db.adminCreateAuthority({ institutionId: iid, name: 'War', type: 'subject' });
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', subject_authority_ids: [s1.id, s2.id] }, []);
    const book = await db.adminGetBook(id) as { subject_headings: string[] | null };
    expect(book.subject_headings?.sort()).toEqual(['History', 'War']);
    expect((await db.adminGetAuthority(s1.id))?.usage_count).toBe(1);
  });

  it('replaces subject links on update', async () => {
    const s1 = await db.adminCreateAuthority({ institutionId: iid, name: 'History', type: 'subject' });
    const s2 = await db.adminCreateAuthority({ institutionId: iid, name: 'Science', type: 'subject' });
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', subject_authority_ids: [s1.id] }, []);
    await db.adminUpdateBook(id, { title: 'T', author: 'A', is_loanable: true, subject_authority_ids: [s2.id] });
    expect((await db.adminGetAuthority(s1.id))?.usage_count).toBe(0);
    expect((await db.adminGetAuthority(s2.id))?.usage_count).toBe(1);
  });

  it('syncs publisher text from a linked publisher authority on create', async () => {
    const p = await db.adminCreateAuthority({ institutionId: iid, name: 'Penguin', type: 'publisher' });
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', publisher_authority_id: p.id }, []);
    const book = await db.adminGetBook(id) as { publisher: string; publisher_authority_id: number };
    expect(book.publisher).toBe('Penguin');
    expect(book.publisher_authority_id).toBe(p.id);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/server && npm test -- src/adapter/sqlite.authorities.test.ts -t "book ↔ authority"`
Expected: FAIL — subject_headings null / usage_count 0 (links not written yet).

- [ ] **Step 3: Add a private subject-sync helper inside the adapter factory**

Inside `createSqliteAdapter`, just above `const adapterImpl: DbAdapter = {` (line 129), add a closure helper:

```typescript
  // Replace a resource's subject links and re-derive its denormalized
  // subject_headings JSON from the linked authorities' preferred names.
  function syncResourceSubjects(resourceId: number, authorityIds: number[] | undefined): void {
    if (authorityIds === undefined) return; // caller didn't touch subjects
    const unique = [...new Set(authorityIds)];
    rawDb.prepare('DELETE FROM resource_subjects WHERE resource_id = ?').run(resourceId);
    const insert = rawDb.prepare('INSERT OR IGNORE INTO resource_subjects (resource_id, authority_id) VALUES (?, ?)');
    for (const aid of unique) insert.run(resourceId, aid);
    const names = unique.length
      ? (rawDb.prepare(
          `SELECT name FROM authority_names WHERE id IN (${unique.map(() => '?').join(',')}) ORDER BY name`,
        ).all(...unique) as { name: string }[]).map(n => n.name)
      : [];
    rawDb.prepare('UPDATE resources SET subject_headings = ? WHERE id = ?')
      .run(names.length ? JSON.stringify(names) : null, resourceId);
  }

  // If a publisher/author authority is linked, force the denormalized text to its name.
  function publisherNameFor(authorityId: number | null | undefined): string | undefined {
    if (authorityId == null) return undefined;
    const row = rawDb.prepare('SELECT name FROM authority_names WHERE id = ?').get(authorityId) as { name: string } | undefined;
    return row?.name;
  }
```

- [ ] **Step 4: Wire into `adminCreateBook`**

In `adminCreateBook` (line 733), before the `.returning(...)` insert, compute the synced publisher/author text. Change the `publisher` and `author` values and add `publisher_authority_id`, then after the resource + copies are created, sync subjects. Concretely:

Replace the `publisher: d.publisher ?? null,` line (line 742) with:

```typescript
        publisher: publisherNameFor(d.publisher_authority_id) ?? d.publisher ?? null,
```

Replace the `author: d.author,` line (line 741) with:

```typescript
        author: publisherNameFor(d.author_authority_id) ?? d.author,
```

After the `author_authority_id: d.author_authority_id ?? null,` line (line 762) add:

```typescript
        publisher_authority_id: d.publisher_authority_id ?? null,
```

Then, just before `return { id: resourceId };` (line 781), add:

```typescript
      syncResourceSubjects(resourceId, d.subject_authority_ids as number[] | undefined);
```

- [ ] **Step 5: Wire into `adminUpdateBook`**

In `adminUpdateBook` (line 784), replace the `author: d.author,` line (789) and `publisher: d.publisher ?? null,` line (790) the same way:

```typescript
        author: publisherNameFor(d.author_authority_id) ?? d.author,
        publisher: publisherNameFor(d.publisher_authority_id) ?? d.publisher ?? null,
```

After `author_authority_id: d.author_authority_id ?? null,` (line 812) add:

```typescript
        publisher_authority_id: d.publisher_authority_id ?? null,
```

After the `.where(eq(resources.id, id));` that closes the update (line 815), add:

```typescript
      syncResourceSubjects(id, d.subject_authority_ids as number[] | undefined);
```

- [ ] **Step 6: Run the full authorities test file**

Run: `cd packages/server && npm test -- src/adapter/sqlite.authorities.test.ts`
Expected: PASS (all describe blocks, including the previously-deferred delete-guard and merge-subject-dedupe cases).

- [ ] **Step 7: Run the whole server suite for regressions**

Run: `cd packages/server && npm test`
Expected: PASS (import tests + authority tests). Then `npm run typecheck` → PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/adapter/sqlite.ts packages/server/src/adapter/sqlite.authorities.test.ts
git commit -m "feat(authorities): link authorities into book create/update with denormalized sync"
```

---

## Phase E — tRPC Router

### Task 10: `admin.authorities` router

**Files:**
- Create: `packages/server/src/router/admin/authorities.ts`
- Modify: `packages/server/src/router/admin/index.ts`

- [ ] **Step 1: Write the router**

Create `packages/server/src/router/admin/authorities.ts`:

```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

const AUTHORITY_TYPES = ['personal', 'corporate', 'geographic', 'subject', 'publisher'] as const;

export const adminAuthoritiesRouter = router({
  list: librarianProcedure
    .input(z.object({
      institutionId: z.number().int(),
      type: z.enum(AUTHORITY_TYPES).optional(),
      q: z.string().optional(),
    }))
    .query(({ input, ctx }) => ctx.db.adminListAuthorities(input.institutionId, { type: input.type, q: input.q })),

  get: librarianProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const a = await ctx.db.adminGetAuthority(input.id);
      if (!a) throw new TRPCError({ code: 'NOT_FOUND', message: 'Authority not found' });
      return a;
    }),

  create: librarianProcedure
    .input(z.object({
      institutionId: z.number().int(),
      name: z.string().min(1),
      type: z.enum(AUTHORITY_TYPES),
      variants: z.array(z.string()).optional(),
    }))
    .mutation(({ input, ctx }) => ctx.db.adminCreateAuthority({
      institutionId: input.institutionId, name: input.name, type: input.type, variants: input.variants ?? null,
    })),

  update: librarianProcedure
    .input(z.object({
      id: z.number().int(),
      data: z.object({
        name: z.string().min(1).optional(),
        type: z.enum(AUTHORITY_TYPES).optional(),
        variants: z.array(z.string()).optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminUpdateAuthority(input.id, input.data);
      return { ok: true as const };
    }),

  delete: librarianProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        await ctx.db.adminDeleteAuthority(input.id);
        return { ok: true as const };
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Could not delete authority' });
      }
    }),

  merge: librarianProcedure
    .input(z.object({ survivorId: z.number().int(), loserIds: z.array(z.number().int()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        await ctx.db.adminMergeAuthorities(input.survivorId, input.loserIds);
        return { ok: true as const };
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Merge failed' });
      }
    }),
});
```

- [ ] **Step 2: Mount it**

In `packages/server/src/router/admin/index.ts`, add the import after line 9 and the mount inside `router({...})`:

```typescript
import { adminAuthoritiesRouter } from './authorities';
```

```typescript
  authorities: adminAuthoritiesRouter,
```

- [ ] **Step 3: Typecheck**

Run: `cd packages/server && npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/router/admin/authorities.ts packages/server/src/router/admin/index.ts
git commit -m "feat(authorities): admin.authorities tRPC router"
```

---

## Phase F — Desktop UI

### Task 11: `<AuthorityCombobox>` component

**Files:**
- Create: `apps/desktop/src/components/AuthorityCombobox.tsx`

This is a self-contained combobox built from `Input` + an absolutely-positioned results list (no Command primitive exists in `packages/ui`). It supports single-select (returns an id) and multi-select (returns id[]), with create-on-the-fly via the `create` mutation.

- [ ] **Step 1: Write the component**

Create `apps/desktop/src/components/AuthorityCombobox.tsx`:

```typescript
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Input } from '@bookleaf/ui/components/input';
import { Badge } from '@bookleaf/ui/components/badge';
import { Button } from '@bookleaf/ui/components/button';
import { X, Plus } from 'lucide-react';

type AuthorityType = 'personal' | 'corporate' | 'geographic' | 'subject' | 'publisher';
type AuthorityRow = { id: number; name: string; name_type: string };

function useAuthoritySearch(type: AuthorityType, q: string) {
  const trpc = useTRPC();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  return useQuery({
    ...trpc.admin.authorities.list.queryOptions({ institutionId: iid, type, q }),
    enabled: q.trim().length > 0,
  });
}

function useCreateAuthority(type: AuthorityType) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  return useMutation(trpc.admin.authorities.create.mutationOptions({
    onSuccess: () => qc.invalidateQueries({ queryKey: trpc.admin.authorities.list.queryKey() }),
  }));
}

/** Single-select: binds one authority id (or null). */
export function AuthorityPicker({
  type, valueId, valueName, onChange, placeholder,
}: {
  type: AuthorityType;
  valueId: number | null;
  valueName?: string;
  onChange: (id: number | null, name: string | null) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(valueName ?? '');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const { data: results = [] } = useAuthoritySearch(type, text);
  const createMut = useCreateAuthority(type);

  useEffect(() => { setText(valueName ?? ''); }, [valueName]);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const rows = results as AuthorityRow[];
  const exact = rows.some(r => r.name.toLowerCase() === text.trim().toLowerCase());

  async function create() {
    const created = await createMut.mutateAsync({ institutionId: useAuthStore.getState().user?.institution_id ?? 1, name: text.trim(), type });
    onChange(created.id, text.trim());
    setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={text}
        placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); setOpen(true); if (valueId != null) onChange(null, null); }}
        onFocus={() => setOpen(true)}
      />
      {open && text.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-md max-h-56 overflow-auto">
          {rows.map(r => (
            <button type="button" key={r.id} className="flex w-full items-center px-3 py-1.5 text-sm hover:bg-muted text-left"
              onClick={() => { onChange(r.id, r.name); setText(r.name); setOpen(false); }}>
              {r.name}
            </button>
          ))}
          {!exact && (
            <button type="button" className="flex w-full items-center gap-1.5 px-3 py-1.5 text-sm text-brand hover:bg-muted text-left"
              onClick={create} disabled={createMut.isPending}>
              <Plus size={13} /> Create “{text.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Multi-select: binds an array of authority ids. */
export function AuthorityMultiPicker({
  type, value, onChange, placeholder,
}: {
  type: AuthorityType;
  value: { id: number; name: string }[];
  onChange: (next: { id: number; name: string }[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const { data: results = [] } = useAuthoritySearch(type, text);
  const createMut = useCreateAuthority(type);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const rows = (results as AuthorityRow[]).filter(r => !value.some(v => v.id === r.id));
  const exact = (results as AuthorityRow[]).some(r => r.name.toLowerCase() === text.trim().toLowerCase());

  function add(r: { id: number; name: string }) { onChange([...value, r]); setText(''); }
  async function create() {
    const created = await createMut.mutateAsync({ institutionId: useAuthStore.getState().user?.institution_id ?? 1, name: text.trim(), type });
    add({ id: created.id, name: text.trim() });
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex flex-wrap gap-1 mb-1">
        {value.map(v => (
          <Badge key={v.id} variant="secondary" className="gap-1">
            {v.name}
            <button type="button" onClick={() => onChange(value.filter(x => x.id !== v.id))}><X size={11} /></button>
          </Badge>
        ))}
      </div>
      <Input value={text} placeholder={placeholder}
        onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && text.trim() && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-background shadow-md max-h-56 overflow-auto">
          {rows.map(r => (
            <button type="button" key={r.id} className="flex w-full px-3 py-1.5 text-sm hover:bg-muted text-left"
              onClick={() => add({ id: r.id, name: r.name })}>{r.name}</button>
          ))}
          {!exact && (
            <button type="button" className="flex w-full items-center gap-1.5 px-3 py-1.5 text-sm text-brand hover:bg-muted text-left"
              onClick={create} disabled={createMut.isPending}><Plus size={13} /> Create “{text.trim()}”</button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck the desktop app**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: PASS. (If `text-brand` is not a configured Tailwind token in the desktop app, substitute `text-primary` — verify against `apps/desktop/tailwind.config.*` during this step.)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/AuthorityCombobox.tsx
git commit -m "feat(desktop): reusable AuthorityCombobox (single + multi select)"
```

---

### Task 12: Authorities management page + route

**Files:**
- Create: `apps/desktop/src/pages/Authorities.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/layout/AppShell.tsx` (nav link — confirm structure when editing)

- [ ] **Step 1: Write the page**

Create `apps/desktop/src/pages/Authorities.tsx`:

```typescript
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@bookleaf/ui/components/button';
import { Input } from '@bookleaf/ui/components/input';
import { Label } from '@bookleaf/ui/components/label';
import { Badge } from '@bookleaf/ui/components/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@bookleaf/ui/components/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@bookleaf/ui/components/alert-dialog';
import { Plus, Pencil, Trash2, Merge, Search } from 'lucide-react';

const TABS = [
  { key: 'name', label: 'Names', types: ['personal', 'corporate', 'geographic'] as const, createType: 'personal' as const },
  { key: 'subject', label: 'Subjects', types: ['subject'] as const, createType: 'subject' as const },
  { key: 'publisher', label: 'Publishers', types: ['publisher'] as const, createType: 'publisher' as const },
];

type Authority = { id: number; name: string; name_type: string; variants: string[] | null; usage_count: number };

export default function Authorities() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  const [tab, setTab] = useState(TABS[0]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Authority | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [mergeIds, setMergeIds] = useState<number[]>([]);

  // 'name' tab spans 3 types — query without a type filter and filter client-side.
  const typeArg = tab.key === 'name' ? undefined : tab.createType;
  const { data: allRows = [] } = useQuery(trpc.admin.authorities.list.queryOptions({ institutionId: iid, type: typeArg, q: search }));
  const rows = (allRows as Authority[]).filter(r => (tab.types as readonly string[]).includes(r.name_type));

  const invalidate = () => qc.invalidateQueries({ queryKey: trpc.admin.authorities.list.queryKey() });
  const createMut = useMutation(trpc.admin.authorities.create.mutationOptions({ onSuccess: () => { invalidate(); setIsAddOpen(false); } }));
  const updateMut = useMutation(trpc.admin.authorities.update.mutationOptions({ onSuccess: () => { invalidate(); setEditing(null); } }));
  const deleteMut = useMutation(trpc.admin.authorities.delete.mutationOptions({ onSuccess: () => { invalidate(); setDeleteId(null); } }));
  const mergeMut = useMutation(trpc.admin.authorities.merge.mutationOptions({ onSuccess: () => { invalidate(); setMergeIds([]); } }));

  function toggleMerge(id: number) {
    setMergeIds((cur) => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }
  function doMerge() {
    if (mergeIds.length < 2) return;
    const [survivorId, ...loserIds] = mergeIds; // first selected survives
    mergeMut.mutate({ survivorId, loserIds });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Authorities</h1><p className="text-muted-foreground text-sm mt-1">Controlled names, subjects & publishers</p></div>
        <div className="flex gap-2">
          {mergeIds.length >= 2 && (
            <Button variant="outline" size="sm" onClick={doMerge} disabled={mergeMut.isPending}>
              <Merge size={15} className="mr-1.5" />Merge {mergeIds.length} (keep first)
            </Button>
          )}
          <Button onClick={() => setIsAddOpen(true)} size="sm"><Plus size={15} className="mr-1.5" />Add</Button>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t); setMergeIds([]); }}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab.key === t.key ? 'border-brand text-brand' : 'border-transparent text-muted-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search…" className="pl-8 h-8 text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Name</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Variants</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">Used</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No authorities.</td></tr>
              : rows.map(r => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-3 py-2"><input type="checkbox" checked={mergeIds.includes(r.id)} onChange={() => toggleMerge(r.id)} /></td>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2"><Badge variant="secondary">{r.name_type}</Badge></td>
                <td className="px-3 py-2 text-muted-foreground">{(r.variants ?? []).join('; ') || '—'}</td>
                <td className="px-3 py-2">{r.usage_count}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(r)}><Pencil size={13} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(r.id)}><Trash2 size={13} /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AuthorityDialog
        open={isAddOpen || !!editing}
        onClose={() => { setIsAddOpen(false); setEditing(null); }}
        editing={editing}
        defaultType={tab.createType}
        onSubmit={(d) => editing
          ? updateMut.mutate({ id: editing.id, data: { name: d.name, type: d.type, variants: splitVariants(d.variants) } })
          : createMut.mutate({ institutionId: iid, name: d.name, type: d.type, variants: splitVariants(d.variants) })}
        isPending={createMut.isPending || updateMut.isPending}
        error={createMut.error || updateMut.error}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete authority?</AlertDialogTitle>
            <AlertDialogDescription>In-use authorities cannot be deleted — merge or unlink them first.{deleteMut.error ? ` ${getTRPCErrorMessage(deleteMut.error)}` : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteId && deleteMut.mutate({ id: deleteId })}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function splitVariants(raw: string | undefined): string[] {
  return (raw ?? '').split(';').map(s => s.trim()).filter(Boolean);
}

function AuthorityDialog({ open, onClose, editing, defaultType, onSubmit, isPending, error }: {
  open: boolean; onClose: () => void; editing: Authority | null;
  defaultType: 'personal' | 'subject' | 'publisher';
  onSubmit: (d: { name: string; type: any; variants: string }) => void;
  isPending: boolean; error: unknown;
}) {
  const { register, handleSubmit, reset } = useForm<{ name: string; type: string; variants: string }>();
  const isName = (editing ? ['personal', 'corporate', 'geographic'].includes(editing.name_type) : defaultType === 'personal');
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); reset(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? 'Edit Authority' : 'Add Authority'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => onSubmit({ name: d.name, type: d.type, variants: d.variants }))} className="space-y-3 py-2">
          <div className="space-y-1"><Label>Preferred name *</Label>
            <Input defaultValue={editing?.name ?? ''} {...register('name', { required: true })} /></div>
          <div className="space-y-1"><Label>Type</Label>
            <select defaultValue={editing?.name_type ?? defaultType} {...register('type')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {isName
                ? <><option value="personal">personal</option><option value="corporate">corporate</option><option value="geographic">geographic</option></>
                : <option value={defaultType}>{defaultType}</option>}
            </select></div>
          <div className="space-y-1"><Label>Variants / "use for" (semicolon-separated)</Label>
            <Input defaultValue={(editing?.variants ?? []).join('; ')} {...register('variants')} placeholder="Clemens, Samuel; Mark Twain" /></div>
          {error ? <p className="text-xs text-destructive">{getTRPCErrorMessage(error)}</p> : null}
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

- [ ] **Step 2: Register the route**

In `apps/desktop/src/App.tsx`, add the import after line 15:

```typescript
import Authorities  from '@/pages/Authorities';
```

Add a child route after the `books/import` route (line 33):

```typescript
      { path: 'authorities', element: <Authorities /> },
```

- [ ] **Step 3: Add a nav link**

Open `apps/desktop/src/components/layout/AppShell.tsx`, find the list of nav items (it will reference `/books`, `/members`, etc.), and add an entry pointing to `/authorities` labeled "Authorities" using the same shape as the existing items (copy an adjacent item exactly and change `to`/label/icon — use the `Library` or `Tags` lucide icon).

- [ ] **Step 4: Typecheck + manual smoke**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: PASS.
Manual (optional but recommended): start the desktop server (`cd packages/server && npm run build:desktop` per existing workflow, or the app's dev command) and confirm `/authorities` renders, you can add a subject, edit it, and the usage column shows 0.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/pages/Authorities.tsx apps/desktop/src/App.tsx apps/desktop/src/components/layout/AppShell.tsx
git commit -m "feat(desktop): authorities management page (CRUD + merge) and route"
```

---

### Task 13: Wire authority pickers into the book form

**Files:**
- Modify: `apps/desktop/src/pages/Books.tsx`

The book form currently registers `author`, `publisher` as plain text. We add controlled authority state alongside the form: author + publisher single-pickers and a subjects multi-picker. On submit we pass `author_authority_id`, `publisher_authority_id`, and `subject_authority_ids` in the `data` payload (the tRPC `create`/`update` inputs accept `data: z.record(z.unknown())`, and the adapter now reads these keys).

- [ ] **Step 1: Extend the Book type and dialog props**

In `Books.tsx`, extend the `Book` type (line 35) to carry authority ids for edit prefill:

```typescript
type Book = { id: number; title: string; author: string | null; genre: string | null; year: number | null; material_type: string; available_copies: number; total_copies: number; author_authority_id?: number | null; publisher?: string | null; publisher_authority_id?: number | null; subject_headings?: string[] | null };
```

- [ ] **Step 2: Add authority state + pickers inside `BookDialog`**

Add the imports at the top of `Books.tsx`:

```typescript
import { AuthorityPicker, AuthorityMultiPicker } from '@/components/AuthorityCombobox';
```

Inside `BookDialog` (after the `useForm` line, line 116), add local authority state:

```typescript
  const [authorAuthority, setAuthorAuthority] = useState<{ id: number | null; name: string | null }>({ id: null, name: null });
  const [publisherAuthority, setPublisherAuthority] = useState<{ id: number | null; name: string | null }>({ id: null, name: null });
  const [subjects, setSubjects] = useState<{ id: number; name: string }[]>([]);
```

(Import `useState` is already imported at the top of the file.)

- [ ] **Step 3: Replace the plain author + publisher inputs with pickers and add subjects**

In the `BookDialog` form grid (lines 123-133), replace the Author field block:

```typescript
            <div className="space-y-1"><Label>Author</Label><Input {...register('author')} /></div>
```

with:

```typescript
            <div className="col-span-2 space-y-1"><Label>Author</Label>
              <AuthorityPicker type="personal" valueId={authorAuthority.id} valueName={authorAuthority.name ?? undefined}
                placeholder="Search or create an author authority…"
                onChange={(id, name) => setAuthorAuthority({ id, name })} />
            </div>
```

Replace the Publisher field block:

```typescript
            <div className="space-y-1"><Label>Publisher</Label><Input {...register('publisher')} /></div>
```

with:

```typescript
            <div className="col-span-2 space-y-1"><Label>Publisher</Label>
              <AuthorityPicker type="publisher" valueId={publisherAuthority.id} valueName={publisherAuthority.name ?? undefined}
                placeholder="Search or create a publisher…"
                onChange={(id, name) => setPublisherAuthority({ id, name })} />
            </div>
```

After the Call Number field block (line 131), add a subjects row:

```typescript
            <div className="col-span-2 space-y-1"><Label>Subjects</Label>
              <AuthorityMultiPicker type="subject" value={subjects} onChange={setSubjects}
                placeholder="Add controlled subjects…" />
            </div>
```

- [ ] **Step 4: Merge authority ids into the submit payload**

`BookDialog` currently calls `onSubmit(data)` directly via `handleSubmit(onSubmit)`. Change the form's submit handler (line 122) to enrich the payload:

```typescript
        <form onSubmit={handleSubmit((data) => onSubmit({
          ...data,
          author: authorAuthority.name ?? data.author,
          publisher: publisherAuthority.name ?? data.publisher,
          author_authority_id: authorAuthority.id,
          publisher_authority_id: publisherAuthority.id,
          subject_authority_ids: subjects.map(s => s.id),
        }))} className="space-y-3 py-2">
```

Update the `onSubmit` prop type on `BookDialog` (line 115) to accept the extra fields:

```typescript
function BookDialog({ open, onClose, defaultValues, onSubmit, isPending, error, title }: { open: boolean; onClose: () => void; defaultValues?: Partial<BookForm>; onSubmit: (d: Record<string, unknown>) => void; isPending: boolean; error: unknown; title: string }) {
```

And in the parent `Books` component, the two call sites that pass `onSubmit` (line 100) already forward `data` straight to the mutations as `data`; no change needed there since `create`/`update` accept `data: Record<string, unknown>`.

- [ ] **Step 5: Prefill pickers when editing**

Inside `BookDialog`, extend the existing `useEffect` that runs on `open` (line 117) to also seed authority state from `defaultValues` is insufficient (it lacks ids). Instead, accept the full `editBook` via a new optional prop. Add to `BookDialog` props: `editing?: Book | null`. In the parent (line 98-101) pass `editing={editBook}`. Then in `BookDialog`'s `open` effect add:

```typescript
  useEffect(() => {
    if (!open) return;
    setAuthorAuthority({ id: editing?.author_authority_id ?? null, name: editing?.author ?? null });
    setPublisherAuthority({ id: editing?.publisher_authority_id ?? null, name: editing?.publisher ?? null });
    setSubjects([]); // subject names are known but ids require a fetch; start empty on edit and let the librarian re-add. (See note.)
  }, [open]);
```

Note on edit prefill of subjects: the list endpoint returns `subject_headings` names but not their authority ids on the book row. Prefilling subject *ids* would require either (a) `admin.books.get` to also return linked subject ids, or (b) a lookup. To keep this task self-contained, subjects start empty on edit; re-saving with no subjects would clear them. **Guard against accidental clearing:** only send `subject_authority_ids` when the user actually touched the subjects field. Implement by tracking a `subjectsTouched` boolean (set true in `AuthorityMultiPicker.onChange`) and spreading `...(subjectsTouched ? { subject_authority_ids: subjects.map(s => s.id) } : {})` into the submit payload. The adapter's `syncResourceSubjects` already treats `undefined` as "don't touch."

- [ ] **Step 6: Typecheck**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/pages/Books.tsx
git commit -m "feat(desktop): wire author/publisher/subject authority pickers into the book form"
```

---

### Task 14: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Server tests**

Run: `cd packages/server && npm test`
Expected: PASS (import + authorities suites).

- [ ] **Step 2: Server typecheck**

Run: `cd packages/server && npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Desktop typecheck**

Run: `cd apps/desktop && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Types + db typecheck**

Run: `cd packages/types && npx tsc --noEmit && cd ../db && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Confirm no mobile app files changed**

Run: `git diff --name-only master...HEAD -- apps/server`
Expected: empty output (no mobile changes).

- [ ] **Step 6: Commit (if any lint/format fixups were needed)**

```bash
git add -A
git commit -m "chore(authorities): regression pass fixups" --allow-empty
```

---

## Self-Review

**Spec coverage:**
- Unified authority table (subjects + publishers) → Tasks 1, 2, 3 ✓
- Name normalization + dedupe-on-create → Tasks 4, 6 ✓
- Variants / cross-references → Tasks 6 (storage), 12 (UI) ✓
- Merge duplicate authorities (repoint + re-sync) → Task 8 ✓
- Delete guard for in-use authorities → Task 7 ✓
- Author + publisher pickers + `publisher_authority_id` → Tasks 1, 9, 11, 13 ✓
- Controlled subjects via `resource_subjects` + multi-picker → Tasks 1, 9, 11, 13 ✓
- Authority management page → Task 12 ✓
- Denormalized text kept in sync → Tasks 8, 9 ✓
- Desktop-only / no mobile changes → enforced; verified in Task 14 Step 5 ✓
- No backfill of catalog free-text → honored (only `normalized_name` of existing authority rows backfilled, Task 2) ✓
- No personal-name reordering → Task 4 ✓
- `admin.authorities` tRPC router (list/get/create/update/delete/merge) → Task 10 ✓

**Type consistency:** Adapter method names (`adminCreateAuthority`, `adminListAuthorities`, `adminGetAuthority`, `adminUpdateAuthority`, `adminDeleteAuthority`, `adminMergeAuthorities`) are identical across `adapter/types.ts`, `sqlite.ts`, and the router. Payload keys (`author_authority_id`, `publisher_authority_id`, `subject_authority_ids`) are identical across the form, the tRPC `data` record, and the adapter reads. `AuthorityType` is the shared union used by router enum + types.

**Placeholder scan:** The only deliberate cross-task dependency is the delete-guard / merge-subject-dedup tests that go green once Task 9 lands; this is explicitly flagged in those tasks. One known UX limitation (subject id prefill on edit) is documented with a concrete safe-guard (`subjectsTouched`) rather than left open.

**Scope:** Single slice; no decomposition needed.
