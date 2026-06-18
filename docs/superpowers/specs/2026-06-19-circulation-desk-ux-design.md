# Circulation Desk UX — Design Spec

**Date:** 2026-06-19
**Status:** Approved
**Scope:** Desktop app only (`apps/desktop`). The mobile server app (`apps/server`) must not change. Shared packages (`packages/server`, `packages/types`) may change. **No DB schema changes** — this sub-project is endpoints + UI over existing tables.

## Context

This is **sub-project ② of 5** in the comprehensive circulation update (desktop-only). Decomposition:

1. Loan Policy & Rules Engine *(done — merged to master)*
2. **Circulation Desk UX** *(this spec)*
3. Renewals & Overdues Automation (auto-renewals, batch fines, desktop notifications)
4. Holds & Reservations (queue, pickup locations, expiration)
5. Item Condition Workflows (lost/damaged processing)

② builds directly on ①: it wraps ①'s `adminCheckout` (policy enforcement + logged override) and `adminReturn` (policy-driven fines) behind scan-oriented endpoints so the circulation desk becomes scan-driven.

## Goal

Replace the current bare-bones desk flow — a dialog with two **internal-numeric-ID** inputs (`Copy ID`, `Member ID`) and row-by-row returns — with a real, fast, scan-driven circulation desk: scan a patron card, then scan items that check out immediately; scan items to return them. Covers the original request items: **check-in/check-out, barcode scanning at the desk, express checkout, bulk checkout, bulk return**.

## Current state (what exists today)

- `apps/desktop/src/pages/Circulation.tsx`: checkout is a modal with `Copy ID` + `Member ID (numeric)` number inputs calling `adminCheckout(copyId, userId)`; returns are per-row from the Active/Overdue tables (`adminReturn(borrowingId, 'good')`); a Pay-Fine dialog; and ①'s policy-violation **override dialog**.
- `apps/desktop/src/pages/Inventory.tsx`: the proven **keyboard-wedge scan pattern** — a `ref`'d `<Input>` with `onKeyDown` Enter → submit → clear → re-focus (auto-focus on mount). ② reuses this pattern at the desk. (No hardware SDK; a USB scanner types into the input and sends Enter.)
- Server: `adminCheckout(copyId, userId, opts?)` and `adminReturn(borrowingId, condition)` take **internal PKs**. There is **no** endpoint to resolve a copy by accession, a patron by card number, or an active borrowing by accession. Patrons are resolved elsewhere only by `users.id_number` (gate flow); copies carry both `barcode` and `accession_number` (neither uniquely constrained).

## Design decisions (locked during brainstorming)

- **Architecture:** scan-oriented server endpoints that resolve + act in one round-trip, wrapping ①'s primitives (thin desk client). (Rejected: client-side resolve-then-call; a generic resolver.)
- **Scan identifiers:** item = `resource_copies.accession_number`; patron card = `users.id_number`.
- **Workflow shape:** one **unified checkout scan session** (express = scan one; bulk = keep scanning) — not two separate modes.
- **Commit timing:** each scanned item checks out **immediately** on scan; a blocked item appears **inline** with its violations and an inline override (librarian/admin), not a flow-breaking modal.
- **Bulk return:** condition defaults to `good`; damaged/lost handling is sub-project ⑤.
- **No new DB schema.** Accession is resolved with graceful ambiguity handling rather than adding a unique constraint (which could break existing data).

## Accession resolution

Resolve a copy by `resource_copies.accession_number`, scoped to the institution (join `resource_copies → resources` on `resources.institution_id`). Outcomes:

- **0 matches** → `unknown` (item not in catalog / wrong code).
- **exactly 1** → proceed.
- **>1 matches** → `ambiguous` (surface "N copies share this accession — resolve manually"); do not guess.

The same resolution is used for checkout (resolve the copy) and return (resolve the copy, then its active borrowing).

## Server: new endpoints + adapter methods

All under `admin.circulation.*`, `librarianProcedure`, actor/institution from `ctx.principal` (never the request body). Each is a thin wrapper over ① — no duplication of enforcement/fine logic.

### `adminResolvePatron(institutionId, idNumber)`
Returns `{ userId, name, user_type, is_active, active_loans, unpaid_fines } | null`. Drives the patron panel. An **inactive** patron is returned (not null) but flagged so the UI blocks checkout with a clear reason. `active_loans` = count of borrowings with `returned_at IS NULL`; `unpaid_fines` = sum of unpaid `fines.amount` for the patron.

### `adminCheckoutByAccession(institutionId, userId, accession, opts?)`
Resolves the copy by accession; on `unknown`/`ambiguous` returns a structured non-ok outcome; otherwise delegates to ①'s `adminCheckout(copyId, userId, opts)` and returns:
`{ ok: true, copyId, title, due_date } | { ok: false, reason: 'unknown' | 'ambiguous' | 'unavailable', accession } | { ok: false, reason: 'policy', violations }`.
`opts` carries `{ override?, note? }`; `actedByUserId`/`institutionId` are injected from `ctx.principal` by the router, exactly as ①'s checkout does. "Unavailable" covers a copy that resolves but is already borrowed/lost ( that surfaces from ①'s atomic claim).

### `adminReturnByAccession(institutionId, accession)`
Resolves the copy by accession, then its **active** borrowing (`returned_at IS NULL` for that `copy_id`); on `unknown`/`ambiguous`/`no_active_loan` returns a structured non-ok outcome; otherwise delegates to ①'s `adminReturn(borrowingId, 'good')` and returns:
`{ ok: true, title, patron_name, fine_amount } | { ok: false, reason: 'unknown' | 'ambiguous' | 'no_active_loan', accession }`.

The existing `adminCheckout`, `adminReturn`, `payFine`, `activeBorrows`, `overdueBorrows` endpoints are unchanged and remain in use.

## Desktop UI — redesigned Circulation page

Reuses Inventory's keyboard-wedge scan pattern (auto-focus, Enter-to-submit, clear input, re-focus). The page presents two scan sessions plus the existing tables.

### Checkout scan session
1. **Scan patron card** (`id_number`) → `adminResolvePatron`. Shows a **patron panel**: name, `user_type`, active loans, and unpaid fines. If `is_active` is false, the panel shows "inactive — cannot borrow" and the item scanner is disabled.
2. **Scan items** (accession): each scan calls `adminCheckoutByAccession({ userId, accession })` and appends a row to a running list:
   - ✓ `title — due <date>` on success;
   - ✗ `unknown / ambiguous / unavailable` with the scanned code;
   - ✗ **blocked**: lists ①'s violation messages, and for `librarian`/`admin` an **inline override** (reason input + button) that re-submits with `{ override: true, note }`. Non-privileged users see the block without an override.
3. A running count and a **"Next patron / Done"** action resets the session (clears patron + list) for the next person. Express = scan one item then Done; bulk = scan many.

### Return scan session
- **Scan items** (accession): each scan calls `adminReturnByAccession({ accession })` and appends a row:
  - ✓ `returned: title — <patron> — ₱<fine>` (fine shown when > 0);
  - ✗ `no active loan / unknown / ambiguous` with the scanned code.
- Condition is fixed to `good` for ② (damaged/lost is ⑤).

### Retained / superseded
The existing **Active / Overdue** tables and the manual **Return** and **Pay Fine** actions stay for reference and exception handling. **Superseded and removed:** the modal numeric-ID checkout *and* its separate policy-violation override dialog — both are replaced by the checkout scan session, where policy blocks and the librarian/admin override are handled **inline** per scanned item (reusing ①'s violation messages and override call).

## Testing

- **Server** (adapter integration tests, the established `:memory:` style in `packages/server/src/adapter/`):
  - `adminResolvePatron`: found (correct counts/fines), not found → null, inactive flagged.
  - `adminCheckoutByAccession`: resolves and checks out (returns title + due_date); `unknown` accession; `ambiguous` (two copies same accession); `unavailable` (already-borrowed copy); delegates a policy block (returns `reason:'policy'` + violations); override proceeds and writes a `circ_overrides` row (via ①).
  - `adminReturnByAccession`: resolves the active loan and returns it (surfaces fine when overdue); `no_active_loan` (copy not currently out); `unknown`; `ambiguous`.
- **Desktop UI:** `tsc --noEmit` clean for the new/changed files; manual smoke (no page-test harness in the project). Note the 3 pre-existing desktop `tsc` errors in `Books.tsx`/`Members.tsx`/`Settings.tsx` are unrelated and out of scope.

## Out of scope for ② (later sub-projects)

- Damaged/lost condition handling and lost-item processing (⑤).
- Auto-renewals, batch/scheduled fine calculation, desktop due/overdue/hold-ready notifications (③).
- Holds queue, pickup locations, reservation expiration (④).
- RFID, SMS/email, multi-branch, self-service kiosk, remote/offline circulation (dropped during ①'s brainstorming).
- Any change to `apps/server` (mobile) or the DB schema.
