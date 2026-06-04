# Phase 2 — Extract packages/server + tRPC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `packages/server` (Hono + tRPC v11) with a full patron + admin router, bundled by esbuild directly into `apps/server/nodejs-assets/nodejs-project/main.js`, replacing the current hand-rolled REST server while keeping the React Native bridge pattern unchanged.

**Architecture:** `packages/server` is a pure TypeScript/Node.js package. On Android it runs inside `nodejs-mobile-react-native` and delegates every DB call back to the React Native side via `rn-bridge` (same pattern as the current `main.js`). esbuild bundles the TypeScript source to a single CJS file that replaces `main.js`. The librarian UI in `apps/server` keeps its existing direct-service-call pattern — nothing changes for it. Admin tRPC procedures are implemented now (needed by Phase 4 desktop) but no Android UI calls them yet.

**Tech Stack:** `@trpc/server@^11.0.0`, `hono@^4.7.11`, `zod@^3.25.23`, `esbuild@^0.25.4`, `rn-bridge` (runtime-provided by nodejs-mobile, not an npm dep)

---

## File Map

**New — `packages/server/`**
```
packages/server/
├── src/
│   ├── adapter/
│   │   ├── types.ts          ← DbAdapter interface (all methods)
│   │   └── bridge.ts         ← BridgeAdapter: wraps queryRN → DbAdapter
│   ├── middleware/
│   │   └── rateLimit.ts      ← in-memory per-account rate limiter
│   ├── router/
│   │   ├── auth.ts           ← auth.login, auth.logout
│   │   ├── catalog.ts        ← catalog.search, byId, recent, popular, similar
│   │   ├── me.ts             ← me.borrows, me.reservations, me.favorites
│   │   ├── borrows.ts        ← borrows.renew
│   │   ├── books.ts          ← books.reserve, toggleFavorite, favoriteStatus, reviews, addReview
│   │   ├── gate.ts           ← gate.log
│   │   ├── admin/
│   │   │   ├── books.ts      ← admin.books.*
│   │   │   ├── members.ts    ← admin.members.*
│   │   │   ├── circulation.ts← admin.circulation.*
│   │   │   ├── reports.ts    ← admin.reports.*
│   │   │   ├── inventory.ts  ← admin.inventory.*
│   │   │   ├── settings.ts   ← admin.settings.*
│   │   │   ├── backup.ts     ← admin.backup.*
│   │   │   └── index.ts      ← combines admin sub-routers
│   │   └── index.ts          ← AppRouter (combines all routers) + exports AppRouter type
│   ├── gate-html.ts          ← GATE_HTML constant (browser check-in page)
│   ├── beacon.ts             ← UDP discovery beacon
│   ├── trpc.ts               ← initTRPC, TRPCContext, procedure factories
│   ├── server.ts             ← initApp({ db }) → Hono app
│   └── index.android.ts      ← Android entry point (rn-bridge + http.createServer)
├── build.mjs                 ← esbuild script (outputs to apps/server/nodejs-assets)
├── package.json
└── tsconfig.json
```

**Modified — `apps/server/`**
```
apps/server/
├── src/services/
│   ├── ServerBridge.ts       ← updated: routes admin_* to AdminBridgeHandler
│   └── AdminBridgeHandler.ts ← NEW: handles admin bridge actions, calls services
├── nodejs-assets/nodejs-project/
│   └── main.js               ← DELETED — replaced by esbuild output
├── src/services/
│   └── ApiServer.ts          ← DELETED — logic absorbed into ServerBridge + AdminBridgeHandler
└── package.json              ← android script runs packages/server build first
```

**Modified — root**
```
turbo.json  ← add build task for packages/server pipeline
```

---

## Task 1: Scaffold packages/server

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`

- [ ] **Step 1: Create packages/server/package.json**

```json
{
  "name": "@bookleaf/server",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "node build.mjs",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@trpc/server": "^11.0.0",
    "hono": "^4.7.11",
    "zod": "^3.25.23"
  },
  "devDependencies": {
    "@bookleaf/tsconfig": "workspace:*",
    "@bookleaf/types": "workspace:*",
    "esbuild": "^0.25.4",
    "typescript": "~5.9.2"
  }
}
```

- [ ] **Step 2: Create packages/server/tsconfig.json**

```json
{
  "extends": "@bookleaf/tsconfig/base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run from repo root:
```powershell
pnpm install
```

Expected: `@bookleaf/server` workspace recognized, `hono`, `@trpc/server`, `zod`, `esbuild` installed.

- [ ] **Step 4: Commit**

```powershell
git add packages/server/
git commit -m "feat: scaffold packages/server workspace package"
```

---

## Task 2: DB Adapter interface + BridgeAdapter

The `DbAdapter` interface is the contract between the tRPC procedures and the underlying data source. On Android it is implemented by `BridgeAdapter` (delegates via `rn-bridge`). On Desktop (Phase 4) it will be implemented by a SQLite adapter.

**Files:**
- Create: `packages/server/src/adapter/types.ts`
- Create: `packages/server/src/adapter/bridge.ts`

- [ ] **Step 1: Create packages/server/src/adapter/types.ts**

```typescript
export interface SessionPrincipal {
  user_id: number;
  institution_id: number;
  role: string;
}

export interface DbAdapter {
  // ── Auth ──────────────────────────────────────────────────────────────────
  authenticateMember(
    idNumber: string,
    pin: string,
  ): Promise<{ user: Record<string, unknown>; token: string; expires_at: string } | null>;
  validateSession(token: string): Promise<SessionPrincipal | null>;
  logout(token: string): Promise<{ ok: true }>;

  // ── Catalog (public) ──────────────────────────────────────────────────────
  searchBooks(institutionId: number, query: string): Promise<unknown[]>;
  searchBooksFiltered(
    institutionId: number,
    query: string,
    filters: { materialType?: string; yearFrom?: number; yearTo?: number; language?: string },
  ): Promise<unknown[]>;
  getRecentlyAdded(institutionId: number, limit: number): Promise<unknown[]>;
  getPopular(institutionId: number, limit: number): Promise<unknown[]>;
  getBookDetail(resourceId: number): Promise<unknown | null>;
  getSimilarBooks(resourceId: number): Promise<unknown[]>;

  // ── Books (patron, protected) ─────────────────────────────────────────────
  getBookReviews(
    resourceId: number,
  ): Promise<{ reviews: unknown[]; avg_rating: number | null }>;
  submitReview(
    resourceId: number,
    userId: number,
    rating: number,
    comment: string | null,
  ): Promise<{ ok: true }>;
  toggleFavorite(resourceId: number, userId: number): Promise<unknown>;
  getFavoriteStatus(resourceId: number, userId: number): Promise<{ favorited: boolean }>;
  getMemberFavorites(userId: number): Promise<unknown | null>;
  reserveBook(resourceId: number, userId: number): Promise<unknown>;

  // ── Me (protected) ────────────────────────────────────────────────────────
  getMemberBorrows(userId: number): Promise<unknown | null>;
  getMemberReservations(userId: number): Promise<unknown | null>;

  // ── Borrows (protected) ───────────────────────────────────────────────────
  renewBorrow(borrowingId: number, userId: number): Promise<unknown>;

  // ── Gate ──────────────────────────────────────────────────────────────────
  gateLogByUserId(
    userId: number,
    institutionId: number,
    method: 'app' | 'browser' | 'manual',
  ): Promise<unknown | null>;
  gateVerifyAndLog(
    idNumber: string,
    pin: string,
    institutionId: number,
  ): Promise<unknown | null>;

  // ── Admin: Books ──────────────────────────────────────────────────────────
  adminListBooks(institutionId: number, q?: string): Promise<unknown[]>;
  adminGetBook(id: number): Promise<unknown | null>;
  adminGetBookWithCopies(id: number): Promise<unknown | null>;
  adminCreateBook(
    institutionId: number,
    data: Record<string, unknown>,
    copies: Array<{ accession_number?: string; barcode?: string; shelf_location?: string }>,
  ): Promise<{ id: number }>;
  adminUpdateBook(id: number, data: Record<string, unknown>): Promise<void>;
  adminDeleteBook(id: number): Promise<void>;
  adminAddCopy(resourceId: number): Promise<void>;

  // ── Admin: Members ────────────────────────────────────────────────────────
  adminListMembers(institutionId: number, q?: string): Promise<unknown[]>;
  adminGetMember(id: number): Promise<unknown | null>;
  adminCreateMember(data: Record<string, unknown>): Promise<{ id: number }>;
  adminUpdateMember(id: number, data: Record<string, unknown>): Promise<void>;
  adminSetMemberActive(id: number, isActive: boolean): Promise<void>;
  adminResetMemberPin(id: number, newPin: string): Promise<void>;

  // ── Admin: Circulation ────────────────────────────────────────────────────
  adminActiveBorrows(institutionId: number): Promise<unknown[]>;
  adminOverdueBorrows(institutionId: number): Promise<unknown[]>;
  adminCheckout(copyId: number, userId: number): Promise<{ borrowingId: number }>;
  adminReturn(borrowingId: number, condition: string): Promise<unknown | null>;
  adminPendingReservations(institutionId: number): Promise<unknown[]>;
  adminCancelReservation(reservationId: number): Promise<void>;
  adminPayFine(borrowingId: number): Promise<void>;

  // ── Admin: Reports ────────────────────────────────────────────────────────
  adminCirculationReport(institutionId: number): Promise<unknown>;
  adminCollectionReport(institutionId: number): Promise<unknown>;
  adminFinesReport(institutionId: number): Promise<unknown>;
  adminPatronReport(institutionId: number): Promise<unknown>;

  // ── Admin: Inventory ──────────────────────────────────────────────────────
  adminActiveInventorySession(institutionId: number): Promise<unknown | null>;
  adminStartInventorySession(institutionId: number): Promise<unknown>;
  adminInventoryScan(
    sessionId: number,
    isbn: string,
    institutionId: number,
  ): Promise<unknown>;
  adminFinishInventorySession(sessionId: number): Promise<unknown>;

  // ── Admin: Settings ───────────────────────────────────────────────────────
  adminGetSettings(institutionId: number): Promise<unknown>;
  adminUpdateSettings(institutionId: number, data: Record<string, unknown>): Promise<void>;

  // ── Admin: Backup ─────────────────────────────────────────────────────────
  adminExportBackup(
    institutionId: number,
    passphrase: string,
  ): Promise<{ encryptedData: string }>;
  adminImportBackup(
    institutionId: number,
    encryptedData: string,
    passphrase: string,
  ): Promise<{ ok: true; imported: number }>;
}
```

- [ ] **Step 2: Create packages/server/src/adapter/bridge.ts**

The `BridgeAdapter` wraps the `queryRN` function (provided by the Android entry point) into the `DbAdapter` interface. Each method sends a named action to React Native and awaits the response.

```typescript
import type { DbAdapter, SessionPrincipal } from './types';

type QueryFn = (action: string, params: Record<string, unknown>) => Promise<unknown>;

export function createBridgeAdapter(queryRN: QueryFn): DbAdapter {
  const q = queryRN;

  return {
    // ── Auth ────────────────────────────────────────────────────────────────
    authenticateMember: (idNumber, pin) =>
      q('authenticateMember', { idNumber, pin }) as Promise<
        { user: Record<string, unknown>; token: string; expires_at: string } | null
      >,

    validateSession: (token) =>
      q('validateSession', { token }) as Promise<SessionPrincipal | null>,

    logout: (token) =>
      q('logout', { token }) as Promise<{ ok: true }>,

    // ── Catalog ─────────────────────────────────────────────────────────────
    searchBooks: (institutionId, query) =>
      q('searchBooks', { institutionId, q: query }) as Promise<unknown[]>,

    searchBooksFiltered: (institutionId, query, filters) =>
      q('searchBooksFiltered', {
        query,
        materialType: filters.materialType,
        yearFrom: filters.yearFrom,
        yearTo: filters.yearTo,
        language: filters.language,
      }) as Promise<unknown[]>,

    getRecentlyAdded: (institutionId, limit) =>
      q('getRecentlyAdded', { institutionId, limit }) as Promise<unknown[]>,

    getPopular: (institutionId, limit) =>
      q('getPopular', { institutionId, limit }) as Promise<unknown[]>,

    getBookDetail: (resourceId) =>
      q('getBookDetail', { id: resourceId }) as Promise<unknown | null>,

    getSimilarBooks: (resourceId) =>
      q('getSimilarBooks', { resourceId }) as Promise<unknown[]>,

    // ── Books ────────────────────────────────────────────────────────────────
    getBookReviews: (resourceId) =>
      q('getBookReviews', { resourceId }) as Promise<{
        reviews: unknown[];
        avg_rating: number | null;
      }>,

    submitReview: (resourceId, userId, rating, comment) =>
      q('submitReview', { resourceId, userId, rating, comment }) as Promise<{ ok: true }>,

    toggleFavorite: (resourceId, userId) =>
      q('toggleFavorite', { resourceId, userId }) as Promise<unknown>,

    getFavoriteStatus: (resourceId, userId) =>
      q('getFavoriteStatus', { resourceId, userId }) as Promise<{ favorited: boolean }>,

    getMemberFavorites: (userId) =>
      q('getMemberFavorites', { userId }) as Promise<unknown | null>,

    reserveBook: (resourceId, userId) =>
      q('reserveBook', { resourceId, userId }) as Promise<unknown>,

    // ── Me ───────────────────────────────────────────────────────────────────
    getMemberBorrows: (userId) =>
      q('getMemberBorrows', { userId }) as Promise<unknown | null>,

    getMemberReservations: (userId) =>
      q('getMemberReservations', { userId }) as Promise<unknown | null>,

    // ── Borrows ──────────────────────────────────────────────────────────────
    renewBorrow: (borrowingId, userId) =>
      q('renewBorrow', { borrowingId, userId }) as Promise<unknown>,

    // ── Gate ─────────────────────────────────────────────────────────────────
    gateLogByUserId: (userId, institutionId, method) =>
      q('gateLogByUserId', { userId, institutionId, method }) as Promise<unknown | null>,

    gateVerifyAndLog: (idNumber, pin, institutionId) =>
      q('gateVerifyAndLog', { idNumber, pin, institutionId }) as Promise<unknown | null>,

    // ── Admin: Books ─────────────────────────────────────────────────────────
    adminListBooks: (institutionId, q2) =>
      q('adminListBooks', { institutionId, q: q2 }) as Promise<unknown[]>,

    adminGetBook: (id) =>
      q('adminGetBook', { id }) as Promise<unknown | null>,

    adminGetBookWithCopies: (id) =>
      q('adminGetBookWithCopies', { id }) as Promise<unknown | null>,

    adminCreateBook: (institutionId, data, copies) =>
      q('adminCreateBook', { institutionId, data, copies }) as Promise<{ id: number }>,

    adminUpdateBook: (id, data) =>
      q('adminUpdateBook', { id, data }).then(() => undefined),

    adminDeleteBook: (id) =>
      q('adminDeleteBook', { id }).then(() => undefined),

    adminAddCopy: (resourceId) =>
      q('adminAddCopy', { resourceId }).then(() => undefined),

    // ── Admin: Members ───────────────────────────────────────────────────────
    adminListMembers: (institutionId, q2) =>
      q('adminListMembers', { institutionId, q: q2 }) as Promise<unknown[]>,

    adminGetMember: (id) =>
      q('adminGetMember', { id }) as Promise<unknown | null>,

    adminCreateMember: (data) =>
      q('adminCreateMember', { data }) as Promise<{ id: number }>,

    adminUpdateMember: (id, data) =>
      q('adminUpdateMember', { id, data }).then(() => undefined),

    adminSetMemberActive: (id, isActive) =>
      q('adminSetMemberActive', { id, isActive }).then(() => undefined),

    adminResetMemberPin: (id, newPin) =>
      q('adminResetMemberPin', { id, newPin }).then(() => undefined),

    // ── Admin: Circulation ───────────────────────────────────────────────────
    adminActiveBorrows: (institutionId) =>
      q('adminActiveBorrows', { institutionId }) as Promise<unknown[]>,

    adminOverdueBorrows: (institutionId) =>
      q('adminOverdueBorrows', { institutionId }) as Promise<unknown[]>,

    adminCheckout: (copyId, userId) =>
      q('adminCheckout', { copyId, userId }) as Promise<{ borrowingId: number }>,

    adminReturn: (borrowingId, condition) =>
      q('adminReturn', { borrowingId, condition }) as Promise<unknown | null>,

    adminPendingReservations: (institutionId) =>
      q('adminPendingReservations', { institutionId }) as Promise<unknown[]>,

    adminCancelReservation: (reservationId) =>
      q('adminCancelReservation', { reservationId }).then(() => undefined),

    adminPayFine: (borrowingId) =>
      q('adminPayFine', { borrowingId }).then(() => undefined),

    // ── Admin: Reports ───────────────────────────────────────────────────────
    adminCirculationReport: (institutionId) =>
      q('adminCirculationReport', { institutionId }) as Promise<unknown>,

    adminCollectionReport: (institutionId) =>
      q('adminCollectionReport', { institutionId }) as Promise<unknown>,

    adminFinesReport: (institutionId) =>
      q('adminFinesReport', { institutionId }) as Promise<unknown>,

    adminPatronReport: (institutionId) =>
      q('adminPatronReport', { institutionId }) as Promise<unknown>,

    // ── Admin: Inventory ─────────────────────────────────────────────────────
    adminActiveInventorySession: (institutionId) =>
      q('adminActiveInventorySession', { institutionId }) as Promise<unknown | null>,

    adminStartInventorySession: (institutionId) =>
      q('adminStartInventorySession', { institutionId }) as Promise<unknown>,

    adminInventoryScan: (sessionId, isbn, institutionId) =>
      q('adminInventoryScan', { sessionId, isbn, institutionId }) as Promise<unknown>,

    adminFinishInventorySession: (sessionId) =>
      q('adminFinishInventorySession', { sessionId }) as Promise<unknown>,

    // ── Admin: Settings ──────────────────────────────────────────────────────
    adminGetSettings: (institutionId) =>
      q('adminGetSettings', { institutionId }) as Promise<unknown>,

    adminUpdateSettings: (institutionId, data) =>
      q('adminUpdateSettings', { institutionId, data }).then(() => undefined),

    // ── Admin: Backup ────────────────────────────────────────────────────────
    adminExportBackup: (institutionId, passphrase) =>
      q('adminExportBackup', { institutionId, passphrase }) as Promise<{
        encryptedData: string;
      }>,

    adminImportBackup: (institutionId, encryptedData, passphrase) =>
      q('adminImportBackup', { institutionId, encryptedData, passphrase }) as Promise<{
        ok: true;
        imported: number;
      }>,
  };
}
```

- [ ] **Step 3: Commit**

```powershell
git add packages/server/src/adapter/
git commit -m "feat(server): add DbAdapter interface and BridgeAdapter"
```

---

## Task 3: tRPC core, rate limiter, gate HTML, UDP beacon

**Files:**
- Create: `packages/server/src/trpc.ts`
- Create: `packages/server/src/middleware/rateLimit.ts`
- Create: `packages/server/src/gate-html.ts`
- Create: `packages/server/src/beacon.ts`

- [ ] **Step 1: Create packages/server/src/trpc.ts**

```typescript
import { initTRPC, TRPCError } from '@trpc/server';
import type { DbAdapter, SessionPrincipal } from './adapter/types';

export type TRPCContext = {
  db: DbAdapter;
  principal: SessionPrincipal | null;
};

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Requires a valid Bearer token — used for patron endpoints. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.principal) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, principal: ctx.principal } });
});

/** Requires admin or librarian role — used for librarian/admin endpoints. */
export const librarianProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.principal) throw new TRPCError({ code: 'UNAUTHORIZED' });
  if (ctx.principal.role !== 'admin' && ctx.principal.role !== 'librarian') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx: { ...ctx, principal: ctx.principal } });
});
```

- [ ] **Step 2: Create packages/server/src/middleware/rateLimit.ts**

Ported directly from `main.js`. In-memory, per-account. Unlocks on success.

```typescript
interface RateLimitEntry {
  count: number;
  blockedUntil: number;
  lastActivity: number;
}

const loginFailures = new Map<string, RateLimitEntry>();

// Prune stale entries every 5 minutes
const cleanup = setInterval(() => {
  const now = Date.now();
  const cutoff = now - 60 * 60 * 1000;
  for (const [k, e] of loginFailures.entries()) {
    if (e.lastActivity < cutoff && e.blockedUntil < now) loginFailures.delete(k);
  }
}, 5 * 60 * 1000);
if ((cleanup as NodeJS.Timeout).unref) (cleanup as NodeJS.Timeout).unref();

export function rateLimitCheck(key: string): { blocked: false } | { blocked: true; retryAfter: number } {
  const now = Date.now();
  const entry = loginFailures.get(key);
  if (!entry) return { blocked: false };
  if (entry.blockedUntil > now) {
    return { blocked: true, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  return { blocked: false };
}

export function rateLimitRecordFailure(key: string): void {
  const now = Date.now();
  const entry = loginFailures.get(key) ?? { count: 0, blockedUntil: 0, lastActivity: now };
  entry.count += 1;
  entry.lastActivity = now;
  if (entry.count >= 15) entry.blockedUntil = now + 15 * 60 * 1000;
  else if (entry.count >= 10) entry.blockedUntil = now + 5 * 60 * 1000;
  else if (entry.count >= 5) entry.blockedUntil = now + 60 * 1000;
  loginFailures.set(key, entry);
}

export function rateLimitRecordSuccess(key: string): void {
  loginFailures.delete(key);
}
```

- [ ] **Step 3: Create packages/server/src/gate-html.ts**

Exact HTML from `main.js` extracted as a constant.

```typescript
export const GATE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Library Gate Check-in</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#F4F9F4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;border-radius:20px;padding:32px 28px;width:100%;max-width:380px;box-shadow:0 4px 24px rgba(42,92,51,.1)}
  h1{color:#2A5C33;font-size:22px;font-weight:800;margin-bottom:4px}
  p{color:#7A9A7E;font-size:13px;margin-bottom:24px}
  label{display:block;font-size:12px;font-weight:700;color:#2A5C33;margin-bottom:6px;letter-spacing:.5px;text-transform:uppercase}
  input{width:100%;border:1.5px solid #D1E8D0;border-radius:12px;padding:13px 16px;font-size:15px;color:#1C2B1E;outline:none;margin-bottom:16px}
  input:focus{border-color:#2A5C33}
  button{width:100%;background:#5CB85C;color:#fff;border:none;border-radius:14px;padding:15px;font-size:16px;font-weight:700;cursor:pointer}
  button:active{background:#2A5C33}
  .msg{margin-top:20px;padding:14px 16px;border-radius:12px;font-size:14px;font-weight:600;text-align:center}
  .in{background:#DCFCE7;color:#16A34A}
  .out{background:#FEF3C7;color:#D97706}
  .err{background:#FEE2E2;color:#DC2626}
</style>
</head>
<body>
<div class="card">
  <h1>📚 Library Gate</h1>
  <p>Enter your library ID and PIN to check in or out.</p>
  <form id="f">
    <label>Library ID</label>
    <input id="id" type="text" autocomplete="off" placeholder="e.g. 2024-001" required/>
    <label>PIN</label>
    <input id="pin" type="password" placeholder="4-digit PIN" required/>
    <button type="submit">Check In / Out</button>
  </form>
  <div id="msg"></div>
</div>
<script>
document.getElementById('f').addEventListener('submit',async function(e){
  e.preventDefault();
  const btn=document.querySelector('button');
  btn.disabled=true;btn.textContent='Please wait…';
  const msgEl=document.getElementById('msg');
  msgEl.className='msg';msgEl.textContent='';
  try{
    const r=await fetch(location.pathname+'/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({idNumber:document.getElementById('id').value,pin:document.getElementById('pin').value})
    });
    const d=await r.json();
    if(!r.ok||d.error){msgEl.className='msg err';msgEl.textContent=d.error||'Login failed.';}
    else{
      const dir=d.direction==='in'?'✅ Checked IN':'👋 Checked OUT';
      msgEl.className='msg '+(d.direction==='in'?'in':'out');
      msgEl.textContent=dir+' — '+d.user_name;
      document.getElementById('id').value='';
      document.getElementById('pin').value='';
    }
  }catch{msgEl.className='msg err';msgEl.textContent='Cannot reach server.';}
  finally{btn.disabled=false;btn.textContent='Check In / Out';}
});
</script>
</body>
</html>`;
```

- [ ] **Step 4: Create packages/server/src/beacon.ts**

UDP broadcast identical to current `main.js` `startBeacon`/`stopBeacon`.

```typescript
import { createSocket, Socket } from 'dgram';

const DISCOVERY_PORT = 41234;

let beaconSocket: Socket | null = null;
let beaconInterval: ReturnType<typeof setInterval> | null = null;

export function startBeacon(port: number): void {
  beaconSocket = createSocket('udp4');
  beaconSocket.bind(() => {
    beaconSocket!.setBroadcast(true);
    const msg = Buffer.from(
      JSON.stringify({ type: 'bookleaf_beacon', name: 'Bookleaf Library', port }),
    );
    beaconInterval = setInterval(() => {
      beaconSocket?.send(msg, 0, msg.length, DISCOVERY_PORT, '255.255.255.255');
    }, 3000);
  });
}

export function stopBeacon(): void {
  if (beaconInterval) { clearInterval(beaconInterval); beaconInterval = null; }
  if (beaconSocket) { try { beaconSocket.close(); } catch { /* ignore */ } beaconSocket = null; }
}
```

- [ ] **Step 5: Commit**

```powershell
git add packages/server/src/trpc.ts packages/server/src/middleware/ packages/server/src/gate-html.ts packages/server/src/beacon.ts
git commit -m "feat(server): add tRPC core, rate limiter, gate HTML, UDP beacon"
```

---

## Task 4: Patron tRPC router — auth + catalog

**Files:**
- Create: `packages/server/src/router/auth.ts`
- Create: `packages/server/src/router/catalog.ts`

- [ ] **Step 1: Create packages/server/src/router/auth.ts**

```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { rateLimitCheck, rateLimitRecordFailure, rateLimitRecordSuccess } from '../middleware/rateLimit';

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ idNumber: z.string(), pin: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const rl = rateLimitCheck(`auth:${input.idNumber}`);
      if (rl.blocked) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many failed attempts. Try again in ${rl.retryAfter}s.`,
        });
      }
      const result = await ctx.db.authenticateMember(input.idNumber, input.pin);
      if (!result) {
        rateLimitRecordFailure(`auth:${input.idNumber}`);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid ID or PIN' });
      }
      rateLimitRecordSuccess(`auth:${input.idNumber}`);
      return result;
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    // Token is extracted from the Authorization header in createContext
    // We resolve it again here by re-validating; principal already holds user info
    // The token itself was used to create ctx.principal — pass it back via meta if needed.
    // For now, logout is best-effort: client should discard its token regardless.
    return { ok: true as const };
  }),
});
```

> **Note on logout:** The token string is not threaded into TRPCContext in this design — `ctx.principal` holds the resolved identity but not the raw token. To properly revoke the token, extend `TRPCContext` to include `token: string | null` and set it in `createContext` (see `server.ts` Task 8). Until then, logout is a no-op server-side (patron discards the token locally). Add `token` to `TRPCContext` in `trpc.ts` and pass it from `createContext` before wiring logout properly.

- [ ] **Step 2: Update trpc.ts to include token in context**

Open `packages/server/src/trpc.ts` and add `token` to `TRPCContext`:

```typescript
export type TRPCContext = {
  db: DbAdapter;
  principal: SessionPrincipal | null;
  token: string | null;      // ← add this line
};
```

- [ ] **Step 3: Update auth.ts logout to revoke token**

Replace the logout mutation body:

```typescript
  logout: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.token) await ctx.db.logout(ctx.token);
    return { ok: true as const };
  }),
```

- [ ] **Step 4: Create packages/server/src/router/catalog.ts**

```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';

export const catalogRouter = router({
  search: publicProcedure
    .input(
      z.object({
        institutionId: z.number().int(),
        q: z.string().default(''),
        type: z.string().optional(),
        yearFrom: z.number().int().optional(),
        yearTo: z.number().int().optional(),
        language: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const hasFilters = input.type || input.yearFrom || input.yearTo || input.language;
      if (hasFilters || input.q) {
        return ctx.db.searchBooksFiltered(input.institutionId, input.q, {
          materialType: input.type,
          yearFrom: input.yearFrom,
          yearTo: input.yearTo,
          language: input.language,
        });
      }
      return ctx.db.searchBooks(input.institutionId, input.q);
    }),

  byId: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const book = await ctx.db.getBookDetail(input.id);
      if (!book) throw new TRPCError({ code: 'NOT_FOUND', message: 'Book not found' });
      return book;
    }),

  recent: publicProcedure
    .input(z.object({ institutionId: z.number().int(), limit: z.number().int().default(10) }))
    .query(({ input, ctx }) => ctx.db.getRecentlyAdded(input.institutionId, input.limit)),

  popular: publicProcedure
    .input(z.object({ institutionId: z.number().int(), limit: z.number().int().default(10) }))
    .query(({ input, ctx }) => ctx.db.getPopular(input.institutionId, input.limit)),

  similar: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.getSimilarBooks(input.id)),
});
```

- [ ] **Step 5: Commit**

```powershell
git add packages/server/src/router/auth.ts packages/server/src/router/catalog.ts packages/server/src/trpc.ts
git commit -m "feat(server): add auth and catalog tRPC routers"
```

---

## Task 5: Patron tRPC router — me, borrows, books, gate, root

**Files:**
- Create: `packages/server/src/router/me.ts`
- Create: `packages/server/src/router/borrows.ts`
- Create: `packages/server/src/router/books.ts`
- Create: `packages/server/src/router/gate.ts`
- Create: `packages/server/src/router/index.ts`

- [ ] **Step 1: Create packages/server/src/router/me.ts**

```typescript
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';

export const meRouter = router({
  borrows: protectedProcedure.query(async ({ ctx }) => {
    const data = await ctx.db.getMemberBorrows(ctx.principal.user_id);
    if (!data) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
    return data;
  }),

  reservations: protectedProcedure.query(async ({ ctx }) => {
    const data = await ctx.db.getMemberReservations(ctx.principal.user_id);
    if (!data) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
    return data;
  }),

  favorites: protectedProcedure.query(async ({ ctx }) => {
    const data = await ctx.db.getMemberFavorites(ctx.principal.user_id);
    if (!data) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
    return data;
  }),
});
```

- [ ] **Step 2: Create packages/server/src/router/borrows.ts**

```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';

export const borrowsRouter = router({
  renew: protectedProcedure
    .input(z.object({ borrowingId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.renewBorrow(input.borrowingId, ctx.principal.user_id);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not renew',
        });
      }
    }),
});
```

- [ ] **Step 3: Create packages/server/src/router/books.ts**

```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';

export const booksRouter = router({
  reviews: publicProcedure
    .input(z.object({ resourceId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.getBookReviews(input.resourceId)),

  addReview: protectedProcedure
    .input(
      z.object({
        resourceId: z.number().int(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.submitReview(
          input.resourceId,
          ctx.principal.user_id,
          input.rating,
          input.comment ?? null,
        );
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not submit review',
        });
      }
    }),

  favoriteStatus: protectedProcedure
    .input(z.object({ resourceId: z.number().int() }))
    .query(({ input, ctx }) =>
      ctx.db.getFavoriteStatus(input.resourceId, ctx.principal.user_id),
    ),

  toggleFavorite: protectedProcedure
    .input(z.object({ resourceId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.toggleFavorite(input.resourceId, ctx.principal.user_id);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not toggle favorite',
        });
      }
    }),

  reserve: protectedProcedure
    .input(z.object({ resourceId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.reserveBook(input.resourceId, ctx.principal.user_id);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not reserve book',
        });
      }
    }),
});
```

- [ ] **Step 4: Create packages/server/src/router/gate.ts**

```typescript
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const gateRouter = router({
  log: protectedProcedure.mutation(async ({ ctx }) => {
    const data = await ctx.db.gateLogByUserId(
      ctx.principal.user_id,
      ctx.principal.institution_id,
      'app',
    );
    if (!data) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
    return data;
  }),
});
```

- [ ] **Step 5: Create packages/server/src/router/admin/books.ts**

```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

export const adminBooksRouter = router({
  list: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), q: z.string().optional() }))
    .query(({ input, ctx }) => ctx.db.adminListBooks(input.institutionId, input.q)),

  get: librarianProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const book = await ctx.db.adminGetBookWithCopies(input.id);
      if (!book) throw new TRPCError({ code: 'NOT_FOUND', message: 'Book not found' });
      return book;
    }),

  create: librarianProcedure
    .input(
      z.object({
        institutionId: z.number().int(),
        data: z.record(z.unknown()),
        copies: z
          .array(
            z.object({
              accession_number: z.string().optional(),
              barcode: z.string().optional(),
              shelf_location: z.string().optional(),
            }),
          )
          .default([]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminCreateBook(input.institutionId, input.data, input.copies);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not create book',
        });
      }
    }),

  update: librarianProcedure
    .input(z.object({ id: z.number().int(), data: z.record(z.unknown()) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminUpdateBook(input.id, input.data);
      return { ok: true as const };
    }),

  delete: librarianProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminDeleteBook(input.id);
      return { ok: true as const };
    }),

  addCopy: librarianProcedure
    .input(z.object({ resourceId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminAddCopy(input.resourceId);
      return { ok: true as const };
    }),
});
```

- [ ] **Step 6: Create packages/server/src/router/admin/members.ts**

```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

export const adminMembersRouter = router({
  list: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), q: z.string().optional() }))
    .query(({ input, ctx }) => ctx.db.adminListMembers(input.institutionId, input.q)),

  get: librarianProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const member = await ctx.db.adminGetMember(input.id);
      if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      return member;
    }),

  create: librarianProcedure
    .input(z.object({ data: z.record(z.unknown()) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminCreateMember(input.data);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not create member',
        });
      }
    }),

  update: librarianProcedure
    .input(z.object({ id: z.number().int(), data: z.record(z.unknown()) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminUpdateMember(input.id, input.data);
      return { ok: true as const };
    }),

  setActive: librarianProcedure
    .input(z.object({ id: z.number().int(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminSetMemberActive(input.id, input.isActive);
      return { ok: true as const };
    }),

  resetPin: librarianProcedure
    .input(z.object({ id: z.number().int(), newPin: z.string().min(4) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminResetMemberPin(input.id, input.newPin);
      return { ok: true as const };
    }),
});
```

- [ ] **Step 7: Create packages/server/src/router/admin/circulation.ts**

```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

export const adminCirculationRouter = router({
  activeBorrows: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminActiveBorrows(input.institutionId)),

  overdueBorrows: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminOverdueBorrows(input.institutionId)),

  checkout: librarianProcedure
    .input(z.object({ copyId: z.number().int(), userId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminCheckout(input.copyId, input.userId);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not check out',
        });
      }
    }),

  return: librarianProcedure
    .input(
      z.object({
        borrowingId: z.number().int(),
        condition: z.enum(['good', 'damaged', 'lost']).default('good'),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminReturn(input.borrowingId, input.condition);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not return book',
        });
      }
    }),

  pendingReservations: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminPendingReservations(input.institutionId)),

  cancelReservation: librarianProcedure
    .input(z.object({ reservationId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminCancelReservation(input.reservationId);
      return { ok: true as const };
    }),

  payFine: librarianProcedure
    .input(z.object({ borrowingId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminPayFine(input.borrowingId);
      return { ok: true as const };
    }),
});
```

- [ ] **Step 8: Create packages/server/src/router/admin/reports.ts**

```typescript
import { z } from 'zod';
import { router, librarianProcedure } from '../../trpc';

export const adminReportsRouter = router({
  circulation: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminCirculationReport(input.institutionId)),

  collection: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminCollectionReport(input.institutionId)),

  fines: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminFinesReport(input.institutionId)),

  patron: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminPatronReport(input.institutionId)),
});
```

- [ ] **Step 9: Create packages/server/src/router/admin/inventory.ts**

```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

export const adminInventoryRouter = router({
  activeSession: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminActiveInventorySession(input.institutionId)),

  startSession: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminStartInventorySession(input.institutionId);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not start session',
        });
      }
    }),

  scan: librarianProcedure
    .input(
      z.object({
        sessionId: z.number().int(),
        isbn: z.string(),
        institutionId: z.number().int(),
      }),
    )
    .mutation(({ input, ctx }) =>
      ctx.db.adminInventoryScan(input.sessionId, input.isbn, input.institutionId),
    ),

  finishSession: librarianProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminFinishInventorySession(input.sessionId);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not finish session',
        });
      }
    }),
});
```

- [ ] **Step 10: Create packages/server/src/router/admin/settings.ts**

```typescript
import { z } from 'zod';
import { router, librarianProcedure } from '../../trpc';

export const adminSettingsRouter = router({
  get: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminGetSettings(input.institutionId)),

  update: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), data: z.record(z.unknown()) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminUpdateSettings(input.institutionId, input.data);
      return { ok: true as const };
    }),
});
```

- [ ] **Step 11: Create packages/server/src/router/admin/backup.ts**

```typescript
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

export const adminBackupRouter = router({
  export: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), passphrase: z.string().min(6) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminExportBackup(input.institutionId, input.passphrase);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Export failed',
        });
      }
    }),

  import: librarianProcedure
    .input(
      z.object({
        institutionId: z.number().int(),
        encryptedData: z.string(),
        passphrase: z.string().min(6),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminImportBackup(
          input.institutionId,
          input.encryptedData,
          input.passphrase,
        );
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Import failed',
        });
      }
    }),
});
```

- [ ] **Step 12: Create packages/server/src/router/admin/index.ts**

```typescript
import { router } from '../../trpc';
import { adminBooksRouter } from './books';
import { adminMembersRouter } from './members';
import { adminCirculationRouter } from './circulation';
import { adminReportsRouter } from './reports';
import { adminInventoryRouter } from './inventory';
import { adminSettingsRouter } from './settings';
import { adminBackupRouter } from './backup';

export const adminRouter = router({
  books: adminBooksRouter,
  members: adminMembersRouter,
  circulation: adminCirculationRouter,
  reports: adminReportsRouter,
  inventory: adminInventoryRouter,
  settings: adminSettingsRouter,
  backup: adminBackupRouter,
});
```

- [ ] **Step 13: Create packages/server/src/router/index.ts**

```typescript
import { router } from '../trpc';
import { authRouter } from './auth';
import { catalogRouter } from './catalog';
import { meRouter } from './me';
import { borrowsRouter } from './borrows';
import { booksRouter } from './books';
import { gateRouter } from './gate';
import { adminRouter } from './admin';

export const appRouter = router({
  auth: authRouter,
  catalog: catalogRouter,
  me: meRouter,
  borrows: borrowsRouter,
  books: booksRouter,
  gate: gateRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
```

- [ ] **Step 14: Commit**

```powershell
git add packages/server/src/router/
git commit -m "feat(server): add full tRPC router (patron + admin procedures)"
```

---

## Task 6: Hono server factory + Android entry point

**Files:**
- Create: `packages/server/src/server.ts`
- Create: `packages/server/src/index.android.ts`

- [ ] **Step 1: Create packages/server/src/server.ts**

`initApp` returns a Hono app configured with tRPC, CORS, and the browser gate page. Takes a `DbAdapter` so the same factory works for both Android and Desktop.

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './router';
import type { DbAdapter } from './adapter/types';
import type { TRPCContext } from './trpc';
import { GATE_HTML } from './gate-html';
import { rateLimitCheck, rateLimitRecordFailure, rateLimitRecordSuccess } from './middleware/rateLimit';

async function createContext(
  req: Request,
  db: DbAdapter,
): Promise<TRPCContext> {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  let principal: TRPCContext['principal'] = null;
  let token: string | null = null;
  if (header) {
    const match = header.match(/^Bearer\s+(\S+)$/i);
    if (match) {
      token = match[1];
      principal = await db.validateSession(token);
    }
  }
  return { db, principal, token };
}

export function initApp({ db }: { db: DbAdapter }): Hono {
  const app = new Hono();

  app.use(
    '*',
    cors({
      origin: '*',
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
    }),
  );

  app.get('/ping', (c) => c.json({ ok: true, timestamp: new Date().toISOString() }));

  // Browser gate page (served as HTML to patron's mobile browser)
  app.get('/gate', (c) => c.html(GATE_HTML));

  // Browser gate login — PIN-per-request, no token issued
  app.post('/gate/login', async (c) => {
    let body: { idNumber?: string; pin?: string; institutionId?: number };
    try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid request body.' }, 400); }
    const { idNumber, pin, institutionId = 1 } = body;
    if (!idNumber || !pin) return c.json({ error: 'idNumber and pin are required.' }, 400);
    const rl = rateLimitCheck(`gate:${idNumber}`);
    if (rl.blocked) {
      return c.json(
        { error: 'Too many failed attempts. Try again later.', retry_after: rl.retryAfter },
        429,
      );
    }
    const data = await db.gateVerifyAndLog(idNumber, pin, institutionId);
    if (!data) {
      rateLimitRecordFailure(`gate:${idNumber}`);
      return c.json({ error: 'Invalid ID or PIN.' }, 401);
    }
    rateLimitRecordSuccess(`gate:${idNumber}`);
    return c.json(data);
  });

  // tRPC endpoint — handles all /trpc/* routes
  app.all('/trpc/*', async (c) => {
    return fetchRequestHandler({
      endpoint: '/trpc',
      req: c.req.raw,
      router: appRouter,
      createContext: () => createContext(c.req.raw, db),
    });
  });

  return app;
}
```

- [ ] **Step 2: Create packages/server/src/index.android.ts**

This is the file esbuild bundles into `main.js`. It wires `rn-bridge` into a `queryRN` function, hands it to `createBridgeAdapter`, then starts a Node.js HTTP server wrapping the Hono app.

```typescript
// rn-bridge is provided by nodejs-mobile at runtime — not an npm package.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rn_bridge = require('rn-bridge') as {
  channel: {
    send(data: string): void;
    on(event: 'message', listener: (data: string) => void): void;
  };
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const http = require('http') as typeof import('http');

import { initApp } from './server';
import { createBridgeAdapter } from './adapter/bridge';
import { startBeacon, stopBeacon } from './beacon';

const PORT = 3000;

// ── Bridge message passing ────────────────────────────────────────────────────
const pending = new Map<number, (data: unknown) => void>();
let nextId = 0;

function queryRN(action: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, resolve);
    rn_bridge.channel.send(JSON.stringify({ requestId: id, action, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`RN query timeout: ${action}`));
      }
    }, 15_000);
  });
}

// ── Hono app ──────────────────────────────────────────────────────────────────
const db = createBridgeAdapter(queryRN);
const app = initApp({ db });

// ── HTTP server (Node.js http → Hono fetch interface) ─────────────────────────
const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
  const bodyBuf = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

  const url = `http://0.0.0.0:${PORT}${req.url ?? '/'}`;
  const fetchReq = new Request(url, {
    method: req.method ?? 'GET',
    headers: req.headers as HeadersInit,
    body: bodyBuf && bodyBuf.length > 0 ? bodyBuf : undefined,
  });

  const fetchRes = await app.fetch(fetchReq);

  const headers: Record<string, string> = {};
  fetchRes.headers.forEach((v, k) => { headers[k] = v; });
  res.writeHead(fetchRes.status, headers);
  const buf = await fetchRes.arrayBuffer();
  res.end(Buffer.from(buf));
});

// ── Message routing: stop signal + DB response callbacks ─────────────────────
rn_bridge.channel.on('message', (raw: string) => {
  try {
    const msg = JSON.parse(raw) as { type?: string; requestId?: number; data?: unknown };
    if (msg.type === 'stop') {
      stopBeacon();
      server.close(() => process.exit(0));
      return;
    }
    if (typeof msg.requestId === 'number') {
      const resolve = pending.get(msg.requestId);
      if (resolve) {
        resolve(msg.data);
        pending.delete(msg.requestId);
      }
    }
  } catch {
    // malformed message — ignore
  }
});

server.listen(PORT, '0.0.0.0', () => {
  rn_bridge.channel.send(JSON.stringify({ type: 'server_ready', port: PORT }));
  startBeacon(PORT);
});

server.on('error', (err: Error) => {
  rn_bridge.channel.send(JSON.stringify({ type: 'server_error', message: err.message }));
});
```

- [ ] **Step 3: Commit**

```powershell
git add packages/server/src/server.ts packages/server/src/index.android.ts
git commit -m "feat(server): add Hono server factory and Android entry point"
```

---

## Task 7: esbuild build script + turbo pipeline

**Files:**
- Create: `packages/server/build.mjs`
- Modify: `turbo.json`

- [ ] **Step 1: Create packages/server/build.mjs**

Bundles `index.android.ts` → `apps/server/nodejs-assets/nodejs-project/main.js`. `rn-bridge` is external — it's provided by nodejs-mobile at runtime.

```mjs
import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(__dirname, 'src/index.android.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  // Output directly to nodejs-assets so Expo picks it up on the next android build.
  outfile: resolve(__dirname, '../../apps/server/nodejs-assets/nodejs-project/main.js'),
  external: ['rn-bridge'],
  minify: false,  // keep readable for debugging; enable for release builds
});

console.log('✓ packages/server bundled to apps/server/nodejs-assets/nodejs-project/main.js');
```

- [ ] **Step 2: Test the build**

```powershell
pnpm --filter @bookleaf/server build
```

Expected output:
```
✓ packages/server bundled to apps/server/nodejs-assets/nodejs-project/main.js
```

Verify the file exists and is larger than the current `main.js` (~500 bytes → bundled will be ~50KB+):
```powershell
ls apps/server/nodejs-assets/nodejs-project/main.js
```

- [ ] **Step 3: Update turbo.json to include packages/server in the build pipeline**

Open `turbo.json` and add `packages/server` awareness. The `build` task already has `"dependsOn": ["^build"]` so turbo will build `packages/server` before any package that depends on it. No change needed to turbo.json tasks themselves — just confirm the workspace is recognized.

Verify:
```powershell
pnpm turbo run build --filter=@bookleaf/server
```

Expected: `@bookleaf/server:build` runs without errors.

- [ ] **Step 4: Update apps/server/package.json android script**

Open `apps/server/package.json` and update the `android` script so it builds `packages/server` first:

```json
"android": "pnpm --filter @bookleaf/server build && expo run:android",
```

- [ ] **Step 5: Commit**

```powershell
git add packages/server/build.mjs apps/server/package.json
git commit -m "feat(server): add esbuild bundle script and wire into apps/server android script"
```

---

## Task 8: AdminBridgeHandler.ts (React Native side)

This file handles all `admin_*` bridge actions on the React Native side. It calls the existing services directly — no changes to those services are needed.

**Files:**
- Create: `apps/server/src/services/AdminBridgeHandler.ts`

- [ ] **Step 1: Create apps/server/src/services/AdminBridgeHandler.ts**

```typescript
import { ResourceService } from './ResourceService';
import { UserService } from './UserService';
import { BorrowService } from './BorrowService';
import { ReservationService } from './ReservationService';
import { InventoryService } from './InventoryService';
import { InventoryAuditService } from './InventoryAuditService';
import { SettingsService } from './SettingsService';
import { CirculationReportService } from './CirculationReportService';
import { CollectionReportService } from './CollectionReportService';
import { FinesReportService } from './FinesReportService';
import { PatronReportService } from './PatronReportService';
import { encryptBackup, decryptBackup } from './backupCrypto';
import { db } from '@bookleaf/db';
import {
  institutions, users, resources, resourceCopies, borrowingRecords,
  reservations, fines, favorites, reviews, gateLogs, settings,
  authorityNames, scanSessions, scanEntries,
} from '@bookleaf/db';

export const AdminBridgeHandler = {
  async handle(action: string, params: Record<string, unknown>): Promise<unknown> {
    switch (action) {

      // ── Books ──────────────────────────────────────────────────────────────
      case 'adminListBooks':
        return params.q
          ? ResourceService.search(params.institutionId as number, params.q as string)
          : ResourceService.getAll(params.institutionId as number);

      case 'adminGetBook':
        return ResourceService.getById(params.id as number);

      case 'adminGetBookWithCopies': {
        const book = await ResourceService.getById(params.id as number);
        if (!book) return null;
        const copies = await ResourceService.getCopies(params.id as number);
        return { ...book, copies };
      }

      case 'adminCreateBook': {
        const id = await ResourceService.create(
          { ...(params.data as Record<string, unknown>), institution_id: params.institutionId } as any,
          (params.copies as Array<{ accession_number?: string; barcode?: string; shelf_location?: string }>) ?? [],
        );
        return { id };
      }

      case 'adminUpdateBook':
        await ResourceService.update(params.id as number, params.data as any);
        return { ok: true };

      case 'adminDeleteBook': {
        // ResourceService does not expose delete — use db directly
        const { eq } = await import('drizzle-orm');
        await db.delete(resources).where(eq(resources.id, params.id as number));
        return { ok: true };
      }

      case 'adminAddCopy':
        await ResourceService.addCopy(params.resourceId as number);
        return { ok: true };

      // ── Members ────────────────────────────────────────────────────────────
      case 'adminListMembers':
        return params.q
          ? UserService.search(params.institutionId as number, params.q as string)
          : UserService.getAll(params.institutionId as number);

      case 'adminGetMember':
        return UserService.getById(params.id as number);

      case 'adminCreateMember': {
        const data = params.data as Record<string, unknown>;
        const id = await UserService.create({
          institution_id: data.institution_id as number,
          name: data.name as string,
          id_number: data.id_number as string,
          role: data.role as any,
          pin: data.pin as string,
          photo_uri: data.photo_uri as string | undefined,
          department: data.department as string | undefined,
          user_type: data.user_type as any,
        });
        return { id };
      }

      case 'adminUpdateMember': {
        const data = params.data as Record<string, unknown>;
        await UserService.update(params.id as number, {
          name: data.name as string,
          id_number: data.id_number as string,
          role: data.role as any,
          department: data.department as string | undefined,
          user_type: data.user_type as any,
        });
        return { ok: true };
      }

      case 'adminSetMemberActive':
        await UserService.updateStatus(params.id as number, params.isActive as boolean);
        return { ok: true };

      case 'adminResetMemberPin':
        await UserService.changePin(params.id as number, params.newPin as string);
        return { ok: true };

      // ── Circulation ────────────────────────────────────────────────────────
      case 'adminActiveBorrows': {
        const { eq, isNull } = await import('drizzle-orm');
        return db.select({
          id: borrowingRecords.id,
          copy_id: borrowingRecords.copy_id,
          user_id: borrowingRecords.user_id,
          borrowed_at: borrowingRecords.borrowed_at,
          due_date: borrowingRecords.due_date,
          resource_id: resourceCopies.resource_id,
          book_title: resources.title,
          user_name: users.name,
          user_id_number: users.id_number,
        })
          .from(borrowingRecords)
          .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
          .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
          .innerJoin(users, eq(borrowingRecords.user_id, users.id))
          .where(
            (await import('drizzle-orm')).and(
              eq(resources.institution_id, params.institutionId as number),
              isNull(borrowingRecords.returned_at),
            ),
          );
      }

      case 'adminOverdueBorrows': {
        const { eq, isNull, sql: drizzleSql } = await import('drizzle-orm');
        return db.select({
          id: borrowingRecords.id,
          copy_id: borrowingRecords.copy_id,
          user_id: borrowingRecords.user_id,
          borrowed_at: borrowingRecords.borrowed_at,
          due_date: borrowingRecords.due_date,
          resource_id: resourceCopies.resource_id,
          book_title: resources.title,
          user_name: users.name,
          user_id_number: users.id_number,
        })
          .from(borrowingRecords)
          .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
          .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
          .innerJoin(users, eq(borrowingRecords.user_id, users.id))
          .where(
            (await import('drizzle-orm')).and(
              eq(resources.institution_id, params.institutionId as number),
              isNull(borrowingRecords.returned_at),
              (await import('drizzle-orm')).lt(
                drizzleSql`datetime(${borrowingRecords.due_date})`,
                drizzleSql`datetime('now')`,
              ),
            ),
          );
      }

      case 'adminCheckout': {
        const borrowingId = await BorrowService.borrowBook(
          params.copyId as number,
          params.userId as number,
        );
        return { borrowingId };
      }

      case 'adminReturn':
        return BorrowService.returnBook(
          params.borrowingId as number,
          (params.condition as string) ?? 'good',
        );

      case 'adminPendingReservations': {
        const { eq } = await import('drizzle-orm');
        return db.select({
          id: reservations.id,
          resource_id: reservations.resource_id,
          user_id: reservations.user_id,
          created_at: reservations.created_at,
          book_title: resources.title,
          user_name: users.name,
          user_id_number: users.id_number,
        })
          .from(reservations)
          .innerJoin(resources, eq(reservations.resource_id, resources.id))
          .innerJoin(users, eq(reservations.user_id, users.id))
          .where(
            (await import('drizzle-orm')).and(
              eq(resources.institution_id, params.institutionId as number),
              eq(reservations.status, 'active'),
            ),
          );
      }

      case 'adminCancelReservation':
        await ReservationService.cancel(params.reservationId as number);
        return { ok: true };

      case 'adminPayFine': {
        const { eq } = await import('drizzle-orm');
        await db.update(fines)
          .set({ paid: true, paid_at: new Date().toISOString() })
          .where(eq(fines.borrowing_id, params.borrowingId as number));
        return { ok: true };
      }

      // ── Reports ────────────────────────────────────────────────────────────
      case 'adminCirculationReport':
        return CirculationReportService.getReport(params.institutionId as number);

      case 'adminCollectionReport':
        return CollectionReportService.getReport(params.institutionId as number);

      case 'adminFinesReport':
        return FinesReportService.getReport(params.institutionId as number);

      case 'adminPatronReport':
        return PatronReportService.getReport(params.institutionId as number);

      // ── Inventory ──────────────────────────────────────────────────────────
      case 'adminActiveInventorySession':
        return InventoryService.getActiveSession(params.institutionId as number);

      case 'adminStartInventorySession':
        return InventoryService.startSession(params.institutionId as number);

      case 'adminInventoryScan':
        return InventoryService.recordScan(
          params.sessionId as number,
          params.isbn as string,
          params.institutionId as number,
        );

      case 'adminFinishInventorySession':
        return InventoryAuditService.finishSession(params.sessionId as number);

      // ── Settings ───────────────────────────────────────────────────────────
      case 'adminGetSettings':
        return SettingsService.getAll();

      case 'adminUpdateSettings':
        await SettingsService.update(params.data as any);
        return { ok: true };

      // ── Backup ─────────────────────────────────────────────────────────────
      case 'adminExportBackup': {
        // Collect all tables, encrypt, return as string (file save handled by RN UI)
        const [
          inst, auth, usr, res, copies, borrows, resv, fns,
          favs, revs, gates, scnSess, scnEnt, stgs,
        ] = await Promise.all([
          db.select().from(institutions),
          db.select().from(authorityNames),
          db.select().from(users),
          db.select().from(resources),
          db.select().from(resourceCopies),
          db.select().from(borrowingRecords),
          db.select().from(reservations),
          db.select().from(fines),
          db.select().from(favorites),
          db.select().from(reviews),
          db.select().from(gateLogs),
          db.select().from(scanSessions),
          db.select().from(scanEntries),
          db.select().from(settings),
        ]);
        const payload = {
          version: 4,
          exported_at: new Date().toISOString(),
          data: {
            institutions: inst, authority_names: auth, users: usr,
            resources: res, resource_copies: copies, borrowing_records: borrows,
            reservations: resv, fines: fns, favorites: favs, reviews: revs,
            gate_logs: gates, scan_sessions: scnSess, scan_entries: scnEnt, settings: stgs,
          },
        };
        const encryptedData = await encryptBackup(
          JSON.stringify(payload),
          params.passphrase as string,
        );
        return { encryptedData };
      }

      case 'adminImportBackup': {
        const raw = await decryptBackup(
          params.encryptedData as string,
          params.passphrase as string,
        );
        // Delegate to existing BackupService import logic
        // BackupService.importJson expects the decrypted payload directly
        // We use a simplified version here: parse and insert
        const payload = JSON.parse(raw);
        const { BackupService } = await import('./BackupService');
        await (BackupService as any).importPayload(payload);
        return { ok: true, imported: payload.data?.users?.length ?? 0 };
      }

      default:
        throw new Error(`Unknown admin bridge action: ${action}`);
    }
  },
};
```

> **Note on `BackupService.importPayload`:** `BackupService` exposes `importJson(passphrase)` which reads from a file (expo-document-picker). For the bridge, we need a variant that accepts an already-decrypted payload. Add this method to `BackupService`:
>
> ```typescript
> // In BackupService.ts — add this method:
> async importPayload(payload: BackupPayload): Promise<void> {
>   // Same logic as the existing import, but accepts payload directly
>   // Copy the transaction block from importJson and remove file-reading step
> }
> ```
>
> If `BackupService.importPayload` is complex to extract, replace the `adminImportBackup` bridge case with a simplified version that only handles the data already being in memory.

- [ ] **Step 2: Commit**

```powershell
git add apps/server/src/services/AdminBridgeHandler.ts
git commit -m "feat(server-app): add AdminBridgeHandler for admin tRPC bridge actions"
```

---

## Task 9: Update ServerBridge.ts + delete old files

**Files:**
- Modify: `apps/server/src/services/ServerBridge.ts`
- Delete: `apps/server/src/services/ApiServer.ts`
- Delete: `apps/server/nodejs-assets/nodejs-project/main.js` (source file, not the build output)

- [ ] **Step 1: Replace apps/server/src/services/ServerBridge.ts**

The existing `handleQuery` switch handles patron bridge actions. We keep those cases and add routing to `AdminBridgeHandler` for admin actions. The bridge listener message format (`{ requestId, action, params }`) is unchanged — `packages/server`'s `BridgeAdapter` sends exactly this format.

```typescript
import nodejs from 'nodejs-mobile-react-native';
import { MdnsService } from './MdnsService';
import { AdminBridgeHandler } from './AdminBridgeHandler';
import { ApiServer } from './ApiServer';

type BridgeMessage =
  | { requestId: number; action: string; params: Record<string, unknown> }
  | { type: 'server_ready'; port: number }
  | { type: 'server_error'; message: string }
  | { type: 'stop' };

type StatusCallback = (status: 'starting' | 'running' | 'error' | 'stopped', detail?: string) => void;

let institutionId: number | null = null;
let statusCallback: StatusCallback | null = null;
let isStarted = false;

function requireInstitution(): number {
  if (institutionId === null) {
    throw new Error('ServerBridge not initialized — call start(institutionId) first');
  }
  return institutionId;
}

async function handleQuery(requestId: number, action: string, params: Record<string, unknown>) {
  let data: unknown;
  try {
    if (action.startsWith('admin')) {
      // Admin actions — handled by AdminBridgeHandler
      data = await AdminBridgeHandler.handle(action, params);
    } else {
      // Patron actions — same as before
      data = await handlePatronAction(action, params);
    }
  } catch (e: unknown) {
    data = { error: e instanceof Error ? e.message : 'Unknown error' };
  }
  nodejs.channel.send(JSON.stringify({ requestId, data }));
}

async function handlePatronAction(action: string, params: Record<string, unknown>): Promise<unknown> {
  switch (action) {
    case 'searchBooks':
      return ApiServer.searchBooks(requireInstitution(), (params.q as string) || '');
    case 'getAllBooks':
      return ApiServer.getAllBooks(requireInstitution());
    case 'getBookDetail':
      return ApiServer.getBookDetail(params.id as number);
    case 'getMemberBorrows':
      return ApiServer.getMemberBorrows(params.userId as number);
    case 'getRecentlyAdded':
      return ApiServer.getRecentlyAdded(requireInstitution(), (params.limit as number) || 10);
    case 'getPopular':
      return ApiServer.getPopular(requireInstitution(), (params.limit as number) || 10);
    case 'renewBorrow':
      return ApiServer.renewBorrow(params.borrowingId as number, params.userId as number);
    case 'reserveBook':
      return ApiServer.reserveBook(params.resourceId as number, params.userId as number);
    case 'getMemberReservations':
      return ApiServer.getMemberReservations(params.userId as number);
    case 'searchBooksFiltered':
      return ApiServer.searchBooksFiltered(
        requireInstitution(),
        (params.query as string) || '',
        params.materialType as string | undefined,
        params.yearFrom as number | undefined,
        params.yearTo as number | undefined,
        params.language as string | undefined,
      );
    case 'getSimilarBooks':
      return ApiServer.getSimilarBooks(params.resourceId as number);
    case 'toggleFavorite':
      return ApiServer.toggleFavorite(params.resourceId as number, params.userId as number);
    case 'getFavoriteStatus':
      return ApiServer.getFavoriteStatus(params.resourceId as number, params.userId as number);
    case 'getMemberFavorites':
      return ApiServer.getMemberFavorites(params.userId as number);
    case 'getBookReviews':
      return ApiServer.getBookReviews(params.resourceId as number);
    case 'submitReview':
      return ApiServer.submitReview(
        params.resourceId as number,
        params.userId as number,
        params.rating as number,
        (params.comment as string) || null,
      );
    case 'gateLogByUserId':
      return ApiServer.gateLogByUserId(
        params.userId as number,
        params.institutionId as number,
        params.method as 'app' | 'browser' | 'manual',
      );
    case 'gateVerifyAndLog':
      return ApiServer.gateVerifyAndLog(
        params.idNumber as string,
        params.pin as string,
        params.institutionId as number,
      );
    case 'authenticateMember':
      return ApiServer.authenticateMember(
        params.idNumber as string,
        params.pin as string,
      );
    case 'validateSession':
      return ApiServer.validateSession(params.token as string);
    case 'logout':
      return ApiServer.logout(params.token as string);
    default:
      return { error: `Unknown action: ${action}` };
  }
}

export const ServerBridge = {
  start(instId: number, onStatus: StatusCallback) {
    if (isStarted) return;
    institutionId = instId;
    statusCallback = onStatus;
    isStarted = true;

    onStatus('starting');

    nodejs.channel.addListener('message', (raw: string) => {
      try {
        const msg: BridgeMessage = JSON.parse(raw);

        if ('type' in msg) {
          if (msg.type === 'server_ready') {
            MdnsService.publish();
            statusCallback?.('running', `Port ${msg.port}`);
          } else if (msg.type === 'server_error') {
            statusCallback?.('error', msg.message);
          }
          return;
        }

        if ('requestId' in msg) {
          handleQuery(msg.requestId, msg.action, msg.params);
        }
      } catch {
        // malformed message
      }
    });

    nodejs.start('main.js');
  },

  stop() {
    if (!isStarted) return;
    MdnsService.unpublish();
    nodejs.channel.send(JSON.stringify({ type: 'stop' }));
    isStarted = false;
    statusCallback?.('stopped');
    statusCallback = null;
  },

  isRunning() {
    return isStarted;
  },

  setStatusCallback(cb: StatusCallback | null) {
    statusCallback = cb;
  },
};
```

> **Note:** `ApiServer` is kept temporarily (still imported) so all existing patron actions continue to work through the unchanged `handlePatronAction` switch. It will be deleted in the next step only after the build is verified.

- [ ] **Step 2: Verify the build still compiles**

```powershell
pnpm --filter @bookleaf/server-app exec npx tsc --noEmit 2>&1 | Select-String "error TS" | Select-Object -First 20
```

Expected: only the 6 known pre-existing errors (5 in `BorrowService.ts`, 1 in `NotificationService.ts`). Zero new errors.

- [ ] **Step 3: Delete ApiServer.ts and old main.js source**

The `ApiServer.ts` logic now lives in `handlePatronAction` inside `ServerBridge.ts`. The old `main.js` is replaced by the esbuild build output.

```powershell
git rm apps/server/src/services/ApiServer.ts
git rm apps/server/nodejs-assets/nodejs-project/main.js
```

- [ ] **Step 4: Update ServerBridge.ts to remove the ApiServer import**

Now that `ApiServer.ts` is deleted, update `ServerBridge.ts` to inline the patron queries instead of delegating to `ApiServer`. Replace the import and all `ApiServer.*` calls with direct service calls.

Open `apps/server/src/services/ServerBridge.ts` and replace the top imports + `handlePatronAction` body.

Replace the import section:
```typescript
import nodejs from 'nodejs-mobile-react-native';
import { MdnsService } from './MdnsService';
import { AdminBridgeHandler } from './AdminBridgeHandler';
import { GateService } from './GateService';
import { BorrowService } from './BorrowService';
import { ReservationService } from './ReservationService';
import { FavoritesService } from './FavoritesService';
import { ReviewService } from './ReviewService';
import { SessionService, SessionPrincipal } from './SessionService';
import { db } from '@bookleaf/db';
import { resources, resourceCopies, borrowingRecords, users, fines } from '@bookleaf/db';
import { hashPin, verifyPin, isLegacyHash } from '@bookleaf/db';
import { eq, like, or, and, desc, sum, sql, ne, gte, lte } from 'drizzle-orm';
```

Replace the `handlePatronAction` function with the full inline implementation — copy the body from `ApiServer.ts` directly, using the same logic. Each case calls the same service or DB query that `ApiServer.*` used to:

```typescript
async function handlePatronAction(
  action: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (action) {
    case 'searchBooks': {
      const iid = requireInstitution();
      const q = `%${(params.q as string) || ''}%`;
      return db.select({
        id: resources.id, title: resources.title, author: resources.author,
        genre: resources.genre, year: resources.year,
        material_type: resources.material_type, cover_uri: resources.cover_uri,
        available_copies: resources.available_copies, total_copies: resources.total_copies,
      }).from(resources)
        .where(and(eq(resources.institution_id, iid),
          or(like(resources.title, q), like(resources.author, q), like(resources.isbn, q),
            like(resources.genre, q), like(resources.publisher, q), like(resources.call_number, q))))
        .orderBy(resources.title).limit(50);
    }

    case 'getAllBooks':
      return db.select({
        id: resources.id, title: resources.title, author: resources.author,
        genre: resources.genre, year: resources.year,
        material_type: resources.material_type, cover_uri: resources.cover_uri,
        available_copies: resources.available_copies, total_copies: resources.total_copies,
      }).from(resources)
        .where(eq(resources.institution_id, requireInstitution()))
        .orderBy(resources.title);

    case 'getBookDetail': {
      const resource = await db.select({
        id: resources.id, title: resources.title, author: resources.author,
        publisher: resources.publisher, year: resources.year, genre: resources.genre,
        description: resources.description, material_type: resources.material_type,
        language: resources.language, call_number: resources.call_number,
        isbn: resources.isbn, edition: resources.edition, url: resources.url,
        subject_headings: resources.subject_headings, cover_uri: resources.cover_uri,
        available_copies: resources.available_copies, total_copies: resources.total_copies,
      }).from(resources).where(eq(resources.id, params.id as number)).limit(1).then(r => r[0] ?? null);
      if (!resource) return null;
      const copies = await db.select({ shelf_location: resourceCopies.shelf_location })
        .from(resourceCopies).where(eq(resourceCopies.resource_id, params.id as number));
      const shelf_locations = [...new Set(copies.map(c => c.shelf_location).filter((s): s is string => !!s))];
      return { ...resource, shelf_locations };
    }

    case 'getRecentlyAdded':
      return db.select({
        id: resources.id, title: resources.title, author: resources.author,
        genre: resources.genre, year: resources.year,
        material_type: resources.material_type, cover_uri: resources.cover_uri,
        available_copies: resources.available_copies, total_copies: resources.total_copies,
      }).from(resources)
        .where(eq(resources.institution_id, requireInstitution()))
        .orderBy(desc(resources.added_at)).limit((params.limit as number) || 10);

    case 'getPopular':
      return db.select({
        id: resources.id, title: resources.title, author: resources.author,
        genre: resources.genre, year: resources.year,
        material_type: resources.material_type, cover_uri: resources.cover_uri,
        available_copies: resources.available_copies, total_copies: resources.total_copies,
        borrow_count: sql<number>`count(${borrowingRecords.id})`,
      }).from(resources)
        .leftJoin(resourceCopies, eq(resourceCopies.resource_id, resources.id))
        .leftJoin(borrowingRecords, eq(borrowingRecords.copy_id, resourceCopies.id))
        .where(eq(resources.institution_id, requireInstitution()))
        .groupBy(resources.id)
        .orderBy(desc(sql`count(${borrowingRecords.id})`))
        .limit((params.limit as number) || 10);

    case 'getSimilarBooks': {
      const book = await db.select({ author: resources.author, genre: resources.genre, institution_id: resources.institution_id })
        .from(resources).where(eq(resources.id, params.resourceId as number)).limit(1).then(r => r[0] ?? null);
      if (!book) return [];
      const conditions: ReturnType<typeof eq>[] = [
        eq(resources.institution_id, book.institution_id) as any,
        ne(resources.id, params.resourceId as number) as any,
      ];
      const authorOrGenre: ReturnType<typeof eq>[] = [];
      if (book.author) authorOrGenre.push(eq(resources.author, book.author) as any);
      if (book.genre) authorOrGenre.push(eq(resources.genre, book.genre) as any);
      if (authorOrGenre.length === 0) return [];
      return db.select({
        id: resources.id, title: resources.title, author: resources.author,
        genre: resources.genre, cover_uri: resources.cover_uri,
        available_copies: resources.available_copies, total_copies: resources.total_copies,
      }).from(resources).where(and(...conditions, or(...authorOrGenre))).limit(8);
    }

    case 'searchBooksFiltered': {
      const conditions: ReturnType<typeof eq>[] = [eq(resources.institution_id, requireInstitution()) as any];
      if (params.query) {
        const q = `%${params.query as string}%`;
        conditions.push(or(like(resources.title, q), like(resources.author, q), like(resources.isbn, q),
          like(resources.genre, q), like(resources.publisher, q), like(resources.call_number, q)) as any);
      }
      if (params.materialType) conditions.push(eq(resources.material_type, params.materialType as any) as any);
      if (params.yearFrom) conditions.push(gte(resources.year, params.yearFrom as number) as any);
      if (params.yearTo) conditions.push(lte(resources.year, params.yearTo as number) as any);
      if (params.language) conditions.push(like(resources.language, `%${params.language as string}%`) as any);
      return db.select({
        id: resources.id, title: resources.title, author: resources.author,
        genre: resources.genre, year: resources.year, material_type: resources.material_type,
        language: resources.language, cover_uri: resources.cover_uri,
        available_copies: resources.available_copies, total_copies: resources.total_copies,
      }).from(resources).where(and(...conditions)).orderBy(resources.title).limit(100);
    }

    case 'getMemberBorrows': {
      const member = await db.select({ name: users.name })
        .from(users).where(eq(users.id, params.userId as number)).limit(1).then(r => r[0] ?? null);
      if (!member) return null;
      const borrows = await db.select({
        id: borrowingRecords.id, resource_id: resourceCopies.resource_id,
        book_title: resources.title, book_author: resources.author,
        due_date: borrowingRecords.due_date, returned_at: borrowingRecords.returned_at,
        renewal_count: borrowingRecords.renewal_count,
      }).from(borrowingRecords)
        .innerJoin(resourceCopies, eq(borrowingRecords.copy_id, resourceCopies.id))
        .innerJoin(resources, eq(resourceCopies.resource_id, resources.id))
        .where(eq(borrowingRecords.user_id, params.userId as number))
        .orderBy(desc(borrowingRecords.borrowed_at));
      const fineRows = await db.select({
        borrowing_id: fines.borrowing_id,
        total: sum(fines.amount),
      }).from(fines)
        .innerJoin(borrowingRecords, eq(fines.borrowing_id, borrowingRecords.id))
        .where(and(eq(borrowingRecords.user_id, params.userId as number), eq(fines.paid, false)))
        .groupBy(fines.borrowing_id);
      const fineMap: Record<number, number> = {};
      for (const f of fineRows) {
        if (f.borrowing_id !== null) fineMap[f.borrowing_id] = Number(f.total ?? 0);
      }
      return {
        member_name: member.name,
        borrows: borrows.map(b => ({ ...b, fine_amount: fineMap[b.id] ?? 0 })),
        total_fines: Object.values(fineMap).reduce((a, b) => a + b, 0),
      };
    }

    case 'getMemberReservations': {
      const member = await db.select({ name: users.name })
        .from(users).where(eq(users.id, params.userId as number)).limit(1).then(r => r[0] ?? null);
      if (!member) return null;
      const holds = await ReservationService.getByUser(params.userId as number);
      return { member_name: member.name, reservations: holds.filter(h => h.status === 'active') };
    }

    case 'getMemberFavorites': {
      const member = await db.select({ name: users.name })
        .from(users).where(eq(users.id, params.userId as number)).limit(1).then(r => r[0] ?? null);
      if (!member) return null;
      const items = await FavoritesService.getByUser(params.userId as number);
      return { member_name: member.name, favorites: items };
    }

    case 'renewBorrow': {
      const record = await db.select({ user_id: borrowingRecords.user_id })
        .from(borrowingRecords).where(eq(borrowingRecords.id, params.borrowingId as number)).limit(1).then(r => r[0] ?? null);
      if (!record) throw new Error('Borrowing record not found');
      if (record.user_id !== params.userId) throw new Error('Not allowed');
      return BorrowService.renewBook(params.borrowingId as number);
    }

    case 'reserveBook':
      return ReservationService.reserve(params.resourceId as number, params.userId as number);

    case 'toggleFavorite':
      return FavoritesService.toggle(params.userId as number, params.resourceId as number);

    case 'getFavoriteStatus': {
      const favorited = await FavoritesService.isFavorited(params.userId as number, params.resourceId as number);
      return { favorited };
    }

    case 'getBookReviews': {
      const [reviewList, avgRating] = await Promise.all([
        ReviewService.getByResource(params.resourceId as number),
        ReviewService.getAverageRating(params.resourceId as number),
      ]);
      return { reviews: reviewList, avg_rating: avgRating };
    }

    case 'submitReview': {
      const eligible = await ReviewService.canReview(params.userId as number, params.resourceId as number);
      if (!eligible) throw new Error('You must have borrowed this item to leave a review');
      await ReviewService.submit(params.userId as number, params.resourceId as number,
        params.rating as number, (params.comment as string) || null);
      return { ok: true };
    }

    case 'gateLogByUserId': {
      const user = await db.select({ id: users.id, name: users.name, is_active: users.is_active })
        .from(users).where(eq(users.id, params.userId as number)).limit(1).then(r => r[0] ?? null);
      if (!user || !user.is_active) return null;
      const result = await GateService.logEntry(user.id, params.institutionId as number, params.method as any);
      return { user_name: user.name, direction: result.direction, logged_at: result.logged_at };
    }

    case 'gateVerifyAndLog': {
      const user = await db.select({ id: users.id, name: users.name, pin_hash: users.pin_hash, is_active: users.is_active })
        .from(users).where(eq(users.id_number, params.idNumber as string)).limit(1).then(r => r[0] ?? null);
      if (!user || !user.is_active) return null;
      if (!verifyPin(params.pin as string, user.pin_hash)) return null;
      if (isLegacyHash(user.pin_hash)) {
        await db.update(users).set({ pin_hash: hashPin(params.pin as string) }).where(eq(users.id, user.id));
      }
      const result = await GateService.logEntry(user.id, params.institutionId as number, 'browser');
      return { user_name: user.name, direction: result.direction, logged_at: result.logged_at };
    }

    case 'authenticateMember': {
      const row = await db.select({
        id: users.id, institution_id: users.institution_id, name: users.name,
        id_number: users.id_number, role: users.role, pin_hash: users.pin_hash,
        photo_uri: users.photo_uri, is_active: users.is_active, created_at: users.created_at,
        department: users.department, user_type: users.user_type,
      }).from(users).where(eq(users.id_number, params.idNumber as string)).limit(1).then(r => r[0] ?? null);
      if (!row || !row.is_active) return null;
      if (!verifyPin(params.pin as string, row.pin_hash)) return null;
      if (isLegacyHash(row.pin_hash)) {
        await db.update(users).set({ pin_hash: hashPin(params.pin as string) }).where(eq(users.id, row.id));
      }
      const { pin_hash: _, ...safeUser } = row;
      const session = await SessionService.create(row.id);
      return { user: safeUser, token: session.token, expires_at: session.expires_at };
    }

    case 'validateSession':
      return SessionService.validate(params.token as string) as Promise<SessionPrincipal | null>;

    case 'logout':
      await SessionService.revoke(params.token as string);
      return { ok: true };

    default:
      return { error: `Unknown action: ${action}` };
  }
}
```

- [ ] **Step 5: Verify typecheck again**

```powershell
pnpm --filter @bookleaf/server-app exec npx tsc --noEmit 2>&1 | Select-String "error TS" | Select-Object -First 20
```

Expected: only the 6 known pre-existing errors.

- [ ] **Step 6: Commit**

```powershell
git add apps/server/src/services/ServerBridge.ts
git commit -m "feat(server-app): update ServerBridge to route admin actions, inline patron handlers, remove ApiServer"
```

---

## Task 10: Verify on Android

- [ ] **Step 1: Build packages/server and run the Android app**

```powershell
pnpm --filter @bookleaf/server-app android -- --device
```

Expected:
1. `packages/server build` runs → bundle written to `nodejs-assets/nodejs-project/main.js`
2. Gradle build completes
3. App installs and launches

- [ ] **Step 2: Verify the tRPC server starts**

In the Metro logs, you should see the `server_ready` message handled by `ServerBridge`:
```
StatusCallback: running Port 3000
```

- [ ] **Step 3: Test a public tRPC endpoint from another device on the same Wi-Fi**

From a browser or curl on a device connected to the same Wi-Fi (replace `IP` with the librarian device's IP shown in the server status screen):

```
http://IP:3000/trpc/catalog.search?input={"json":{"q":"","institutionId":1}}
```

Expected response (tRPC v11 format):
```json
{"result":{"data":{"json":[...books...]}}}
```

- [ ] **Step 4: Test the browser gate page**

Open `http://IP:3000/gate` in a browser. Expected: the gate check-in HTML page loads.

- [ ] **Step 5: Test the ping endpoint**

```
http://IP:3000/ping
```

Expected: `{"ok":true,"timestamp":"..."}`

- [ ] **Step 6: Commit verification**

```powershell
git add .
git commit -m "feat: Phase 2 complete — packages/server tRPC server replaces main.js"
```

---

## Spec Coverage Check

| Spec requirement | Covered by |
|---|---|
| Create `packages/server` with Hono + tRPC | Tasks 1–6 |
| Full patron tRPC router | Tasks 4–5 |
| Full admin tRPC router | Task 5 |
| Bridge adapter (Android DB delegation) | Task 2 |
| UDP beacon | Task 3 |
| Rate limiting on auth + gate | Tasks 3, 6 |
| Browser gate page | Tasks 3, 6 |
| esbuild bundle pipeline | Task 7 |
| Replace `main.js` | Tasks 7, 9 |
| Delete `ApiServer.ts` | Task 9 |
| `ServerBridge.ts` updated | Task 9 |
| Verify Android server works | Task 10 |
| Librarian UI unchanged | Confirmed — no screen files touched |
| `packages/server` exports `AppRouter` type | Task 5 (router/index.ts) |
