# Staff Client Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow librarian/admin accounts to manage the library (circulation + cataloging) from any Wi-Fi-connected device in client mode, with PIN sudo gating on edits/deletes.

**Architecture:** New `app/(staff-client)/` Expo Router group; new `/api/staff/*` REST endpoints in `main.js` behind a role-check middleware; PIN elevation state in Zustand store (5-min sudo window); `clientFetch` extended with 403 handling.

**Tech Stack:** Expo Router 6.0.23 · NativeWind 4 · Zustand 5 · React Query 5 · expo-camera · nodejs-mobile-react-native bridge

---

## Task 1: Store — staff elevation state

**Files:**
- Modify: `src/store/appStore.ts`

- [ ] **Step 1: Add staffElevatedUntil field and three actions**

Open `src/store/appStore.ts`. Add the following to the `AppState` interface after `sessionExpiresAt`:

```typescript
staffElevatedUntil: number | null;
elevateStaff: (pin: string) => Promise<void>;
isStaffElevated: () => boolean;
clearStaffElevation: () => void;
```

- [ ] **Step 2: Implement the field and actions in the store**

In the `create<AppState>` call, add after `sessionExpiresAt: null,`:

```typescript
staffElevatedUntil: null,
```

Add after `reset:`:

```typescript
elevateStaff: async (pin: string) => {
  const { serverUrl, sessionToken } = useAppStore.getState();
  const res = await fetch(`${serverUrl}/api/staff/verify-pin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) {
      const mins = Math.ceil((data.retry_after ?? 60) / 60);
      throw new Error(`Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`);
    }
    throw new Error(data.error ?? 'Invalid PIN');
  }
  set({ staffElevatedUntil: Date.now() + 5 * 60 * 1000 });
},

isStaffElevated: () => {
  const { staffElevatedUntil } = useAppStore.getState();
  return staffElevatedUntil !== null && Date.now() < staffElevatedUntil;
},

clearStaffElevation: () => set({ staffElevatedUntil: null }),
```

- [ ] **Step 3: Clear elevation on session clear**

In the existing `clearClientSession` action, add `staffElevatedUntil: null` to the `set(...)` call:

```typescript
clearClientSession: async () => {
  await AsyncStorage.removeItem(CLIENT_SESSION_KEY);
  set({ currentUser: null, sessionToken: null, sessionExpiresAt: null, staffElevatedUntil: null });
},
```

- [ ] **Step 4: Commit**

```bash
git add src/store/appStore.ts
git commit -m "feat(staff-client): add staff elevation state to appStore"
```

---

## Task 2: clientFetch — 403 handling

**Files:**
- Modify: `src/services/clientApi.ts`

- [ ] **Step 1: Add router import and 403 handler**

Replace the entire file with:

```typescript
import { router } from 'expo-router';
import { useAppStore } from '../store/appStore';

/**
 * fetch wrapper for client-mode screens.
 *
 * - Prepends serverUrl from the store when the input is a path.
 * - Sends `Authorization: Bearer <token>` when a session token is present.
 * - On 401: clears session (token expired/invalid).
 * - On 403: clears session and navigates to connect (role downgraded server-side).
 */
export async function clientFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { serverUrl, sessionToken } = useAppStore.getState();
  const url = input.startsWith('http') ? input : `${serverUrl ?? ''}${input}`;

  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (sessionToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${sessionToken}`;
  }
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    try { await useAppStore.getState().clearClientSession(); } catch {}
  }

  if (res.status === 403) {
    try { await useAppStore.getState().clearClientSession(); } catch {}
    router.replace('/(auth)/connect');
  }

  return res;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/clientApi.ts
git commit -m "feat(staff-client): handle 403 in clientFetch — clear session and redirect"
```

---

## Task 3: ApiServer — staff methods

**Files:**
- Modify: `src/services/ApiServer.ts`

Add these methods to the `ApiServer` object (after the existing `logout` method). All imports are already present in the file (`eq`, `and`, `like`, `or`, `isNull` from `drizzle-orm`; `db`; service classes; `verifyPin`).

- [ ] **Step 1: Add missing import**

At the top of `src/services/ApiServer.ts`, add `isNull` to the drizzle-orm import:

```typescript
import { eq, like, or, and, desc, sum, sql, ne, gte, lte, isNull, asc } from 'drizzle-orm';
```

Also add missing schema imports if not present:
```typescript
import { resources, resourceCopies, borrowingRecords, users, fines, reservations } from '../db/schema';
```

- [ ] **Step 2: Add all staff methods**

Append to the `ApiServer` object:

```typescript
  // ─── Staff: PIN verification ─────────────────────────────────────────────

  async staffVerifyPin(userId: number, pin: string): Promise<boolean> {
    const row = await db.select({ pin_hash: users.pin_hash })
      .from(users).where(eq(users.id, userId)).limit(1).then(r => r[0] ?? null);
    if (!row) return false;
    return verifyPin(pin, row.pin_hash);
  },

  // ─── Staff: Copy lookup ───────────────────────────────────────────────────

  async staffCopyByBarcode(barcode: string, institutionId: number) {
    const copy = await db.select({
      id: resourceCopies.id,
      resource_id: resourceCopies.resource_id,
      copy_number: resourceCopies.copy_number,
      barcode: resourceCopies.barcode,
      status: resourceCopies.status,
      condition: resourceCopies.condition,
      accession_number: resourceCopies.accession_number,
      shelf_location: resourceCopies.shelf_location,
      resource_title: resources.title,
      resource_author: resources.author,
    }).from(resourceCopies)
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(and(
        eq(resourceCopies.barcode, barcode),
        eq(resources.institution_id, institutionId),
      ))
      .limit(1)
      .then(r => r[0] ?? null);
    if (!copy) return null;
    let active_borrow = null;
    if (copy.status === 'borrowed') {
      active_borrow = await db.select({
        id: borrowingRecords.id,
        borrowed_at: borrowingRecords.borrowed_at,
        due_date: borrowingRecords.due_date,
        member_name: users.name,
        member_id_number: users.id_number,
        user_id: borrowingRecords.user_id,
      }).from(borrowingRecords)
        .innerJoin(users, eq(borrowingRecords.user_id, users.id))
        .where(and(
          eq(borrowingRecords.copy_id, copy.id),
          isNull(borrowingRecords.returned_at),
        ))
        .limit(1)
        .then(r => r[0] ?? null);
    }
    return { ...copy, active_borrow };
  },

  // ─── Staff: Circulation ───────────────────────────────────────────────────

  async staffCheckout(barcode: string, memberId: number, institutionId: number) {
    const copy = await db.select({
      id: resourceCopies.id,
      status: resourceCopies.status,
      condition: resourceCopies.condition,
    }).from(resourceCopies)
      .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
      .where(and(
        eq(resourceCopies.barcode, barcode),
        eq(resources.institution_id, institutionId),
      ))
      .limit(1)
      .then(r => r[0] ?? null);
    if (!copy) throw new Error('Copy not found for that barcode');
    if (copy.status !== 'available') throw new Error('This copy is not available');
    if (copy.condition === 'lost') throw new Error('This copy is marked lost');
    const borrowingId = await BorrowService.borrowBook(copy.id, memberId);
    return { borrowing_id: borrowingId };
  },

  async staffReturn(borrowingId: number) {
    return BorrowService.returnBook(borrowingId);
  },

  async staffMemberByIdNumber(idNumber: string, institutionId: number) {
    return db.select({
      id: users.id,
      name: users.name,
      id_number: users.id_number,
      role: users.role,
      is_active: users.is_active,
      department: users.department,
      user_type: users.user_type,
    }).from(users)
      .where(and(eq(users.id_number, idNumber), eq(users.institution_id, institutionId)))
      .limit(1)
      .then(r => r[0] ?? null);
  },

  // ─── Staff: Books ─────────────────────────────────────────────────────────

  async staffSearchBooks(institutionId: number, q: string) {
    const query = `%${q}%`;
    return db.select({
      id: resources.id,
      title: resources.title,
      author: resources.author,
      genre: resources.genre,
      year: resources.year,
      material_type: resources.material_type,
      cover_uri: resources.cover_uri,
      available_copies: resources.available_copies,
      total_copies: resources.total_copies,
    }).from(resources)
      .where(and(
        eq(resources.institution_id, institutionId),
        q ? or(
          like(resources.title, query),
          like(resources.author, query),
          like(resources.isbn, query),
          like(resources.genre, query),
        ) : undefined,
      ))
      .orderBy(asc(resources.title))
      .limit(50);
  },

  async staffCreateBook(institutionId: number, data: {
    material_type: string; title: string; author: string;
    isbn?: string | null; publisher?: string | null; year?: number | null;
    genre?: string | null; description?: string | null; is_loanable?: boolean;
  }) {
    return ResourceService.create({
      institution_id: institutionId,
      material_type: data.material_type as any,
      title: data.title,
      author: data.author,
      isbn: data.isbn ?? null,
      publisher: data.publisher ?? null,
      year: data.year ?? null,
      genre: data.genre ?? null,
      description: data.description ?? null,
      cover_uri: null,
      subtitle: null, edition: null, volume: null, issue_number: null,
      series_title: null, doi: null, url: null, duration: null,
      language: null, call_number: null, call_number_type: null,
      content_type: null, media_type: null, carrier_type: null,
      issn: null, subject_headings: null, author_authority_id: null,
      is_loanable: data.is_loanable ?? true,
      loan_period_days: null,
      total_copies: 1,
    }, [{}]);
  },

  async staffUpdateBook(resourceId: number, data: Partial<import('../types').Resource>) {
    return ResourceService.update(resourceId, data);
  },

  async staffDeleteBook(resourceId: number) {
    await db.delete(borrowingRecords)
      .where(
        eq(borrowingRecords.copy_id,
          db.select({ id: resourceCopies.id }).from(resourceCopies)
            .where(eq(resourceCopies.resource_id, resourceId)).limit(1) as any
        )
      ).catch(() => {}); // best-effort cascade
    await db.delete(resourceCopies).where(eq(resourceCopies.resource_id, resourceId));
    await db.delete(resources).where(eq(resources.id, resourceId));
  },

  // ─── Staff: Members ───────────────────────────────────────────────────────

  async staffSearchMembers(institutionId: number, q: string) {
    return q ? UserService.search(institutionId, q) : UserService.getAll(institutionId);
  },

  async staffGetMemberDetail(userId: number) {
    const member = await UserService.getById(userId);
    if (!member) return null;
    const activeBorrows = await BorrowService.getActiveByUser(userId);
    return { member, activeBorrows };
  },

  async staffCreateMember(institutionId: number, data: {
    name: string; id_number: string; role: string; pin: string;
    department?: string; user_type?: string;
  }) {
    return UserService.create({
      institution_id: institutionId,
      name: data.name,
      id_number: data.id_number,
      role: data.role as any,
      pin: data.pin,
      department: data.department,
      user_type: data.user_type as any,
    });
  },

  async staffUpdateMember(userId: number, data: {
    name: string; id_number: string; role: string;
    department?: string; user_type?: string | null;
  }) {
    return UserService.update(userId, {
      name: data.name,
      id_number: data.id_number,
      role: data.role as any,
      department: data.department,
      user_type: data.user_type as any,
    });
  },

  // ─── Staff: Reservations ──────────────────────────────────────────────────

  async staffGetReservations(institutionId: number) {
    return ReservationService.getAll(institutionId);
  },

  async staffApproveReservation(reservationId: number) {
    return ReservationService.fulfill(reservationId);
  },

  async staffCancelReservation(reservationId: number) {
    return ReservationService.cancel(reservationId);
  },
```

- [ ] **Step 3: Commit**

```bash
git add src/services/ApiServer.ts
git commit -m "feat(staff-client): add staff methods to ApiServer"
```

---

## Task 4: ServerBridge — wire up new bridge actions

**Files:**
- Modify: `src/services/ServerBridge.ts`

- [ ] **Step 1: Add new cases to the switch statement**

Inside `handleQuery`, add these cases before the `default:` case:

```typescript
      case 'staffVerifyPin':
        data = await ApiServer.staffVerifyPin(params.userId as number, params.pin as string);
        break;
      case 'staffCopyByBarcode':
        data = await ApiServer.staffCopyByBarcode(
          params.barcode as string,
          requireInstitution(),
        );
        break;
      case 'staffCheckout':
        data = await ApiServer.staffCheckout(
          params.barcode as string,
          params.memberId as number,
          requireInstitution(),
        );
        break;
      case 'staffReturn':
        data = await ApiServer.staffReturn(params.borrowingId as number);
        break;
      case 'staffMemberByIdNumber':
        data = await ApiServer.staffMemberByIdNumber(
          params.idNumber as string,
          requireInstitution(),
        );
        break;
      case 'staffSearchBooks':
        data = await ApiServer.staffSearchBooks(
          requireInstitution(),
          (params.q as string) || '',
        );
        break;
      case 'staffCreateBook':
        data = await ApiServer.staffCreateBook(requireInstitution(), params as any);
        break;
      case 'staffUpdateBook':
        data = await ApiServer.staffUpdateBook(params.resourceId as number, params.data as any);
        break;
      case 'staffDeleteBook':
        data = await ApiServer.staffDeleteBook(params.resourceId as number);
        break;
      case 'staffSearchMembers':
        data = await ApiServer.staffSearchMembers(
          requireInstitution(),
          (params.q as string) || '',
        );
        break;
      case 'staffGetMemberDetail':
        data = await ApiServer.staffGetMemberDetail(params.userId as number);
        break;
      case 'staffCreateMember':
        data = await ApiServer.staffCreateMember(requireInstitution(), params as any);
        break;
      case 'staffUpdateMember':
        data = await ApiServer.staffUpdateMember(params.userId as number, params.data as any);
        break;
      case 'staffGetReservations':
        data = await ApiServer.staffGetReservations(requireInstitution());
        break;
      case 'staffApproveReservation':
        data = await ApiServer.staffApproveReservation(params.reservationId as number);
        break;
      case 'staffCancelReservation':
        data = await ApiServer.staffCancelReservation(params.reservationId as number);
        break;
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ServerBridge.ts
git commit -m "feat(staff-client): wire staff bridge actions in ServerBridge"
```

---

## Task 5: main.js — /api/staff/* routes

**Files:**
- Modify: `nodejs-assets/nodejs-project/main.js`

- [ ] **Step 1: Add staff role middleware helper**

After the `authResolve` function definition (around line 168), add:

```javascript
/**
 * Resolves auth and enforces staff role (admin or librarian).
 * Returns the principal on success, or calls send(res, 403, ...) and returns null.
 */
async function staffResolve(req, res) {
  const principal = await authResolve(req);
  if (!principal || (principal.role !== 'admin' && principal.role !== 'librarian')) {
    send(res, 403, { error: 'forbidden' });
    return null;
  }
  return principal;
}
```

- [ ] **Step 2: Add all /api/staff/* routes**

Before the final `send(res, 404, { error: 'Not found' });` line (near end of the request handler), add:

```javascript
    // ─── /api/staff/* — all require staff role ────────────────────────────

    // POST /api/staff/verify-pin
    if (req.method === 'POST' && path === '/api/staff/verify-pin') {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      const body = await readBody(req);
      let pin;
      try { ({ pin } = JSON.parse(body)); } catch { return send(res, 400, { error: 'Invalid body' }); }
      if (!pin) return send(res, 400, { error: 'pin is required' });
      const rl = rateLimitCheck(`verify:${principal.id_number}`);
      if (rl.blocked) {
        return send(res, 429, { error: 'Too many attempts', retry_after: rl.retryAfter }, { 'Retry-After': String(rl.retryAfter) });
      }
      const ok = await queryRN('staffVerifyPin', { userId: principal.user_id, pin });
      if (!ok) {
        rateLimitRecordFailure(`verify:${principal.id_number}`);
        return send(res, 403, { error: 'Invalid PIN' });
      }
      rateLimitRecordSuccess(`verify:${principal.id_number}`);
      return send(res, 200, { ok: true });
    }

    // GET /api/staff/copies/by-barcode/:barcode
    const copyBarcodeMatch = path.match(/^\/api\/staff\/copies\/by-barcode\/(.+)$/);
    if (req.method === 'GET' && copyBarcodeMatch) {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      const barcode = decodeURIComponent(copyBarcodeMatch[1]);
      const data = await queryRN('staffCopyByBarcode', { barcode });
      if (!data) return send(res, 404, { error: 'Copy not found' });
      return send(res, 200, data);
    }

    // POST /api/staff/borrows — checkout
    if (req.method === 'POST' && path === '/api/staff/borrows') {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      const body = await readBody(req);
      let barcode, memberId;
      try { ({ barcode, memberId } = JSON.parse(body)); } catch { return send(res, 400, { error: 'Invalid body' }); }
      if (!barcode || !memberId) return send(res, 400, { error: 'barcode and memberId are required' });
      try {
        const data = await queryRN('staffCheckout', { barcode, memberId });
        return send(res, 200, data);
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    // POST /api/staff/borrows/:id/return
    const staffReturnMatch = path.match(/^\/api\/staff\/borrows\/(\d+)\/return$/);
    if (req.method === 'POST' && staffReturnMatch) {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      try {
        const data = await queryRN('staffReturn', { borrowingId: parseInt(staffReturnMatch[1]) });
        return send(res, 200, data ?? { ok: true });
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    // GET /api/staff/members/by-id/:idNumber
    const staffMemberByIdMatch = path.match(/^\/api\/staff\/members\/by-id\/(.+)$/);
    if (req.method === 'GET' && staffMemberByIdMatch) {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      const idNumber = decodeURIComponent(staffMemberByIdMatch[1]);
      const data = await queryRN('staffMemberByIdNumber', { idNumber });
      if (!data) return send(res, 404, { error: 'Member not found' });
      return send(res, 200, data);
    }

    // GET /api/staff/books?q=
    if (req.method === 'GET' && path === '/api/staff/books') {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      const data = await queryRN('staffSearchBooks', { q: query.q || '' });
      return send(res, 200, data);
    }

    // POST /api/staff/books
    if (req.method === 'POST' && path === '/api/staff/books') {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      const body = await readBody(req);
      let bookData;
      try { bookData = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid body' }); }
      if (!bookData.title || !bookData.author) return send(res, 400, { error: 'title and author are required' });
      try {
        const id = await queryRN('staffCreateBook', bookData);
        return send(res, 201, { id });
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    // PUT /api/staff/books/:id
    const staffBookPutMatch = path.match(/^\/api\/staff\/books\/(\d+)$/);
    if (req.method === 'PUT' && staffBookPutMatch) {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      const body = await readBody(req);
      let data;
      try { data = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid body' }); }
      try {
        await queryRN('staffUpdateBook', { resourceId: parseInt(staffBookPutMatch[1]), data });
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    // DELETE /api/staff/books/:id
    const staffBookDeleteMatch = path.match(/^\/api\/staff\/books\/(\d+)$/);
    if (req.method === 'DELETE' && staffBookDeleteMatch) {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      try {
        await queryRN('staffDeleteBook', { resourceId: parseInt(staffBookDeleteMatch[1]) });
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    // GET /api/staff/members?q=
    if (req.method === 'GET' && path === '/api/staff/members') {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      const data = await queryRN('staffSearchMembers', { q: query.q || '' });
      return send(res, 200, data);
    }

    // GET /api/staff/members/:id
    const staffMemberGetMatch = path.match(/^\/api\/staff\/members\/(\d+)$/);
    if (req.method === 'GET' && staffMemberGetMatch) {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      const data = await queryRN('staffGetMemberDetail', { userId: parseInt(staffMemberGetMatch[1]) });
      if (!data) return send(res, 404, { error: 'Member not found' });
      return send(res, 200, data);
    }

    // POST /api/staff/members
    if (req.method === 'POST' && path === '/api/staff/members') {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      const body = await readBody(req);
      let memberData;
      try { memberData = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid body' }); }
      if (!memberData.name || !memberData.id_number || !memberData.pin) {
        return send(res, 400, { error: 'name, id_number, and pin are required' });
      }
      try {
        const id = await queryRN('staffCreateMember', memberData);
        return send(res, 201, { id });
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    // PUT /api/staff/members/:id
    const staffMemberPutMatch = path.match(/^\/api\/staff\/members\/(\d+)$/);
    if (req.method === 'PUT' && staffMemberPutMatch) {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      const body = await readBody(req);
      let data;
      try { data = JSON.parse(body); } catch { return send(res, 400, { error: 'Invalid body' }); }
      try {
        await queryRN('staffUpdateMember', { userId: parseInt(staffMemberPutMatch[1]), data });
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    // GET /api/staff/reservations
    if (req.method === 'GET' && path === '/api/staff/reservations') {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      const data = await queryRN('staffGetReservations', {});
      return send(res, 200, data);
    }

    // POST /api/staff/reservations/:id/approve
    const staffResvApproveMatch = path.match(/^\/api\/staff\/reservations\/(\d+)\/approve$/);
    if (req.method === 'POST' && staffResvApproveMatch) {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      try {
        await queryRN('staffApproveReservation', { reservationId: parseInt(staffResvApproveMatch[1]) });
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }

    // POST /api/staff/reservations/:id/cancel
    const staffResvCancelMatch = path.match(/^\/api\/staff\/reservations\/(\d+)\/cancel$/);
    if (req.method === 'POST' && staffResvCancelMatch) {
      const principal = await staffResolve(req, res);
      if (!principal) return;
      try {
        await queryRN('staffCancelReservation', { reservationId: parseInt(staffResvCancelMatch[1]) });
        return send(res, 200, { ok: true });
      } catch (e) {
        return send(res, 400, { error: e.message });
      }
    }
```

- [ ] **Step 3: Commit**

```bash
git add nodejs-assets/nodejs-project/main.js
git commit -m "feat(staff-client): add /api/staff/* routes to Node.js server"
```

---

## Task 6: PinSudoModal component

**Files:**
- Create: `src/components/staff/PinSudoModal.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useAppStore } from '../../store/appStore';

interface PinSudoModalProps {
  visible: boolean;
  onElevated: () => void;
  onDismiss: () => void;
}

/**
 * Prompts for the current user's PIN and calls elevateStaff().
 * On success, calls onElevated() so the caller can proceed with the gated action.
 * Does NOT contain any action logic — screens own their actions.
 */
export function PinSudoModal({ visible, onElevated, onDismiss }: PinSudoModalProps) {
  const elevateStaff = useAppStore((s) => s.elevateStaff);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => { setPin(''); setError(''); setLoading(false); };

  const handleDismiss = () => { reset(); onDismiss(); };

  const handleSubmit = async () => {
    if (!pin.trim()) { setError('Enter your PIN'); return; }
    setLoading(true);
    setError('');
    try {
      await elevateStaff(pin.trim());
      reset();
      onElevated();
    } catch (e: any) {
      setError(e.message ?? 'Invalid PIN');
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDismiss}>
      <View
        className="flex-1 justify-center items-center px-6"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <View
          className="bg-white rounded-3xl p-6 w-full gap-4"
          style={{ elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16 }}
        >
          {/* Header */}
          <View className="flex-row items-center gap-3">
            <View className="w-10 h-10 bg-brand rounded-xl items-center justify-center">
              <Ionicons name="lock-closed" size={20} color="#FFFFFF" />
            </View>
            <View className="flex-1">
              <Text className="text-base font-extrabold text-[#1C2B1E]">Confirm Identity</Text>
              <Text className="text-xs text-[#7A9A7E] mt-0.5">Enter your PIN to continue</Text>
            </View>
            <TouchableOpacity onPress={handleDismiss}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* PIN input */}
          <TextInput
            className="bg-bio border border-mint rounded-2xl px-4 py-3.5 text-base text-[#1C2B1E] text-center tracking-widest"
            value={pin}
            onChangeText={(t) => { setPin(t); setError(''); }}
            placeholder="• • • •"
            placeholderTextColor="#94A3B8"
            secureTextEntry
            keyboardType="numeric"
            maxLength={8}
            autoFocus
            onSubmitEditing={handleSubmit}
          />

          {/* Error */}
          {error ? (
            <View className="flex-row items-center gap-2 bg-red-50 rounded-xl px-3 py-2">
              <Ionicons name="warning-outline" size={16} color="#DC2626" />
              <Text className="text-xs text-red-600 font-semibold flex-1">{error}</Text>
            </View>
          ) : null}

          {/* 5-minute note */}
          <Text className="text-[10px] text-[#94A3B8] text-center">
            Access granted for 5 minutes after verification
          </Text>

          {/* Actions */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              className="flex-1 border border-mint rounded-2xl py-3.5 items-center"
              onPress={handleDismiss}
              disabled={loading}
            >
              <Text className="text-sm font-bold text-[#7A9A7E]">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-[2] bg-brand rounded-2xl py-3.5 items-center"
              onPress={handleSubmit}
              disabled={loading}
              style={{ elevation: 4, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 }}
            >
              {loading
                ? <ActivityIndicator color="#FFFFFF" size="small" />
                : <Text className="text-sm font-bold text-white">Verify</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/staff/PinSudoModal.tsx
git commit -m "feat(staff-client): add PinSudoModal component"
```

---

## Task 7: Auth routing fork

**Files:**
- Modify: `app/(auth)/client-login.tsx`
- Modify: `app/index.tsx`

- [ ] **Step 1: Update client-login.tsx — route staff to (staff-client)**

Find this line in `handleSignIn`:
```typescript
router.replace('/(client)/home')
```

Replace with:
```typescript
const role = data.user?.role;
router.replace(
  role === 'admin' || role === 'librarian'
    ? '/(staff-client)/circulation'
    : '/(client)/home'
);
```

- [ ] **Step 2: Update index.tsx — fork on session restore**

Find this line in `index.tsx`:
```typescript
router.replace(restored ? '/(client)/home' : '/(auth)/connect');
```

Replace with:
```typescript
if (restored) {
  const role = restored.user?.role;
  router.replace(
    role === 'admin' || role === 'librarian'
      ? '/(staff-client)/circulation'
      : '/(client)/home'
  );
} else {
  router.replace('/(auth)/connect');
}
```

- [ ] **Step 3: Commit**

```bash
git add app/(auth)/client-login.tsx app/index.tsx
git commit -m "feat(staff-client): fork auth routing — staff → (staff-client), member → (client)"
```

---

## Task 8: (staff-client) layout

**Files:**
- Create: `app/(staff-client)/_layout.tsx`

- [ ] **Step 1: Create the layout**

```typescript
import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { CustomTabBar } from '../../src/components/navigation/CustomTabBar';
import { ErrorBoundary } from '../../src/components/common/ErrorBoundary';
import { useAppStore } from '../../src/store/appStore';

export default function StaffClientLayout() {
  const router = useRouter();
  const mode = useAppStore((s) => s.mode);
  const currentUser = useAppStore((s) => s.currentUser);

  // Mode guard
  useEffect(() => {
    if (mode !== null && mode !== 'client') {
      router.replace('/');
    }
  }, [mode]);

  // Role guard — patron who somehow lands here gets sent to patron home
  useEffect(() => {
    if (currentUser !== null && currentUser.role === 'member') {
      router.replace('/(client)/home');
    }
  }, [currentUser]);

  return (
    <ErrorBoundary>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <CustomTabBar {...props} accentRoute="circulation" />}
      >
        <Tabs.Screen
          name="catalog"
          options={{
            title: 'Catalog',
            tabBarLabel: 'Catalog',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'book' : 'book-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="circulation"
          options={{
            title: 'Circulation',
            tabBarLabel: 'Scan',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'scan' : 'scan-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="members"
          options={{
            title: 'Members',
            tabBarLabel: 'Members',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'people' : 'people-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="reservations"
          options={{
            title: 'Reservations',
            tabBarLabel: 'Holds',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'bookmark' : 'bookmark-outline'} size={size} color={color} />
            ),
          }}
        />
        {/* Hidden routes */}
        <Tabs.Screen name="book/[id]" options={{ href: null }} />
        <Tabs.Screen name="book/add" options={{ href: null }} />
        <Tabs.Screen name="member/[id]" options={{ href: null }} />
      </Tabs>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(staff-client)/_layout.tsx"
git commit -m "feat(staff-client): add (staff-client) layout with 4 tabs"
```

---

## Task 9: Circulation screen

**Files:**
- Create: `app/(staff-client)/circulation.tsx`

- [ ] **Step 1: Create the screen**

```typescript
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StatusBar, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clientFetch } from '../../src/services/clientApi';
import { useAppStore } from '../../src/store/appStore';

type Phase = 'idle' | 'scanning' | 'resolving' | 'found_available' | 'found_borrowed' | 'not_found';

interface CopyInfo {
  id: number;
  resource_title: string;
  resource_author: string;
  copy_number: number;
  barcode: string;
  status: string;
  condition: string;
  active_borrow?: {
    id: number;
    member_name: string;
    member_id_number: string;
    due_date: string;
    borrowed_at: string;
  } | null;
}

export default function CirculationScreen() {
  const insets = useSafeAreaInsets();
  const serverUrl = useAppStore((s) => s.serverUrl);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('idle');
  const [manualBarcode, setManualBarcode] = useState('');
  const [copy, setCopy] = useState<CopyInfo | null>(null);
  const [memberIdInput, setMemberIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const scannedRef = useRef(false);

  const reset = useCallback(() => {
    scannedRef.current = false;
    setPhase('idle');
    setManualBarcode('');
    setCopy(null);
    setMemberIdInput('');
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => {
    setCameraKey(k => k + 1);
    return () => reset();
  }, [reset]));

  const lookupBarcode = async (barcode: string) => {
    setPhase('resolving');
    try {
      const res = await clientFetch(`/api/staff/copies/by-barcode/${encodeURIComponent(barcode)}`);
      if (res.status === 404) { setPhase('not_found'); return; }
      if (!res.ok) { setPhase('not_found'); return; }
      const data: CopyInfo = await res.json();
      setCopy(data);
      setPhase(data.status === 'borrowed' ? 'found_borrowed' : 'found_available');
    } catch {
      setPhase('not_found');
    }
  };

  const handleBarcodeScan = async ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setManualBarcode(data);
    await lookupBarcode(data);
  };

  const handleManualLookup = async () => {
    if (!manualBarcode.trim()) return;
    await lookupBarcode(manualBarcode.trim());
  };

  const handleCheckout = async () => {
    if (!copy || !memberIdInput.trim()) {
      Alert.alert('Error', 'Enter the member ID number');
      return;
    }
    setLoading(true);
    try {
      // Look up member by ID number
      const mRes = await clientFetch(`/api/staff/members/by-id/${encodeURIComponent(memberIdInput.trim())}`);
      if (!mRes.ok) {
        Alert.alert('Error', 'Member not found');
        setLoading(false);
        return;
      }
      const member = await mRes.json();
      if (!member.is_active) {
        Alert.alert('Error', 'Member account is inactive');
        setLoading(false);
        return;
      }
      const res = await clientFetch('/api/staff/borrows', {
        method: 'POST',
        body: JSON.stringify({ barcode: copy.barcode, memberId: member.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Checkout Failed', data.error ?? 'Could not check out');
        setLoading(false);
        return;
      }
      Alert.alert('Checked Out ✓', `"${copy.resource_title}" checked out to ${member.name}.`, [
        { text: 'OK', onPress: reset },
      ]);
    } catch {
      Alert.alert('Error', 'Could not complete checkout');
    } finally {
      setLoading(false);
    }
  };

  const handleReturn = async () => {
    if (!copy?.active_borrow) return;
    setLoading(true);
    try {
      const res = await clientFetch(`/api/staff/borrows/${copy.active_borrow.id}/return`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Return Failed', data.error ?? 'Could not process return');
        setLoading(false);
        return;
      }
      const fineMsg = data?.amount_due > 0 ? `\nFine issued: ₱${data.amount_due.toFixed(2)}` : '';
      Alert.alert('Returned ✓', `"${copy.resource_title}" returned.${fineMsg}`, [
        { text: 'OK', onPress: reset },
      ]);
    } catch {
      Alert.alert('Error', 'Could not complete return');
    } finally {
      setLoading(false);
    }
  };

  const showCamera = phase === 'idle' || phase === 'scanning';

  return (
    <View className="flex-1 bg-bio">
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />
      {/* Header */}
      <View className="bg-brand px-5 pb-5 rounded-b-[28px]" style={{ paddingTop: insets.top + 12 }}>
        <Text className="text-2xl font-extrabold text-white">Circulation</Text>
        <Text className="text-sm text-[#A8D5A2] mt-0.5">Scan to check out or return</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Camera / viewfinder */}
        {showCamera && (
          <View className="bg-white rounded-3xl overflow-hidden" style={{ elevation: 2, height: 240 }}>
            {permission?.granted ? (
              <CameraView
                key={cameraKey}
                style={{ flex: 1 }}
                facing="back"
                onBarcodeScanned={handleBarcodeScan}
              />
            ) : (
              <TouchableOpacity
                className="flex-1 items-center justify-center gap-3"
                onPress={requestPermission}
              >
                <Ionicons name="camera-outline" size={40} color="#94A3B8" />
                <Text className="text-sm text-[#94A3B8] font-semibold">Tap to allow camera</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Manual barcode entry */}
        {showCamera && (
          <View className="bg-white rounded-2xl p-4 gap-3" style={{ elevation: 2 }}>
            <Text className="text-xs font-bold text-brand uppercase tracking-widest">Manual Entry</Text>
            <View className="flex-row gap-2">
              <TextInput
                className="flex-1 bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
                value={manualBarcode}
                onChangeText={setManualBarcode}
                placeholder="Enter barcode"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={handleManualLookup}
              />
              <TouchableOpacity
                className="bg-brand rounded-xl px-4 items-center justify-center"
                onPress={handleManualLookup}
              >
                <Ionicons name="search" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Resolving */}
        {phase === 'resolving' && (
          <View className="bg-white rounded-2xl p-6 items-center gap-3" style={{ elevation: 2 }}>
            <ActivityIndicator size="large" color="#2A5C33" />
            <Text className="text-sm text-[#7A9A7E]">Looking up barcode…</Text>
          </View>
        )}

        {/* Not found */}
        {phase === 'not_found' && (
          <View className="bg-white rounded-2xl p-5 gap-4" style={{ elevation: 2 }}>
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 bg-red-100 rounded-xl items-center justify-center">
                <Ionicons name="close-circle" size={22} color="#DC2626" />
              </View>
              <Text className="text-base font-bold text-[#1C2B1E]">Not Found</Text>
            </View>
            <Text className="text-sm text-[#7A9A7E]">No copy found for barcode "{manualBarcode}"</Text>
            <TouchableOpacity className="bg-brand rounded-2xl py-3 items-center" onPress={reset}>
              <Text className="text-sm font-bold text-white">Scan Again</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Available — checkout */}
        {phase === 'found_available' && copy && (
          <View className="bg-white rounded-2xl p-5 gap-4" style={{ elevation: 2 }}>
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 bg-green-100 rounded-xl items-center justify-center">
                <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-extrabold text-[#1C2B1E]" numberOfLines={1}>{copy.resource_title}</Text>
                <Text className="text-xs text-[#7A9A7E]">{copy.resource_author} · Copy #{copy.copy_number}</Text>
              </View>
            </View>
            <View className="gap-2">
              <Text className="text-xs font-bold text-brand uppercase tracking-widest">Member ID Number</Text>
              <TextInput
                className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]"
                value={memberIdInput}
                onChangeText={setMemberIdInput}
                placeholder="e.g. 2024-001"
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleCheckout}
              />
            </View>
            <View className="flex-row gap-3">
              <TouchableOpacity className="flex-1 border border-mint rounded-2xl py-3.5 items-center" onPress={reset}>
                <Text className="text-sm font-bold text-[#7A9A7E]">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-[2] bg-leaf rounded-2xl py-3.5 items-center"
                onPress={handleCheckout}
                disabled={loading}
                style={{ elevation: 4, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 }}
              >
                {loading
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text className="text-sm font-bold text-white">Check Out</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Borrowed — return */}
        {phase === 'found_borrowed' && copy?.active_borrow && (
          <View className="bg-white rounded-2xl p-5 gap-4" style={{ elevation: 2 }}>
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 bg-blue-100 rounded-xl items-center justify-center">
                <Ionicons name="return-up-back" size={22} color="#2563EB" />
              </View>
              <View className="flex-1">
                <Text className="text-base font-extrabold text-[#1C2B1E]" numberOfLines={1}>{copy.resource_title}</Text>
                <Text className="text-xs text-[#7A9A7E]">{copy.resource_author} · Copy #{copy.copy_number}</Text>
              </View>
            </View>
            <View className="bg-bio rounded-xl p-3 gap-1">
              <Text className="text-xs font-bold text-brand">Borrowed by</Text>
              <Text className="text-sm font-semibold text-[#1C2B1E]">{copy.active_borrow.member_name}</Text>
              <Text className="text-xs text-[#7A9A7E]">{copy.active_borrow.member_id_number}</Text>
              <Text className="text-xs text-[#7A9A7E] mt-1">Due: {new Date(copy.active_borrow.due_date).toLocaleDateString()}</Text>
            </View>
            <View className="flex-row gap-3">
              <TouchableOpacity className="flex-1 border border-mint rounded-2xl py-3.5 items-center" onPress={reset}>
                <Text className="text-sm font-bold text-[#7A9A7E]">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-[2] bg-brand rounded-2xl py-3.5 items-center"
                onPress={handleReturn}
                disabled={loading}
                style={{ elevation: 4, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 }}
              >
                {loading
                  ? <ActivityIndicator color="#FFFFFF" size="small" />
                  : <Text className="text-sm font-bold text-white">Process Return</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(staff-client)/circulation.tsx"
git commit -m "feat(staff-client): add circulation screen (checkout + return by barcode)"
```

---

## Task 10: Catalog screen

**Files:**
- Create: `app/(staff-client)/catalog.tsx`

- [ ] **Step 1: Create the screen**

```typescript
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, FlatList, StatusBar, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clientFetch } from '../../src/services/clientApi';

interface BookRow {
  id: number;
  title: string;
  author: string;
  genre: string | null;
  year: number | null;
  material_type: string;
  available_copies: number;
  total_copies: number;
}

export default function StaffCatalogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');

  const { data: books = [], isLoading, refetch } = useQuery<BookRow[]>({
    queryKey: ['staff', 'books', search],
    queryFn: async () => {
      const res = await clientFetch(`/api/staff/books?q=${encodeURIComponent(search)}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <View className="flex-1 bg-bio">
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />
      <View className="bg-brand px-5 pb-5 rounded-b-[28px]" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-2xl font-extrabold text-white">Catalog</Text>
          <TouchableOpacity
            className="w-10 h-10 bg-leaf rounded-full items-center justify-center"
            onPress={() => router.push('/(staff-client)/book/add')}
            style={{ elevation: 4, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 }}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View className="flex-row bg-[#1C3E23] rounded-2xl px-4 py-2 items-center gap-2">
          <Ionicons name="search-outline" size={18} color="#A8D5A2" />
          <TextInput
            className="flex-1 text-sm text-white"
            value={q}
            onChangeText={setQ}
            placeholder="Search title, author, ISBN…"
            placeholderTextColor="#5A7A5E"
            returnKeyType="search"
            onSubmitEditing={() => setSearch(q)}
          />
          {q ? (
            <TouchableOpacity onPress={() => { setQ(''); setSearch(''); }}>
              <Ionicons name="close-circle" size={18} color="#A8D5A2" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2A5C33" />
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
          ListEmptyComponent={
            <View className="items-center justify-center py-16 gap-3">
              <Ionicons name="book-outline" size={40} color="#C8DFC5" />
              <Text className="text-sm text-[#94A3B8]">{search ? 'No books match your search' : 'No books in catalog'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              className="bg-white rounded-2xl p-4 flex-row gap-3 items-center"
              style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }}
              onPress={() => router.push(`/(staff-client)/book/${item.id}`)}
              activeOpacity={0.75}
            >
              <View className="w-10 h-10 bg-mint rounded-xl items-center justify-center">
                <Ionicons name="book-outline" size={20} color="#2A5C33" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-[#1C2B1E]" numberOfLines={1}>{item.title}</Text>
                <Text className="text-xs text-[#7A9A7E] mt-0.5" numberOfLines={1}>{item.author}</Text>
                {item.genre ? <Text className="text-[10px] text-[#94A3B8] mt-0.5">{item.genre}</Text> : null}
              </View>
              <View className="items-end gap-1">
                <Text className={`text-xs font-bold ${item.available_copies > 0 ? 'text-leaf' : 'text-red-500'}`}>
                  {item.available_copies}/{item.total_copies}
                </Text>
                <Text className="text-[10px] text-[#94A3B8]">available</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(staff-client)/catalog.tsx"
git commit -m "feat(staff-client): add catalog screen"
```

---

## Task 11: Book add screen

**Files:**
- Create: `app/(staff-client)/book/add.tsx`

- [ ] **Step 1: Create the screen**

```typescript
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StatusBar, Switch, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clientFetch } from '../../../src/services/clientApi';

const MATERIAL_TYPES = ['BOOK', 'SERIAL', 'ARTICLE', 'AUDIOVISUAL', 'MAP', 'MANUSCRIPT', 'DIGITAL', 'THESIS', 'OTHER'] as const;

export default function StaffBookAddScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const [materialType, setMaterialType] = useState('BOOK');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isbn, setIsbn] = useState('');
  const [publisher, setPublisher] = useState('');
  const [year, setYear] = useState('');
  const [genre, setGenre] = useState('');
  const [description, setDescription] = useState('');
  const [isLoanable, setIsLoanable] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !author.trim()) {
      Alert.alert('Error', 'Title and author are required');
      return;
    }
    setSaving(true);
    try {
      const res = await clientFetch('/api/staff/books', {
        method: 'POST',
        body: JSON.stringify({
          material_type: materialType,
          title: title.trim(),
          author: author.trim(),
          isbn: isbn.trim() || null,
          publisher: publisher.trim() || null,
          year: year.trim() ? parseInt(year.trim()) : null,
          genre: genre.trim() || null,
          description: description.trim() || null,
          is_loanable: isLoanable,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Error', data.error ?? 'Could not add book');
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['staff', 'books'] });
      router.back();
    } catch {
      Alert.alert('Error', 'Could not reach server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-bio">
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />
      <View
        className="bg-brand flex-row items-center justify-between px-5 pb-4 rounded-b-[20px]"
        style={{ paddingTop: insets.top + 12 }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[#A8D5A2] text-sm font-medium">Cancel</Text>
        </TouchableOpacity>
        <Text className="text-white font-extrabold text-base">Add Resource</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving
            ? <ActivityIndicator color="#A8D5A2" size="small" />
            : <Text className="text-[#A8D5A2] text-sm font-bold">Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        {/* Material type */}
        <View className="bg-white rounded-2xl p-4 gap-3" style={{ elevation: 2 }}>
          <Text className="text-xs font-bold text-brand uppercase tracking-widest">Material Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MATERIAL_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setMaterialType(t)}
                className={`px-3 py-2 rounded-xl border ${materialType === t ? 'bg-brand border-brand' : 'bg-white border-mint'}`}
              >
                <Text className={`text-xs font-bold ${materialType === t ? 'text-white' : 'text-brand'}`}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Details */}
        <View className="bg-white rounded-2xl p-4 gap-3" style={{ elevation: 2 }}>
          <Text className="text-xs font-bold text-brand uppercase tracking-widest">Details</Text>
          <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={title} onChangeText={setTitle} placeholder="Title *" placeholderTextColor="#94A3B8" />
          <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={author} onChangeText={setAuthor} placeholder="Author / Creator *" placeholderTextColor="#94A3B8" />
          <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={isbn} onChangeText={setIsbn} placeholder="ISBN / ISSN (optional)" placeholderTextColor="#94A3B8" autoCapitalize="none" />
          <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={publisher} onChangeText={setPublisher} placeholder="Publisher" placeholderTextColor="#94A3B8" />
          <View className="flex-row gap-2">
            <TextInput className="flex-1 bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={year} onChangeText={setYear} placeholder="Year" placeholderTextColor="#94A3B8" keyboardType="numeric" maxLength={4} />
            <TextInput className="flex-[2] bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={genre} onChangeText={setGenre} placeholder="Genre / Subject" placeholderTextColor="#94A3B8" />
          </View>
          <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E] h-20" style={{ textAlignVertical: 'top' }} value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor="#94A3B8" multiline />
        </View>

        {/* Lending */}
        <View className="bg-white rounded-2xl p-4" style={{ elevation: 2 }}>
          <Text className="text-xs font-bold text-brand uppercase tracking-widest mb-3">Lending</Text>
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm font-semibold text-[#1C2B1E]">Loanable</Text>
              <Text className="text-xs text-[#7A9A7E] mt-0.5">Can members borrow this?</Text>
            </View>
            <Switch value={isLoanable} onValueChange={setIsLoanable} trackColor={{ false: '#C8DFC5', true: '#2A5C33' }} thumbColor="#FFFFFF" />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(staff-client)/book/add.tsx"
git commit -m "feat(staff-client): add book/add screen"
```

---

## Task 12: Book detail screen (staff-client, with PIN sudo)

**Files:**
- Create: `app/(staff-client)/book/[id].tsx`

- [ ] **Step 1: Create the screen**

```typescript
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinSudoModal } from '../../../src/components/staff/PinSudoModal';
import { clientFetch } from '../../../src/services/clientApi';
import { useAppStore } from '../../../src/store/appStore';

const STATUS_COLOR: Record<string, string> = {
  available: '#16A34A', borrowed: '#2563EB', reserved: '#7C3AED',
};
const CONDITION_COLOR: Record<string, string> = {
  good: '#16A34A', damaged: '#D97706', lost: '#DC2626',
};

export default function StaffBookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isStaffElevated = useAppStore((s) => s.isStaffElevated);
  const resourceId = parseInt(id);

  const [editVisible, setEditVisible] = useState(false);
  const [sudoVisible, setSudoVisible] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);

  const { data: book, isLoading } = useQuery({
    queryKey: ['staff', 'book', resourceId],
    queryFn: async () => {
      const res = await clientFetch(`/api/staff/books?q=`);
      // Use existing public detail endpoint for display
      const detailRes = await clientFetch(`/api/books/${resourceId}`);
      if (!detailRes.ok) return null;
      return detailRes.json();
    },
  });

  const requireSudo = (action: () => void) => {
    if (isStaffElevated()) { action(); return; }
    pendingAction.current = action;
    setSudoVisible(true);
  };

  const handleDelete = () => {
    requireSudo(() => {
      Alert.alert(
        'Delete Resource',
        `Delete "${book?.title}"? This will also remove all copies and cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete', style: 'destructive', onPress: async () => {
              const res = await clientFetch(`/api/staff/books/${resourceId}`, { method: 'DELETE' });
              if (res.ok) {
                queryClient.invalidateQueries({ queryKey: ['staff', 'books'] });
                router.back();
              } else {
                const data = await res.json().catch(() => ({}));
                Alert.alert('Error', data.error ?? 'Could not delete');
              }
            },
          },
        ]
      );
    });
  };

  if (isLoading) {
    return <View className="flex-1 items-center justify-center bg-bio"><ActivityIndicator size="large" color="#2A5C33" /></View>;
  }
  if (!book) {
    return <View className="flex-1 items-center justify-center bg-bio"><Text className="text-red-600">Book not found</Text></View>;
  }

  return (
    <>
      <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="bg-brand px-5 pb-5 rounded-b-[28px]" style={{ paddingTop: insets.top + 12 }}>
          <View className="flex-row items-center justify-between mb-4">
            <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-1">
              <Ionicons name="chevron-back" size={20} color="#A8D5A2" />
              <Text className="text-[#A8D5A2] text-sm font-medium">Back</Text>
            </TouchableOpacity>
            <View className="flex-row gap-2">
              <TouchableOpacity
                className="bg-[#1C3E23] rounded-xl px-4 py-2"
                onPress={() => requireSudo(() => setEditVisible(true))}
              >
                <Text className="text-[#A8D5A2] text-sm font-bold">Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="bg-red-900 rounded-xl px-3 py-2"
                onPress={handleDelete}
              >
                <Ionicons name="trash-outline" size={16} color="#FCA5A5" />
              </TouchableOpacity>
            </View>
          </View>
          <Text className="text-white font-extrabold text-lg">{book.title}</Text>
          <Text className="text-[#A8D5A2] text-sm mt-0.5">{book.author}</Text>
          {book.publisher ? <Text className="text-[#7A9A7E] text-xs mt-0.5">{book.publisher}{book.year ? ` · ${book.year}` : ''}</Text> : null}
        </View>

        <View className="p-4 gap-3" style={{ paddingBottom: 120 }}>
          <View className="flex-row gap-3">
            <View className="flex-1 bg-white rounded-2xl p-3 items-center" style={{ elevation: 2 }}>
              <Text className="text-2xl font-extrabold text-[#1C2B1E]">{book.available_copies}</Text>
              <Text className="text-xs text-[#7A9A7E] mt-0.5 text-center">Available</Text>
            </View>
            <View className="flex-1 bg-white rounded-2xl p-3 items-center" style={{ elevation: 2 }}>
              <Text className="text-2xl font-extrabold text-[#1C2B1E]">{book.total_copies}</Text>
              <Text className="text-xs text-[#7A9A7E] mt-0.5 text-center">Total</Text>
            </View>
          </View>

          {book.description ? (
            <View className="bg-white rounded-2xl p-4" style={{ elevation: 2 }}>
              <Text className="text-sm font-bold text-[#1C2B1E] mb-2">Description</Text>
              <Text className="text-sm text-[#475569] leading-6">{book.description}</Text>
            </View>
          ) : null}

          {book.isbn ? (
            <View className="bg-white rounded-2xl p-4" style={{ elevation: 2 }}>
              <Text className="text-sm font-bold text-[#1C2B1E] mb-2">ISBN</Text>
              <Text className="text-sm text-[#475569]">{book.isbn}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <PinSudoModal
        visible={sudoVisible}
        onElevated={() => { setSudoVisible(false); pendingAction.current?.(); pendingAction.current = null; }}
        onDismiss={() => { setSudoVisible(false); pendingAction.current = null; }}
      />

      <StaffEditBookModal
        visible={editVisible}
        book={book}
        onClose={() => setEditVisible(false)}
        onSaved={() => {
          setEditVisible(false);
          queryClient.invalidateQueries({ queryKey: ['staff', 'book', resourceId] });
          queryClient.invalidateQueries({ queryKey: ['staff', 'books'] });
        }}
        resourceId={resourceId}
      />
    </>
  );
}

function StaffEditBookModal({ visible, book, onClose, onSaved, resourceId }: {
  visible: boolean; book: any; onClose: () => void; onSaved: () => void; resourceId: number;
}) {
  const [title, setTitle] = useState(book?.title ?? '');
  const [author, setAuthor] = useState(book?.author ?? '');
  const [publisher, setPublisher] = useState(book?.publisher ?? '');
  const [year, setYear] = useState(book?.year ? String(book.year) : '');
  const [genre, setGenre] = useState(book?.genre ?? '');
  const [description, setDescription] = useState(book?.description ?? '');
  const [isbn, setIsbn] = useState(book?.isbn ?? '');
  const [isLoanable, setIsLoanable] = useState(book?.is_loanable ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !author.trim()) {
      Alert.alert('Error', 'Title and author are required');
      return;
    }
    setSaving(true);
    try {
      const res = await clientFetch(`/api/staff/books/${resourceId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: title.trim(), author: author.trim(),
          publisher: publisher.trim() || null,
          year: year.trim() ? parseInt(year.trim()) : null,
          genre: genre.trim() || null,
          description: description.trim() || null,
          isbn: isbn.trim() || null,
          is_loanable: isLoanable,
          material_type: book.material_type,
        }),
      });
      if (res.ok) { onSaved(); }
      else {
        const data = await res.json().catch(() => ({}));
        Alert.alert('Error', data.error ?? 'Could not save');
      }
    } catch {
      Alert.alert('Error', 'Could not reach server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View className="flex-1 bg-bio">
        <View className="bg-brand flex-row items-center justify-between px-5 pb-4 pt-16 rounded-b-[20px]">
          <TouchableOpacity onPress={onClose}><Text className="text-[#A8D5A2] text-sm font-medium">Cancel</Text></TouchableOpacity>
          <Text className="text-white font-extrabold text-base">Edit Resource</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#A8D5A2" size="small" /> : <Text className="text-[#A8D5A2] text-sm font-bold">Save</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          <View className="bg-white rounded-2xl p-4 gap-3" style={{ elevation: 2 }}>
            <Text className="text-xs font-bold text-brand uppercase tracking-widest">Details</Text>
            <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={title} onChangeText={setTitle} placeholder="Title *" placeholderTextColor="#94A3B8" />
            <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={author} onChangeText={setAuthor} placeholder="Author *" placeholderTextColor="#94A3B8" />
            <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={isbn} onChangeText={setIsbn} placeholder="ISBN" placeholderTextColor="#94A3B8" autoCapitalize="none" />
            <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={publisher} onChangeText={setPublisher} placeholder="Publisher" placeholderTextColor="#94A3B8" />
            <View className="flex-row gap-2">
              <TextInput className="flex-1 bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={year} onChangeText={setYear} placeholder="Year" placeholderTextColor="#94A3B8" keyboardType="numeric" maxLength={4} />
              <TextInput className="flex-[2] bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={genre} onChangeText={setGenre} placeholder="Genre" placeholderTextColor="#94A3B8" />
            </View>
            <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E] h-20" style={{ textAlignVertical: 'top' }} value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor="#94A3B8" multiline />
          </View>
          <View className="bg-white rounded-2xl p-4" style={{ elevation: 2 }}>
            <Text className="text-xs font-bold text-brand uppercase tracking-widest mb-3">Lending</Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-semibold text-[#1C2B1E]">Loanable</Text>
              <Switch value={isLoanable} onValueChange={setIsLoanable} trackColor={{ false: '#C8DFC5', true: '#2A5C33' }} thumbColor="#FFFFFF" />
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(staff-client)/book/[id].tsx"
git commit -m "feat(staff-client): add book detail screen with PIN-gated edit/delete"
```

---

## Task 13: Members screen + member detail

**Files:**
- Create: `app/(staff-client)/members.tsx`
- Create: `app/(staff-client)/member/[id].tsx`

- [ ] **Step 1: Create members.tsx**

```typescript
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, StatusBar, Text,
  TextInput, TouchableOpacity, View, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clientFetch } from '../../src/services/clientApi';
import { useQueryClient } from '@tanstack/react-query';

const ROLE_COLOR: Record<string, string> = { admin: '#7C3AED', librarian: '#2563EB', member: '#16A34A' };

interface MemberRow {
  id: number; name: string; id_number: string;
  role: string; is_active: boolean; department?: string; user_type?: string;
}

export default function StaffMembersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [addVisible, setAddVisible] = useState(false);

  const { data: members = [], isLoading } = useQuery<MemberRow[]>({
    queryKey: ['staff', 'members', search],
    queryFn: async () => {
      const res = await clientFetch(`/api/staff/members?q=${encodeURIComponent(search)}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <View className="flex-1 bg-bio">
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />
      <View className="bg-brand px-5 pb-5 rounded-b-[28px]" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-2xl font-extrabold text-white">Members</Text>
          <TouchableOpacity
            className="w-10 h-10 bg-leaf rounded-full items-center justify-center"
            onPress={() => setAddVisible(true)}
            style={{ elevation: 4, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 }}
          >
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
        <View className="flex-row bg-[#1C3E23] rounded-2xl px-4 py-2 items-center gap-2">
          <Ionicons name="search-outline" size={18} color="#A8D5A2" />
          <TextInput
            className="flex-1 text-sm text-white"
            value={q} onChangeText={setQ}
            placeholder="Search by name or ID…" placeholderTextColor="#5A7A5E"
            returnKeyType="search" onSubmitEditing={() => setSearch(q)}
          />
          {q ? <TouchableOpacity onPress={() => { setQ(''); setSearch(''); }}><Ionicons name="close-circle" size={18} color="#A8D5A2" /></TouchableOpacity> : null}
        </View>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#2A5C33" /></View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
          ListEmptyComponent={
            <View className="items-center justify-center py-16 gap-3">
              <Ionicons name="people-outline" size={40} color="#C8DFC5" />
              <Text className="text-sm text-[#94A3B8]">{search ? 'No members match' : 'No members yet'}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              className="bg-white rounded-2xl p-4 flex-row gap-3 items-center"
              style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }}
              onPress={() => router.push(`/(staff-client)/member/${item.id}`)}
              activeOpacity={0.75}
            >
              <View className="w-10 h-10 bg-mint rounded-xl items-center justify-center">
                <Ionicons name="person-outline" size={20} color="#2A5C33" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-[#1C2B1E]">{item.name}</Text>
                <Text className="text-xs text-[#7A9A7E] mt-0.5">{item.id_number}</Text>
              </View>
              <View className="items-end gap-1">
                <View className="rounded-md px-2 py-0.5" style={{ backgroundColor: ROLE_COLOR[item.role] + '20' }}>
                  <Text className="text-[10px] font-bold capitalize" style={{ color: ROLE_COLOR[item.role] }}>{item.role}</Text>
                </View>
                {!item.is_active && (
                  <Text className="text-[10px] text-red-500 font-semibold">Inactive</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        />
      )}

      <AddMemberModal
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        onSaved={() => {
          setAddVisible(false);
          queryClient.invalidateQueries({ queryKey: ['staff', 'members'] });
        }}
      />
    </View>
  );
}

function AddMemberModal({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [pin, setPin] = useState('');
  const [department, setDepartment] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(''); setIdNumber(''); setPin(''); setDepartment(''); };

  const handleSave = async () => {
    if (!name.trim() || !idNumber.trim() || !pin.trim()) {
      Alert.alert('Error', 'Name, ID number, and PIN are required');
      return;
    }
    setSaving(true);
    try {
      const res = await clientFetch('/api/staff/members', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(), id_number: idNumber.trim(),
          pin: pin.trim(), role: 'member',
          department: department.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert('Error', data.error ?? 'Could not add member'); return; }
      reset();
      onSaved();
    } catch {
      Alert.alert('Error', 'Could not reach server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View className="flex-1 bg-bio">
        <View className="bg-brand flex-row items-center justify-between px-5 pb-4 pt-16 rounded-b-[20px]">
          <TouchableOpacity onPress={() => { reset(); onClose(); }}><Text className="text-[#A8D5A2] text-sm font-medium">Cancel</Text></TouchableOpacity>
          <Text className="text-white font-extrabold text-base">Add Member</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#A8D5A2" size="small" /> : <Text className="text-[#A8D5A2] text-sm font-bold">Save</Text>}
          </TouchableOpacity>
        </View>
        <View className="p-4 gap-3">
          <View className="bg-white rounded-2xl p-4 gap-3" style={{ elevation: 2 }}>
            <Text className="text-xs font-bold text-brand uppercase tracking-widest">Member Info</Text>
            <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={name} onChangeText={setName} placeholder="Full name *" placeholderTextColor="#94A3B8" />
            <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={idNumber} onChangeText={setIdNumber} placeholder="ID number *" placeholderTextColor="#94A3B8" autoCapitalize="none" />
            <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={pin} onChangeText={setPin} placeholder="PIN *" placeholderTextColor="#94A3B8" secureTextEntry keyboardType="numeric" />
            <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={department} onChangeText={setDepartment} placeholder="Department (optional)" placeholderTextColor="#94A3B8" />
          </View>
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 2: Create member/[id].tsx**

```typescript
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinSudoModal } from '../../../src/components/staff/PinSudoModal';
import { clientFetch } from '../../../src/services/clientApi';
import { useAppStore } from '../../../src/store/appStore';

const ROLE_OPTIONS = ['member', 'librarian', 'admin'] as const;
const ROLE_COLOR: Record<string, string> = { admin: '#7C3AED', librarian: '#2563EB', member: '#16A34A' };

export default function StaffMemberDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const currentUser = useAppStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === 'admin';
  const isStaffElevated = useAppStore((s) => s.isStaffElevated);
  const userId = parseInt(id);

  const [editVisible, setEditVisible] = useState(false);
  const [sudoVisible, setSudoVisible] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);

  const requireSudo = (action: () => void) => {
    if (isStaffElevated()) { action(); return; }
    pendingAction.current = action;
    setSudoVisible(true);
  };

  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'member', userId],
    queryFn: async () => {
      const res = await clientFetch(`/api/staff/members/${userId}`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  const member = data?.member;
  const activeBorrows = data?.activeBorrows ?? [];

  if (isLoading) {
    return <View className="flex-1 items-center justify-center bg-bio"><ActivityIndicator size="large" color="#2A5C33" /></View>;
  }
  if (!member) {
    return <View className="flex-1 items-center justify-center bg-bio"><Text className="text-red-600">Member not found</Text></View>;
  }

  return (
    <>
      <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="bg-brand px-5 pb-5 rounded-b-[28px]" style={{ paddingTop: insets.top + 12 }}>
          <View className="flex-row items-center justify-between mb-4">
            <TouchableOpacity onPress={() => router.back()} className="flex-row items-center gap-1">
              <Ionicons name="chevron-back" size={20} color="#A8D5A2" />
              <Text className="text-[#A8D5A2] text-sm font-medium">Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="bg-[#1C3E23] rounded-xl px-4 py-2"
              onPress={() => requireSudo(() => setEditVisible(true))}
            >
              <Text className="text-[#A8D5A2] text-sm font-bold">Edit</Text>
            </TouchableOpacity>
          </View>
          <Text className="text-white font-extrabold text-xl">{member.name}</Text>
          <Text className="text-[#A8D5A2] text-sm mt-0.5">{member.id_number}</Text>
          <View className="flex-row items-center gap-2 mt-2">
            <View className="rounded-md px-2.5 py-1" style={{ backgroundColor: ROLE_COLOR[member.role] + '30' }}>
              <Text className="text-xs font-bold capitalize" style={{ color: ROLE_COLOR[member.role] }}>{member.role}</Text>
            </View>
            {!member.is_active && (
              <View className="rounded-md px-2.5 py-1 bg-red-900">
                <Text className="text-xs font-bold text-red-300">Inactive</Text>
              </View>
            )}
          </View>
        </View>

        <View className="p-4 gap-3" style={{ paddingBottom: 120 }}>
          {member.department ? (
            <View className="bg-white rounded-2xl p-4" style={{ elevation: 2 }}>
              <Text className="text-xs font-bold text-brand uppercase tracking-widest mb-1">Department</Text>
              <Text className="text-sm text-[#1C2B1E]">{member.department}</Text>
            </View>
          ) : null}

          <View className="bg-white rounded-2xl p-4" style={{ elevation: 2 }}>
            <Text className="text-sm font-bold text-[#1C2B1E] mb-3">Active Borrows ({activeBorrows.length})</Text>
            {activeBorrows.length === 0 ? (
              <Text className="text-sm text-[#94A3B8] text-center py-2">No active borrows</Text>
            ) : activeBorrows.map((b: any) => (
              <View key={b.id} className="flex-row items-center py-2.5 border-t border-[#F1F5F9]">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-[#1C2B1E]" numberOfLines={1}>{b.title ?? b.resource_title}</Text>
                  <Text className="text-xs text-[#94A3B8] mt-0.5">Due: {new Date(b.due_date).toLocaleDateString()}</Text>
                </View>
                {new Date(b.due_date) < new Date() && (
                  <Text className="text-xs font-bold text-red-600 ml-2">Overdue</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <PinSudoModal
        visible={sudoVisible}
        onElevated={() => { setSudoVisible(false); pendingAction.current?.(); pendingAction.current = null; }}
        onDismiss={() => { setSudoVisible(false); pendingAction.current = null; }}
      />

      <EditMemberModal
        visible={editVisible}
        member={member}
        isAdmin={isAdmin}
        onClose={() => setEditVisible(false)}
        onSaved={() => {
          setEditVisible(false);
          queryClient.invalidateQueries({ queryKey: ['staff', 'member', userId] });
          queryClient.invalidateQueries({ queryKey: ['staff', 'members'] });
        }}
        userId={userId}
      />
    </>
  );
}

function EditMemberModal({ visible, member, isAdmin, onClose, onSaved, userId }: {
  visible: boolean; member: any; isAdmin: boolean;
  onClose: () => void; onSaved: () => void; userId: number;
}) {
  const [name, setName] = useState(member?.name ?? '');
  const [idNumber, setIdNumber] = useState(member?.id_number ?? '');
  const [role, setRole] = useState(member?.role ?? 'member');
  const [department, setDepartment] = useState(member?.department ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !idNumber.trim()) {
      Alert.alert('Error', 'Name and ID number are required');
      return;
    }
    setSaving(true);
    try {
      const res = await clientFetch(`/api/staff/members/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(), id_number: idNumber.trim(),
          role, department: department.trim() || undefined,
        }),
      });
      if (res.ok) { onSaved(); }
      else {
        const data = await res.json().catch(() => ({}));
        Alert.alert('Error', data.error ?? 'Could not save');
      }
    } catch {
      Alert.alert('Error', 'Could not reach server');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View className="flex-1 bg-bio">
        <View className="bg-brand flex-row items-center justify-between px-5 pb-4 pt-16 rounded-b-[20px]">
          <TouchableOpacity onPress={onClose}><Text className="text-[#A8D5A2] text-sm font-medium">Cancel</Text></TouchableOpacity>
          <Text className="text-white font-extrabold text-base">Edit Member</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator color="#A8D5A2" size="small" /> : <Text className="text-[#A8D5A2] text-sm font-bold">Save</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          <View className="bg-white rounded-2xl p-4 gap-3" style={{ elevation: 2 }}>
            <Text className="text-xs font-bold text-brand uppercase tracking-widest">Member Info</Text>
            <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={name} onChangeText={setName} placeholder="Full name *" placeholderTextColor="#94A3B8" />
            <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={idNumber} onChangeText={setIdNumber} placeholder="ID number *" placeholderTextColor="#94A3B8" autoCapitalize="none" />
            <TextInput className="bg-bio border border-mint rounded-xl px-4 py-3 text-sm text-[#1C2B1E]" value={department} onChangeText={setDepartment} placeholder="Department" placeholderTextColor="#94A3B8" />
          </View>

          {/* Role — admin only */}
          {isAdmin && (
            <View className="bg-white rounded-2xl p-4 gap-3" style={{ elevation: 2 }}>
              <Text className="text-xs font-bold text-brand uppercase tracking-widest">Role</Text>
              <View className="flex-row gap-2">
                {ROLE_OPTIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setRole(r)}
                    className={`flex-1 py-2.5 rounded-xl items-center border ${role === r ? 'border-transparent' : 'bg-white border-mint'}`}
                    style={role === r ? { backgroundColor: ROLE_COLOR[r] } : undefined}
                  >
                    <Text className={`text-xs font-bold capitalize ${role === r ? 'text-white' : 'text-[#374151]'}`}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(staff-client)/members.tsx" "app/(staff-client)/member/[id].tsx"
git commit -m "feat(staff-client): add members list and member detail screens"
```

---

## Task 14: Reservations screen

**Files:**
- Create: `app/(staff-client)/reservations.tsx`

- [ ] **Step 1: Create the screen**

```typescript
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, StatusBar,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PinSudoModal } from '../../src/components/staff/PinSudoModal';
import { clientFetch } from '../../src/services/clientApi';
import { useAppStore } from '../../src/store/appStore';

interface Reservation {
  id: number;
  book_title: string;
  book_author: string;
  member_name: string;
  member_id_number: string;
  reserved_at: string;
  available_copies: number;
}

export default function StaffReservationsScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const isStaffElevated = useAppStore((s) => s.isStaffElevated);
  const [sudoVisible, setSudoVisible] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);

  const requireSudo = (action: () => void) => {
    if (isStaffElevated()) { action(); return; }
    pendingAction.current = action;
    setSudoVisible(true);
  };

  const { data: reservations = [], isLoading, refetch } = useQuery<Reservation[]>({
    queryKey: ['staff', 'reservations'],
    queryFn: async () => {
      const res = await clientFetch('/api/staff/reservations');
      if (!res.ok) return [];
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await clientFetch(`/api/staff/reservations/${id}/approve`, { method: 'POST' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed'); }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', 'reservations'] }),
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await clientFetch(`/api/staff/reservations/${id}/cancel`, { method: 'POST' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed'); }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', 'reservations'] }),
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const handleApprove = (id: number) => requireSudo(() => approveMutation.mutate(id));
  const handleCancel = (id: number) => requireSudo(() => cancelMutation.mutate(id));

  return (
    <View className="flex-1 bg-bio">
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />
      <View className="bg-brand px-5 pb-5 rounded-b-[28px]" style={{ paddingTop: insets.top + 12 }}>
        <Text className="text-2xl font-extrabold text-white">Reservations</Text>
        <Text className="text-sm text-[#A8D5A2] mt-0.5">{reservations.length} active hold{reservations.length !== 1 ? 's' : ''}</Text>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#2A5C33" /></View>
      ) : (
        <FlatList
          data={reservations}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={
            <View className="items-center justify-center py-16 gap-3">
              <Ionicons name="bookmark-outline" size={40} color="#C8DFC5" />
              <Text className="text-sm text-[#94A3B8]">No active reservations</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View
              className="bg-white rounded-2xl p-4 gap-3"
              style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }}
            >
              <View className="flex-row items-start gap-3">
                <View className="w-10 h-10 bg-mint rounded-xl items-center justify-center mt-0.5">
                  <Ionicons name="bookmark-outline" size={20} color="#2A5C33" />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-[#1C2B1E]" numberOfLines={1}>{item.book_title}</Text>
                  <Text className="text-xs text-[#7A9A7E]">{item.book_author}</Text>
                </View>
                {item.available_copies > 0 && (
                  <View className="bg-green-100 rounded-md px-2 py-0.5">
                    <Text className="text-[10px] font-bold text-green-700">Available</Text>
                  </View>
                )}
              </View>

              <View className="flex-row items-center gap-2 bg-bio rounded-xl px-3 py-2">
                <Ionicons name="person-outline" size={14} color="#7A9A7E" />
                <Text className="text-xs font-semibold text-[#1C2B1E] flex-1">{item.member_name}</Text>
                <Text className="text-xs text-[#94A3B8]">{item.member_id_number}</Text>
              </View>

              <Text className="text-[10px] text-[#94A3B8]">Reserved {new Date(item.reserved_at).toLocaleDateString()}</Text>

              <View className="flex-row gap-2">
                <TouchableOpacity
                  className="flex-1 border border-red-200 rounded-xl py-2.5 items-center"
                  onPress={() => handleCancel(item.id)}
                  disabled={cancelMutation.isPending}
                >
                  <Text className="text-xs font-bold text-red-600">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-[2] bg-brand rounded-xl py-2.5 items-center"
                  onPress={() => handleApprove(item.id)}
                  disabled={approveMutation.isPending}
                  style={{ elevation: 2, shadowColor: '#2A5C33', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 }}
                >
                  <Text className="text-xs font-bold text-white">Mark Fulfilled</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <PinSudoModal
        visible={sudoVisible}
        onElevated={() => { setSudoVisible(false); pendingAction.current?.(); pendingAction.current = null; }}
        onDismiss={() => { setSudoVisible(false); pendingAction.current = null; }}
      />
    </View>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(staff-client)/reservations.tsx"
git commit -m "feat(staff-client): add reservations screen with PIN-gated approve/cancel"
```

---

## Task 15: Smoke test

- [ ] **Step 1: Run the app on a connected device**

```bash
npm start
```

- [ ] **Step 2: Test librarian login flow**
  1. Launch the app on a second device (or emulator) connected to the same Wi-Fi as the server tablet
  2. Go through setup → connect → discover server
  3. Sign in with a librarian or admin account
  4. Verify the app routes to `/(staff-client)/circulation` (not the patron home)
  5. Verify 4 tabs appear: Catalog · Scan (accent) · Members · Holds

- [ ] **Step 3: Test circulation**
  1. On the circulation screen, scan or type a barcode of an available copy
  2. Verify it shows "Available" state with a member ID input
  3. Enter a member ID and tap Check Out → verify success alert
  4. Scan the same barcode again → verify it shows "Borrowed" state with member name
  5. Tap Process Return → verify success alert (and fine message if overdue)

- [ ] **Step 4: Test PIN sudo**
  1. On catalog screen, tap a book → tap Edit
  2. Verify PinSudoModal appears (not elevated yet)
  3. Enter wrong PIN → verify error message
  4. Enter correct PIN → verify modal dismisses and edit modal opens
  5. Without leaving the screen, tap Delete on the same book → verify NO sudo prompt (still elevated)
  6. Wait 5 minutes (or set `staffElevatedUntil = Date.now() - 1` via debug) → tap Edit again → verify sudo prompt reappears

- [ ] **Step 5: Test 403 handling**
  1. With a librarian session active on a second device, go to the server tablet and downgrade the librarian to member role
  2. On the second device, perform any catalog action
  3. Verify the app routes back to `/(auth)/connect`

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: staff client mode — librarian/admin management from any device"
```

---

## Self-Review

**Spec coverage:**
- ✅ §4 Route group `(staff-client)/` — Tasks 8–14
- ✅ §5 Auth routing fork — Task 7
- ✅ §6 Staff API `/api/staff/*` — Tasks 3–5
- ✅ §7 PIN sudo window — Tasks 1, 5, 6
- ✅ §8 clientFetch 403 — Task 2
- ✅ §9 Edge cases — role guard in layout (Task 8), 403 clear in clientFetch (Task 2), admin-only role field in member edit (Task 13)

**Type consistency check:**
- `elevateStaff(pin: string)` defined in Task 1, called in Task 6 ✅
- `isStaffElevated()` defined in Task 1, called in Tasks 12, 13, 14 ✅
- `clearStaffElevation()` defined in Task 1, called via `clearClientSession` in Task 1 ✅
- `PinSudoModal` props `{ visible, onElevated, onDismiss }` defined in Task 6, used in Tasks 12, 13, 14 ✅
- `clientFetch` used throughout — same signature ✅
- Bridge action names match between ServerBridge (Task 4) and main.js `queryRN` calls (Task 5) ✅
