# Bookleaf Monorepo — Design Spec
_Date: 2026-05-25_

## Overview

Bookleaf is restructured from a single React Native monolith into a Turborepo + pnpm workspaces monorepo containing three apps and three shared packages. The goal is to separate concerns, reduce APK size for patrons, enable independent release cycles, and add a desktop server option for institutions that prefer a PC over an Android device.

---

## Problem Statement

The current app bundles librarian server code, patron client code, Node.js assets, and a local LLM into a single APK. Patrons download code they never use. The server and client can't be released independently. There is no desktop option for librarians.

---

## Solution

Three distinct apps sharing common types and schema:

1. **Bookleaf Server** (`apps/server`) — Android app for the librarian's device. Runs Node.js HTTP server, owns the SQLite DB, full CRUD.
2. **Bookleaf Client** (`apps/client`) — Android app for patron devices. No DB, no server, connects to whichever server is on the LAN.
3. **Bookleaf Desktop** (`apps/desktop`) — Tauri + PocketBase desktop app for librarians on Windows/macOS/Linux. Alternative to the Android server device.

---

## Repo Structure

```
bookleaf/
├── apps/
│   ├── server/                    ← React Native + Expo 54 (librarian device)
│   ├── client/                    ← React Native + Expo 54 (patron device)
│   └── desktop/                   ← Tauri + PocketBase + React/Vite
├── packages/
│   ├── types/                     ← shared TypeScript interfaces
│   ├── api-schema/                ← shared patron API contract (req/res types)
│   └── db-schema/                 ← shared Drizzle schema + migrations
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Shared Packages

### `packages/types`
- Source: current `src/types/index.ts`
- All shared domain interfaces: `Book`, `Member`, `BorrowRecord`, `Institution`, `Settings`, etc.
- No runtime dependencies — pure TypeScript types.
- Used by all three apps.

### `packages/api-schema`
- TypeScript types for the 13 patron-facing API routes (request bodies + response shapes).
- The single source of truth for the shared API contract.
- Ensures server, client, and desktop stay in sync at the type level.
- No runtime dependencies.

### `packages/db-schema`
- Source: current `src/db/schema.ts`, `src/db/database.ts`, `src/db/index.ts`, `drizzle/`
- Used by `apps/server` (primary DB owner) and `apps/desktop` (migration import tool).
- Not used by `apps/client` (no local DB).

---

## App Specifications

### `apps/server`
**What it is:** The current app, minus all client-mode screens and the patron-only dependencies.

**Kept from current codebase:**
- All `app/(server)/` screens and `app/(auth)/` (setup, login)
- All services: `BorrowService`, `UserService`, `SessionService`, `ResourceService`, `BookService`, `GateService`, `LlmService`, `LibraryTools`, `ReportService`, `InventoryService`, `BackupService`, `NotificationService`, etc.
- `nodejs-assets/nodejs-project/main.js` — updated to match new API contract (see below)
- `ServerBridge.ts`, `ApiServer.ts`
- `appStore` (server slice)

**Removed from current codebase:**
- All `app/(client)/` screens
- `clientApi.ts` (patron API client)
- Client-mode Zustand state

**New addition:**
- Raw SQLite export in Settings screen — exports the `.db` file unencrypted for migration to Desktop.

**Updated:**
- `main.js` routes updated to match the new 13-route patron API contract (mostly path renames, response shape normalization — see API Contract section).

---

### `apps/client`
**What it is:** A new, lightweight Expo app containing only patron-facing screens.

**Extracted from current codebase:**
- All `app/(client)/` screens
- `app/(auth)/connect.tsx` (server discovery / manual IP entry)
- `src/services/clientApi.ts` — updated to use new API contract paths
- Client slice of `appStore` (serverUrl, sessionToken, currentUser, clientSession hydration)

**Excluded auth screens** (server-only, stay in `apps/server`):
- `setup.tsx` — institution setup wizard
- `login.tsx` — librarian PIN login
- `register.tsx` — new member registration (done by librarian, not patron)

**Dependencies removed vs. current app:**
- No `expo-sqlite` or Drizzle ORM
- No `nodejs-mobile-react-native`
- No `llama.rn`
- No `react-native-zeroconf`
- No `expo-notifications` (patron app doesn't send notifications)
- Significantly smaller APK

**Updated:**
- `clientApi.ts` path constants updated to new API contract.

---

### `apps/desktop`
**What it is:** A new Tauri desktop application. The librarian runs this on their PC instead of an Android server device.

#### Tauri Shell (`src-tauri/`)
- Rust process that spawns PocketBase as a child process on startup.
- Manages PocketBase lifecycle (start, stop, restart on crash).
- Bundles platform-specific PocketBase binaries:
  - `pocketbase-win.exe` (Windows)
  - `pocketbase-macos` (macOS)
  - `pocketbase-linux` (Linux)
- Tauri webview loads `http://localhost:8090` (PocketBase serves the React app as static files).
- Single port (8090) serves both the librarian UI and the patron REST API.

#### PocketBase Layer (`pb/`)
- Written in Go, extends PocketBase with:
  - **Collections** matching the Bookleaf schema (resources, members, borrowing_records, reservations, fines, favorites, reviews, gate_logs, scan_sessions, settings, institutions).
  - **13 custom patron routes** (see API Contract section) — these are the routes patron Android phones call.
  - **UDP beacon** on port 41234 — broadcasts `{ ip, port: 8090 }` every 3s so patron phones can auto-discover. Android server broadcasts `{ ip, port: 3000 }`. The client uses whatever `{ ip, port }` it receives — no hardcoded port.
  - **Migration import** — reads a `.db` file exported from the Android server and inserts records into PocketBase collections.

#### React Frontend (`frontend/`)
- Vite + React + TypeScript.
- Talks to PocketBase using the PocketBase JS SDK (native collections API — not the custom patron routes).
- Sidebar navigation layout (not mobile tab bar).
- Screens:

| Screen | Description |
|---|---|
| Dashboard | Stats overview, recent activity, active borrows count |
| Books | Full data table, add/edit/delete, ISBN lookup |
| Members | Member CRUD, member card print |
| Circulation | Active borrows, overdue list, fine management |
| Reservations | Pending reservations, approve/reject |
| Gate | Live gate log display, QR code for patron check-in |
| Inventory | Inventory audit sessions |
| Reports | Circulation, collection, fines, patron, inventory — print/export |
| AI Chat | Chat interface via local Ollama (graceful fallback if Ollama not running) |
| Settings | Institution config, backup/restore, import from Android (.db file) |

**Barcode/QR scanning:** Deferred — not in v1. Desktop scanning UX (USB scanners, webcam) to be designed separately.

**AI:** Uses Ollama instead of bundled Gemma GGUF. If Ollama is not running, Settings screen shows setup instructions. No 1.1GB model bundled in the app.

---

## API Contract

The 13 patron-facing routes implemented identically on both `apps/server` (`main.js`) and `apps/desktop` (`pb/main.go`). Types live in `packages/api-schema`.

```
POST   /api/auth/member           PIN login → { token, user, expires_at }
GET    /api/me/borrows             active borrows for token holder
GET    /api/me/reservations        reservations for token holder
GET    /api/me/favorites           favorites for token holder
GET    /api/catalog/search         ?q=&page= → paginated book list
GET    /api/catalog/:id            book detail + copies
POST   /api/borrows/:id/return     return a copy
POST   /api/borrows/:id/renew      renew a borrow
POST   /api/books/:id/reserve      reserve a book
POST   /api/books/:id/favorite     toggle favorite
POST   /api/books/:id/reviews      add review { rating, body }
POST   /api/gate/log               gate entry/exit { memberId, direction }
GET    /api/gate/verify            ?pin=&memberId= → member identity check
```

Auth: Bearer token in `Authorization` header (same as current). Rate limiting on `/api/auth/member`: 5 fails → 1 min, 10 → 5 min, 15+ → 15 min.

The librarian UI (desktop React frontend) uses PocketBase's native collections API directly via the JS SDK and does not go through these custom routes.

---

## Data Migration (Android → Desktop)

1. Librarian opens `apps/server` Settings → exports raw `.db` file.
2. Librarian opens `apps/desktop` Settings → Import from Android → selects `.db` file.
3. Desktop reads the SQLite file, maps rows to PocketBase collections in dependency order:
   `institutions → users → resources → resource_copies → borrowing_records → reservations → fines → favorites → reviews → gate_logs → settings`
4. PIN hashes migrate as-is (`sha256s$<salt>$<hash>` format) — patron PINs work on day one.
5. Import shows progress summary on completion.

---

## Implementation Phases

Each phase is a separate spec → plan → implementation cycle.

### Phase 1 — Monorepo Setup
- Initialize Turborepo + pnpm workspaces in the existing repo.
- Create `packages/types`, `packages/api-schema`, `packages/db-schema`.
- Move current app code into `apps/server/` as a starting point.
- Verify `apps/server` builds and runs identically to the current app.
- No functional changes — pure restructuring.

### Phase 2 — Split Mobile Apps
- Create `apps/client/` as a new Expo project.
- Extract client-mode screens and `clientApi.ts` into `apps/client/`.
- Update `apps/server/` to remove client-mode screens and unused dependencies.
- Update both apps to use `packages/types` and `packages/api-schema`.
- Update `main.js` in `apps/server/` to match new API contract.
- Update `clientApi.ts` in `apps/client/` to use new API contract paths.
- Add raw SQLite export to `apps/server/` Settings.
- Verify both apps build, patron phones connect to Android server unchanged.

### Phase 3 — Desktop App
- Scaffold `apps/desktop/` with Tauri + Vite + React.
- Build PocketBase Go layer: collections, 13 custom routes, UDP beacon, migration import.
- Build React librarian UI: all screens listed above.
- Integrate Ollama for AI chat.
- Verify patron Android phones (running `apps/client/`) connect to desktop server.
- Verify data migration from Android export.

---

## Key Constraints

- `npm install --legacy-peer-deps` — do not use `npx expo install` (SDK-55 packages pinned in SDK-54 project). This applies to both `apps/server` and `apps/client`.
- Native modules in Expo apps require full `expo run:android` rebuild, not just Metro reload.
- `crypto.getRandomValues` not available in Hermes — `src/polyfills.ts` must be loaded before any crypto calls. Both mobile apps need this polyfill.
- PocketBase binary must be downloaded separately for each platform during desktop CI builds — it is not committed to the repo.
- The desktop app does not need to replicate the LLM tool-calling pipeline from the Android app. Ollama handles inference; the tool definitions can be reimplemented as simple REST calls to PocketBase collections.
