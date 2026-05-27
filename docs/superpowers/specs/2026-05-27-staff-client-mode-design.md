# Staff Client Mode — Design Spec

**Date:** 2026-05-27  
**Status:** Approved  
**Scope:** Role-based routing in client mode — librarian and admin accounts can manage the library (circulation + cataloging) from any connected device on the same Wi-Fi, not just the server tablet.

---

## 1. Problem Statement

Currently, client mode is patron-only. Librarians and admins must physically use the server tablet to perform management tasks. This blocks multi-device workflows (e.g., a librarian at the circulation desk on their own phone while the server tablet stays at a fixed station).

**Security constraint:** The app runs over plaintext HTTP (documented LAN-only trust model). A sniffed staff bearer token could allow unauthorized library management. Mitigation: PIN re-confirmation (sudo window) is required before any edit or delete operation.

---

## 2. Approach

Add a new `(staff-client)/` Expo Router group alongside the existing `(client)/` and `(server)/` groups. When a librarian or admin authenticates via client mode, they are routed to `/(staff-client)/` instead of `/(client)/`. A new `/api/staff/*` endpoint group on the Node.js server handles staff operations, protected by a role-check middleware. Patron client mode is unchanged.

---

## 3. Affected Roles

| Role | Client mode destination | Change |
|---|---|---|
| `member` | `/(client)/home` | None |
| `librarian` | `/(staff-client)/circulation` | New |
| `admin` | `/(staff-client)/circulation` | New |

Admin gets full staff-client access including the role-change field on member edit (same admin-only gate as server mode).

---

## 4. Route Group: `app/(staff-client)/`

### 4.1 Layout (`_layout.tsx`)

- Mode guard: redirects to `/` if `mode !== 'client'`
- Role guard: redirects to `/(client)/home` if `currentUser.role === 'member'`
- Renders `CustomTabBar` with 4 tabs (same pill design, same tokens)

### 4.2 Tabs

| Tab | File | Accent | Notes |
|---|---|---|---|
| Circulation | `circulation.tsx` | ✅ Center accent (leaf green) | Barcode scan → checkout or return |
| Catalog | `catalog.tsx` | — | Book list + search; FAB → add book |
| Members | `members.tsx` | — | Member list + search |
| Reservations | `reservations.tsx` | — | All pending reservations |

### 4.3 Hidden Routes (href: null)

| File | Description | PIN sudo |
|---|---|---|
| `book/[id].tsx` | Book detail + edit form | Edit/delete gated |
| `book/add.tsx` | Add book (manual or ISBN lookup) | No (create only) |
| `member/[id].tsx` | Member detail + edit form | Edit gated; role field admin-only |

### 4.4 Shared Components

Book and member detail layouts are extracted into `src/components/books/` and `src/components/members/` so `(staff-client)/` and `(server)/` screens share base components without duplication.

---

## 5. Auth Routing Fork

**File:** `app/(auth)/client-login.tsx`

After a successful `POST /api/auth/member` response:

```
user.role === 'member'              → router.replace('/(client)/home')
user.role === 'librarian' | 'admin' → router.replace('/(staff-client)/circulation')
```

Session hydration on boot (`hydrateClientSession()`) applies the same fork:

```
restored user.role === 'member'              → /(client)/home
restored user.role === 'librarian' | 'admin' → /(staff-client)/circulation
```

No change to `POST /api/auth/member`, token format, or 30-day expiry.

---

## 6. Staff API (`/api/staff/*`)

### 6.1 Role Middleware

Applied to every `/api/staff/` route before the handler runs:

```javascript
const principal = await authResolve(req);
if (!principal || (principal.role !== 'admin' && principal.role !== 'librarian')) {
  return res.status(403).json({ error: 'forbidden' });
}
```

### 6.2 Endpoints

#### Books (Cataloging)

| Method | Route | PIN sudo | Notes |
|---|---|---|---|
| `GET` | `/api/staff/books` | No | Search with extra fields (copy count, condition) |
| `POST` | `/api/staff/books` | No | Create book + first copy |
| `PUT` | `/api/staff/books/:id` | **Yes** | Edit book metadata |
| `DELETE` | `/api/staff/books/:id` | **Yes** | Soft-delete (marks inactive) |

#### Members

| Method | Route | PIN sudo | Notes |
|---|---|---|---|
| `GET` | `/api/staff/members` | No | Search members |
| `GET` | `/api/staff/members/:id` | No | Member detail + active borrows |
| `POST` | `/api/staff/members` | No | Add member |
| `PUT` | `/api/staff/members/:id` | **Yes** | Edit member details |

#### Circulation

| Method | Route | PIN sudo | Notes |
|---|---|---|---|
| `POST` | `/api/staff/borrows` | No | Manual checkout — barcode → copy → borrow |
| `POST` | `/api/staff/borrows/:id/return` | No | Return by borrow ID |
| `GET` | `/api/staff/reservations` | No | All pending reservations |
| `POST` | `/api/staff/reservations/:id/approve` | **Yes** | Approve reservation |
| `POST` | `/api/staff/reservations/:id/cancel` | **Yes** | Cancel reservation |

#### PIN Sudo Verification

| Method | Route | Notes |
|---|---|---|
| `POST` | `/api/staff/verify-pin` | Bearer token + `{ pin }` body. Verifies PIN against the authenticated user's own stored hash. Rate-limited: `verify:{idNumber}` key, same 5-fail → escalating lockout pattern. Returns `{ ok: true }` or `403`. |

---

## 7. PIN Sudo Window

### 7.1 Store Changes (`src/store/appStore.ts`)

New field:
```typescript
staffElevatedUntil: number | null  // ms timestamp; null = not elevated; NOT persisted to AsyncStorage
```

New actions:
```typescript
elevateStaff: async (pin: string) => void
// Calls POST /api/staff/verify-pin
// On success: sets staffElevatedUntil = Date.now() + 5 * 60 * 1000
// On failure: throws error with message for modal display

isStaffElevated: () => boolean
// Returns staffElevatedUntil !== null && Date.now() < staffElevatedUntil

clearStaffElevation: () => void
// Called on logout / session clear
```

`staffElevatedUntil` is intentionally ephemeral — lost on app background/kill.

### 7.2 `PinSudoModal` Component (`src/components/staff/PinSudoModal.tsx`)

Props:
```typescript
interface PinSudoModalProps {
  visible: boolean;
  onElevated: () => void;   // Called after successful elevation — screen proceeds with action
  onDismiss: () => void;    // User cancels
}
```

Behaviour:
- Renders the existing PIN pad UI
- Calls `elevateStaff(pin)` on submit
- Shows inline error on wrong PIN or rate-limit (`429` → surfaces `Retry-After` countdown)
- Displays "Access granted for 5 minutes" note on success before dismissing
- Does not contain action logic — screens own their actions, modal only gates elevation

### 7.3 Usage Pattern in Screens

```typescript
// In book/[id].tsx (staff-client)
const [sudoVisible, setSudoVisible] = useState(false);
const pendingAction = useRef<(() => void) | null>(null);

const handleEdit = () => {
  if (isStaffElevated()) { submitEdit(); return; }
  pendingAction.current = submitEdit;
  setSudoVisible(true);
};

<PinSudoModal
  visible={sudoVisible}
  onElevated={() => { setSudoVisible(false); pendingAction.current?.(); }}
  onDismiss={() => setSudoVisible(false)}
/>
```

---

## 8. `clientFetch` Changes (`src/services/clientApi.ts`)

Add `403` handling alongside existing `401` handling:

```typescript
if (res.status === 401) {
  await useAppStore.getState().clearClientSession();
}
if (res.status === 403) {
  await useAppStore.getState().clearClientSession();
  // Redirect to /(auth)/connect with reason param
  router.replace('/(auth)/connect?reason=access_changed');
}
```

Patron client code is unaffected — patron endpoints never return `403` for role reasons.

---

## 9. Edge Cases

| Scenario | Handling |
|---|---|
| Patron token reaches `(staff-client)/` layout | Role guard in `_layout.tsx` redirects to `/(client)/home` |
| Librarian role downgraded mid-session | Next `/api/staff/*` call → `403` → session cleared → redirect to `/(auth)/connect` with "Your access level has changed" message |
| Token expires while sudo window active | Next API call → `401` → session + elevation both cleared |
| PIN verify rate-limited during sudo modal | `429` + `Retry-After` surfaced in modal; elevation not granted |
| Admin-only: member role field | Rendered conditionally — `currentUser.role === 'admin'` only, same as server mode |
| Offline / server unreachable | Existing `clientFetch` network error handling; no special staff treatment needed |

---

## 10. What Does Not Change

- `/api/auth/member` endpoint — same, no new fields
- Bearer token format and 30-day expiry
- All existing `(client)/` patron routes and screens
- `(server)/` routes and server-mode auth
- `CustomTabBar` design tokens and layout
- `clientFetch` Bearer injection logic (additions only)

---

## 11. File Checklist

### New Files
- `app/(staff-client)/_layout.tsx`
- `app/(staff-client)/circulation.tsx`
- `app/(staff-client)/catalog.tsx`
- `app/(staff-client)/members.tsx`
- `app/(staff-client)/reservations.tsx`
- `app/(staff-client)/book/[id].tsx`
- `app/(staff-client)/book/add.tsx`
- `app/(staff-client)/member/[id].tsx`
- `src/components/staff/PinSudoModal.tsx`

### Modified Files
- `app/(auth)/client-login.tsx` — role-based redirect after login
- `app/index.tsx` — role-based redirect on session restore
- `src/store/appStore.ts` — `staffElevatedUntil`, `elevateStaff`, `isStaffElevated`, `clearStaffElevation`
- `src/services/clientApi.ts` — `403` handler
- `nodejs-assets/nodejs-project/main.js` — `/api/staff/*` routes + role middleware

### Extracted (Refactor)
- `src/components/books/BookDetailLayout.tsx` — shared between `(server)/book/[id]` and `(staff-client)/book/[id]`
- `src/components/members/MemberDetailLayout.tsx` — shared between `(server)/member/[id]` and `(staff-client)/member/[id]`
