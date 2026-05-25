# Bookleaf Monorepo — Design Spec
_Date: 2026-05-25 (updated: drop PocketBase, adopt tRPC)_

## Overview

Bookleaf is restructured from a single React Native monolith into a Turborepo + pnpm workspaces monorepo containing three apps and three shared packages. The goal is to separate concerns, reduce APK size for patrons, enable independent release cycles, and add a desktop server option for institutions that prefer a PC over an Android device.

All three apps share a single tRPC server package — true end-to-end type safety across Android and desktop with one shared backend codebase.

---

## Problem Statement

The current app bundles librarian server code, patron client code, Node.js assets, and a local LLM into a single APK. Patrons download code they never use. The server and client can't be released independently. There is no desktop option for librarians. The API contract between server and client is untyped strings — drift is caught at runtime, not compile time.

---

## Solution

Three distinct apps sharing common packages:

1. **Bookleaf Server** (`apps/server`) — Android app for the librarian's device. Runs the shared tRPC server via `nodejs-mobile-react-native`, owns the SQLite DB.
2. **Bookleaf Client** (`apps/client`) — Android app for patron devices. No DB, no server. Uses tRPC client to talk to whichever server is on the LAN.
3. **Bookleaf Desktop** (`apps/desktop`) — Tauri desktop app for librarians on Windows/macOS/Linux. Bundles the same shared tRPC server as a standalone binary. Alternative to the Android server device.

---

## Repo Structure

```
bookleaf/
├── apps/
│   ├── server/                    ← React Native + Expo 54 (librarian device)
│   ├── client/                    ← React Native + Expo 54 (patron device)
│   └── desktop/                   ← Tauri + React/Vite (librarian desktop)
├── packages/
│   ├── types/                     ← shared TypeScript domain interfaces
│   ├── db-schema/                 ← shared Drizzle schema + migrations
│   └── server/                    ← shared tRPC router + business logic
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## Shared Packages

### `packages/types`
- Source: current `src/types/index.ts`
- All shared domain interfaces: `Book`, `Member`, `BorrowRecord`, `Institution`, `Settings`, etc.
- Pure TypeScript — no runtime dependencies.
- Used by all three apps and `packages/server`.

### `packages/db-schema`
- Source: current `src/db/schema.ts`, `src/db/database.ts`, `src/db/index.ts`, `drizzle/`
- Drizzle ORM schema, migrations, and DB init.
- Used by `packages/server` (the only place DB access happens).
- Not used directly by any app — apps go through tRPC procedures, never touch the DB directly.

### `packages/server`
The heart of the system. A standalone Node.js HTTP server that runs identically on Android (via `nodejs-mobile`) and desktop (via bundled binary).

**Contains:**
- **Hono** — lightweight HTTP framework, handles routing and middleware
- **tRPC** — type-safe procedure layer on top of Hono
- **Drizzle queries** — all DB access via `packages/db-schema`
- **Business logic** — ported from current `src/services/` (BorrowService, UserService, SessionService, ResourceService, GateService, ReportService, InventoryService, BackupService, etc.)
- **UDP beacon** — broadcasts `{ ip, port }` every 3s on port 41234 for patron auto-discovery
- **Entry point** (`src/index.ts`) — starts Hono + tRPC server, begins UDP beacon

**tRPC router structure:**
```
router
├── auth.login          ← patron PIN login → token
├── auth.verify         ← gate PIN verify
├── catalog.search      ← book search (public)
├── catalog.byId        ← book detail (public)
├── me.borrows          ← patron: active borrows
├── me.reservations     ← patron: reservations
├── me.favorites        ← patron: favorites
├── borrows.return      ← patron: return a copy
├── borrows.renew       ← patron: renew a borrow
├── books.reserve       ← patron: reserve a book
├── books.favorite      ← patron: toggle favorite
├── books.addReview     ← patron: add review
├── gate.log            ← patron: gate entry/exit
├── admin.books.*       ← librarian: book CRUD
├── admin.members.*     ← librarian: member CRUD
├── admin.circulation.* ← librarian: borrow management
├── admin.reports.*     ← librarian: all reports
├── admin.inventory.*   ← librarian: inventory sessions
├── admin.settings.*    ← librarian: institution settings
└── admin.backup.*      ← librarian: export/import/migration
```

Procedures are protected by middleware:
- **Public** — no auth required (catalog search, book detail)
- **Patron** — requires valid bearer token in context
- **Librarian** — requires librarian session (admin/librarian role)

**Build output:**
- `packages/server` compiles to a standalone binary per platform using Node.js SEA (Single Executable Application) or `pkg`:
  - `bookleaf-server-win.exe`
  - `bookleaf-server-macos`
  - `bookleaf-server-linux`
- These binaries are bundled inside the Tauri desktop installer. The librarian installs nothing separately.
- On Android, `packages/server` source runs directly inside `nodejs-mobile-react-native` (no compilation needed).

---

## App Specifications

### `apps/server`
**What it is:** The current app, stripped of client-mode screens. Runs `packages/server` via `nodejs-mobile-react-native`.

**Kept from current codebase:**
- All `app/(server)/` screens and `app/(auth)/` (setup, login)
- `ServerBridge.ts` — updated to start `packages/server` instead of `main.js`
- `appStore` (server slice)
- `LlmService` + `llama.rn` (Gemma 2B AI chat stays on Android)

**Removed:**
- `nodejs-assets/nodejs-project/main.js` — replaced by `packages/server`
- `ApiServer.ts` — logic moves into `packages/server` tRPC procedures
- All `app/(client)/` screens
- `clientApi.ts`
- Client-mode Zustand state

**New addition:**
- Raw SQLite export in Settings — exports the `.db` file for migration to Desktop.

---

### `apps/client`
**What it is:** A new, lightweight Expo app for patron devices only.

**Extracted from current codebase:**
- All `app/(client)/` screens
- `app/(auth)/connect.tsx` (server discovery / manual IP entry)
- Client slice of `appStore` (serverUrl, sessionToken, currentUser, clientSession hydration)

**Excluded auth screens** (server-only, stay in `apps/server`):
- `setup.tsx` — institution setup wizard
- `login.tsx` — librarian PIN login
- `register.tsx` — new member registration (done by librarian, not patron)

**New:**
- tRPC client configured with `serverUrl` from appStore — replaces `clientApi.ts`
- All API calls are now fully type-safe via tRPC procedures

**Dependencies removed vs. current app:**
- No `expo-sqlite` or Drizzle ORM
- No `nodejs-mobile-react-native`
- No `llama.rn`
- No `react-native-zeroconf`
- No `expo-notifications`
- Significantly smaller APK

---

### `apps/desktop`
**What it is:** A Tauri desktop application for librarians who prefer a PC over an Android device.

#### Tauri Shell (`src-tauri/`)
- Rust process that spawns the bundled server binary as a child process on startup.
- Manages server lifecycle (start, stop, restart on crash, graceful shutdown).
- Bundles platform-specific server binaries (built from `packages/server`):
  - `bookleaf-server-win.exe`
  - `bookleaf-server-macos`
  - `bookleaf-server-linux`
- Tauri webview loads the React frontend (served as static files by the Hono server).
- Exposes Tauri commands for native OS features: file picker (DB import), system tray, window management.

#### React Frontend (`frontend/`)
- Vite + React + TypeScript.
- Uses the **same tRPC client** as `apps/client` — same type-safe procedures, same router.
- Sidebar navigation layout (not mobile tab bar).
- Has access to all `admin.*` procedures (librarian-scoped).

**Screens:**

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
| AI Chat | Chat via local Ollama (graceful fallback if Ollama not running) |
| Settings | Institution config, backup/restore, import from Android (.db file) |

**Barcode/QR scanning:** Deferred — not in v1.

**AI:** Uses Ollama (separate optional install). If not running, AI Chat shows setup instructions. No model bundled in the app.

**Installer experience:**
- Librarian downloads `Bookleaf-Setup.exe` (or `.dmg` / `.AppImage`)
- Installs like any desktop app — no Node.js, no terminal, no manual steps
- Everything is bundled: React UI, server binary, SQLite (created on first run)
- Double-click Bookleaf → native window opens → server starts automatically in background

---

## Type Safety Model

tRPC eliminates the manual API contract from the previous design. Instead:

```
packages/server  →  exports AppRouter type
apps/client      →  imports AppRouter → tRPC client → fully typed procedures
apps/desktop     →  imports AppRouter → tRPC client → fully typed procedures
```

If a procedure's input or output changes in `packages/server`, TypeScript errors surface immediately in both `apps/client` and `apps/desktop` at compile time. No runtime surprises, no manual contract sync.

---

## UDP Discovery

The server binary (running on both Android and desktop) broadcasts a UDP beacon every 3s:

```json
{ "ip": "192.168.1.x", "port": 3000, "name": "Bookleaf Library" }
```

The patron client listens on port 41234 and connects to whatever `{ ip, port }` it receives. Both server types broadcast on the same format — the client doesn't need to know which server type it's talking to.

---

## Data Migration (Android → Desktop)

1. Librarian opens `apps/server` Settings → exports raw `.db` file.
2. Librarian opens `apps/desktop` Settings → Import from Android → selects `.db` file via native file picker.
3. Desktop tRPC procedure `admin.backup.importFromAndroid` reads the SQLite file, inserts records in dependency order:
   `institutions → users → resources → resource_copies → borrowing_records → reservations → fines → favorites → reviews → gate_logs → settings`
4. PIN hashes migrate as-is (`sha256s$<salt>$<hash>`) — patron PINs work on day one.
5. Import returns a progress summary to the frontend.

---

## Implementation Phases

Each phase is a separate spec → plan → implementation cycle.

### Phase 1 — Monorepo Setup
- Initialize Turborepo + pnpm workspaces in the existing repo.
- Create `packages/types`, `packages/db-schema`.
- Move current app code into `apps/server/` as a starting point.
- Verify `apps/server` builds and runs identically to the current app.
- No functional changes — pure restructuring.

### Phase 2 — Extract `packages/server` + tRPC
- Create `packages/server` with Hono + tRPC + Drizzle.
- Port business logic from current `src/services/` into tRPC procedures.
- Wire `apps/server` to use `packages/server` via `nodejs-mobile-react-native`.
- Replace `main.js` and `ApiServer.ts` with `packages/server`.
- Verify Android server works identically to current behavior.

### Phase 3 — Split Mobile Apps
- Create `apps/client/` as a new Expo project.
- Extract client-mode screens into `apps/client/`.
- Replace `clientApi.ts` with tRPC client in `apps/client/`.
- Remove client-mode code from `apps/server/`.
- Add raw SQLite export to `apps/server/` Settings.
- Verify both apps build and patron phones connect to Android server.

### Phase 4 — Desktop App
- Scaffold `apps/desktop/` with Tauri + Vite + React.
- Build `packages/server` standalone binary compilation pipeline.
- Wire Tauri to spawn the server binary on startup.
- Build React librarian UI with all screens listed above.
- Integrate Ollama for AI chat.
- Verify patron phones connect to desktop server.
- Verify data migration from Android export.

---

## Key Constraints

- `npm install --legacy-peer-deps` — do not use `npx expo install`. Applies to `apps/server` and `apps/client`.
- Native modules in Expo apps require full `expo run:android` rebuild.
- `crypto.getRandomValues` not available in Hermes — polyfill must load before any crypto calls in both mobile apps.
- `packages/server` must not use any Node.js APIs unavailable in `nodejs-mobile-react-native` (e.g. some `fs` paths, `child_process`). Test on Android early.
- Server binary for desktop is built in CI per platform — not committed to the repo.
- Ollama for desktop AI is optional. App must work fully without it.
- The LLM tool-calling pipeline (`LlmService` + `LibraryTools`) stays in `apps/server` only — it uses `llama.rn` which is Android-specific. Desktop AI uses Ollama with a simpler implementation.
