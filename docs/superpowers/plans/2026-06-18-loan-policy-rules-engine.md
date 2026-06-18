# Loan Policy & Rules Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single flat global loan policy with a per-`(patron category × material type)` rules matrix that drives loan periods, limits, renewals, and fines, enforced at the circulation desk with a logged librarian override.

**Architecture:** A pure resolver module (`loanPolicy.ts`) computes the effective policy and violations from already-fetched rows (no DB I/O, fully unit-tested). The SQLite adapter fetches rows + patron counters, calls the resolver, and enforces results in `adminCheckout` / `renewBorrow` / `adminReturn`. Three new tables (`loan_rules`, `category_limits`, `circ_overrides`) are added via migration `0005`. A default `(ANY,ANY)` rule + `(ANY)` category limit are ensured idempotently from the existing global `settings`, guaranteeing identical day-one behavior. A new desktop "Loan Policies" page edits the matrix; the Circulation page gains an override dialog.

**Tech Stack:** TypeScript, Drizzle ORM + better-sqlite3, tRPC, Vitest, React 19 + react-router + TanStack Query + react-hook-form + Zod + shadcn/ui (Tauri desktop).

## Global Constraints

- Desktop app only (`apps/desktop`). **Do not modify `apps/server`** (the mobile app).
- Shared packages (`packages/db`, `packages/server`, `packages/types`) may change.
- Migrations are numbered SQL files in `packages/db/drizzle/`; the runner splits statements on `--> statement-breakpoint` and tolerates `already exists` errors. Register new files in `packages/server/src/index.desktop.ts`; tests auto-discover them via `migrationSqls()`.
- The acting (override) user is taken from `ctx.principal`, **never** from the request body (LAN auth model).
- Patron category = `users.user_type` (`student|faculty|alumni|external`, nullable → treated as `ANY`). Item type = `resources.material_type` (9 values).
- Run server tests from `packages/server` with `pnpm test`; desktop typecheck from `apps/desktop` with `pnpm typecheck`.
- **Spec deviation (intentional):** the spec describes seeding the default rule in the migration; this plan instead ensures it idempotently from `settings` at point-of-use (`ensureDefaultRules`), because institutions are created after adapter construction. The guarantee (default behavior == old globals) is unchanged.

---

### Task 1: Shared types + pure policy resolver

**Files:**
- Modify: `packages/types/src/index.ts` (append near the existing `UserType` / `MaterialType` exports)
- Create: `packages/server/src/adapter/loanPolicy.ts`
- Test: `packages/server/src/adapter/loanPolicy.test.ts`

**Interfaces:**
- Consumes: `UserType`, `MaterialType` from `@bookleaf/types`.
- Produces:
  - Types in `@bookleaf/types`: `USER_TYPES`, `LOAN_RULE_ANY`, `RuleUserType`, `RuleMaterialType`, `LoanRule`, `CategoryLimit`, `ResolvedPolicy`, `PolicyReasonCode`, `PolicyViolation`, `CircOverride`.
  - From `loanPolicy.ts`: `resolvePolicy(rules, limits, patron, resource): ResolvedPolicy`, `evaluateCheckout(policy, counters): PolicyViolation[]`, `class PolicyError`, interfaces `PatronInput`, `ResourceInput`, `CheckoutCounters`.

- [ ] **Step 1: Add shared types**

Append to `packages/types/src/index.ts`:

```ts
// ── Loan policy / circulation rules ──────────────────────────────────────────
export const USER_TYPES = ['student', 'faculty', 'alumni', 'external'] as const;
export const LOAN_RULE_ANY = 'ANY' as const;
export type RuleUserType = UserType | typeof LOAN_RULE_ANY;
export type RuleMaterialType = MaterialType | typeof LOAN_RULE_ANY;

export interface LoanRule {
  id: number;
  institution_id: number;
  user_type: RuleUserType;
  material_type: RuleMaterialType;
  loan_period_days: number;
  type_limit: number | null;
  max_renewals: number;
  renewal_period_days: number | null;
  fine_per_day: number;
  grace_period_days: number;
  fine_max: number | null;
  is_loanable: boolean;
  is_holdable: boolean;
}

export interface CategoryLimit {
  id: number;
  institution_id: number;
  user_type: RuleUserType;
  overall_limit: number | null;
  fines_block_threshold: number;
}

export interface ResolvedPolicy {
  loan_period_days: number;      // effective (item override applied)
  type_limit: number | null;
  overall_limit: number | null;
  max_renewals: number;
  renewal_period_days: number;   // resolved (falls back to loan_period_days)
  fine_per_day: number;
  grace_period_days: number;
  fine_max: number | null;
  is_loanable: boolean;          // rule.is_loanable AND resource.is_loanable
  is_holdable: boolean;
  fines_block_threshold: number;
}

export type PolicyReasonCode =
  | 'not_loanable'
  | 'over_overall_limit'
  | 'over_type_limit'
  | 'fines_block'
  | 'renewals_exhausted';

export interface PolicyViolation {
  reason_code: PolicyReasonCode;
  message: string;
}

export interface CircOverride {
  id: number;
  institution_id: number;
  acted_by_user_id: number;
  patron_user_id: number;
  copy_id: number | null;
  reason_code: PolicyReasonCode;
  note: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Write the failing resolver test**

Create `packages/server/src/adapter/loanPolicy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolvePolicy, evaluateCheckout } from './loanPolicy';
import type { LoanRule, CategoryLimit } from '@bookleaf/types';

function rule(p: Partial<LoanRule>): LoanRule {
  return {
    id: 0, institution_id: 1, user_type: 'ANY', material_type: 'ANY',
    loan_period_days: 7, type_limit: null, max_renewals: 2, renewal_period_days: null,
    fine_per_day: 5, grace_period_days: 0, fine_max: null, is_loanable: true, is_holdable: true,
    ...p,
  };
}
function limit(p: Partial<CategoryLimit>): CategoryLimit {
  return { id: 0, institution_id: 1, user_type: 'ANY', overall_limit: null, fines_block_threshold: 0, ...p };
}

describe('resolvePolicy', () => {
  it('picks the most specific (user_type, material_type) rule', () => {
    const rules = [
      rule({ id: 1, user_type: 'ANY', material_type: 'ANY', loan_period_days: 7 }),
      rule({ id: 2, user_type: 'faculty', material_type: 'ANY', loan_period_days: 30 }),
      rule({ id: 3, user_type: 'faculty', material_type: 'AUDIOVISUAL', loan_period_days: 3 }),
    ];
    const p = resolvePolicy(rules, [limit({})], { user_type: 'faculty' }, { material_type: 'AUDIOVISUAL', loan_period_days: null, is_loanable: true });
    expect(p.loan_period_days).toBe(3);
  });

  it('falls back through (ut,ANY) then (ANY,mt) then (ANY,ANY)', () => {
    const rules = [
      rule({ id: 1, user_type: 'ANY', material_type: 'ANY', loan_period_days: 7 }),
      rule({ id: 2, user_type: 'ANY', material_type: 'BOOK', loan_period_days: 14 }),
    ];
    const p = resolvePolicy(rules, [limit({})], { user_type: 'student' }, { material_type: 'BOOK', loan_period_days: null, is_loanable: true });
    expect(p.loan_period_days).toBe(14);
  });

  it('coalesces null user_type to ANY', () => {
    const rules = [rule({ id: 1, loan_period_days: 9 })];
    const p = resolvePolicy(rules, [limit({})], { user_type: null }, { material_type: 'BOOK', loan_period_days: null, is_loanable: true });
    expect(p.loan_period_days).toBe(9);
  });

  it('lets a per-item loan_period_days override the rule period only', () => {
    const rules = [rule({ id: 1, loan_period_days: 7, fine_per_day: 5 })];
    const p = resolvePolicy(rules, [limit({})], { user_type: 'student' }, { material_type: 'BOOK', loan_period_days: 21, is_loanable: true });
    expect(p.loan_period_days).toBe(21);
    expect(p.fine_per_day).toBe(5);
  });

  it('resolves renewal_period_days to the effective loan period when null', () => {
    const rules = [rule({ id: 1, loan_period_days: 7, renewal_period_days: null })];
    const p = resolvePolicy(rules, [limit({})], { user_type: 'student' }, { material_type: 'BOOK', loan_period_days: 21, is_loanable: true });
    expect(p.renewal_period_days).toBe(21);
  });

  it('ANDs rule.is_loanable with resource.is_loanable', () => {
    const rules = [rule({ id: 1, is_loanable: true })];
    const p = resolvePolicy(rules, [limit({})], { user_type: 'student' }, { material_type: 'BOOK', loan_period_days: null, is_loanable: false });
    expect(p.is_loanable).toBe(false);
  });

  it('reads overall_limit + threshold from the category-specific limit, else ANY', () => {
    const limits = [limit({ user_type: 'ANY', overall_limit: 3 }), limit({ user_type: 'student', overall_limit: 10, fines_block_threshold: 50 })];
    const p = resolvePolicy([rule({ id: 1 })], limits, { user_type: 'student' }, { material_type: 'BOOK', loan_period_days: null, is_loanable: true });
    expect(p.overall_limit).toBe(10);
    expect(p.fines_block_threshold).toBe(50);
  });
});

describe('evaluateCheckout', () => {
  const base = resolvePolicy([rule({ id: 1, type_limit: 2 })], [limit({ overall_limit: 5, fines_block_threshold: 100 })],
    { user_type: 'student' }, { material_type: 'BOOK', loan_period_days: null, is_loanable: true });

  it('flags not_loanable', () => {
    const p = { ...base, is_loanable: false };
    expect(evaluateCheckout(p, { activeTotal: 0, activeOfType: 0, unpaidFines: 0 }).map(v => v.reason_code)).toContain('not_loanable');
  });
  it('flags over_overall_limit at the cap', () => {
    expect(evaluateCheckout(base, { activeTotal: 5, activeOfType: 0, unpaidFines: 0 }).map(v => v.reason_code)).toContain('over_overall_limit');
  });
  it('flags over_type_limit at the type cap', () => {
    expect(evaluateCheckout(base, { activeTotal: 0, activeOfType: 2, unpaidFines: 0 }).map(v => v.reason_code)).toContain('over_type_limit');
  });
  it('flags fines_block only when threshold > 0 and exceeded', () => {
    expect(evaluateCheckout(base, { activeTotal: 0, activeOfType: 0, unpaidFines: 150 }).map(v => v.reason_code)).toContain('fines_block');
    const disabled = { ...base, fines_block_threshold: 0 };
    expect(evaluateCheckout(disabled, { activeTotal: 0, activeOfType: 0, unpaidFines: 999 })).toHaveLength(0);
  });
  it('passes cleanly under all limits', () => {
    expect(evaluateCheckout(base, { activeTotal: 1, activeOfType: 1, unpaidFines: 10 })).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/server && pnpm test loanPolicy`
Expected: FAIL — `Cannot find module './loanPolicy'`.

- [ ] **Step 4: Implement the resolver**

Create `packages/server/src/adapter/loanPolicy.ts`:

```ts
import type {
  LoanRule, CategoryLimit, ResolvedPolicy, PolicyViolation,
  RuleUserType, RuleMaterialType,
} from '@bookleaf/types';

export interface PatronInput { user_type: string | null }
export interface ResourceInput { material_type: string; loan_period_days: number | null; is_loanable: boolean }
export interface CheckoutCounters { activeTotal: number; activeOfType: number; unpaidFines: number }

export class PolicyError extends Error {
  readonly violations: PolicyViolation[];
  constructor(violations: PolicyViolation[]) {
    super('Checkout blocked by loan policy');
    this.name = 'PolicyError';
    this.violations = violations;
  }
}

const ANY = 'ANY';

export function resolvePolicy(
  rules: LoanRule[],
  limits: CategoryLimit[],
  patron: PatronInput,
  resource: ResourceInput,
): ResolvedPolicy {
  const ut: RuleUserType = (patron.user_type ?? ANY) as RuleUserType;
  const mt = resource.material_type as RuleMaterialType;

  const find = (u: RuleUserType, m: RuleMaterialType) =>
    rules.find(r => r.user_type === u && r.material_type === m);
  const rule =
    find(ut, mt) ?? find(ut, ANY) ?? find(ANY, mt) ?? find(ANY, ANY);
  if (!rule) throw new Error('No loan rule resolved (missing ANY/ANY default)');

  const limitRow =
    limits.find(l => l.user_type === ut) ?? limits.find(l => l.user_type === ANY);

  const period = resource.loan_period_days ?? rule.loan_period_days;
  return {
    loan_period_days: period,
    type_limit: rule.type_limit,
    overall_limit: limitRow?.overall_limit ?? null,
    max_renewals: rule.max_renewals,
    renewal_period_days: rule.renewal_period_days ?? period,
    fine_per_day: rule.fine_per_day,
    grace_period_days: rule.grace_period_days,
    fine_max: rule.fine_max,
    is_loanable: rule.is_loanable && resource.is_loanable,
    is_holdable: rule.is_holdable,
    fines_block_threshold: limitRow?.fines_block_threshold ?? 0,
  };
}

export function evaluateCheckout(
  policy: ResolvedPolicy,
  counters: CheckoutCounters,
): PolicyViolation[] {
  const v: PolicyViolation[] = [];
  if (!policy.is_loanable) {
    v.push({ reason_code: 'not_loanable', message: 'This item is not loanable.' });
  }
  if (policy.overall_limit != null && counters.activeTotal >= policy.overall_limit) {
    v.push({ reason_code: 'over_overall_limit', message: `Borrowing limit reached (${policy.overall_limit} items).` });
  }
  if (policy.type_limit != null && counters.activeOfType >= policy.type_limit) {
    v.push({ reason_code: 'over_type_limit', message: `Limit for this material type reached (${policy.type_limit}).` });
  }
  if (policy.fines_block_threshold > 0 && counters.unpaidFines > policy.fines_block_threshold) {
    v.push({ reason_code: 'fines_block', message: `Unpaid fines (₱${counters.unpaidFines}) exceed the limit of ₱${policy.fines_block_threshold}.` });
  }
  return v;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/server && pnpm test loanPolicy`
Expected: PASS (all `resolvePolicy` + `evaluateCheckout` tests green).

- [ ] **Step 6: Commit**

```bash
git add packages/types/src/index.ts packages/server/src/adapter/loanPolicy.ts packages/server/src/adapter/loanPolicy.test.ts
git commit -m "feat(circulation): pure loan-policy resolver + shared types"
```

---

### Task 2: Migration `0005` + Drizzle tables + wiring

**Files:**
- Create: `packages/db/drizzle/0005_loan_rules.sql`
- Modify: `packages/db/src/schema.ts` (append new tables)
- Modify: `packages/server/src/index.desktop.ts` (import + pass `sql_0005`)
- Test: `packages/server/src/adapter/sqlite.loanRules.test.ts` (new file; migration-applies smoke test)

**Interfaces:**
- Consumes: existing `institutions`, `users`, `resourceCopies` tables.
- Produces: Drizzle tables `loanRules`, `categoryLimits`, `circOverrides` exported from `@bookleaf/db`; migration registered so `createSqliteAdapter` creates the tables.

- [ ] **Step 1: Write the migration SQL**

Create `packages/db/drizzle/0005_loan_rules.sql`:

```sql
CREATE TABLE `loan_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` integer NOT NULL,
	`user_type` text NOT NULL,
	`material_type` text NOT NULL,
	`loan_period_days` integer NOT NULL,
	`type_limit` integer,
	`max_renewals` integer NOT NULL,
	`renewal_period_days` integer,
	`fine_per_day` real NOT NULL,
	`grace_period_days` integer DEFAULT 0 NOT NULL,
	`fine_max` real,
	`is_loanable` integer DEFAULT 1 NOT NULL,
	`is_holdable` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `loan_rules_scope_unique` ON `loan_rules` (`institution_id`,`user_type`,`material_type`);
--> statement-breakpoint
CREATE TABLE `category_limits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` integer NOT NULL,
	`user_type` text NOT NULL,
	`overall_limit` integer,
	`fines_block_threshold` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_limits_scope_unique` ON `category_limits` (`institution_id`,`user_type`);
--> statement-breakpoint
CREATE TABLE `circ_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`institution_id` integer NOT NULL,
	`acted_by_user_id` integer NOT NULL,
	`patron_user_id` integer NOT NULL,
	`copy_id` integer,
	`reason_code` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`institution_id`) REFERENCES `institutions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`acted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patron_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`copy_id`) REFERENCES `resource_copies`(`id`) ON UPDATE no action ON DELETE no action
);
```

- [ ] **Step 2: Add Drizzle table definitions**

Append to `packages/db/src/schema.ts` (after the `settings` table):

```ts
export const loanRules = sqliteTable('loan_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  institution_id: integer('institution_id').notNull().references(() => institutions.id),
  user_type: text('user_type').notNull(),
  material_type: text('material_type').notNull(),
  loan_period_days: integer('loan_period_days').notNull(),
  type_limit: integer('type_limit'),
  max_renewals: integer('max_renewals').notNull(),
  renewal_period_days: integer('renewal_period_days'),
  fine_per_day: real('fine_per_day').notNull(),
  grace_period_days: integer('grace_period_days').notNull().default(0),
  fine_max: real('fine_max'),
  is_loanable: integer('is_loanable', { mode: 'boolean' }).notNull().default(true),
  is_holdable: integer('is_holdable', { mode: 'boolean' }).notNull().default(true),
});

export const categoryLimits = sqliteTable('category_limits', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  institution_id: integer('institution_id').notNull().references(() => institutions.id),
  user_type: text('user_type').notNull(),
  overall_limit: integer('overall_limit'),
  fines_block_threshold: real('fines_block_threshold').notNull().default(0),
});

export const circOverrides = sqliteTable('circ_overrides', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  institution_id: integer('institution_id').notNull().references(() => institutions.id),
  acted_by_user_id: integer('acted_by_user_id').notNull().references(() => users.id),
  patron_user_id: integer('patron_user_id').notNull().references(() => users.id),
  copy_id: integer('copy_id').references(() => resourceCopies.id),
  reason_code: text('reason_code').notNull(),
  note: text('note'),
  created_at: text('created_at').notNull().default(sql`(datetime('now'))`),
});
```

- [ ] **Step 3: Register the migration in the desktop entrypoint**

In `packages/server/src/index.desktop.ts`, after the `sql_0004` import add:

```ts
// @ts-expect-error — imported as plain text by esbuild
import sql_0005 from '../../../packages/db/drizzle/0005_loan_rules.sql';
```

And extend the `createSqliteAdapter` call:

```ts
const db = createSqliteAdapter(dbPath, sql_0000 as string, sql_0001 as string, sql_0002 as string, sql_0003 as string, sql_0004 as string, sql_0005 as string);
```

- [ ] **Step 4: Write the failing migration smoke test**

Create `packages/server/src/adapter/sqlite.loanRules.test.ts`:

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
let raw: { prepare(sql: string): { get(...a: unknown[]): unknown; all(...a: unknown[]): unknown[] } };

beforeEach(() => {
  db = createSqliteAdapter(':memory:', ...migrationSqls());
  iid = (db as unknown as { __seedTestInstitution(): number }).__seedTestInstitution();
  raw = (db as unknown as { __raw(): typeof raw }).__raw();
});

describe('0005 migration', () => {
  it('creates the loan_rules, category_limits, and circ_overrides tables', () => {
    const names = (raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(r => r.name);
    expect(names).toEqual(expect.arrayContaining(['loan_rules', 'category_limits', 'circ_overrides']));
  });
});
```

This test needs a `__raw()` test helper. Add it alongside `__seedTestInstitution` in `packages/server/src/adapter/sqlite.ts`:

```ts
    __raw(): Database.Database {
      return rawDb;
    },
```

(Place it inside the same `Object.assign(adapterImpl, { ... })` block as `__seedTestInstitution`.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/server && pnpm test loanRules`
Expected: PASS (tables exist). If it fails with `no such table`, confirm the SQL file name matches the glob `^\d+_.*\.sql$`.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `cd packages/server && pnpm test`
Expected: all prior tests still PASS (the new migration is additive).

- [ ] **Step 7: Commit**

```bash
git add packages/db/drizzle/0005_loan_rules.sql packages/db/src/schema.ts packages/server/src/index.desktop.ts packages/server/src/adapter/sqlite.ts packages/server/src/adapter/sqlite.loanRules.test.ts
git commit -m "feat(db): 0005 loan-rules/category-limits/circ-overrides migration + tables"
```

---

### Task 3: Adapter resolution + `ensureDefaultRules` + `resolvePreview`

**Files:**
- Modify: `packages/server/src/adapter/sqlite.ts`
- Modify: `packages/server/src/adapter/types.ts` (add `adminResolvePolicy` to `DbAdapter`)
- Test: `packages/server/src/adapter/sqlite.loanRules.test.ts` (extend)

**Interfaces:**
- Consumes: `resolvePolicy`, types from Task 1; tables from Task 2.
- Produces:
  - Private helpers in `sqlite.ts`: `ensureDefaultRules(institutionId: number): Promise<void>`, `loadRulesAndLimits(institutionId): Promise<{ rules: LoanRule[]; limits: CategoryLimit[] }>`, `fetchCheckoutCounters(userId, materialType): Promise<CheckoutCounters>`, `resolveForCopy(institutionId, userId, copyId)` and `resolveForResource(institutionId, userId, resourceId)`.
  - `DbAdapter.adminResolvePolicy(institutionId, userId, resourceId): Promise<ResolvedPolicy>`.

- [ ] **Step 1: Add the adapter interface method**

In `packages/server/src/adapter/types.ts`, under the `// ── Admin: Circulation ──` group, add:

```ts
  adminResolvePolicy(
    institutionId: number,
    userId: number,
    resourceId: number,
  ): Promise<import('@bookleaf/types').ResolvedPolicy>;
```

- [ ] **Step 2: Write the failing resolution tests**

Append to `packages/server/src/adapter/sqlite.loanRules.test.ts`:

```ts
describe('policy resolution', () => {
  async function makeMember(user_type: string | null) {
    const r = raw.prepare(
      "INSERT INTO users (institution_id, name, role, id_number, pin_hash, user_type) VALUES (?, 'M', 'member', ?, 'x', ?)",
    ).run(iid, 'ID' + Math.floor(performance.now() * 1000), user_type) as { lastInsertRowid: number };
    return Number(r.lastInsertRowid);
  }

  it('returns the seeded default (== old global settings) when no rules were added', async () => {
    const uid = await makeMember('student');
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', material_type: 'BOOK' }, []);
    const p = await db.adminResolvePolicy(iid, uid, id);
    expect(p.loan_period_days).toBe(7);       // DEFAULT_SETTINGS.max_borrow_days
    expect(p.fine_per_day).toBe(5);           // DEFAULT_SETTINGS.fine_per_day
    expect(p.max_renewals).toBe(2);           // DEFAULT_SETTINGS.max_renewals
    expect(p.overall_limit).toBe(3);          // DEFAULT_SETTINGS.max_books_per_member
    expect(p.fines_block_threshold).toBe(0);  // disabled by default
  });

  it('applies a per-item loan_period_days override for the period only', async () => {
    const uid = await makeMember('student');
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', material_type: 'BOOK', loan_period_days: 21 }, []);
    const p = await db.adminResolvePolicy(iid, uid, id);
    expect(p.loan_period_days).toBe(21);
    expect(p.fine_per_day).toBe(5);
  });

  it('prefers a specific (faculty, AUDIOVISUAL) rule over the default', async () => {
    raw.prepare(
      "INSERT INTO loan_rules (institution_id, user_type, material_type, loan_period_days, max_renewals, fine_per_day) VALUES (?, 'faculty', 'AUDIOVISUAL', 3, 0, 10)",
    ).run(iid);
    const uid = await makeMember('faculty');
    const { id } = await db.adminCreateBook(iid, { title: 'DVD', author: 'A', material_type: 'AUDIOVISUAL' }, []);
    const p = await db.adminResolvePolicy(iid, uid, id);
    expect(p.loan_period_days).toBe(3);
    expect(p.fine_per_day).toBe(10);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd packages/server && pnpm test loanRules`
Expected: FAIL — `db.adminResolvePolicy is not a function`.

- [ ] **Step 4: Implement the helpers + method**

In `packages/server/src/adapter/sqlite.ts`, the schema tables are pulled in via `import * as schema from '@bookleaf/db/schema'` and then destructured. Add the three new tables to that existing destructure block (around `sqlite.ts:12`):

```ts
const {
  institutions, users, resources, resourceCopies, borrowingRecords,
  reservations, fines, favorites, reviews, gateLogs, settings,
  authorityNames, resourceSubjects, scanSessions, scanEntries, sessions,
  DEFAULT_SETTINGS,
  loanRules, categoryLimits, circOverrides,
} = schema;
```

Then add these new type/function imports near the top (after the existing `import type { DbAdapter, SessionPrincipal } from './types';` line). Import only what **this** task uses — Task 4 will extend them:

```ts
import type { LoanRule, CategoryLimit, ResolvedPolicy } from '@bookleaf/types';
import { resolvePolicy, type CheckoutCounters } from './loanPolicy';
```

(Do **not** import from the `@bookleaf/db` package index — its index pulls in `expo-sqlite`, which the Node desktop server cannot load. Always use the `@bookleaf/db/schema` subpath, as the file already does. `count`, `sum`, `sql`, `isNull`, `and`, `eq`, `ne` are already imported from `drizzle-orm` at the top of the file.)

Inside `createSqliteAdapter`, before the `adapterImpl` object literal, add these closures (they capture `db` and `rawDb`):

```ts
  async function ensureDefaultRules(institutionId: number): Promise<void> {
    const existing = await db.select({ id: loanRules.id }).from(loanRules)
      .where(and(eq(loanRules.institution_id, institutionId),
        eq(loanRules.user_type, 'ANY'), eq(loanRules.material_type, 'ANY'))).limit(1);
    const cfg = await getSettings(db);
    if (existing.length === 0) {
      await db.insert(loanRules).values({
        institution_id: institutionId, user_type: 'ANY', material_type: 'ANY',
        loan_period_days: cfg.max_borrow_days, type_limit: null,
        max_renewals: cfg.max_renewals, renewal_period_days: null,
        fine_per_day: cfg.fine_per_day, grace_period_days: cfg.grace_period_days,
        fine_max: null, is_loanable: true, is_holdable: true,
      }).onConflictDoNothing();
    }
    const limitExists = await db.select({ id: categoryLimits.id }).from(categoryLimits)
      .where(and(eq(categoryLimits.institution_id, institutionId), eq(categoryLimits.user_type, 'ANY'))).limit(1);
    if (limitExists.length === 0) {
      await db.insert(categoryLimits).values({
        institution_id: institutionId, user_type: 'ANY',
        overall_limit: cfg.max_books_per_member, fines_block_threshold: 0,
      }).onConflictDoNothing();
    }
  }

  async function loadRulesAndLimits(institutionId: number): Promise<{ rules: LoanRule[]; limits: CategoryLimit[] }> {
    await ensureDefaultRules(institutionId);
    const rules = await db.select().from(loanRules).where(eq(loanRules.institution_id, institutionId)) as unknown as LoanRule[];
    const limits = await db.select().from(categoryLimits).where(eq(categoryLimits.institution_id, institutionId)) as unknown as CategoryLimit[];
    return { rules, limits };
  }

  async function fetchCheckoutCounters(userId: number, materialType: string): Promise<CheckoutCounters> {
    const totalRow = await db.select({ c: sql<number>`count(*)` }).from(borrowingRecords)
      .where(and(eq(borrowingRecords.user_id, userId), isNull(borrowingRecords.returned_at)));
    const typeRow = await db.select({ c: sql<number>`count(*)` }).from(borrowingRecords)
      .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(and(eq(borrowingRecords.user_id, userId), isNull(borrowingRecords.returned_at), eq(resources.material_type, materialType)));
    const fineRow = await db.select({ s: sum(fines.amount) }).from(fines)
      .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
      .where(and(eq(borrowingRecords.user_id, userId), eq(fines.paid, false)));
    return {
      activeTotal: Number(totalRow[0]?.c ?? 0),
      activeOfType: Number(typeRow[0]?.c ?? 0),
      unpaidFines: Number(fineRow[0]?.s ?? 0),
    };
  }

  async function resolveForResource(institutionId: number, userId: number, resourceId: number): Promise<ResolvedPolicy> {
    const { rules, limits } = await loadRulesAndLimits(institutionId);
    const patron = await db.select({ user_type: users.user_type }).from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);
    const resource = await db.select({
      material_type: resources.material_type, loan_period_days: resources.loan_period_days, is_loanable: resources.is_loanable,
    }).from(resources).where(eq(resources.id, resourceId)).limit(1).then(r => r[0] ?? null);
    if (!patron || !resource) throw new Error('Patron or resource not found');
    return resolvePolicy(rules, limits, { user_type: patron.user_type }, {
      material_type: resource.material_type, loan_period_days: resource.loan_period_days, is_loanable: resource.is_loanable,
    });
  }
```

Then add the method to the `adapterImpl` object literal, near `adminCheckout`:

```ts
    async adminResolvePolicy(institutionId, userId, resourceId) {
      return resolveForResource(institutionId, userId, resourceId);
    },
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd packages/server && pnpm test loanRules`
Expected: PASS (all resolution tests green).

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/adapter/sqlite.ts packages/server/src/adapter/types.ts packages/server/src/adapter/sqlite.loanRules.test.ts
git commit -m "feat(circulation): adapter policy resolution + idempotent default rules"
```

---

### Task 4: Enforce policy at checkout (with override + logging)

**Files:**
- Modify: `packages/server/src/adapter/sqlite.ts` (`adminCheckout`)
- Modify: `packages/server/src/adapter/types.ts` (`adminCheckout` signature)
- Test: `packages/server/src/adapter/sqlite.loanRules.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveForResource`, `fetchCheckoutCounters`, `evaluateCheckout`, `PolicyError`, `circOverrides`.
- Produces: new `adminCheckout` signature
  `adminCheckout(copyId, userId, opts?: { override?: boolean; actedByUserId?: number; institutionId?: number; note?: string }): Promise<{ borrowingId: number }>` — throws `PolicyError` (with `violations`) when blocked and not overridden.

- [ ] **Step 1: Update the adapter interface**

In `packages/server/src/adapter/types.ts`, replace the `adminCheckout` line with:

```ts
  adminCheckout(
    copyId: number,
    userId: number,
    opts?: { override?: boolean; actedByUserId?: number; institutionId?: number; note?: string },
  ): Promise<{ borrowingId: number }>;
```

- [ ] **Step 2: Write the failing enforcement tests**

Append to `packages/server/src/adapter/sqlite.loanRules.test.ts`:

```ts
import { PolicyError } from './loanPolicy';

describe('checkout enforcement', () => {
  async function member(user_type: string) {
    const r = raw.prepare("INSERT INTO users (institution_id, name, role, id_number, pin_hash, user_type) VALUES (?, 'M', 'member', ?, 'x', ?)")
      .run(iid, 'EID' + Math.floor(performance.now() * 1000), user_type) as { lastInsertRowid: number };
    return Number(r.lastInsertRowid);
  }
  async function bookWithCopy() {
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', material_type: 'BOOK' }, [{ barcode: 'BC' + Math.floor(performance.now() * 1000) }]);
    const copy = raw.prepare('SELECT id FROM resource_copies WHERE resource_id = ? LIMIT 1').get(id) as { id: number };
    return { resourceId: id, copyId: copy.id };
  }

  it('allows a normal checkout under the default policy', async () => {
    const uid = await member('student');
    const { copyId } = await bookWithCopy();
    const res = await db.adminCheckout(copyId, uid);
    expect(res.borrowingId).toBeGreaterThan(0);
  });

  it('blocks checkout over the overall limit and does NOT claim the copy', async () => {
    // overall_limit defaults to 3; give this category a limit of 1 for a sharp test
    raw.prepare("INSERT INTO category_limits (institution_id, user_type, overall_limit, fines_block_threshold) VALUES (?, 'student', 1, 0)").run(iid);
    const uid = await member('student');
    const a = await bookWithCopy();
    const b = await bookWithCopy();
    await db.adminCheckout(a.copyId, uid);
    await expect(db.adminCheckout(b.copyId, uid)).rejects.toBeInstanceOf(PolicyError);
    const status = raw.prepare('SELECT status FROM resource_copies WHERE id = ?').get(b.copyId) as { status: string };
    expect(status.status).toBe('available');
  });

  it('proceeds when overridden and writes a circ_overrides row', async () => {
    raw.prepare("INSERT INTO category_limits (institution_id, user_type, overall_limit, fines_block_threshold) VALUES (?, 'student', 1, 0)").run(iid);
    const uid = await member('student');
    const a = await bookWithCopy();
    const b = await bookWithCopy();
    await db.adminCheckout(a.copyId, uid);
    const res = await db.adminCheckout(b.copyId, uid, { override: true, actedByUserId: uid, institutionId: iid, note: 'dean approved' });
    expect(res.borrowingId).toBeGreaterThan(0);
    const row = raw.prepare('SELECT reason_code, note FROM circ_overrides WHERE patron_user_id = ?').get(uid) as { reason_code: string; note: string };
    expect(row.reason_code).toBe('over_overall_limit');
    expect(row.note).toBe('dean approved');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd packages/server && pnpm test loanRules`
Expected: FAIL — the block test resolves instead of rejecting (limits not yet enforced).

- [ ] **Step 4: Extend the imports for enforcement**

This task newly uses `circOverrides` (already added to the `schema` destructure in Task 3), plus `evaluateCheckout`, `PolicyError`, and the `PolicyReasonCode` type. Update the two import lines added in Task 3 so they read:

```ts
import type { LoanRule, CategoryLimit, ResolvedPolicy, PolicyReasonCode } from '@bookleaf/types';
import { resolvePolicy, evaluateCheckout, PolicyError, type CheckoutCounters } from './loanPolicy';
```

- [ ] **Step 5: Rewrite `adminCheckout`**

Replace the existing `adminCheckout` implementation (`sqlite.ts:1171`) with:

```ts
    async adminCheckout(copyId, userId, opts) {
      // Resolve the copy's resource + institution first (needed for policy).
      const copyInfo = await db.select({ resource_id: resourceCopies.resource_id, institution_id: resources.institution_id, material_type: resources.material_type })
        .from(resourceCopies)
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(eq(resourceCopies.id, copyId)).limit(1).then(r => r[0] ?? null);
      if (!copyInfo) throw new Error('This copy is no longer available. Please pick another.');

      const policy = await resolveForResource(copyInfo.institution_id, userId, copyInfo.resource_id);
      const counters = await fetchCheckoutCounters(userId, copyInfo.material_type);
      const violations = evaluateCheckout(policy, counters);

      if (violations.length > 0 && !opts?.override) {
        throw new PolicyError(violations);
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + policy.loan_period_days);

      return db.transaction(async (tx) => {
        const claimed = await tx.update(resourceCopies)
          .set({ status: 'borrowed' })
          .where(and(eq(resourceCopies.id, copyId), eq(resourceCopies.status, 'available'), ne(resourceCopies.condition, 'lost')))
          .returning({ id: resourceCopies.id, resource_id: resourceCopies.resource_id });
        if (claimed.length === 0) throw new Error('This copy is no longer available. Please pick another.');

        if (violations.length > 0 && opts?.override) {
          for (const v of violations) {
            await tx.insert(circOverrides).values({
              institution_id: opts.institutionId ?? copyInfo.institution_id,
              acted_by_user_id: opts.actedByUserId ?? userId,
              patron_user_id: userId,
              copy_id: copyId,
              reason_code: v.reason_code as PolicyReasonCode,
              note: opts.note ?? null,
            });
          }
        }

        const result = await tx.insert(borrowingRecords)
          .values({ copy_id: copyId, user_id: userId, due_date: dueDate.toISOString() })
          .returning({ id: borrowingRecords.id });

        await tx.update(resources)
          .set({ available_copies: sql`${resources.available_copies} - 1` })
          .where(eq(resources.id, claimed[0].resource_id));

        await tx.update(reservations)
          .set({ status: 'fulfilled' })
          .where(and(eq(reservations.resource_id, claimed[0].resource_id), eq(reservations.user_id, userId), eq(reservations.status, 'active')));

        return { borrowingId: result[0].id };
      });
    },
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd packages/server && pnpm test loanRules`
Expected: PASS (normal checkout, block-and-not-claimed, override-and-logged all green).

- [ ] **Step 7: Run the full suite (catch checkout callers/regressions)**

Run: `cd packages/server && pnpm test`
Expected: all PASS. The old `adminCheckout` callers pass only `(copyId, userId)`; the new third arg is optional, so they still compile and behave identically under the default policy.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/adapter/sqlite.ts packages/server/src/adapter/types.ts packages/server/src/adapter/sqlite.loanRules.test.ts
git commit -m "feat(circulation): enforce loan limits at checkout with logged override"
```

---

### Task 5: Policy-driven renewals + returns

**Files:**
- Modify: `packages/server/src/adapter/sqlite.ts` (`renewBorrow`, `adminReturn`)
- Test: `packages/server/src/adapter/sqlite.loanRules.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveForResource`.
- Produces: `renewBorrow` and `adminReturn` now read period/renewals/fines from the resolved policy (behavior identical under the default rule; differs only when specific rules exist).

- [ ] **Step 1: Write the failing tests**

Append to `packages/server/src/adapter/sqlite.loanRules.test.ts`:

```ts
describe('renewal + return use resolved policy', () => {
  async function member(user_type: string) {
    const r = raw.prepare("INSERT INTO users (institution_id, name, role, id_number, pin_hash, user_type) VALUES (?, 'M', 'member', ?, 'x', ?)")
      .run(iid, 'RID' + Math.floor(performance.now() * 1000), user_type) as { lastInsertRowid: number };
    return Number(r.lastInsertRowid);
  }
  async function bookCopy(material_type = 'BOOK') {
    const { id } = await db.adminCreateBook(iid, { title: 'T', author: 'A', material_type }, [{ barcode: 'RB' + Math.floor(performance.now() * 1000) }]);
    const copy = raw.prepare('SELECT id FROM resource_copies WHERE resource_id = ? LIMIT 1').get(id) as { id: number };
    return copy.id;
  }

  it('blocks renewal past the rule max_renewals', async () => {
    raw.prepare("INSERT INTO loan_rules (institution_id, user_type, material_type, loan_period_days, max_renewals, fine_per_day) VALUES (?, 'student', 'BOOK', 7, 0, 5)").run(iid);
    const uid = await member('student');
    const copyId = await bookCopy('BOOK');
    const { borrowingId } = await db.adminCheckout(copyId, uid);
    await expect(db.renewBorrow(borrowingId, uid)).rejects.toThrow(/renewal/i);
  });

  it('computes the return fine from the rule fine_per_day and caps at fine_max', async () => {
    // student/BOOK: ₱10/day, capped at ₱15
    raw.prepare("INSERT INTO loan_rules (institution_id, user_type, material_type, loan_period_days, max_renewals, fine_per_day, grace_period_days, fine_max) VALUES (?, 'student', 'BOOK', 7, 2, 10, 0, 15)").run(iid);
    const uid = await member('student');
    const copyId = await bookCopy('BOOK');
    const { borrowingId } = await db.adminCheckout(copyId, uid);
    // Force the loan 5 days overdue.
    raw.prepare("UPDATE borrowing_records SET due_date = datetime('now', '-5 days') WHERE id = ?").run(borrowingId);
    const fine = await db.adminReturn(borrowingId, 'good') as { amount: number } | null;
    expect(fine?.amount).toBe(15); // 5×10=50 capped to 15
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/server && pnpm test loanRules`
Expected: FAIL — renewal still uses global `max_renewals` (2), and the fine is uncapped (50).

- [ ] **Step 3: Rewrite `renewBorrow`**

Replace the body of `renewBorrow` (`sqlite.ts:605`) with:

```ts
    async renewBorrow(borrowingId, userId) {
      const record = await db.select({ user_id: borrowingRecords.user_id })
        .from(borrowingRecords).where(eq(borrowingRecords.id, borrowingId)).limit(1).then(r => r[0] ?? null);
      if (!record) throw new Error('Borrowing record not found');
      if (record.user_id !== userId) throw new Error('Not allowed');

      const full = await db.select().from(borrowingRecords)
        .where(eq(borrowingRecords.id, borrowingId)).limit(1).then(r => r[0] ?? null);
      if (!full) throw new Error('Borrowing record not found');
      if (full.returned_at) throw new Error('This item has already been returned');

      const copy = await db.select({ resource_id: resourceCopies.resource_id, institution_id: resources.institution_id })
        .from(resourceCopies)
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(eq(resourceCopies.id, full.copy_id)).limit(1).then(r => r[0] ?? null);
      if (!copy) throw new Error('Copy not found');

      const policy = await resolveForResource(copy.institution_id, userId, copy.resource_id);
      if (full.renewal_count >= policy.max_renewals) {
        throw new Error(`Maximum renewals (${policy.max_renewals}) reached`);
      }
      const newDue = new Date(full.due_date);
      newDue.setDate(newDue.getDate() + policy.renewal_period_days);
      await db.update(borrowingRecords).set({
        due_date: newDue.toISOString(),
        renewal_count: full.renewal_count + 1,
      }).where(eq(borrowingRecords.id, borrowingId));
      return { new_due_date: newDue.toISOString() };
    },
```

- [ ] **Step 4: Rewrite the fine computation in `adminReturn`**

In `adminReturn` (`sqlite.ts:1210`), replace the fine-calculation block (the `if (now > due) { ... }` that calls `getSettings`) with a policy-driven version. Replace:

```ts
      if (now > due) {
        const cfg = await getSettings(db);
        const daysLate = Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
        const billableDays = Math.max(0, daysLate - (cfg.grace_period_days ?? 0));
        fineAmount = billableDays * cfg.fine_per_day;
      }
```

with:

```ts
      if (now > due) {
        const copyRes = await db.select({ resource_id: resourceCopies.resource_id, institution_id: resources.institution_id })
          .from(resourceCopies)
          .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
          .where(eq(resourceCopies.id, record.copy_id)).limit(1).then(r => r[0] ?? null);
        if (copyRes) {
          const policy = await resolveForResource(copyRes.institution_id, record.user_id, copyRes.resource_id);
          const daysLate = Math.max(0, Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)));
          const billableDays = Math.max(0, daysLate - policy.grace_period_days);
          fineAmount = billableDays * policy.fine_per_day;
          if (policy.fine_max != null) fineAmount = Math.min(fineAmount, policy.fine_max);
        }
      }
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd packages/server && pnpm test loanRules`
Expected: PASS (renewal blocked at 0; fine capped at 15).

- [ ] **Step 6: Run the full suite**

Run: `cd packages/server && pnpm test`
Expected: all PASS (default policy preserves the existing return/renew behavior).

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/adapter/sqlite.ts packages/server/src/adapter/sqlite.loanRules.test.ts
git commit -m "feat(circulation): policy-driven renewals and return fines"
```

---

### Task 6: tRPC surface — loan-rules CRUD + checkout override

**Files:**
- Create: `packages/server/src/router/admin/loanRules.ts`
- Modify: `packages/server/src/router/admin/index.ts` (register sub-router)
- Modify: `packages/server/src/router/admin/circulation.ts` (override input + structured result)
- Modify: `packages/server/src/adapter/types.ts` (CRUD methods)
- Modify: `packages/server/src/adapter/sqlite.ts` (CRUD impls)
- Test: `packages/server/src/adapter/sqlite.loanRules.test.ts` (extend with CRUD)

**Interfaces:**
- Consumes: tables + `loadRulesAndLimits` + `PolicyError`.
- Produces:
  - `DbAdapter`: `adminListLoanRules(institutionId): Promise<LoanRule[]>`, `adminUpsertLoanRule(institutionId, data): Promise<{ id: number }>`, `adminDeleteLoanRule(id): Promise<void>`, `adminGetCategoryLimits(institutionId): Promise<CategoryLimit[]>`, `adminUpsertCategoryLimit(institutionId, data): Promise<{ id: number }>`.
  - tRPC: `admin.loanRules.{listRules, upsertRule, deleteRule, getCategoryLimits, upsertCategoryLimit, resolvePreview}`.
  - `admin.circulation.checkout` returns `{ ok: true; borrowingId: number } | { ok: false; violations: PolicyViolation[] }` and accepts `{ copyId, userId, override?, note? }`.

- [ ] **Step 1: Add adapter CRUD methods to the interface**

In `packages/server/src/adapter/types.ts`, under the circulation group add:

```ts
  adminListLoanRules(institutionId: number): Promise<import('@bookleaf/types').LoanRule[]>;
  adminUpsertLoanRule(
    institutionId: number,
    data: Omit<import('@bookleaf/types').LoanRule, 'id' | 'institution_id'> & { id?: number },
  ): Promise<{ id: number }>;
  adminDeleteLoanRule(id: number): Promise<void>;
  adminGetCategoryLimits(institutionId: number): Promise<import('@bookleaf/types').CategoryLimit[]>;
  adminUpsertCategoryLimit(
    institutionId: number,
    data: Omit<import('@bookleaf/types').CategoryLimit, 'id' | 'institution_id'> & { id?: number },
  ): Promise<{ id: number }>;
```

- [ ] **Step 2: Write the failing CRUD test**

Append to `packages/server/src/adapter/sqlite.loanRules.test.ts`:

```ts
describe('loan-rule CRUD', () => {
  it('lists (with the ensured default), upserts, and deletes a rule', async () => {
    const initial = await db.adminListLoanRules(iid);
    expect(initial.some(r => r.user_type === 'ANY' && r.material_type === 'ANY')).toBe(true);

    const { id } = await db.adminUpsertLoanRule(iid, {
      user_type: 'faculty', material_type: 'AUDIOVISUAL', loan_period_days: 3, type_limit: 2,
      max_renewals: 0, renewal_period_days: null, fine_per_day: 10, grace_period_days: 0,
      fine_max: 50, is_loanable: true, is_holdable: true,
    });
    expect(id).toBeGreaterThan(0);

    await db.adminUpsertLoanRule(iid, {
      id, user_type: 'faculty', material_type: 'AUDIOVISUAL', loan_period_days: 5, type_limit: 2,
      max_renewals: 1, renewal_period_days: null, fine_per_day: 10, grace_period_days: 0,
      fine_max: 50, is_loanable: true, is_holdable: true,
    });
    const updated = (await db.adminListLoanRules(iid)).find(r => r.id === id);
    expect(updated?.loan_period_days).toBe(5);

    await db.adminDeleteLoanRule(id);
    expect((await db.adminListLoanRules(iid)).some(r => r.id === id)).toBe(false);
  });

  it('upserts a category limit', async () => {
    await db.adminUpsertCategoryLimit(iid, { user_type: 'student', overall_limit: 8, fines_block_threshold: 100 });
    const got = (await db.adminGetCategoryLimits(iid)).find(l => l.user_type === 'student');
    expect(got?.overall_limit).toBe(8);
    expect(got?.fines_block_threshold).toBe(100);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd packages/server && pnpm test loanRules`
Expected: FAIL — `db.adminListLoanRules is not a function`.

- [ ] **Step 4: Implement the CRUD methods**

Add to the `adapterImpl` object literal in `sqlite.ts` (near `adminResolvePolicy`):

```ts
    async adminListLoanRules(institutionId) {
      const { rules } = await loadRulesAndLimits(institutionId);
      return rules;
    },

    async adminUpsertLoanRule(institutionId, data) {
      const values = {
        institution_id: institutionId,
        user_type: data.user_type, material_type: data.material_type,
        loan_period_days: data.loan_period_days, type_limit: data.type_limit ?? null,
        max_renewals: data.max_renewals, renewal_period_days: data.renewal_period_days ?? null,
        fine_per_day: data.fine_per_day, grace_period_days: data.grace_period_days,
        fine_max: data.fine_max ?? null, is_loanable: data.is_loanable, is_holdable: data.is_holdable,
      };
      if (data.id) {
        await db.update(loanRules).set(values).where(eq(loanRules.id, data.id));
        return { id: data.id };
      }
      const res = await db.insert(loanRules).values(values)
        .onConflictDoUpdate({ target: [loanRules.institution_id, loanRules.user_type, loanRules.material_type], set: values })
        .returning({ id: loanRules.id });
      return { id: res[0].id };
    },

    async adminDeleteLoanRule(id) {
      await db.delete(loanRules).where(eq(loanRules.id, id));
    },

    async adminGetCategoryLimits(institutionId) {
      const { limits } = await loadRulesAndLimits(institutionId);
      return limits;
    },

    async adminUpsertCategoryLimit(institutionId, data) {
      const values = {
        institution_id: institutionId, user_type: data.user_type,
        overall_limit: data.overall_limit ?? null, fines_block_threshold: data.fines_block_threshold,
      };
      if (data.id) {
        await db.update(categoryLimits).set(values).where(eq(categoryLimits.id, data.id));
        return { id: data.id };
      }
      const res = await db.insert(categoryLimits).values(values)
        .onConflictDoUpdate({ target: [categoryLimits.institution_id, categoryLimits.user_type], set: values })
        .returning({ id: categoryLimits.id });
      return { id: res[0].id };
    },
```

(If `db.delete` is not yet imported, confirm `delete` comes from the Drizzle instance — it does; no extra import needed.)

- [ ] **Step 5: Run to verify the adapter tests pass**

Run: `cd packages/server && pnpm test loanRules`
Expected: PASS (CRUD tests green).

- [ ] **Step 6: Create the tRPC sub-router**

Create `packages/server/src/router/admin/loanRules.ts`:

```ts
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

const RULE_USER_TYPES = ['student', 'faculty', 'alumni', 'external', 'ANY'] as const;
const RULE_MATERIAL_TYPES = ['BOOK', 'SERIAL', 'ARTICLE', 'AUDIOVISUAL', 'MAP', 'MANUSCRIPT', 'DIGITAL', 'THESIS', 'OTHER', 'ANY'] as const;

const ruleInput = z.object({
  id: z.number().int().optional(),
  user_type: z.enum(RULE_USER_TYPES),
  material_type: z.enum(RULE_MATERIAL_TYPES),
  loan_period_days: z.number().int().min(0),
  type_limit: z.number().int().min(0).nullable(),
  max_renewals: z.number().int().min(0),
  renewal_period_days: z.number().int().min(0).nullable(),
  fine_per_day: z.number().min(0),
  grace_period_days: z.number().int().min(0),
  fine_max: z.number().min(0).nullable(),
  is_loanable: z.boolean(),
  is_holdable: z.boolean(),
});

const limitInput = z.object({
  id: z.number().int().optional(),
  user_type: z.enum(RULE_USER_TYPES),
  overall_limit: z.number().int().min(0).nullable(),
  fines_block_threshold: z.number().min(0),
});

export const adminLoanRulesRouter = router({
  listRules: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminListLoanRules(input.institutionId)),

  upsertRule: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), data: ruleInput }))
    .mutation(({ input, ctx }) => ctx.db.adminUpsertLoanRule(input.institutionId, input.data)),

  deleteRule: librarianProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => { await ctx.db.adminDeleteLoanRule(input.id); return { ok: true as const }; }),

  getCategoryLimits: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminGetCategoryLimits(input.institutionId)),

  upsertCategoryLimit: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), data: limitInput }))
    .mutation(({ input, ctx }) => ctx.db.adminUpsertCategoryLimit(input.institutionId, input.data)),

  resolvePreview: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), userId: z.number().int(), resourceId: z.number().int() }))
    .query(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminResolvePolicy(input.institutionId, input.userId, input.resourceId);
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Could not resolve policy' });
      }
    }),
});
```

- [ ] **Step 7: Register the sub-router**

In `packages/server/src/router/admin/index.ts`, import and add it:

```ts
import { adminLoanRulesRouter } from './loanRules';
```

and inside `router({ ... })` add:

```ts
  loanRules: adminLoanRulesRouter,
```

- [ ] **Step 8: Wire override into `admin.circulation.checkout`**

In `packages/server/src/router/admin/circulation.ts`, add the import at the top:

```ts
import { PolicyError } from '../../adapter/loanPolicy';
```

and replace the `checkout` procedure with:

```ts
  checkout: librarianProcedure
    .input(z.object({
      copyId: z.number().int(),
      userId: z.number().int(),
      override: z.boolean().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const res = await ctx.db.adminCheckout(input.copyId, input.userId, {
          override: input.override,
          note: input.note,
          actedByUserId: ctx.principal.user_id,
          institutionId: ctx.principal.institution_id,
        });
        return { ok: true as const, borrowingId: res.borrowingId };
      } catch (e) {
        if (e instanceof PolicyError) {
          return { ok: false as const, violations: e.violations };
        }
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Could not check out' });
      }
    }),
```

- [ ] **Step 9: Run the full suite + typecheck**

Run: `cd packages/server && pnpm test && pnpm typecheck`
Expected: all tests PASS; typecheck clean.

- [ ] **Step 10: Commit**

```bash
git add packages/server/src/router/admin/loanRules.ts packages/server/src/router/admin/index.ts packages/server/src/router/admin/circulation.ts packages/server/src/adapter/types.ts packages/server/src/adapter/sqlite.ts packages/server/src/adapter/sqlite.loanRules.test.ts
git commit -m "feat(circulation): tRPC loan-rules CRUD + checkout override result"
```

---

### Task 7: Desktop "Loan Policies" page

**Files:**
- Create: `apps/desktop/src/pages/LoanPolicies.tsx`
- Modify: `apps/desktop/src/App.tsx` (route)
- Modify: `apps/desktop/src/components/layout/Sidebar.tsx` (nav item)

**Interfaces:**
- Consumes: `trpc.admin.loanRules.*` from Task 6; `@bookleaf/ui` components.
- Produces: a `/loan-policies` route that lists/edits `loan_rules` and per-category limits.

> **Testing note:** the desktop app has no page-level test harness (only `lib/*` unit tests). For this task, verification is `pnpm typecheck` + a manual smoke check, consistent with the existing project convention.

- [ ] **Step 1: Create the page**

Create `apps/desktop/src/pages/LoanPolicies.tsx`:

```tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@bookleaf/ui/components/button';
import { Input } from '@bookleaf/ui/components/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@bookleaf/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@bookleaf/ui/components/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bookleaf/ui/components/select';
import { Trash2, Plus } from 'lucide-react';
import type { LoanRule, CategoryLimit } from '@bookleaf/types';

const USER_TYPE_OPTS = ['ANY', 'student', 'faculty', 'alumni', 'external'] as const;
const MATERIAL_TYPE_OPTS = ['ANY', 'BOOK', 'SERIAL', 'ARTICLE', 'AUDIOVISUAL', 'MAP', 'MANUSCRIPT', 'DIGITAL', 'THESIS', 'OTHER'] as const;

const blankRule = (): Omit<LoanRule, 'id' | 'institution_id'> => ({
  user_type: 'ANY', material_type: 'ANY', loan_period_days: 7, type_limit: null,
  max_renewals: 2, renewal_period_days: null, fine_per_day: 5, grace_period_days: 0,
  fine_max: null, is_loanable: true, is_holdable: true,
});

export default function LoanPolicies() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  const [draft, setDraft] = useState<Omit<LoanRule, 'id' | 'institution_id'>>(blankRule());

  const rulesQ = useQuery(trpc.admin.loanRules.listRules.queryOptions({ institutionId: iid }));
  const limitsQ = useQuery(trpc.admin.loanRules.getCategoryLimits.queryOptions({ institutionId: iid }));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: trpc.admin.loanRules.listRules.queryKey({ institutionId: iid }) });
    qc.invalidateQueries({ queryKey: trpc.admin.loanRules.getCategoryLimits.queryKey({ institutionId: iid }) });
  };

  const upsertRule = useMutation(trpc.admin.loanRules.upsertRule.mutationOptions({ onSuccess: invalidate }));
  const deleteRule = useMutation(trpc.admin.loanRules.deleteRule.mutationOptions({ onSuccess: invalidate }));
  const upsertLimit = useMutation(trpc.admin.loanRules.upsertCategoryLimit.mutationOptions({ onSuccess: invalidate }));

  const rules = (rulesQ.data ?? []) as LoanRule[];
  const limits = (limitsQ.data ?? []) as CategoryLimit[];

  const numOrNull = (s: string) => (s === '' ? null : Number(s));

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Loan Policies</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rules matrix</CardTitle>
          <CardDescription>Per patron category × material type. Blank cells fall back to the most general matching rule (ANY).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead><TableHead>Material</TableHead><TableHead>Period</TableHead>
                <TableHead>Type limit</TableHead><TableHead>Renewals</TableHead><TableHead>Fine/day</TableHead>
                <TableHead>Grace</TableHead><TableHead>Fine cap</TableHead><TableHead>Loanable</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.user_type}</TableCell>
                  <TableCell>{r.material_type}</TableCell>
                  <TableCell>{r.loan_period_days}d</TableCell>
                  <TableCell>{r.type_limit ?? '—'}</TableCell>
                  <TableCell>{r.max_renewals}</TableCell>
                  <TableCell>₱{r.fine_per_day}</TableCell>
                  <TableCell>{r.grace_period_days}d</TableCell>
                  <TableCell>{r.fine_max == null ? '—' : `₱${r.fine_max}`}</TableCell>
                  <TableCell>{r.is_loanable ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" onClick={() => deleteRule.mutate({ id: r.id })} aria-label="Delete rule">
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="border-t pt-4 space-y-3">
            <p className="text-sm font-medium">Add / overwrite a rule</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs">Category</label>
                <Select value={draft.user_type} onValueChange={(v) => setDraft({ ...draft, user_type: v as LoanRule['user_type'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{USER_TYPE_OPTS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs">Material</label>
                <Select value={draft.material_type} onValueChange={(v) => setDraft({ ...draft, material_type: v as LoanRule['material_type'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MATERIAL_TYPE_OPTS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><label className="text-xs">Loan period (days)</label><Input type="number" value={draft.loan_period_days} onChange={(e) => setDraft({ ...draft, loan_period_days: Number(e.target.value) })} /></div>
              <div className="space-y-1"><label className="text-xs">Type limit (blank = none)</label><Input type="number" value={draft.type_limit ?? ''} onChange={(e) => setDraft({ ...draft, type_limit: numOrNull(e.target.value) })} /></div>
              <div className="space-y-1"><label className="text-xs">Max renewals</label><Input type="number" value={draft.max_renewals} onChange={(e) => setDraft({ ...draft, max_renewals: Number(e.target.value) })} /></div>
              <div className="space-y-1"><label className="text-xs">Fine per day</label><Input type="number" step="0.01" value={draft.fine_per_day} onChange={(e) => setDraft({ ...draft, fine_per_day: Number(e.target.value) })} /></div>
              <div className="space-y-1"><label className="text-xs">Grace (days)</label><Input type="number" value={draft.grace_period_days} onChange={(e) => setDraft({ ...draft, grace_period_days: Number(e.target.value) })} /></div>
              <div className="space-y-1"><label className="text-xs">Fine cap (blank = none)</label><Input type="number" step="0.01" value={draft.fine_max ?? ''} onChange={(e) => setDraft({ ...draft, fine_max: numOrNull(e.target.value) })} /></div>
            </div>
            {upsertRule.error && <p className="text-xs text-destructive">{getTRPCErrorMessage(upsertRule.error)}</p>}
            <Button onClick={() => upsertRule.mutate({ institutionId: iid, data: draft })} disabled={upsertRule.isPending} className="flex items-center gap-2">
              <Plus size={15} /> Save rule
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category ceilings</CardTitle>
          <CardDescription>Overall borrowing limit and fines-block threshold per category (₱0 threshold = fines never block).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {USER_TYPE_OPTS.map((ut) => {
            const existing = limits.find(l => l.user_type === ut);
            return <CategoryLimitRow key={ut} userType={ut} existing={existing}
              onSave={(overall, threshold) => upsertLimit.mutate({ institutionId: iid, data: { id: existing?.id, user_type: ut, overall_limit: overall, fines_block_threshold: threshold } })}
              pending={upsertLimit.isPending} />;
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryLimitRow({ userType, existing, onSave, pending }: {
  userType: string; existing?: CategoryLimit; onSave: (overall: number | null, threshold: number) => void; pending: boolean;
}) {
  const [overall, setOverall] = useState<string>(existing?.overall_limit?.toString() ?? '');
  const [threshold, setThreshold] = useState<string>(existing?.fines_block_threshold?.toString() ?? '0');
  return (
    <div className="grid grid-cols-4 gap-3 items-end">
      <div className="text-sm font-medium">{userType}</div>
      <div className="space-y-1"><label className="text-xs">Overall limit (blank = none)</label><Input type="number" value={overall} onChange={(e) => setOverall(e.target.value)} /></div>
      <div className="space-y-1"><label className="text-xs">Fines block ≥ ₱</label><Input type="number" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></div>
      <Button variant="outline" disabled={pending} onClick={() => onSave(overall === '' ? null : Number(overall), Number(threshold || '0'))}>Save</Button>
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

In `apps/desktop/src/App.tsx`, add the import:

```tsx
import LoanPolicies from '@/pages/LoanPolicies';
```

and add a child route (next to `settings`):

```tsx
      { path: 'loan-policies', element: <LoanPolicies /> },
```

- [ ] **Step 3: Add the nav item**

In `apps/desktop/src/components/layout/Sidebar.tsx`, add `ScrollText` to the lucide import, then add to `navItems` (after `circulation`):

```tsx
  { to: '/loan-policies', icon: ScrollText, label: 'Loan Policies' },
```

- [ ] **Step 4: Typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: clean (no TS errors). If `@bookleaf/ui/components/select` or `table` paths differ, match the exact import style used by an existing page that already imports them.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/pages/LoanPolicies.tsx apps/desktop/src/App.tsx apps/desktop/src/components/layout/Sidebar.tsx
git commit -m "feat(desktop): Loan Policies page (rules matrix + category ceilings)"
```

---

### Task 8: Circulation desk override dialog

**Files:**
- Modify: `apps/desktop/src/pages/Circulation.tsx`

**Interfaces:**
- Consumes: the new `admin.circulation.checkout` union result (`{ ok: false, violations }`) + override input from Task 6.
- Produces: a dialog that lists policy violations and lets a librarian/admin re-submit with `{ override: true, note }`.

> **Testing note:** verification is `pnpm typecheck` + manual smoke (no page test harness). The exact wiring depends on the current Circulation checkout call; the steps below describe the precise edit to make against whatever local handler exists.

- [ ] **Step 1: Read the current checkout usage**

Open `apps/desktop/src/pages/Circulation.tsx` and locate the `trpc.admin.circulation.checkout` mutation usage and the success handler. Note the variable names (`checkoutMutation`, the selected `copyId`/`userId`).

- [ ] **Step 2: Add violation state + dialog imports**

Add to the imports at the top of `Circulation.tsx`:

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@bookleaf/ui/components/dialog';
import { Input } from '@bookleaf/ui/components/input';
import { useAuthStore } from '@/store/useAuthStore';
import type { PolicyViolation } from '@bookleaf/types';
```

(If any of these are already imported, do not duplicate them.)

Inside the component, add state:

```tsx
const role = useAuthStore((s) => s.user?.role);
const [blocked, setBlocked] = useState<{ copyId: number; userId: number; violations: PolicyViolation[] } | null>(null);
const [overrideNote, setOverrideNote] = useState('');
```

- [ ] **Step 3: Handle the structured result in the checkout success handler**

Change the checkout mutation's `onSuccess` so it inspects the union. Where the code currently treats checkout as always-success, replace the success body with:

```tsx
onSuccess: (res, vars) => {
  if (res.ok === false) {
    setBlocked({ copyId: vars.copyId, userId: vars.userId, violations: res.violations });
    return;
  }
  setBlocked(null);
  setOverrideNote('');
  // …keep the existing post-success logic here (toast, query invalidation, input reset)…
},
```

(`vars` is the mutation input — `{ copyId, userId }`. If the existing `onSuccess` does not receive `vars`, add it as the second parameter.)

- [ ] **Step 4: Render the override dialog**

Add this JSX near the end of the component's returned markup (before the closing wrapper):

```tsx
<Dialog open={!!blocked} onOpenChange={(o) => { if (!o) { setBlocked(null); setOverrideNote(''); } }}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Checkout blocked by loan policy</DialogTitle>
      <DialogDescription>This checkout violates the library's circulation rules.</DialogDescription>
    </DialogHeader>
    <ul className="list-disc pl-5 text-sm space-y-1">
      {blocked?.violations.map((v) => <li key={v.reason_code}>{v.message}</li>)}
    </ul>
    {(role === 'admin' || role === 'librarian') ? (
      <>
        <div className="space-y-1">
          <label className="text-xs">Override reason (required)</label>
          <Input value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} placeholder="e.g. department head approved" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setBlocked(null); setOverrideNote(''); }}>Cancel</Button>
          <Button
            disabled={!overrideNote.trim() || checkoutMutation.isPending}
            onClick={() => blocked && checkoutMutation.mutate({ copyId: blocked.copyId, userId: blocked.userId, override: true, note: overrideNote.trim() })}
          >
            Override & check out
          </Button>
        </DialogFooter>
      </>
    ) : (
      <DialogFooter>
        <Button variant="outline" onClick={() => setBlocked(null)}>Close</Button>
      </DialogFooter>
    )}
  </DialogContent>
</Dialog>
```

(Replace `checkoutMutation` with the actual mutation variable name found in Step 1.)

- [ ] **Step 5: Typecheck**

Run: `cd apps/desktop && pnpm typecheck`
Expected: clean. The checkout result is now a union; ensure any other reads of the result handle `res.ok` (the compiler will flag them if not).

- [ ] **Step 6: Manual smoke (optional but recommended)**

Run the desktop app, set a `student` category overall limit of 1 on the Loan Policies page, check a student out two items: the second should open the override dialog; overriding with a reason should complete the checkout, and a row should appear in `circ_overrides`.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/pages/Circulation.tsx
git commit -m "feat(desktop): circulation override dialog for policy violations"
```

---

## Final verification

- [ ] Run the full server suite: `cd packages/server && pnpm test` → all PASS.
- [ ] Typecheck both touched packages: `cd packages/server && pnpm typecheck` and `cd apps/desktop && pnpm typecheck` → clean.
- [ ] Confirm the parity guarantee: with no custom rules, a fresh DB checks out / renews / returns exactly as before (period 7, fine ₱5/day, 2 renewals, overall limit 3 now enforced).
