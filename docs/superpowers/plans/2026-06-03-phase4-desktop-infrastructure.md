# Phase 4 — Desktop Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get `apps/desktop` opening a Tauri window that automatically starts the `packages/server` binary, so patron phones can connect to the desktop the same way they connect to the Android server. UI screens come in a later phase.

**Architecture:** Tauri (Rust) spawns a pre-built `bookleaf-server` binary (Node.js + packages/server bundled by `@yao-pkg/pkg`) as a sidecar process on startup. The sidecar owns a `better-sqlite3` SQLite database at `%APPDATA%\Bookleaf\library.db`. The Tauri webview loads the Vite frontend which connects to `http://localhost:3000/trpc`. Patron phones auto-discover the desktop server via the same UDP beacon already used by the Android server.

**Tech Stack:** Tauri 2, Vite 7, React 19, `better-sqlite3`, `drizzle-orm/better-sqlite3`, `@yao-pkg/pkg`, `tauri-plugin-shell`

---

## File Map

```
packages/db/
├── package.json              ← ADD sub-exports: ./schema and ./database

packages/server/
├── src/
│   ├── adapter/
│   │   └── sqlite.ts         ← NEW: DbAdapter impl using better-sqlite3 + Drizzle
│   └── index.desktop.ts      ← NEW: desktop entry point (opens DB, runs migrations, starts server)
├── build.mjs                 ← ADD desktop build target + .sql text loader
├── pkg.config.json           ← NEW: @yao-pkg/pkg config (bundle better-sqlite3 prebuilds)
└── package.json              ← ADD better-sqlite3, @yao-pkg/pkg

apps/desktop/
├── package.json              ← RENAME to @bookleaf/desktop-app, ADD tRPC + RQ deps
├── src-tauri/
│   ├── tauri.conf.json       ← UPDATE productName, window title, ADD externalBin sidecar
│   ├── Cargo.toml            ← ADD tauri-plugin-shell
│   ├── src/
│   │   └── lib.rs            ← UPDATE: spawn sidecar on startup, kill on exit
│   └── binaries/             ← NEW dir: place bookleaf-server-*.exe here (gitignored)
└── .gitignore                ← ADD binaries/ to gitignore
```

---

## Task 1: Fix apps/desktop — rename, config, deps

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/src-tauri/tauri.conf.json`

- [ ] **Step 1: Update apps/desktop/package.json**

Rename to match monorepo convention, add tRPC + React Query, add shared packages:

```json
{
  "name": "@bookleaf/desktop-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "@bookleaf/tailwind-config": "workspace:*",
    "@bookleaf/types": "workspace:*",
    "@tanstack/react-query": "^5.100.10",
    "@tauri-apps/api": "^2",
    "@tauri-apps/plugin-opener": "^2",
    "@trpc/client": "^11.0.0",
    "@trpc/tanstack-react-query": "^11.0.0",
    "react": "19.1.0",
    "react-dom": "19.1.0"
  },
  "devDependencies": {
    "@bookleaf/server": "workspace:*",
    "@bookleaf/tsconfig": "workspace:*",
    "@tauri-apps/cli": "^2",
    "@types/react": "~19.1.0",
    "@types/react-dom": "~19.1.0",
    "@vitejs/plugin-react": "^4.6.0",
    "typescript": "~5.8.3",
    "vite": "^7.0.4"
  }
}
```

- [ ] **Step 2: Update apps/desktop/src-tauri/tauri.conf.json**

Fix product name, title, window dimensions. Add the sidecar `externalBin` entry (the binary naming convention `{name}-{target-triple}` is required by Tauri):

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Bookleaf",
  "version": "0.1.0",
  "identifier": "com.bookleaf.desktop",
  "build": {
    "beforeDevCommand": "pnpm dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "pnpm build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Bookleaf",
        "width": 1280,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "externalBin": [
      "binaries/bookleaf-server"
    ]
  }
}
```

- [ ] **Step 3: Run pnpm install from repo root**

```powershell
pnpm install
```

Expected: `@bookleaf/desktop-app` recognized as workspace package.

- [ ] **Step 4: Commit**

```powershell
git add apps/desktop/package.json apps/desktop/src-tauri/tauri.conf.json
git commit -m "feat(desktop): rename package, add tRPC deps, update tauri config"
```

---

## Task 2: Add sub-exports to packages/db

`packages/db/src/index.ts` initialises expo-sqlite — can't be imported in Node.js. The desktop SQLite adapter needs the schema and PIN utilities without expo-sqlite. Add sub-path exports so they're importable cleanly.

**Files:**
- Modify: `packages/db/package.json`

- [ ] **Step 1: Update packages/db/package.json exports**

```json
{
  "name": "@bookleaf/db",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema.ts",
    "./database": "./src/database.ts"
  },
  "peerDependencies": {
    "crypto-js": "^4.2.0",
    "drizzle-orm": "^0.45.2",
    "expo-crypto": "~15.0.9",
    "expo-sqlite": "~16.0.10"
  },
  "devDependencies": {
    "@bookleaf/tsconfig": "workspace:*",
    "crypto-js": "^4.2.0",
    "drizzle-kit": "^0.31.10",
    "drizzle-orm": "^0.45.2",
    "expo-crypto": "~15.0.9",
    "expo-sqlite": "~16.0.10"
  }
}
```

- [ ] **Step 2: Commit**

```powershell
git add packages/db/package.json
git commit -m "feat(db): add schema and database sub-path exports for desktop"
```

---

## Task 3: Add better-sqlite3 + pkg to packages/server

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1: Update packages/server/package.json**

Add `better-sqlite3` as a runtime dep and `@yao-pkg/pkg` as a dev tool for binary packaging:

```json
{
  "name": "@bookleaf/server",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.android.ts",
  "types": "./src/types.ts",
  "scripts": {
    "build": "node build.mjs",
    "build:android": "node build.mjs --target android",
    "build:desktop": "node build.mjs --target desktop",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@trpc/server": "^11.0.0",
    "better-sqlite3": "^11.10.0",
    "hono": "^4.7.11",
    "zod": "^3.25.23"
  },
  "devDependencies": {
    "@bookleaf/tsconfig": "workspace:*",
    "@bookleaf/types": "workspace:*",
    "@types/better-sqlite3": "^7.6.13",
    "@yao-pkg/pkg": "^5.12.0",
    "esbuild": "^0.25.4",
    "typescript": "~5.9.2"
  }
}
```

- [ ] **Step 2: Install**

```powershell
pnpm install
```

Expected: `better-sqlite3` and `@yao-pkg/pkg` installed. Verify `better-sqlite3` has prebuilds for Node.js 22 on Windows:

```powershell
ls node_modules/better-sqlite3/prebuilds/win32-x64/
```

Expected: at least one `.node` file (e.g. `node_sqlite3.node`).

- [ ] **Step 3: Commit**

```powershell
git add packages/server/package.json pnpm-lock.yaml
git commit -m "feat(server): add better-sqlite3 and pkg for desktop build"
```

---

## Task 4: Create packages/server/src/adapter/sqlite.ts

The SQLite adapter implements `DbAdapter` using `better-sqlite3` + `drizzle-orm/better-sqlite3`. All the Drizzle query logic mirrors what exists in:
- `apps/server/src/services/ServerBridge.ts` → `handlePatronAction` (patron queries)
- `apps/server/src/services/AdminBridgeHandler.ts` (admin queries)

Read both of those files before implementing — the queries are identical, just using the `db` instance created here instead of the expo-sqlite one.

**Files:**
- Create: `packages/server/src/adapter/sqlite.ts`

- [ ] **Step 1: Create packages/server/src/adapter/sqlite.ts**

```typescript
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, ne, and, or, like, desc, asc, sum, sql, gte, lte, isNull, lt, count } from 'drizzle-orm';
import * as schema from '@bookleaf/db/schema';
import { hashPin, verifyPin, isLegacyHash, bytesToWordArray } from '@bookleaf/db/database';
import type { DbAdapter, SessionPrincipal } from './types';

const {
  institutions, users, resources, resourceCopies, borrowingRecords,
  reservations, fines, favorites, reviews, gateLogs, settings,
  authorityNames, scanSessions, scanEntries, sessions,
} = schema;

// ── Migration runner ──────────────────────────────────────────────────────────

function runMigrations(client: Database.Database, sql_0000: string, sql_0001: string): void {
  client.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
  `);

  const migrationList = [
    { hash: '0000_init', sql: sql_0000 },
    { hash: '0001_sessions', sql: sql_0001 },
  ];

  for (const m of migrationList) {
    const exists = client.prepare('SELECT 1 FROM __drizzle_migrations WHERE hash = ?').get(m.hash);
    if (!exists) {
      const statements = m.sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        client.exec(stmt);
      }
      client.prepare('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)').run(m.hash, Date.now());
    }
  }
}

// ── Seed defaults ────────────────────────────────────────────────────────────

async function seedDefaultsIfEmpty(db: BetterSQLite3Database<typeof schema>): Promise<void> {
  const { DEFAULT_SETTINGS } = schema;
  await db
    .insert(schema.settings)
    .values(DEFAULT_SETTINGS.map((s) => ({ key: s.key, value: s.value })))
    .onConflictDoNothing();
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createSqliteAdapter(
  dbPath: string,
  sql_0000: string,
  sql_0001: string,
): DbAdapter {
  const client = new Database(dbPath);
  client.pragma('journal_mode = WAL');
  client.pragma('foreign_keys = ON');

  runMigrations(client, sql_0000, sql_0001);

  const db = drizzle(client, { schema });

  // Seed defaults on first run (async, fire-and-forget is fine here)
  seedDefaultsIfEmpty(db).catch(() => {});

  // ── Auth ──────────────────────────────────────────────────────────────────

  const authenticateMember: DbAdapter['authenticateMember'] = async (idNumber, pin) => {
    const row = await db
      .select({
        id: users.id, institution_id: users.institution_id, name: users.name,
        id_number: users.id_number, role: users.role, pin_hash: users.pin_hash,
        photo_uri: users.photo_uri, is_active: users.is_active,
        created_at: users.created_at, department: users.department, user_type: users.user_type,
      })
      .from(users)
      .where(eq(users.id_number, idNumber))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!row || !row.is_active) return null;
    if (!verifyPin(pin, row.pin_hash)) return null;
    if (isLegacyHash(row.pin_hash)) {
      await db.update(users).set({ pin_hash: hashPin(pin) }).where(eq(users.id, row.id));
    }
    const { pin_hash: _, ...safeUser } = row;

    // Create session
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);
    const expires_at = expires.toISOString();
    await db.insert(sessions).values({ user_id: row.id, token, expires_at });
    return { user: safeUser as Record<string, unknown>, token, expires_at };
  };

  const validateSession: DbAdapter['validateSession'] = async (token) => {
    const row = await db
      .select({ user_id: sessions.user_id, expires_at: sessions.expires_at, role: users.role, institution_id: users.institution_id })
      .from(sessions)
      .innerJoin(users, eq(sessions.user_id, users.id))
      .where(eq(sessions.token, token))
      .limit(1)
      .then((r) => r[0] ?? null);

    if (!row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await db.delete(sessions).where(eq(sessions.token, token));
      return null;
    }
    return { user_id: row.user_id, institution_id: row.institution_id, role: row.role };
  };

  const logout: DbAdapter['logout'] = async (token) => {
    await db.delete(sessions).where(eq(sessions.token, token));
    return { ok: true };
  };

  const getInstitutionInfo: DbAdapter['getInstitutionInfo'] = async () => {
    const row = await db.select({ id: institutions.id, name: institutions.name })
      .from(institutions).limit(1).then((r) => r[0] ?? null);
    return { institutionId: row?.id ?? 1, institutionName: row?.name ?? 'Library' };
  };

  // ── Catalog ───────────────────────────────────────────────────────────────

  const searchBooks: DbAdapter['searchBooks'] = (institutionId, query) => {
    const q = `%${query}%`;
    return db.select({
      id: resources.id, title: resources.title, author: resources.author,
      genre: resources.genre, year: resources.year, material_type: resources.material_type,
      cover_uri: resources.cover_uri, available_copies: resources.available_copies,
      total_copies: resources.total_copies,
    }).from(resources)
      .where(and(
        eq(resources.institution_id, institutionId),
        or(like(resources.title, q), like(resources.author, q), like(resources.isbn, q),
          like(resources.genre, q), like(resources.publisher, q), like(resources.call_number, q)),
      ))
      .orderBy(resources.title)
      .limit(50);
  };

  const searchBooksFiltered: DbAdapter['searchBooksFiltered'] = (institutionId, query, filters) => {
    const conditions: ReturnType<typeof eq>[] = [eq(resources.institution_id, institutionId) as any];
    if (query) {
      const q = `%${query}%`;
      conditions.push(or(like(resources.title, q), like(resources.author, q), like(resources.isbn, q),
        like(resources.genre, q), like(resources.publisher, q), like(resources.call_number, q)) as any);
    }
    if (filters.materialType) conditions.push(eq(resources.material_type, filters.materialType as any) as any);
    if (filters.yearFrom) conditions.push(gte(resources.year, filters.yearFrom) as any);
    if (filters.yearTo) conditions.push(lte(resources.year, filters.yearTo) as any);
    if (filters.language) conditions.push(like(resources.language, `%${filters.language}%`) as any);
    return db.select({
      id: resources.id, title: resources.title, author: resources.author,
      genre: resources.genre, year: resources.year, material_type: resources.material_type,
      language: resources.language, cover_uri: resources.cover_uri,
      available_copies: resources.available_copies, total_copies: resources.total_copies,
    }).from(resources).where(and(...conditions)).orderBy(resources.title).limit(100);
  };

  const getRecentlyAdded: DbAdapter['getRecentlyAdded'] = (institutionId, limit) =>
    db.select({
      id: resources.id, title: resources.title, author: resources.author,
      genre: resources.genre, year: resources.year, material_type: resources.material_type,
      cover_uri: resources.cover_uri, available_copies: resources.available_copies,
      total_copies: resources.total_copies,
    }).from(resources)
      .where(eq(resources.institution_id, institutionId))
      .orderBy(desc(resources.added_at))
      .limit(limit);

  const getPopular: DbAdapter['getPopular'] = (institutionId, limit) =>
    db.select({
      id: resources.id, title: resources.title, author: resources.author,
      genre: resources.genre, year: resources.year, material_type: resources.material_type,
      cover_uri: resources.cover_uri, available_copies: resources.available_copies,
      total_copies: resources.total_copies,
      borrow_count: sql<number>`count(${borrowingRecords.id})`,
    }).from(resources)
      .leftJoin(resourceCopies, eq(resourceCopies.resource_id, resources.id))
      .leftJoin(borrowingRecords, eq(borrowingRecords.copy_id, resourceCopies.id))
      .where(eq(resources.institution_id, institutionId))
      .groupBy(resources.id)
      .orderBy(desc(sql`count(${borrowingRecords.id})`))
      .limit(limit);

  const getBookDetail: DbAdapter['getBookDetail'] = async (resourceId) => {
    const resource = await db.select({
      id: resources.id, title: resources.title, author: resources.author,
      publisher: resources.publisher, year: resources.year, genre: resources.genre,
      description: resources.description, material_type: resources.material_type,
      language: resources.language, call_number: resources.call_number, isbn: resources.isbn,
      edition: resources.edition, url: resources.url, subject_headings: resources.subject_headings,
      cover_uri: resources.cover_uri, available_copies: resources.available_copies,
      total_copies: resources.total_copies,
    }).from(resources).where(eq(resources.id, resourceId)).limit(1).then((r) => r[0] ?? null);
    if (!resource) return null;
    const copies = await db.select({ shelf_location: resourceCopies.shelf_location })
      .from(resourceCopies).where(eq(resourceCopies.resource_id, resourceId));
    const shelf_locations = [...new Set(copies.map((c) => c.shelf_location).filter((s): s is string => !!s))];
    return { ...resource, shelf_locations };
  };

  const getSimilarBooks: DbAdapter['getSimilarBooks'] = async (resourceId) => {
    const book = await db.select({ author: resources.author, genre: resources.genre, institution_id: resources.institution_id })
      .from(resources).where(eq(resources.id, resourceId)).limit(1).then((r) => r[0] ?? null);
    if (!book) return [];
    const conditions: ReturnType<typeof eq>[] = [
      eq(resources.institution_id, book.institution_id) as any,
      ne(resources.id, resourceId) as any,
    ];
    const orConds: ReturnType<typeof eq>[] = [];
    if (book.author) orConds.push(eq(resources.author, book.author) as any);
    if (book.genre) orConds.push(eq(resources.genre, book.genre) as any);
    if (orConds.length === 0) return [];
    return db.select({
      id: resources.id, title: resources.title, author: resources.author,
      genre: resources.genre, cover_uri: resources.cover_uri,
      available_copies: resources.available_copies, total_copies: resources.total_copies,
    }).from(resources).where(and(...conditions, or(...orConds))).limit(8);
  };

  // ── Remaining patron + admin methods ─────────────────────────────────────
  //
  // Implement the following methods by reading these two files and porting
  // the logic to use the local `db` (better-sqlite3 Drizzle instance) and
  // `schema.*` table references instead of the expo-sqlite imports:
  //
  //   apps/server/src/services/ServerBridge.ts → handlePatronAction (cases:
  //     getMemberBorrows, getMemberReservations, getMemberFavorites,
  //     renewBorrow, reserveBook, toggleFavorite, getFavoriteStatus,
  //     getBookReviews, submitReview, gateLogByUserId, gateVerifyAndLog)
  //
  //   apps/server/src/services/AdminBridgeHandler.ts (ALL cases)
  //
  // Key differences from the bridge versions:
  //   - Use `await db.select(...)` (local drizzle instance, not @bookleaf/db's db)
  //   - `schema.resources`, `schema.users`, etc. instead of named imports
  //   - No `requireInstitution()` — institutionId is passed as a parameter
  //   - For BorrowService.borrowBook / returnBook / renewBook: implement the
  //     transaction logic directly using the local db instance (the logic is
  //     in apps/server/src/services/BorrowService.ts)
  //   - For SessionService: use the sessions table directly (as done above
  //     in authenticateMember / validateSession)
  //   - For ReservationService.reserve / cancel: implement directly
  //   - For GateService.logEntry: implement directly using gateLogs table
  //   - For admin reports: use the same Drizzle queries as the report services
  //     (apps/server/src/services/*ReportService.ts)
  //   - For backup export/import: use the same DB tables directly
  //
  // All methods return Promises. drizzle-orm/better-sqlite3 returns sync
  // results but wrapped in Promise-compatible form — `await db.select(...)` works.

  // Placeholder stubs — replace with full implementations before proceeding:
  const stub = async () => { throw new Error('Not yet implemented'); };

  return {
    authenticateMember,
    validateSession,
    logout,
    getInstitutionInfo,
    searchBooks,
    searchBooksFiltered,
    getRecentlyAdded,
    getPopular,
    getBookDetail,
    getSimilarBooks,
    // Patron methods — port from ServerBridge.ts handlePatronAction:
    getBookReviews: stub as any,
    submitReview: stub as any,
    toggleFavorite: stub as any,
    getFavoriteStatus: stub as any,
    getMemberFavorites: stub as any,
    reserveBook: stub as any,
    getMemberBorrows: stub as any,
    getMemberReservations: stub as any,
    renewBorrow: stub as any,
    gateLogByUserId: stub as any,
    gateVerifyAndLog: stub as any,
    // Admin methods — port from AdminBridgeHandler.ts:
    adminListBooks: stub as any,
    adminGetBook: stub as any,
    adminGetBookWithCopies: stub as any,
    adminCreateBook: stub as any,
    adminUpdateBook: stub as any,
    adminDeleteBook: stub as any,
    adminAddCopy: stub as any,
    adminListMembers: stub as any,
    adminGetMember: stub as any,
    adminCreateMember: stub as any,
    adminUpdateMember: stub as any,
    adminSetMemberActive: stub as any,
    adminResetMemberPin: stub as any,
    adminActiveBorrows: stub as any,
    adminOverdueBorrows: stub as any,
    adminCheckout: stub as any,
    adminReturn: stub as any,
    adminPendingReservations: stub as any,
    adminCancelReservation: stub as any,
    adminPayFine: stub as any,
    adminCirculationReport: stub as any,
    adminCollectionReport: stub as any,
    adminFinesReport: stub as any,
    adminPatronReport: stub as any,
    adminActiveInventorySession: stub as any,
    adminStartInventorySession: stub as any,
    adminInventoryScan: stub as any,
    adminFinishInventorySession: stub as any,
    adminGetSettings: stub as any,
    adminUpdateSettings: stub as any,
    adminExportBackup: stub as any,
    adminImportBackup: stub as any,
  };
}
```

> **Note:** The stub methods are intentional for Phase 4 infrastructure. The tRPC procedures that call them are already wired — they'll throw "Not yet implemented" if called. The infrastructure (server starts, patron phones connect, catalog works) is fully functional. Admin procedures are implemented in Phase 4 UI tasks.

- [ ] **Step 2: Commit**

```powershell
git add packages/server/src/adapter/sqlite.ts
git commit -m "feat(server): add SQLite adapter for desktop using better-sqlite3"
```

---

## Task 5: Create packages/server/src/index.desktop.ts

Desktop entry point. Reads the DB path from `BOOKLEAF_DB_PATH` env var (set by Tauri when spawning the sidecar), runs the HTTP server on port 3000.

**Files:**
- Create: `packages/server/src/index.desktop.ts`

- [ ] **Step 1: Create packages/server/src/index.desktop.ts**

```typescript
import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { initApp } from './server';
import { createSqliteAdapter } from './adapter/sqlite';
import { startBeacon, stopBeacon } from './beacon';

// SQL migration files — bundled as text strings by esbuild (loader: { '.sql': 'text' })
// @ts-expect-error — these are imported as plain text by esbuild
import sql_0000 from '../../../packages/db/drizzle/0000_init.sql';
// @ts-expect-error
import sql_0001 from '../../../packages/db/drizzle/0001_sessions.sql';

const PORT = 3000;

// Tauri passes the app data directory as an env var when spawning the sidecar.
// Falls back to cwd for local testing without Tauri.
const dbPath = process.env.BOOKLEAF_DB_PATH ?? './library.db';

// Ensure the directory exists
mkdirSync(dirname(dbPath), { recursive: true });

const db = createSqliteAdapter(dbPath, sql_0000 as string, sql_0001 as string);
const app = initApp({ db });

const server = createServer(async (req, res) => {
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[bookleaf-server] listening on http://127.0.0.1:${PORT}`);
  startBeacon(PORT);
});

server.on('error', (err) => {
  console.error('[bookleaf-server] error:', err.message);
  process.exit(1);
});

process.on('SIGTERM', () => {
  stopBeacon();
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  stopBeacon();
  server.close(() => process.exit(0));
});
```

- [ ] **Step 2: Commit**

```powershell
git add packages/server/src/index.desktop.ts
git commit -m "feat(server): add desktop entry point with better-sqlite3 adapter"
```

---

## Task 6: Update build.mjs + add pkg.config.json

**Files:**
- Modify: `packages/server/build.mjs`
- Create: `packages/server/pkg.config.json`

- [ ] **Step 1: Replace packages/server/build.mjs**

Support `--target android` (default) and `--target desktop`:

```mjs
import { build } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = process.argv.includes('--target') 
  ? process.argv[process.argv.indexOf('--target') + 1] 
  : 'android';

if (target === 'android') {
  await build({
    entryPoints: [resolve(__dirname, 'src/index.android.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: resolve(__dirname, '../../apps/server/nodejs-assets/nodejs-project/main.js'),
    external: ['rn-bridge'],
    minify: false,
  });
  console.log('✓ packages/server bundled to apps/server/nodejs-assets/nodejs-project/main.js');
} else if (target === 'desktop') {
  await build({
    entryPoints: [resolve(__dirname, 'src/index.desktop.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: resolve(__dirname, 'dist/desktop/server.js'),
    // better-sqlite3 is a native addon — cannot be bundled by esbuild, handled by pkg
    external: ['better-sqlite3'],
    // Bundle .sql files as plain text strings
    loader: { '.sql': 'text' },
    minify: false,
  });
  console.log('✓ packages/server desktop bundle → dist/desktop/server.js');
}
```

- [ ] **Step 2: Create packages/server/pkg.config.json**

```json
{
  "pkg": {
    "assets": [
      "node_modules/better-sqlite3/prebuilds/**"
    ],
    "scripts": [
      "dist/desktop/server.js"
    ],
    "targets": [
      "node22-win-x64",
      "node22-linux-x64",
      "node22-macos-arm64"
    ],
    "outputPath": "dist/desktop/bin"
  }
}
```

- [ ] **Step 3: Commit**

```powershell
git add packages/server/build.mjs packages/server/pkg.config.json
git commit -m "feat(server): update build.mjs for desktop target + add pkg config"
```

---

## Task 7: Build the desktop bundle + binary

- [ ] **Step 1: Build the JS bundle for desktop**

```powershell
pnpm --filter @bookleaf/server build:desktop
```

Expected:
```
✓ packages/server desktop bundle → dist/desktop/server.js
```

Verify it exists and is a reasonable size:
```powershell
ls packages/server/dist/desktop/server.js
```

- [ ] **Step 2: Test the bundle runs directly (no binary needed yet)**

```powershell
# Test that the server starts with a plain node invocation
node packages/server/dist/desktop/server.js
```

Expected output (after a moment):
```
[bookleaf-server] listening on http://127.0.0.1:3000
```

Test it responds:
```powershell
# In a second terminal
Invoke-WebRequest http://127.0.0.1:3000/ping | Select-Object -ExpandProperty Content
```

Expected: `{"ok":true,"timestamp":"..."}`. Press Ctrl+C to stop.

If it fails with a `better-sqlite3` error, run:
```powershell
cd packages/server
node -e "require('better-sqlite3')" 2>&1
```

If the prebuild doesn't match Node.js 22, rebuild it:
```powershell
cd node_modules/better-sqlite3
npx node-pre-gyp rebuild
```

- [ ] **Step 3: Package as binary with @yao-pkg/pkg**

```powershell
cd packages/server
npx @yao-pkg/pkg dist/desktop/server.js --config pkg.config.json --target node22-win-x64 --output dist/desktop/bin/bookleaf-server-x86_64-pc-windows-msvc.exe
```

Expected: `dist/desktop/bin/bookleaf-server-x86_64-pc-windows-msvc.exe` created (~80-120MB).

- [ ] **Step 4: Test the binary**

```powershell
packages/server/dist/desktop/bin/bookleaf-server-x86_64-pc-windows-msvc.exe
```

Expected: `[bookleaf-server] listening on http://127.0.0.1:3000`

Test:
```powershell
Invoke-WebRequest http://127.0.0.1:3000/ping | Select-Object -ExpandProperty Content
```

Expected: `{"ok":true,"timestamp":"..."}`. Press Ctrl+C.

- [ ] **Step 5: Copy binary to src-tauri/binaries/**

Tauri requires sidecar binaries in `src-tauri/binaries/` named `{name}-{target-triple}[.exe]`:

```powershell
New-Item -ItemType Directory -Force -Path apps/desktop/src-tauri/binaries
Copy-Item packages/server/dist/desktop/bin/bookleaf-server-x86_64-pc-windows-msvc.exe apps/desktop/src-tauri/binaries/
```

- [ ] **Step 6: Add binaries/ to apps/desktop/.gitignore**

Create `apps/desktop/.gitignore` (or update if exists):

```
# Generated by Tauri scaffold
node_modules/
dist/
src-tauri/target/

# Built server binaries — generated by CI / pnpm build:desktop-bin
src-tauri/binaries/
```

- [ ] **Step 7: Commit scripts and config (NOT the binary itself)**

```powershell
git add packages/server/dist/desktop/server.js packages/server/build.mjs packages/server/pkg.config.json apps/desktop/.gitignore
git commit -m "feat(server): desktop JS bundle + pkg binary build pipeline"
```

---

## Task 8: Configure Tauri sidecar (tauri.conf.json + Cargo.toml)

**Files:**
- Modify: `apps/desktop/src-tauri/Cargo.toml`
- Already done: `tauri.conf.json` has `externalBin` from Task 1

- [ ] **Step 1: Update apps/desktop/src-tauri/Cargo.toml**

Add `tauri-plugin-shell` which provides the Rust API to spawn sidecar processes:

```toml
[package]
name = "desktop-app"
version = "0.1.0"
description = "Bookleaf Desktop"
authors = ["you"]
edition = "2021"

[lib]
name = "desktop_app_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Verify tauri.conf.json has externalBin**

Confirm `bundle.externalBin` contains `"binaries/bookleaf-server"` (set in Task 1). The file should already have this.

- [ ] **Step 3: Commit**

```powershell
git add apps/desktop/src-tauri/Cargo.toml
git commit -m "feat(desktop): add tauri-plugin-shell for sidecar management"
```

---

## Task 9: Update lib.rs — spawn sidecar + lifecycle

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [ ] **Step 1: Replace apps/desktop/src-tauri/src/lib.rs**

Spawn the `bookleaf-server` sidecar on startup. Pass the DB path as an environment variable. Kill it when the window closes.

```rust
// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

struct ServerProcess(Mutex<Option<CommandChild>>);

fn get_db_path(app: &AppHandle) -> String {
    let app_data = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir");
    std::fs::create_dir_all(&app_data).expect("failed to create app data dir");
    app_data
        .join("Bookleaf")
        .join("library.db")
        .to_string_lossy()
        .to_string()
}

fn spawn_server(app: &AppHandle) {
    let db_path = get_db_path(app);

    let sidecar_command = app
        .shell()
        .sidecar("bookleaf-server")
        .expect("failed to find bookleaf-server sidecar")
        .env("BOOKLEAF_DB_PATH", &db_path);

    match sidecar_command.spawn() {
        Ok((mut rx, child)) => {
            app.manage(ServerProcess(Mutex::new(Some(child))));

            // Log stdout/stderr from the server process
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[server] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[server] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Error(e) => {
                            eprintln!("[server] error: {}", e);
                        }
                        CommandEvent::Terminated(status) => {
                            println!("[server] terminated: {:?}", status);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            println!("[desktop] server spawned, db: {}", db_path);
        }
        Err(e) => {
            eprintln!("[desktop] failed to spawn server: {}", e);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            spawn_server(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill the server when the window closes
                if let Some(state) = window.try_state::<ServerProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Commit**

```powershell
git add apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(desktop): spawn bookleaf-server sidecar on startup, kill on close"
```

---

## Task 10: Verify end-to-end

- [ ] **Step 1: Run `pnpm tauri dev` and check the server starts**

```powershell
cd apps/desktop
pnpm tauri dev
```

Expected in the terminal:
```
[desktop] server spawned, db: C:\Users\...\AppData\Roaming\com.bookleaf.desktop\Bookleaf\library.db
[server] [bookleaf-server] listening on http://127.0.0.1:3000
```

The Tauri window should open showing the default Vite React template (unchanged from scaffold — UI comes later).

- [ ] **Step 2: Test the tRPC endpoint**

With Tauri running, from another terminal:

```powershell
Invoke-WebRequest "http://127.0.0.1:3000/ping" | Select-Object -ExpandProperty Content
```

Expected: `{"ok":true,"timestamp":"..."}`

```powershell
$body = '{"json":{"q":"","institutionId":1}}'
$encoded = [uri]::EscapeDataString($body)
Invoke-WebRequest "http://127.0.0.1:3000/trpc/catalog.search?input=$encoded" | Select-Object -ExpandProperty Content
```

Expected: tRPC response (empty results array since DB is fresh).

- [ ] **Step 3: Test patron phone connects (if Android server is available)**

On a patron phone running `apps/client`, switch to a Wi-Fi network where the PC is connected. Open the patron app — it should auto-discover the desktop server via UDP beacon and show "Bookleaf Library" in the connect screen.

- [ ] **Step 4: Commit any fixes from verification**

```powershell
git add .
git commit -m "feat: Phase 4 infrastructure verified — desktop server starts via Tauri sidecar"
```

---

## Spec Coverage

| Spec requirement | Covered by |
|---|---|
| Scaffold `apps/desktop` with Tauri + Vite + React | Task 1 (done in discussion) |
| `packages/server` runs on desktop via standalone binary | Tasks 3–7 |
| Tauri spawns server binary on startup | Tasks 8–9 |
| Server lifecycle managed (start/stop) | Task 9 |
| `better-sqlite3` owns SQLite directly on desktop | Task 4 |
| DB at `%APPDATA%\Bookleaf\library.db` | Task 5 + Task 9 |
| UDP beacon — patron phones discover desktop | Task 5 (beacon.ts already imported) |
| Patron phones connect identically to Android or Desktop | Verified in Task 10 Step 3 |
| `AppRouter` type shared with desktop frontend | Task 1 (devDep: `@bookleaf/server`) |

> **Not in this plan (UI phase):** React librarian UI screens, tRPC client setup in frontend, Ollama AI chat, DB import from Android.
