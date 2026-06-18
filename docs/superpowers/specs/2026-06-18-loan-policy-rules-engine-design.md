# Loan Policy & Rules Engine — Design Spec

**Date:** 2026-06-18
**Status:** Approved
**Scope:** Desktop app only (`apps/desktop`). The mobile server app (`apps/server`) must not change. Shared packages (`packages/db`, `packages/server`, `packages/types`) may change.

## Context

This is **sub-project ① of 5** in a comprehensive circulation-modules update (desktop-only). The full effort was decomposed into:

1. **Loan Policy & Rules Engine** *(this spec — foundational)*
2. Circulation Desk UX (barcode-at-desk, express/bulk checkout & return)
3. Renewals & Overdues Automation (auto-renewals, batch fines, desktop notifications)
4. Holds & Reservations (queue, pickup locations, expiration)
5. Item Condition Workflows (lost/damaged processing)

Each sub-project gets its own spec → plan → build cycle. Sub-projects ②–⑤ consume the resolved-policy primitives this one introduces.

**Dropped from the original request entirely** (decided during brainstorming): SMS reminders, Email reminders, RFID circulation, inter-branch holds, multi-branch support, self-service kiosk, remote circulation, offline circulation. Reminders, where they appear in later sub-projects, are **desktop OS/in-app notifications only**. "Pickup locations" are named points within the single building, not branches.

## Goal

Replace the single flat global loan policy with a **rules matrix** resolved per `(patron category × material type)`, so the library can express realistic circulation policy: different loan periods, limits, renewals, and fines for, e.g., faculty borrowing books vs. students borrowing audiovisual material. Enforce loan limits at checkout (currently never checked — a real bug), with a logged librarian override path.

The migration seeds a single wildcard rule from today's global settings, so **existing installs behave identically** until a librarian adds specific rules.

## Current state (what exists today)

- `settings` is a flat key-value table. `getSettings()` (`packages/server/src/adapter/sqlite.ts:122`) returns one global config: `fine_per_day=5`, `max_borrow_days=7`, `max_books_per_member=3`, `grace_period_days=0`, `max_renewals=2`.
- `adminCheckout` (`sqlite.ts:1171`) computes `due_date = today + max_borrow_days` and **does not check `max_books_per_member`** (confirmed bug).
- `adminReturn` (`sqlite.ts:1210`) computes fines from the global `fine_per_day` / `grace_period_days`.
- `renewBorrow` (`sqlite.ts:605`) checks `renewal_count < max_renewals` and extends by `max_borrow_days`.
- Patron category = `users.user_type` (`student|faculty|alumni|external`, **nullable**). Item type = `resources.material_type` (9 values).
- `resources.loan_period_days` (per-item override) exists but is **ignored** by checkout.
- Migrations are numbered SQL files in `packages/db/drizzle/` (currently through `0004`), auto-discovered by tests via `migrationSqls()`, and registered manually in `packages/server/src/index.desktop.ts`. The runner (`sqlite.ts:64`) tracks applied files by index in `_bookleaf_migrations` and splits on `--> statement-breakpoint`.

## Design decisions (locked during brainstorming)

- **Rule model:** matrix table with `ANY` wildcard fallback (Koha/Evergreen style).
- **Limit model:** BOTH an overall per-category cap AND an optional per-`(category×type)` sub-limit.
- **Enforcement:** block with a clear reason; librarian/admin may override with a required reason, which is logged.
- **Fines block:** configurable per-category threshold; `0` = disabled (default), so no behavior change until enabled.
- **Item override:** `resources.loan_period_days`, when set, overrides the matched rule's **period only**; all other policy (limits, fines, renewals) comes from the rule.

## Data model — new migration `0005_loan_rules.sql`

Three new tables. All FK to `institutions(id)`. Created with `IF NOT EXISTS`-tolerant statements consistent with the existing runner.

### `loan_rules`
One row per `(institution, user_type, material_type)`; either dimension may be the literal string `'ANY'`.

| column | type | notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `institution_id` | INTEGER NOT NULL → institutions | |
| `user_type` | TEXT NOT NULL | `student\|faculty\|alumni\|external\|ANY` |
| `material_type` | TEXT NOT NULL | `BOOK\|SERIAL\|ARTICLE\|AUDIOVISUAL\|MAP\|MANUSCRIPT\|DIGITAL\|THESIS\|OTHER\|ANY` |
| `loan_period_days` | INTEGER NOT NULL | base loan period |
| `type_limit` | INTEGER | max concurrent loans **of this material type**; NULL = no sub-limit |
| `max_renewals` | INTEGER NOT NULL | |
| `renewal_period_days` | INTEGER | NULL → reuse effective loan period |
| `fine_per_day` | REAL NOT NULL | |
| `grace_period_days` | INTEGER NOT NULL DEFAULT 0 | |
| `fine_max` | REAL | per-loan cap; NULL = uncapped |
| `is_loanable` | INTEGER NOT NULL DEFAULT 1 | boolean |
| `is_holdable` | INTEGER NOT NULL DEFAULT 1 | boolean (consumed by sub-project ④) |

`UNIQUE(institution_id, user_type, material_type)`.

### `category_limits`
Per-category ceilings that span all material types.

| column | type | notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `institution_id` | INTEGER NOT NULL → institutions | |
| `user_type` | TEXT NOT NULL | includes `ANY` |
| `overall_limit` | INTEGER | max concurrent loans across all types; NULL = unlimited |
| `fines_block_threshold` | REAL NOT NULL DEFAULT 0 | block checkout when unpaid fines exceed this; `0` = disabled |

`UNIQUE(institution_id, user_type)`.

### `circ_overrides`
Audit log of policy overrides (also seeds the future audit-trail gap).

| column | type | notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `institution_id` | INTEGER NOT NULL → institutions | |
| `acted_by_user_id` | INTEGER NOT NULL → users | librarian/admin who overrode |
| `patron_user_id` | INTEGER NOT NULL → users | |
| `copy_id` | INTEGER → resource_copies | nullable |
| `reason_code` | TEXT NOT NULL | one of the violation codes below |
| `note` | TEXT | required free-text reason from staff |
| `created_at` | TEXT NOT NULL DEFAULT (datetime('now')) | |

## Policy resolution — new isolated module `loanPolicy.ts`

A **pure, side-effect-free module** in `packages/server/src/adapter/` (kept out of the 1600-line `sqlite.ts` for isolation and unit-testability). It receives already-fetched rows and returns a resolved policy + violation verdicts; it performs no DB I/O.

```
resolvePolicy(rules: LoanRule[], limits: CategoryLimit[], patron, resource): ResolvedPolicy
```

Resolution steps:

1. **Match loan rule, most-specific first** among candidates, taking the first present in this precedence order:
   `(ut, mt)` → `(ut, ANY)` → `(ANY, mt)` → `(ANY, ANY)`.
   `patron.user_type` of `null` coalesces to `'ANY'`. `(ANY, ANY)` always exists (seeded), so resolution never fails.
2. **Effective period** = `resource.loan_period_days ?? rule.loan_period_days` (item override wins, period only).
3. **Overall cap + fines threshold** from `category_limits`: row for `ut`, else the `ANY` row.

`ResolvedPolicy` carries: effective period, `type_limit`, `overall_limit`, `max_renewals`, `renewal_period_days` (resolved to effective period if null), `fine_per_day`, `grace_period_days`, `fine_max`, `is_loanable`, `is_holdable`, `fines_block_threshold`.

A second pure function evaluates violations given current patron counters:

```
evaluateCheckout(policy, counters: { activeTotal, activeOfType, unpaidFines }, resourceLoanable): PolicyViolation[]
```

`PolicyViolation.reason_code` ∈ `not_loanable | over_overall_limit | over_type_limit | fines_block`. (`renewals_exhausted` is produced by the renewal path.)

## Enforcement at the desk

### Checkout (`adminCheckout` signature extended)

```
adminCheckout(copyId, userId, opts?: { override?: boolean, actedByUserId?: number, note?: string })
```

Flow (inside the existing transaction where it claims the copy):
1. Fetch the resolved policy + the patron's current counters (`activeTotal`, `activeOfType` for this material type, `unpaidFines` sum) and the resource/copy loanable state.
2. Compute violations.
3. If violations exist and `override` is not set → **do not claim the copy**; throw a typed `PolicyError` carrying `violations: PolicyViolation[]`. The desk UI catches it and presents the override dialog.
4. If `override` is set → require `actedByUserId` (must be `librarian`/`admin`) and a non-empty `note`; write a `circ_overrides` row per violation `reason_code`, then proceed.
5. Claim copy, create borrowing record with `due_date = today + effective period`, decrement `available_copies`, fulfill the patron's matching active reservation (unchanged behavior).

Counters use active loans (`returned_at IS NULL`). The atomic copy-claim (`UPDATE … WHERE status='available' RETURNING`) is preserved.

### Renewal (`renewBorrow`)

Resolve the policy for the loan's patron + the loaned copy's material type. Block if `renewal_count >= rule.max_renewals` (`renewals_exhausted`). Extend `due_date` by `renewal_period_days ?? effective period`. (Override for renewals is out of scope for ①; renewal is staff-initiated and the limit message is sufficient.)

### Return (`adminReturn`)

Compute fines from the resolved rule: `billableDays = max(0, daysLate - grace_period_days)`, `fine = billableDays × fine_per_day`, then capped at `fine_max` when set. Copy-condition handling and `available_copies` restoration are unchanged.

## Migration & backward compatibility (zero behavior change)

A `seedLoanRulesIfEmpty(rawDb)` step (mirroring `seedDefaultsIfEmpty`) runs in `createSqliteAdapter` after migrations. If `loan_rules` is empty for the seeded institution, it inserts, from the **current** `settings` values:

- one `loan_rules (ANY, ANY)` row: `loan_period_days = max_borrow_days (7)`, `type_limit = NULL`, `max_renewals = max_renewals (2)`, `renewal_period_days = NULL`, `fine_per_day (5)`, `grace_period_days (0)`, `fine_max = NULL`, `is_loanable = 1`, `is_holdable = 1`.
- one `category_limits (ANY)` row: `overall_limit = max_books_per_member (3)`, `fines_block_threshold = 0`.

Result: resolution always finds a rule, periods/fines/renewals match the old globals exactly, and the only intentional behavior change is that **`overall_limit` is now actually enforced** (fixing the `max_books_per_member` bug). The old `settings` keys remain (still used for `institution_name` and as the seed source); circulation reads resolved policy instead.

`0005_loan_rules.sql` is registered in `index.desktop.ts` as `sql_0005` and passed to `createSqliteAdapter`; tests pick it up automatically via `migrationSqls()`.

## API & types

### `packages/types`
- `USER_TYPES` const (`['student','faculty','alumni','external']`) + a `LOAN_RULE_ANY = 'ANY'` sentinel.
- Interfaces: `LoanRule`, `CategoryLimit`, `ResolvedPolicy`, `PolicyViolation`, `CircOverride`.

### `packages/server` (tRPC, admin-only)
- New `admin.loanRules` sub-router:
  - `listRules`, `upsertRule`, `deleteRule`
  - `getCategoryLimits`, `upsertCategoryLimit`
  - `resolvePreview(userId, resourceId)` → `ResolvedPolicy` (for UI preview / testing)
- Extend `admin.circulation.checkout` input with optional `{ override, note }` (the acting user comes from the authenticated context, not the request body).
- New adapter methods on `DbAdapter` backing the above, plus the extended `adminCheckout` signature.

## Desktop UI (`apps/desktop`)

- **New "Loan Policies" page** (reusing the existing shadcn + TanStack Table + React Hook Form + Zod stack):
  - A rules editor: list of `loan_rules` with `user_type` / `material_type` selectors (including `ANY`), inline-editable numeric/boolean policy fields, add/delete. Validation via Zod (periods/limits ≥ 0, `type_limit`/`fine_max` optional).
  - A per-category panel for `overall_limit` + `fines_block_threshold`.
- **Circulation page**: on a `PolicyError`, show a violation dialog listing each reason in plain language; for `librarian`/`admin`, an **Override** action requires a typed reason and re-submits with `{ override: true, note }`. Non-privileged users see the block without an override option.

## Testing (TDD)

- **`packages/server/src/adapter/loanPolicy.test.ts`** (pure unit tests, no DB): resolution precedence across all four match tiers; null `user_type` → `ANY`; item period override; `renewal_period_days` fallback; violation evaluation for each `reason_code`; `fine_max` cap and grace subtraction.
- **`packages/server/src/adapter/sqlite.loanRules.test.ts`** (integration, `:memory:`): seed parity (default behaves exactly like old globals); overall + per-type limit enforcement at checkout; override path writes `circ_overrides` and proceeds; non-override checkout throws `PolicyError` and does **not** claim the copy; renewal limit from rule; return fine from rule with cap; fines-block threshold.

## Out of scope for ①

Bulk/express checkout UX, barcode-at-desk scanning, auto-renewals, notifications, holds queue/pickup/expiration, lost/damaged workflows. These are sub-projects ②–⑤ and consume the `ResolvedPolicy` / `is_holdable` primitives defined here.
