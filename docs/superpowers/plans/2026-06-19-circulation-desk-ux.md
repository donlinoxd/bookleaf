# Circulation Desk UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the circulation desk into a scan-driven flow — scan a patron card then scan items that check out immediately (unified express/bulk), and scan items to return them — by wrapping sub-project ①'s checkout/return primitives behind accession/card-based endpoints.

**Architecture:** Three thin scan-oriented adapter methods (`adminResolvePatron`, `adminCheckoutByAccession`, `adminReturnByAccession`) resolve a `resource_copies.accession_number` / `users.id_number` and delegate to ①'s logic. To stay DRY, ①'s `adminCheckout`/`adminReturn` bodies are first extracted into `checkoutCopy`/`returnBorrowing` closures that both the original methods and the new wrappers call. The desktop Circulation page is rebuilt around two scan sessions reusing the Inventory keyboard-wedge input pattern. No DB schema changes.

**Tech Stack:** TypeScript, Drizzle ORM + better-sqlite3, tRPC, Vitest, React 19 + TanStack Query + shadcn/ui (Tauri desktop).

## Global Constraints

- Desktop app only (`apps/desktop`). **Do not modify `apps/server`** (mobile). Shared packages (`packages/server`, `packages/types`) may change.
- **No DB schema changes** — endpoints + UI over existing tables.
- Item scan identifier = `resource_copies.accession_number`; patron card = `users.id_number`. Resolve copies scoped to institution (`resource_copies → resources` on `resources.institution_id`).
- Accession resolution outcomes: 0 → `unknown`, 1 → proceed, >1 → `ambiguous` (no guessing). No unique constraint is added.
- Actor/institution always from `ctx.principal`, never the request body.
- Commit per scan immediately; blocked items surface inline with violations and a librarian/admin override (reusing ①).
- Bulk return condition is fixed to `'good'` (damaged/lost is sub-project ⑤).
- Reuse ①'s `adminCheckout`/`adminReturn` logic via the extracted closures — do not duplicate enforcement/fine/transaction logic.
- Run server tests from `packages/server` (`pnpm test`, `pnpm typecheck`). Desktop type-check via `pnpm exec tsc --noEmit` in `apps/desktop` (there is no `typecheck` script; the `build` script runs `tsc`). Three pre-existing desktop `tsc` errors in `Books.tsx`/`Members.tsx`/`Settings.tsx` are out of scope — do not "fix" them and do not introduce new ones.

---

### Task 1: Shared result types + `adminResolvePatron`

**Files:**
- Modify: `packages/types/src/index.ts` (append near the existing circulation types)
- Modify: `packages/server/src/adapter/types.ts` (`DbAdapter`)
- Modify: `packages/server/src/adapter/sqlite.ts` (add method to `adapterImpl`)
- Modify: `packages/server/src/adapter/bridge.ts` (add stub)
- Modify: `packages/server/src/router/admin/circulation.ts` (add procedure)
- Test: `packages/server/src/adapter/sqlite.deskScan.test.ts` (new)

**Interfaces:**
- Consumes: existing `users`, `borrowingRecords`, `fines` tables; `librarianProcedure`.
- Produces:
  - Types in `@bookleaf/types`: `PatronSummary`, `CheckoutScanResult`, `ReturnScanResult`.
  - `DbAdapter.adminResolvePatron(institutionId: number, idNumber: string): Promise<PatronSummary | null>`.
  - tRPC `admin.circulation.resolvePatron` (query).

- [ ] **Step 1: Add shared types**

Append to `packages/types/src/index.ts` (after the loan-policy types added in ①):

```ts
// ── Circulation desk (scan flows) ────────────────────────────────────────────
export interface PatronSummary {
  userId: number;
  name: string;
  user_type: UserType | null;
  is_active: boolean;
  active_loans: number;
  unpaid_fines: number;
}

export type CheckoutScanResult =
  | { ok: true; copyId: number; title: string; due_date: string }
  | { ok: false; reason: 'unknown' | 'ambiguous' | 'unavailable'; accession: string }
  | { ok: false; reason: 'policy'; violations: PolicyViolation[] };

export type ReturnScanResult =
  | { ok: true; title: string; patron_name: string; fine_amount: number }
  | { ok: false; reason: 'unknown' | 'ambiguous' | 'no_active_loan'; accession: string };
```

- [ ] **Step 2: Add the adapter interface method**

In `packages/server/src/adapter/types.ts`, under the `// ── Admin: Circulation ──` group, add:

```ts
  adminResolvePatron(
    institutionId: number,
    idNumber: string,
  ): Promise<import('@bookleaf/types').PatronSummary | null>;
```

- [ ] **Step 3: Write the failing test**

Create `packages/server/src/adapter/sqlite.deskScan.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createSqliteAdapter } from './sqlite';

const drizzleDir = join(__dirname, '../../../db/drizzle');
function migrationSqls(): string[] {
  return readdirSync(drizzleDir).filter(f => /^\d+_.*\.sql$/.test(f)).sort()
    .map(f => readFileSync(join(drizzleDir, f), 'utf8'));
}

let db: ReturnType<typeof createSqliteAdapter>;
let iid: number;
let raw: { prepare(sql: string): { get(...a: unknown[]): unknown; run(...a: unknown[]): { lastInsertRowid: number | bigint }; all(...a: unknown[]): unknown[] } };

beforeEach(() => {
  db = createSqliteAdapter(':memory:', ...migrationSqls());
  iid = (db as unknown as { __seedTestInstitution(): number }).__seedTestInstitution();
  raw = (db as unknown as { __raw(): typeof raw }).__raw();
});

function makeMember(idNumber: string, isActive = 1, userType = 'student'): number {
  const r = raw.prepare(
    "INSERT INTO users (institution_id, name, role, id_number, pin_hash, user_type, is_active) VALUES (?, 'Pat', 'member', ?, 'x', ?, ?)",
  ).run(iid, idNumber, userType, isActive);
  return Number(r.lastInsertRowid);
}
// Creates a resource + one copy with the given accession, returns { resourceId, copyId }.
function makeCopy(accession: string): { resourceId: number; copyId: number } {
  const res = raw.prepare(
    "INSERT INTO resources (institution_id, material_type, title, author, total_copies, available_copies) VALUES (?, 'BOOK', 'T', 'A', 1, 1)",
  ).run(iid);
  const resourceId = Number(res.lastInsertRowid);
  const copy = raw.prepare(
    "INSERT INTO resource_copies (resource_id, copy_number, accession_number) VALUES (?, 1, ?)",
  ).run(resourceId, accession);
  return { resourceId, copyId: Number(copy.lastInsertRowid) };
}

describe('adminResolvePatron', () => {
  it('returns a summary with active loans and unpaid fines', async () => {
    const uid = makeMember('CARD-1');
    const { copyId } = makeCopy('ACC-1');
    await db.adminCheckout(copyId, uid); // 1 active loan
    raw.prepare("INSERT INTO borrowing_records (copy_id, user_id, due_date, returned_at) VALUES (?, ?, datetime('now','-1 day'), datetime('now'))").run(copyId, uid);
    const lastBorrow = raw.prepare('SELECT id FROM borrowing_records ORDER BY id DESC LIMIT 1').get() as { id: number };
    raw.prepare('INSERT INTO fines (borrowing_id, amount, paid) VALUES (?, 12, 0)').run(lastBorrow.id);

    const p = await db.adminResolvePatron(iid, 'CARD-1');
    expect(p).not.toBeNull();
    expect(p!.userId).toBe(uid);
    expect(p!.is_active).toBe(true);
    expect(p!.active_loans).toBe(1);
    expect(p!.unpaid_fines).toBe(12);
  });

  it('returns null for an unknown card', async () => {
    expect(await db.adminResolvePatron(iid, 'NOPE')).toBeNull();
  });

  it('flags an inactive patron (returned, not null)', async () => {
    makeMember('CARD-OFF', 0);
    const p = await db.adminResolvePatron(iid, 'CARD-OFF');
    expect(p).not.toBeNull();
    expect(p!.is_active).toBe(false);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd packages/server && pnpm test deskScan`
Expected: FAIL — `db.adminResolvePatron is not a function`.

- [ ] **Step 5: Implement `adminResolvePatron`**

In `packages/server/src/adapter/sqlite.ts`, add to the `adapterImpl` object literal (near `adminResolvePolicy`):

```ts
    async adminResolvePatron(institutionId, idNumber) {
      const u = await db.select({
        id: users.id, name: users.name, user_type: users.user_type, is_active: users.is_active,
      }).from(users)
        .where(and(eq(users.institution_id, institutionId), eq(users.id_number, idNumber)))
        .limit(1).then(r => r[0] ?? null);
      if (!u) return null;
      const activeRow = await db.select({ c: sql<number>`count(*)` }).from(borrowingRecords)
        .where(and(eq(borrowingRecords.user_id, u.id), isNull(borrowingRecords.returned_at)));
      const fineRow = await db.select({ s: sum(fines.amount) }).from(fines)
        .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
        .where(and(eq(borrowingRecords.user_id, u.id), eq(fines.paid, false)));
      return {
        userId: u.id, name: u.name, user_type: u.user_type, is_active: u.is_active,
        active_loans: Number(activeRow[0]?.c ?? 0),
        unpaid_fines: Number(fineRow[0]?.s ?? 0),
      };
    },
```

- [ ] **Step 6: Add the bridge stub**

In `packages/server/src/adapter/bridge.ts`, alongside the other admin stubs, add (matching the existing throw-stub pattern in that file):

```ts
    adminResolvePatron: () => { throw new Error('adminResolvePatron is not supported on mobile'); },
```

- [ ] **Step 7: Add the tRPC procedure**

In `packages/server/src/router/admin/circulation.ts`, inside the `router({ ... })`, add:

```ts
  resolvePatron: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), idNumber: z.string().min(1) }))
    .query(({ input, ctx }) => ctx.db.adminResolvePatron(input.institutionId, input.idNumber)),
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd packages/server && pnpm test deskScan`
Expected: PASS (3 tests).

- [ ] **Step 9: Run full suite + typecheck**

Run: `cd packages/server && pnpm test && pnpm typecheck`
Expected: all PASS, typecheck exit 0.

- [ ] **Step 10: Commit**

```bash
git add packages/types/src/index.ts packages/server/src/adapter/types.ts packages/server/src/adapter/sqlite.ts packages/server/src/adapter/bridge.ts packages/server/src/router/admin/circulation.ts packages/server/src/adapter/sqlite.deskScan.test.ts
git commit -m "feat(circulation): scan result types + adminResolvePatron endpoint"
```

---

### Task 2: Extract `checkoutCopy` / `returnBorrowing` closures (DRY refactor)

**Files:**
- Modify: `packages/server/src/adapter/sqlite.ts`

**Interfaces:**
- Consumes: existing `resolveForResource`, `fetchCheckoutCounters`, `evaluateCheckout`, `PolicyError`, schema tables, `db`, `rawDb`.
- Produces: closures `checkoutCopy(copyId, userId, opts?): Promise<{ borrowingId: number }>` and `returnBorrowing(borrowingId, condition): Promise<{ id: number; borrowing_id: number; amount: number; paid: boolean; paid_at: null } | null>`. `adminCheckout` and `adminReturn` delegate to them (behavior unchanged).

This is a pure refactor: the existing `loanRules`/checkout/return tests must stay green with no behavior change.

- [ ] **Step 1: Add the two closures**

In `packages/server/src/adapter/sqlite.ts`, find where the other closures are defined (e.g. `resolveForResource`, `fetchCheckoutCounters`) and add — using the current bodies of `adminCheckout` and `adminReturn` verbatim, just as standalone closures:

```ts
  async function checkoutCopy(
    copyId: number,
    userId: number,
    opts?: { override?: boolean; actedByUserId?: number; institutionId?: number; note?: string },
  ): Promise<{ borrowingId: number }> {
    const copyInfo = await db.select({ resource_id: resourceCopies.resource_id, institution_id: resources.institution_id, material_type: resources.material_type })
      .from(resourceCopies)
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(eq(resourceCopies.id, copyId)).limit(1).then(r => r[0] ?? null);
    if (!copyInfo) throw new Error('This copy is no longer available. Please pick another.');

    const policy = await resolveForResource(copyInfo.institution_id, userId, copyInfo.resource_id);
    const counters = await fetchCheckoutCounters(userId, copyInfo.material_type);
    const violations = evaluateCheckout(policy, counters);
    if (violations.length > 0 && !opts?.override) throw new PolicyError(violations);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + policy.loan_period_days);

    const doCheckout = rawDb.transaction(() => {
      const claimed = rawDb.prepare(
        `UPDATE resource_copies SET status = 'borrowed' WHERE id = ? AND status = 'available' AND condition != 'lost' RETURNING id, resource_id`,
      ).all(copyId) as { id: number; resource_id: number }[];
      if (claimed.length === 0) throw new Error('This copy is no longer available. Please pick another.');

      if (violations.length > 0 && opts?.override) {
        const insertOverride = rawDb.prepare(
          `INSERT INTO circ_overrides (institution_id, acted_by_user_id, patron_user_id, copy_id, reason_code, note) VALUES (?, ?, ?, ?, ?, ?)`,
        );
        for (const v of violations) {
          insertOverride.run(opts.institutionId ?? copyInfo.institution_id, opts.actedByUserId ?? userId, userId, copyId, v.reason_code, opts.note ?? null);
        }
      }

      const borrowResult = rawDb.prepare(
        `INSERT INTO borrowing_records (copy_id, user_id, due_date) VALUES (?, ?, ?) RETURNING id`,
      ).get(copyId, userId, dueDate.toISOString()) as { id: number };
      rawDb.prepare(`UPDATE resources SET available_copies = available_copies - 1 WHERE id = ?`).run(claimed[0].resource_id);
      rawDb.prepare(`UPDATE reservations SET status = 'fulfilled' WHERE resource_id = ? AND user_id = ? AND status = 'active'`).run(claimed[0].resource_id, userId);
      return { borrowingId: borrowResult.id };
    });
    return doCheckout();
  }
```

Then add `returnBorrowing` as a closure holding the current `adminReturn` body verbatim:

```ts
  async function returnBorrowing(
    borrowingId: number,
    condition: string,
  ): Promise<{ id: number; borrowing_id: number; amount: number; paid: boolean; paid_at: null } | null> {
    const record = await db.select().from(borrowingRecords)
      .where(eq(borrowingRecords.id, borrowingId)).limit(1).then(r => r[0] ?? null);
    if (!record) throw new Error('Borrowing record not found');

    const now = new Date();
    const due = new Date(record.due_date);
    let fineAmount = 0;

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

    const typedCondition = (condition ?? 'good') as 'good' | 'damaged' | 'lost';
    const doReturn = rawDb.transaction(() => {
      rawDb.prepare(`UPDATE borrowing_records SET returned_at = ?, fine_amount = ? WHERE id = ?`).run(now.toISOString(), fineAmount, borrowingId);
      rawDb.prepare(`UPDATE resource_copies SET status = 'available', condition = ? WHERE id = ?`).run(typedCondition, record.copy_id);
      if (typedCondition !== 'lost') {
        const copy = rawDb.prepare(`SELECT resource_id FROM resource_copies WHERE id = ? LIMIT 1`).get(record.copy_id) as { resource_id: number } | undefined;
        if (copy) rawDb.prepare(`UPDATE resources SET available_copies = available_copies + 1 WHERE id = ?`).run(copy.resource_id);
      }
      if (fineAmount > 0) {
        const fineResult = rawDb.prepare(`INSERT INTO fines (borrowing_id, amount) VALUES (?, ?) RETURNING id`).get(borrowingId, fineAmount) as { id: number };
        return { id: fineResult.id, borrowing_id: borrowingId, amount: fineAmount, paid: false, paid_at: null };
      }
      return null;
    });
    return doReturn();
  }
```

- [ ] **Step 2: Delegate from the adapter methods**

Replace the `adminCheckout` method body with a one-line delegation:

```ts
    async adminCheckout(copyId, userId, opts) {
      return checkoutCopy(copyId, userId, opts);
    },
```

Replace the `adminReturn` method body with:

```ts
    async adminReturn(borrowingId, condition) {
      return returnBorrowing(borrowingId, condition);
    },
```

- [ ] **Step 3: Run the full suite (no behavior change expected)**

Run: `cd packages/server && pnpm test && pnpm typecheck`
Expected: all PASS (same count as before this task), typecheck exit 0. The existing `sqlite.loanRules.test.ts` checkout/return/override/fine tests exercise the moved logic.

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/adapter/sqlite.ts
git commit -m "refactor(circulation): extract checkoutCopy/returnBorrowing closures"
```

---

### Task 3: `adminCheckoutByAccession` + endpoint

**Files:**
- Modify: `packages/server/src/adapter/sqlite.ts`
- Modify: `packages/server/src/adapter/types.ts`
- Modify: `packages/server/src/adapter/bridge.ts`
- Modify: `packages/server/src/router/admin/circulation.ts`
- Test: `packages/server/src/adapter/sqlite.deskScan.test.ts` (extend)

**Interfaces:**
- Consumes: `checkoutCopy` (Task 2), `PolicyError`, schema tables, `CheckoutScanResult` type.
- Produces:
  - closure `resolveCopyByAccession(institutionId, accession): Promise<{ status: 'ok'; copyId: number; resourceId: number; title: string } | { status: 'unknown' } | { status: 'ambiguous' }>`.
  - `DbAdapter.adminCheckoutByAccession(institutionId, userId, accession, opts?): Promise<CheckoutScanResult>`.
  - tRPC `admin.circulation.checkoutByAccession` (mutation).

- [ ] **Step 1: Add the interface method**

In `packages/server/src/adapter/types.ts`, under the circulation group:

```ts
  adminCheckoutByAccession(
    institutionId: number,
    userId: number,
    accession: string,
    opts?: { override?: boolean; actedByUserId?: number; institutionId?: number; note?: string },
  ): Promise<import('@bookleaf/types').CheckoutScanResult>;
```

- [ ] **Step 2: Write the failing tests**

Append to `packages/server/src/adapter/sqlite.deskScan.test.ts`:

```ts
import { PolicyError } from './loanPolicy';

describe('adminCheckoutByAccession', () => {
  it('checks out a resolvable accession and returns title + due_date', async () => {
    const uid = makeMember('C-CO-1');
    makeCopy('ACC-CO-1');
    const res = await db.adminCheckoutByAccession(iid, uid, 'ACC-CO-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.title).toBe('T');
      expect(typeof res.due_date).toBe('string');
      expect(res.copyId).toBeGreaterThan(0);
    }
  });

  it('returns unknown for an unrecognised accession', async () => {
    const uid = makeMember('C-CO-2');
    const res = await db.adminCheckoutByAccession(iid, uid, 'NOPE');
    expect(res).toEqual({ ok: false, reason: 'unknown', accession: 'NOPE' });
  });

  it('returns ambiguous when two copies share an accession', async () => {
    const uid = makeMember('C-CO-3');
    makeCopy('DUP'); makeCopy('DUP');
    const res = await db.adminCheckoutByAccession(iid, uid, 'DUP');
    expect(res).toEqual({ ok: false, reason: 'ambiguous', accession: 'DUP' });
  });

  it('returns unavailable for an already-borrowed copy', async () => {
    const a = makeMember('C-CO-4a'); const b = makeMember('C-CO-4b');
    makeCopy('ACC-CO-4');
    await db.adminCheckoutByAccession(iid, a, 'ACC-CO-4');
    const res = await db.adminCheckoutByAccession(iid, b, 'ACC-CO-4');
    expect(res).toEqual({ ok: false, reason: 'unavailable', accession: 'ACC-CO-4' });
  });

  it('surfaces a policy block as reason:policy with violations', async () => {
    raw.prepare("INSERT INTO category_limits (institution_id, user_type, overall_limit, fines_block_threshold) VALUES (?, 'student', 1, 0)").run(iid);
    const uid = makeMember('C-CO-5');
    makeCopy('ACC-CO-5a'); makeCopy('ACC-CO-5b');
    await db.adminCheckoutByAccession(iid, uid, 'ACC-CO-5a'); // consumes limit of 1
    const res = await db.adminCheckoutByAccession(iid, uid, 'ACC-CO-5b');
    expect(res.ok).toBe(false);
    if (!res.ok && res.reason === 'policy') {
      expect(res.violations.map(v => v.reason_code)).toContain('over_overall_limit');
    } else { throw new Error('expected policy block'); }
  });

  it('override proceeds and checks out', async () => {
    raw.prepare("INSERT INTO category_limits (institution_id, user_type, overall_limit, fines_block_threshold) VALUES (?, 'student', 1, 0)").run(iid);
    const uid = makeMember('C-CO-6');
    makeCopy('ACC-CO-6a'); makeCopy('ACC-CO-6b');
    await db.adminCheckoutByAccession(iid, uid, 'ACC-CO-6a');
    const res = await db.adminCheckoutByAccession(iid, uid, 'ACC-CO-6b', { override: true, actedByUserId: uid, institutionId: iid, note: 'ok' });
    expect(res.ok).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd packages/server && pnpm test deskScan`
Expected: FAIL — `db.adminCheckoutByAccession is not a function`.

- [ ] **Step 4: Implement the resolver closure + method**

In `sqlite.ts`, add the resolver closure near the other closures:

```ts
  async function resolveCopyByAccession(institutionId: number, accession: string) {
    const rows = await db.select({ id: resourceCopies.id, resource_id: resourceCopies.resource_id, title: resources.title })
      .from(resourceCopies)
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(and(eq(resources.institution_id, institutionId), eq(resourceCopies.accession_number, accession)));
    if (rows.length === 0) return { status: 'unknown' as const };
    if (rows.length > 1) return { status: 'ambiguous' as const };
    return { status: 'ok' as const, copyId: rows[0].id, resourceId: rows[0].resource_id, title: rows[0].title };
  }
```

Add to `adapterImpl`:

```ts
    async adminCheckoutByAccession(institutionId, userId, accession, opts) {
      const resolved = await resolveCopyByAccession(institutionId, accession);
      if (resolved.status === 'unknown') return { ok: false as const, reason: 'unknown' as const, accession };
      if (resolved.status === 'ambiguous') return { ok: false as const, reason: 'ambiguous' as const, accession };
      try {
        const { borrowingId } = await checkoutCopy(resolved.copyId, userId, opts);
        const row = await db.select({ due_date: borrowingRecords.due_date })
          .from(borrowingRecords).where(eq(borrowingRecords.id, borrowingId)).limit(1).then(r => r[0]!);
        return { ok: true as const, copyId: resolved.copyId, title: resolved.title, due_date: row.due_date };
      } catch (e) {
        if (e instanceof PolicyError) return { ok: false as const, reason: 'policy' as const, violations: e.violations };
        return { ok: false as const, reason: 'unavailable' as const, accession };
      }
    },
```

- [ ] **Step 5: Add the bridge stub**

In `bridge.ts`:

```ts
    adminCheckoutByAccession: () => { throw new Error('adminCheckoutByAccession is not supported on mobile'); },
```

- [ ] **Step 6: Add the tRPC procedure**

In `router/admin/circulation.ts`, inside `router({ ... })`:

```ts
  checkoutByAccession: librarianProcedure
    .input(z.object({
      userId: z.number().int(),
      accession: z.string().min(1),
      override: z.boolean().optional(),
      note: z.string().optional(),
    }))
    .mutation(({ input, ctx }) => ctx.db.adminCheckoutByAccession(
      ctx.principal.institution_id,
      input.userId,
      input.accession,
      { override: input.override, note: input.note, actedByUserId: ctx.principal.user_id, institutionId: ctx.principal.institution_id },
    )),
```

- [ ] **Step 7: Run focused + full suite + typecheck**

Run: `cd packages/server && pnpm test deskScan && pnpm test && pnpm typecheck`
Expected: all PASS, typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/adapter/sqlite.ts packages/server/src/adapter/types.ts packages/server/src/adapter/bridge.ts packages/server/src/router/admin/circulation.ts packages/server/src/adapter/sqlite.deskScan.test.ts
git commit -m "feat(circulation): checkout-by-accession scan endpoint"
```

---

### Task 4: `adminReturnByAccession` + endpoint

**Files:**
- Modify: `packages/server/src/adapter/sqlite.ts`
- Modify: `packages/server/src/adapter/types.ts`
- Modify: `packages/server/src/adapter/bridge.ts`
- Modify: `packages/server/src/router/admin/circulation.ts`
- Test: `packages/server/src/adapter/sqlite.deskScan.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveCopyByAccession` (Task 3), `returnBorrowing` (Task 2), schema tables, `ReturnScanResult`.
- Produces:
  - `DbAdapter.adminReturnByAccession(institutionId, accession): Promise<ReturnScanResult>`.
  - tRPC `admin.circulation.returnByAccession` (mutation).

- [ ] **Step 1: Add the interface method**

In `types.ts`:

```ts
  adminReturnByAccession(
    institutionId: number,
    accession: string,
  ): Promise<import('@bookleaf/types').ReturnScanResult>;
```

- [ ] **Step 2: Write the failing tests**

Append to `sqlite.deskScan.test.ts`:

```ts
describe('adminReturnByAccession', () => {
  it('returns an active loan and reports patron + zero fine when on time', async () => {
    const uid = makeMember('R-1');
    makeCopy('ACC-R-1');
    await db.adminCheckoutByAccession(iid, uid, 'ACC-R-1');
    const res = await db.adminReturnByAccession(iid, 'ACC-R-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.title).toBe('T');
      expect(res.patron_name).toBe('Pat');
      expect(res.fine_amount).toBe(0);
    }
  });

  it('surfaces a fine for an overdue loan', async () => {
    raw.prepare("INSERT INTO loan_rules (institution_id, user_type, material_type, loan_period_days, max_renewals, fine_per_day, grace_period_days) VALUES (?, 'student', 'BOOK', 7, 2, 5, 0)").run(iid);
    const uid = makeMember('R-2');
    const { copyId } = makeCopy('ACC-R-2');
    await db.adminCheckoutByAccession(iid, uid, 'ACC-R-2');
    raw.prepare("UPDATE borrowing_records SET due_date = datetime('now','-3 days') WHERE copy_id = ? AND returned_at IS NULL").run(copyId);
    const res = await db.adminReturnByAccession(iid, 'ACC-R-2');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.fine_amount).toBe(15); // 3 days × ₱5
  });

  it('returns no_active_loan when the copy is not currently out', async () => {
    makeCopy('ACC-R-3');
    const res = await db.adminReturnByAccession(iid, 'ACC-R-3');
    expect(res).toEqual({ ok: false, reason: 'no_active_loan', accession: 'ACC-R-3' });
  });

  it('returns unknown for an unrecognised accession', async () => {
    const res = await db.adminReturnByAccession(iid, 'NOPE');
    expect(res).toEqual({ ok: false, reason: 'unknown', accession: 'NOPE' });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd packages/server && pnpm test deskScan`
Expected: FAIL — `db.adminReturnByAccession is not a function`.

- [ ] **Step 4: Implement the method**

Add to `adapterImpl`:

```ts
    async adminReturnByAccession(institutionId, accession) {
      const resolved = await resolveCopyByAccession(institutionId, accession);
      if (resolved.status === 'unknown') return { ok: false as const, reason: 'unknown' as const, accession };
      if (resolved.status === 'ambiguous') return { ok: false as const, reason: 'ambiguous' as const, accession };

      const active = await db.select({ id: borrowingRecords.id, patron_name: users.name })
        .from(borrowingRecords)
        .innerJoin(users, eq(borrowingRecords.user_id, users.id))
        .where(and(eq(borrowingRecords.copy_id, resolved.copyId), isNull(borrowingRecords.returned_at)))
        .limit(1).then(r => r[0] ?? null);
      if (!active) return { ok: false as const, reason: 'no_active_loan' as const, accession };

      const fine = await returnBorrowing(active.id, 'good');
      return { ok: true as const, title: resolved.title, patron_name: active.patron_name, fine_amount: fine?.amount ?? 0 };
    },
```

- [ ] **Step 5: Add the bridge stub**

In `bridge.ts`:

```ts
    adminReturnByAccession: () => { throw new Error('adminReturnByAccession is not supported on mobile'); },
```

- [ ] **Step 6: Add the tRPC procedure**

In `router/admin/circulation.ts`:

```ts
  returnByAccession: librarianProcedure
    .input(z.object({ accession: z.string().min(1) }))
    .mutation(({ input, ctx }) => ctx.db.adminReturnByAccession(ctx.principal.institution_id, input.accession)),
```

- [ ] **Step 7: Run focused + full suite + typecheck**

Run: `cd packages/server && pnpm test deskScan && pnpm test && pnpm typecheck`
Expected: all PASS, typecheck exit 0.

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/adapter/sqlite.ts packages/server/src/adapter/types.ts packages/server/src/adapter/bridge.ts packages/server/src/router/admin/circulation.ts packages/server/src/adapter/sqlite.deskScan.test.ts
git commit -m "feat(circulation): return-by-accession scan endpoint"
```

---

### Task 5: Desktop Circulation page — scan sessions

**Files:**
- Modify (rewrite): `apps/desktop/src/pages/Circulation.tsx`

**Interfaces:**
- Consumes: `trpc.admin.circulation.{resolvePatron, checkoutByAccession, returnByAccession, activeBorrows, overdueBorrows, return, payFine}`; `@bookleaf/types` `PatronSummary`/`CheckoutScanResult`/`ReturnScanResult`; `@bookleaf/ui` components.
- Produces: the rebuilt desk page (checkout scan session + return scan session + retained tables).

> **Testing note:** no page-test harness — verification is `pnpm exec tsc --noEmit` clean for this file + manual smoke. Reuse the Inventory keyboard-wedge pattern: a `ref`'d `<Input>`, `onKeyDown` Enter → submit → clear → re-focus.

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `apps/desktop/src/pages/Circulation.tsx` with:

```tsx
import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@bookleaf/ui/components/button';
import { Input } from '@bookleaf/ui/components/input';
import type { PatronSummary, CheckoutScanResult, ReturnScanResult } from '@bookleaf/types';

type Borrow = { id: number; user_name: string; user_id_number: string; book_title: string; borrowed_at: string; due_date: string };
type CheckoutLine = { key: number; label: string; ok: boolean; blocked?: Extract<CheckoutScanResult, { reason: 'policy' }>; accession: string };
type ReturnLine = { key: number; label: string; ok: boolean };

export default function Circulation() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const iid = user?.institution_id ?? 1;
  const role = user?.role;
  const canOverride = role === 'admin' || role === 'librarian';

  const [mode, setMode] = useState<'checkout' | 'return'>('checkout');

  // ── Checkout session state ──
  const [patron, setPatron] = useState<PatronSummary | null>(null);
  const [cardInput, setCardInput] = useState('');
  const [cardError, setCardError] = useState<string | null>(null);
  const [accInput, setAccInput] = useState('');
  const [coLines, setCoLines] = useState<CheckoutLine[]>([]);
  const [overrideKey, setOverrideKey] = useState<number | null>(null);
  const [overrideNote, setOverrideNote] = useState('');
  const accRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);

  // ── Return session state ──
  const [retInput, setRetInput] = useState('');
  const [retLines, setRetLines] = useState<ReturnLine[]>([]);
  const retRef = useRef<HTMLInputElement>(null);

  const { data: activeBorrows = [] } = useQuery(trpc.admin.circulation.activeBorrows.queryOptions({ institutionId: iid }));
  const { data: overdueBorrows = [] } = useQuery(trpc.admin.circulation.overdueBorrows.queryOptions({ institutionId: iid }));
  const invalidateTables = () => {
    qc.invalidateQueries({ queryKey: trpc.admin.circulation.activeBorrows.queryKey({ institutionId: iid }) });
    qc.invalidateQueries({ queryKey: trpc.admin.circulation.overdueBorrows.queryKey({ institutionId: iid }) });
  };

  const checkoutMut = useMutation(trpc.admin.circulation.checkoutByAccession.mutationOptions());
  const returnMut = useMutation(trpc.admin.circulation.returnByAccession.mutationOptions());

  let lineKey = 0;
  const nextKey = () => ++lineKey + Date.now();

  // ── Card scan: resolve patron ──
  const onCardScan = async () => {
    const idNumber = cardInput.trim();
    if (!idNumber) return;
    setCardError(null);
    const summary = await qc.fetchQuery(trpc.admin.circulation.resolvePatron.queryOptions({ institutionId: iid, idNumber }));
    if (!summary) { setCardError(`No patron with card “${idNumber}”.`); return; }
    setPatron(summary);
    setCoLines([]);
    setCardInput('');
    setTimeout(() => accRef.current?.focus(), 0);
  };

  // ── Item scan: checkout ──
  const onAccScan = async (accessionRaw: string, override?: { note: string }) => {
    const accession = accessionRaw.trim();
    if (!accession || !patron) return;
    const res = await checkoutMut.mutateAsync({
      userId: patron.userId, accession,
      ...(override ? { override: true, note: override.note } : {}),
    });
    if (res.ok) {
      setCoLines((p) => [{ key: nextKey(), label: `✓ ${res.title} — due ${new Date(res.due_date).toLocaleDateString()}`, ok: true, accession }, ...p]);
    } else if (res.reason === 'policy') {
      const k = nextKey();
      setCoLines((p) => [{ key: k, label: `✗ ${accession}: blocked`, ok: false, blocked: res, accession }, ...p]);
    } else {
      const msg = res.reason === 'unknown' ? 'unknown item' : res.reason === 'ambiguous' ? 'ambiguous accession' : 'unavailable';
      setCoLines((p) => [{ key: nextKey(), label: `✗ ${accession}: ${msg}`, ok: false, accession }, ...p]);
    }
    setAccInput('');
    setOverrideKey(null);
    setOverrideNote('');
    invalidateTables();
    setTimeout(() => accRef.current?.focus(), 0);
  };

  const resetCheckout = () => {
    setPatron(null); setCoLines([]); setAccInput(''); setCardInput(''); setCardError(null);
    setTimeout(() => cardRef.current?.focus(), 0);
  };

  // ── Item scan: return ──
  const onRetScan = async () => {
    const accession = retInput.trim();
    if (!accession) return;
    const res: ReturnScanResult = await returnMut.mutateAsync({ accession });
    if (res.ok) {
      const fine = res.fine_amount > 0 ? ` — fine ₱${res.fine_amount}` : '';
      setRetLines((p) => [{ key: nextKey(), label: `✓ returned: ${res.title} — ${res.patron_name}${fine}`, ok: true }, ...p]);
    } else {
      const msg = res.reason === 'unknown' ? 'unknown item' : res.reason === 'ambiguous' ? 'ambiguous accession' : 'no active loan';
      setRetLines((p) => [{ key: nextKey(), label: `✗ ${accession}: ${msg}`, ok: false }, ...p]);
    }
    setRetInput('');
    invalidateTables();
    setTimeout(() => retRef.current?.focus(), 0);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Circulation</h1>
        <div className="flex gap-1 rounded-md border p-0.5">
          {(['checkout', 'return'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`px-4 py-1.5 text-sm font-medium rounded ${mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              {m === 'checkout' ? 'Checkout' : 'Return'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'checkout' ? (
        <div className="space-y-4">
          {!patron ? (
            <div className="rounded-lg border bg-card p-5 space-y-3 shadow-sm max-w-md">
              <p className="text-sm font-medium">Scan patron card</p>
              <div className="flex gap-2">
                <Input ref={cardRef} autoFocus value={cardInput} onChange={(e) => setCardInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onCardScan()} placeholder="Scan or type card ID…" />
                <Button onClick={onCardScan} disabled={!cardInput.trim()}>Find</Button>
              </div>
              {cardError && <p className="text-xs text-destructive">{cardError}</p>}
            </div>
          ) : (
            <>
              <div className="rounded-lg border bg-card p-4 shadow-sm flex items-center justify-between max-w-2xl">
                <div>
                  <p className="font-semibold">{patron.name} <span className="text-muted-foreground font-normal">· {patron.user_type ?? '—'}</span></p>
                  <p className="text-xs text-muted-foreground">{patron.active_loans} active loan(s) · ₱{patron.unpaid_fines} unpaid {patron.is_active ? '' : '· INACTIVE'}</p>
                </div>
                <Button variant="outline" size="sm" onClick={resetCheckout}>Done / Next patron</Button>
              </div>

              {!patron.is_active ? (
                <p className="text-sm text-destructive">This patron is inactive and cannot borrow.</p>
              ) : (
                <div className="rounded-lg border bg-card p-5 space-y-3 shadow-sm max-w-2xl">
                  <p className="text-sm font-medium">Scan item (accession)</p>
                  <div className="flex gap-2">
                    <Input ref={accRef} autoFocus value={accInput} onChange={(e) => setAccInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onAccScan(accInput)} placeholder="Scan or type accession…" disabled={checkoutMut.isPending} />
                    <Button onClick={() => onAccScan(accInput)} disabled={checkoutMut.isPending || !accInput.trim()}>Check out</Button>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {coLines.map((l) => (
                      <li key={l.key} className={l.ok ? 'text-green-600' : 'text-destructive'}>
                        {l.label}
                        {l.blocked && (
                          <ul className="list-disc pl-5 text-xs text-muted-foreground mt-0.5">
                            {l.blocked.violations.map((v) => <li key={v.reason_code}>{v.message}</li>)}
                            {canOverride && (
                              <li className="list-none mt-1">
                                {overrideKey === l.key ? (
                                  <div className="flex gap-2">
                                    <Input value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} placeholder="Override reason…" className="h-7 text-xs" />
                                    <Button size="sm" className="h-7 text-xs" disabled={!overrideNote.trim()} onClick={() => onAccScan(l.accession, { note: overrideNote.trim() })}>Override</Button>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => { setOverrideKey(l.key); setOverrideNote(''); }}>Override…</Button>
                                )}
                              </li>
                            )}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-5 space-y-3 shadow-sm max-w-2xl">
          <p className="text-sm font-medium">Scan item to return (accession)</p>
          <div className="flex gap-2">
            <Input ref={retRef} autoFocus value={retInput} onChange={(e) => setRetInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onRetScan()} placeholder="Scan or type accession…" disabled={returnMut.isPending} />
            <Button onClick={onRetScan} disabled={returnMut.isPending || !retInput.trim()}>Return</Button>
          </div>
          <ul className="space-y-1 text-sm">
            {retLines.map((l) => <li key={l.key} className={l.ok ? 'text-green-600' : 'text-destructive'}>{l.label}</li>)}
          </ul>
        </div>
      )}

      {/* Reference tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
        {([['Active', activeBorrows], ['Overdue', overdueBorrows]] as const).map(([title, rows]) => (
          <div key={title} className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title} ({(rows as Borrow[]).length})</p>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr>{['Book', 'Patron', 'Due'].map((h) => <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">{h}</th>)}</tr></thead>
                <tbody className="divide-y">
                  {(rows as Borrow[]).length === 0 ? <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">None.</td></tr>
                    : (rows as Borrow[]).map((b) => (
                      <tr key={b.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{b.book_title}</td>
                        <td className="px-3 py-2">{b.user_name}</td>
                        <td className="px-3 py-2">{new Date(b.due_date).toLocaleDateString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/desktop && pnpm exec tsc --noEmit`
Expected: no NEW errors from `Circulation.tsx`. Only the 3 pre-existing errors (`Books.tsx:170`, `Members.tsx:122`, `Settings.tsx:42`) remain. If `Circulation.tsx` reports an error (e.g. a `CheckoutScanResult` discriminant mismatch), fix it before committing.

- [ ] **Step 3: Manual smoke (recommended)**

Build/run the desktop app; in Checkout mode scan a known card (patron panel appears), scan a known accession (green ✓ line, due date), scan an unknown accession (red ✗), and — with an over-limit patron — confirm the inline Override appears for a librarian/admin and completes. Switch to Return mode and scan an out-on-loan accession (green ✓ with patron, fine if overdue) and a not-checked-out accession (red ✗ no active loan).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/pages/Circulation.tsx
git commit -m "feat(desktop): scan-driven circulation desk (checkout + return sessions)"
```

---

## Final verification

- [ ] `cd packages/server && pnpm test` → all PASS (existing + new `deskScan` tests).
- [ ] `cd packages/server && pnpm typecheck` → exit 0.
- [ ] `cd apps/desktop && pnpm exec tsc --noEmit` → only the 3 pre-existing errors; none in `Circulation.tsx`.
- [ ] Confirm `apps/server` is untouched and no migration files were added (no schema change).
