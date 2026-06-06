# Phase 4b — Desktop UI: Reservations, Reports, Gate, Inventory

**Goal:** Add four new pages to the Bookleaf desktop librarian UI.  
**Branch:** `feat-desktop-ui`  
**Patterns to follow:** Same as Phase 4a — `useTRPC()` + `useQuery`/`useMutation`, TanStack Table, shadcn/ui, react-hook-form + zod.

---

## Data shapes (from adapter/sqlite.ts)

### `admin.circulation.pendingReservations`
```ts
{ id, resource_id, user_id, reserved_at, book_title, user_name, user_id_number }[]
```

### `admin.reports.circulation`
```ts
{
  overview: { total_borrows, currently_borrowed, overdue, returned, active_borrowers },
  monthly_trends: { month, borrows, returns }[],   // 12 months
  top_borrowers:  { user_name, id_number, total, active }[],  // 10
  most_borrowed:  { title, author, borrow_count }[],           // 10
}
```

### `admin.reports.collection`
```ts
{
  overview: { total_titles, total_copies, available_copies, borrowed_copies,
               damaged_copies, lost_copies, registered_members, copies_per_member },
  by_material_type: { material_type, titles, copies }[],
  by_year:          { bucket, count }[],
  condition_summary:{ condition, count }[],
}
```

### `admin.reports.fines`
```ts
{
  summary: { total_fines, total_collected, total_pending, fine_count, paid_count, unpaid_count },
  monthly_collection: { month, collected }[],   // 6 months
  top_debtors:        { user_name, id_number, total, pending }[],  // 10
  details:            { id, user_name, id_number, book_title, amount, paid, borrowed_at, returned_at }[], // 50
}
```

### `admin.reports.patron`
```ts
{
  overview: { total_members, active_members, inactive_members, total_staff,
               active_borrowers, never_borrowed },
  by_type:             { user_type, count, active }[],
  by_department:       { department, count, active_borrowers }[],
  monthly_registrations: { month, count }[],   // 6 months
  monthly_attendance:    { month, visitors, visits }[],  // 6 months
}
```

### `admin.gate.recentLogs` (NEW — needs backend addition)
```ts
{ id, user_name, user_id_number, direction, method, logged_at }[]
```

### `admin.inventory.activeSession`
```ts
{ id, institution_id, status, started_at, completed_at } | null
```

### `admin.inventory.finishSession` return
```ts
{
  summary: { total_scanned, unique_isbns_scanned },
  discrepancies: {
    ghost_copies:    { isbn, title, available_copies, scan_count }[],
    phantom_returns: { isbn, title, copies_borrowed, scan_count }[],
    extra_copies:    { isbn, title, total_copies, scan_count }[],
    unknown_scans:   { isbn, scan_count }[],
  }
}
```

---

## File map

```
packages/server/src/
├── adapter/types.ts                    ← ADD adminGateRecentLogs
├── adapter/sqlite.ts                   ← IMPLEMENT adminGateRecentLogs
└── router/admin/gate.ts                ← NEW admin gate router
└── router/admin/index.ts               ← ADD gate router

apps/desktop/
├── package.json                        ← ADD react-qr-code
└── src/
    ├── App.tsx                         ← ADD 4 new routes
    ├── components/layout/
    │   ├── Sidebar.tsx                 ← ADD 4 nav items
    │   └── TitleBar.tsx                ← ADD route titles for new pages
    └── pages/
        ├── Reservations.tsx            ← NEW
        ├── Reports.tsx                 ← NEW
        ├── Gate.tsx                    ← NEW
        └── Inventory.tsx               ← NEW
```

---

## Task 1: Backend — admin gate logs + rebuild

### Step 1: Add `adminGateRecentLogs` to `packages/server/src/adapter/types.ts`
Add method signature:
```ts
adminGateRecentLogs(institutionId: number, limit?: number): Promise<{
  id: number; user_name: string; user_id_number: string;
  direction: string; method: string; logged_at: string;
}[]>;
```

### Step 2: Implement in `packages/server/src/adapter/sqlite.ts`
```ts
async adminGateRecentLogs(institutionId, limit = 50) {
  return db.select({
    id: gateLogs.id,
    user_name: users.name,
    user_id_number: users.id_number,
    direction: gateLogs.direction,
    method: gateLogs.method,
    logged_at: gateLogs.logged_at,
  })
    .from(gateLogs)
    .innerJoin(users, eq(gateLogs.user_id, users.id))
    .where(eq(gateLogs.institution_id, institutionId))
    .orderBy(desc(gateLogs.logged_at))
    .limit(limit);
}
```

### Step 3: Create `packages/server/src/router/admin/gate.ts`
```ts
import { z } from 'zod';
import { router, librarianProcedure } from '../../trpc';

export const adminGateRouter = router({
  recentLogs: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), limit: z.number().int().max(100).default(50) }))
    .query(({ input, ctx }) => ctx.db.adminGateRecentLogs(input.institutionId, input.limit)),
});
```

### Step 4: Mount in `packages/server/src/router/admin/index.ts`
Import and add `gate: adminGateRouter` to the admin router.

### Step 5: Rebuild and repackage the server binary
```powershell
pnpm --filter @bookleaf/server build:desktop
# pkg step (see Phase 4a plan for full command)
# copy to apps/desktop/src-tauri/binaries/
# Unblock-File the new exe
```

---

## Task 2: Frontend scaffold — routes + sidebar + nav titles

### Step 1: Install `react-qr-code` in apps/desktop
```powershell
pnpm --filter @bookleaf/desktop-app add react-qr-code
```

### Step 2: Update `apps/desktop/src/App.tsx`
Add imports and routes for the four new pages:
```ts
import Reservations from '@/pages/Reservations';
import Reports      from '@/pages/Reports';
import Gate         from '@/pages/Gate';
import Inventory    from '@/pages/Inventory';

// inside children array:
{ path: 'reservations', element: <Reservations /> },
{ path: 'reports',      element: <Reports /> },
{ path: 'gate',         element: <Gate /> },
{ path: 'inventory',    element: <Inventory /> },
```

### Step 3: Update `apps/desktop/src/components/layout/Sidebar.tsx`
Add 4 nav items:
```ts
import { BookMarked, BarChart2, DoorOpen, ClipboardList } from 'lucide-react';

{ to: '/reservations', icon: BookMarked,    label: 'Reservations' },
{ to: '/reports',      icon: BarChart2,     label: 'Reports' },
{ to: '/gate',         icon: DoorOpen,      label: 'Gate' },
{ to: '/inventory',    icon: ClipboardList, label: 'Inventory' },
```

### Step 4: Update `ROUTE_TITLES` in `TitleBar.tsx`
```ts
'/reservations': 'Reservations',
'/reports':      'Reports',
'/gate':         'Gate',
'/inventory':    'Inventory',
```

---

## Task 3: Reservations page

**File:** `apps/desktop/src/pages/Reservations.tsx`

- `useQuery(trpc.admin.circulation.pendingReservations.queryOptions({ institutionId }))`
- TanStack Table columns: Book Title | Member | ID Number | Reserved At | Actions
- "Cancel" button per row → `useMutation(trpc.admin.circulation.cancelReservation...)` → invalidate query
- Empty state: "No pending reservations"

```ts
type Reservation = {
  id: number; book_title: string; user_name: string;
  user_id_number: string; reserved_at: string;
};
```

---

## Task 4: Reports page

**File:** `apps/desktop/src/pages/Reports.tsx`

- 4 tabs: Circulation | Collection | Fines | Patron
- Each tab fetches its own report query (lazy — only fetches when tab is active using `enabled` flag)
- No charts — stat cards + simple tables

### Circulation tab
- Stat cards: Total Borrows | Currently Borrowed | Overdue | Returned | Active Borrowers
- Table: Top 10 Borrowers (name, ID, total, active)
- Table: Top 10 Most Borrowed Books (title, author, count)

### Collection tab
- Stat cards: Total Titles | Total Copies | Available | Borrowed | Damaged | Lost
- Table: By Material Type (type, titles, copies)
- Table: By Publication Year (bucket, count)

### Fines tab
- Stat cards: Total Fines (₱) | Collected | Pending | Paid Count | Unpaid Count
- Table: Top 10 Debtors (name, ID, total, pending)
- Recent 20 fine records table

### Patron tab
- Stat cards: Total Members | Active | Inactive | Active Borrowers | Never Borrowed
- Table: By Type (user_type, count, active)
- Table: By Department (department, count, active_borrowers)

---

## Task 5: Gate page

**File:** `apps/desktop/src/pages/Gate.tsx`

### Left panel — QR code
- Fetches server URL from `GET /info` (already used in TitleBar)
- Renders `<QRCode value={serverUrl} size={200} />` using `react-qr-code`
- Label: "Scan to connect" + the raw URL beneath
- Refresh/copy URL button

### Right panel — Recent gate activity
- `useQuery(trpc.admin.gate.recentLogs.queryOptions({ institutionId, limit: 50 }))` with `refetchInterval: 10_000`
- Table: Member | ID | Direction (In/Out badge) | Method | Time
- Direction badge: green "IN" / amber "OUT"
- Auto-scrolls to newest entry

---

## Task 6: Inventory page

**File:** `apps/desktop/src/pages/Inventory.tsx`

State machine: `idle` → `active` → `finished` (discrepancy report)

### Idle state (no active session)
- Message: "No active inventory session"
- "Start Inventory Session" button → `useMutation(trpc.admin.inventory.startSession...)`

### Active state (session in progress)
- Session info: ID, started at
- Scan count badge
- Text input for ISBN/barcode (auto-focus, clears on submit)
- Submit → `useMutation(trpc.admin.inventory.scan...)` → shows result toast (found/not found)
- "Finish Session" button (with confirmation AlertDialog) → `useMutation(trpc.admin.inventory.finishSession...)`
- Last 10 scanned entries shown in a mini table

### Finished state (discrepancy report)
- Summary: Total Scanned | Unique ISBNs
- 4 discrepancy tables (ghost copies, phantom returns, extra copies, unknown scans)
- "Start New Session" button to reset

---

## Implementation order

1. Task 1 (backend gate logs + rebuild) — needed for Gate page
2. Task 2 (scaffold: routes + sidebar + titles) — unblocks all pages
3. Task 3 (Reservations) — simplest, good warm-up
4. Task 4 (Reports) — most data, purely read-only
5. Task 5 (Gate) — needs Task 1 done
6. Task 6 (Inventory) — most complex state

---

## Spec coverage

| Feature | Task |
|---|---|
| Pending reservations table + cancel | Task 3 |
| Reports: circulation analytics | Task 4 |
| Reports: collection inventory | Task 4 |
| Reports: fines summary + debtors | Task 4 |
| Reports: patron attendance | Task 4 |
| Gate: server QR code display | Task 5 |
| Gate: live gate log table | Task 5 |
| Inventory: session start/scan/finish | Task 6 |
| Inventory: discrepancy report | Task 6 |
