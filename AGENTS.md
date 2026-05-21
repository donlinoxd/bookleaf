# Bookleaf — Agent Instructions

## Expo Version

Read the **exact versioned docs at https://docs.expo.dev/versions/v54.0.0/** before writing any Expo code.  
Current Expo SDK: **54.0.33** · Expo Router: **6.0.23**

---

## Project Overview

**Bookleaf** is an offline-first Android library management system for institutions without dedicated infrastructure. One Android device acts as a Wi-Fi server; patron devices connect as clients over local LAN.

App name in config: `bookleaf` · Bundle ID: `com.bookleaf.app` · Deep-link scheme: `libraryapp`

---

## Tech Stack

| Layer | Library | Version |
|---|---|---|
| Framework | React Native + Expo | 54.0.33 |
| Routing | Expo Router (file-based) | 6.0.23 |
| Styling | NativeWind + Tailwind CSS | 4.2.4 / 3.4.19 |
| Database | expo-sqlite + Drizzle ORM | 16.0.10 / 0.45.2 |
| State | Zustand | 5.0.13 |
| Data fetching | TanStack React Query | 5.100.10 |
| HTTP server | nodejs-mobile-react-native | 18.20.4 |
| Scanning | expo-camera | 17.0.10 |
| Local LLM | llama.rn (Gemma 2B GGUF) | 0.12.0 |
| mDNS discovery | react-native-zeroconf | 0.14.0 |
| HTTP client | axios | 1.16.1 |
| Crypto | crypto-js + expo-crypto (PIN salted SHA-256, backup PBKDF2+AES-CBC+HMAC) | 4.2.0 / 15.0.x |
| Network info | expo-network | 8.0.7 |
| Build properties | expo-build-properties (Expo config plugin) | 1.0.10 |
| Random polyfill | react-native-get-random-values + src/polyfills.ts | 2.0.0 |
| App version | expo-constants (Settings footer) | 18.0.13 |
| Icons | @expo/vector-icons (Ionicons) | 15.1.1 |
| QR codes | react-native-qrcode-svg | — |
| Push notifications | expo-notifications | 0.32.17 |
| File system | expo-file-system | 19.0.22 |
| Export/print | expo-sharing + expo-print + expo-document-picker | — |

---

## Architecture

### Server / Client Split

**Server mode** (librarian's device):
- Runs a Node.js HTTP server on port 3000 via `nodejs-mobile-react-native`
- Owns the SQLite database (Drizzle ORM)
- Broadcasts UDP discovery beacon on port 41234 every 3s (`react-native-zeroconf` is in deps but unused — real impl is UDP broadcast in `main.js`)
- Full CRUD: books, members, borrow/return, inventory, reports, AI chat

**Client mode** (patron's device):
- No local DB
- Discovers server via UDP beacon or manual IP entry
- REST calls go through `clientFetch` (`src/services/clientApi.ts`) which injects `Authorization: Bearer <token>` and clears the session on 401
- Authenticated actions: catalog search, my-books, renew, reserve, favorite, write review, gate check-in

### Bridge Layer (`src/services/ServerBridge.ts` + `nodejs-assets/nodejs-project/main.js`)
React Native ↔ Node.js communicate over a bidirectional JSON message channel. `ApiServer.ts` handles REST routing inside the Node.js process.

### Routing (`app/`)
File-based Expo Router with three groups:

```
app/
├── index.tsx              → boot: reads AsyncStorage app_mode, redirects
├── _layout.tsx            → root: providers + DB migrations
├── (auth)/                → setup, login, register, connect
├── (server)/              → librarian/admin tabs + nested routes
└── (client)/              → patron tabs
```

Boot logic (`index.tsx`): reads `app_mode` from AsyncStorage → `server` → `/(auth)/login`, `client` → `/(auth)/connect`, null → `/(auth)/setup`.

**Server tabs** (visible): dashboard, books, scan *(accent)*, members, opac  
**Server hidden routes** (href: null): ai-chat, borrow, settings, book/[id], book/add, member/[id], member/add, inventory-scan, gate-scan, gate-qr, reservations, inventory-report/[sessionId], reports/*

**Client tabs**: dashboard, home, my-books *(accent)*, my-card, gate
**Client hidden routes** (href: null): book/[id]

### Global State (`src/store/appStore.ts`)
```typescript
useAppStore() → { mode, currentUser, institution, settings, serverUrl, sessionToken, sessionExpiresAt, setMode, setCurrentUser, setInstitution, setSettings, setServerUrl, setClientSession, clearClientSession, hydrateClientSession, reset }
```

### Data Fetching
React Query with a key factory at `src/lib/queryKeys.ts`. Pattern:
```typescript
useQuery({ queryKey: queryKeys.resources(iid, q), queryFn: () => BookService.search(iid, q), enabled: !!iid })
```

### Database Schema (`src/db/schema.ts`)
Core tables: `institutions`, `users`, `sessions`, `authority_names`, `resources`, `resource_copies`, `borrowing_records`, `reservations`, `fines`, `favorites`, `reviews`, `scan_sessions`, `scan_entries`, `gate_logs`, `settings`

Key enums:
- `material_type`: BOOK, SERIAL, ARTICLE, AUDIOVISUAL, MAP, MANUSCRIPT, DIGITAL, THESIS, OTHER
- `role`: admin, librarian, member
- `user_type`: student, faculty, alumni, external
- `status` (copy): available, borrowed, reserved
- `condition`: good, damaged, lost

Migrations auto-run at startup via `useMigrations(db, migrations)`. Seeding via `seedDefaults()`.

### Services (`src/services/`)
Business logic is in ~20 services. Key ones:
- `ResourceService` / `BookService` — book CRUD & search
- `UserService` — auth, member CRUD, PIN (salted SHA-256)
- `SessionService` — 30-day bearer tokens; `validate(token)` joins users and self-purges expired rows
- `clientApi` (`src/services/clientApi.ts`) — `clientFetch(path)` wrapper for client mode: prepends serverUrl, injects Authorization, clears session on 401
- `BorrowService` — checkout, return, fine calculation
- `GateService` — gate entry/exit logging
- `LlmService` — Gemma 2B inference + tool calling
- `LibraryTools` — 6 LLM tool definitions (search_resources, get_patron_info, get_patron_fines, get_overdue_books, get_circulation_stats, get_today_gate_activity)
- `*ReportService` — circulation, collection, fines, patron, inventory analytics
- `ReservationService` — book reservation management
- `InventoryService` / `InventoryAuditService` — physical inventory & audit sessions
- `FavoritesService` — patron book favorites
- `ReviewService` — patron book reviews/ratings
- `IsbnLookupService` — external ISBN metadata lookup
- `NotificationService` — local push notifications (expo-notifications)
- `AuthorityService` — authority/subject heading control
- `SettingsService` — institution settings CRUD
- `MdnsService` — mDNS publish/scan
- `BackupService` — passphrase-encrypted export/import (AES-256-CBC + HMAC-SHA256, encrypt-then-MAC; PBKDF2-derived keys); transactional import with enum validation

---

## Design System

### Color Tokens (tailwind.config.js)

| Token | Value | Usage |
|---|---|---|
| `brand` / `brand-DEFAULT` | `#2A5C33` | Primary — active icons, headings, borders |
| `brand-light` | `#3A7A45` | Hover/pressed states |
| `brand-dark` | `#1C3E23` | Deep emphasis |
| `mint` / `mint-DEFAULT` | `#E2EFE0` | Secondary backgrounds, chips |
| `mint-dark` | `#C8DFC5` | Borders, dividers |
| `leaf` | `#5CB85C` | **Accent** — FAB, accent tab button, CTAs |
| `bio` | `#FAFDF9` | App background (warm off-white) |

In code: `bg-brand`, `text-brand`, `bg-leaf`, `bg-mint`, `bg-bio`, etc.

### CustomTabBar (`src/components/navigation/CustomTabBar.tsx`)
- Floating pill at bottom (absolute, 16px side margins, 8px above safe area)
- White background, `borderRadius: 28`, elevation 10, green shadow (`#2A5C33`)
- **Accent button** (center tab): 58×58 circle, `LEAF` (#5CB85C) fill, −28px negative margin (pops above bar), white border, `scan-outline` icon
- Active tab: icon + label in `BRAND` (#2A5C33), bold
- Inactive tab: icon + label in `#94A3B8` (slate-400)
- Hidden on routes: `scan`, `ai-chat`, `inventory-scan`, `gate-scan`

### Layout Patterns
- Safe area via `useSafeAreaInsets()`
- Dynamic sizing via `useWindowDimensions()`
- 8px base unit (NativeWind gap-2 = 8px)
- Elevation + shadow for depth (shadow color matches element color)

### Icons
Ionicons from `@expo/vector-icons`. Always `size={22}` for tab icons, `size={24}` for inline, `size={26}` for accent button.

---

## AI / LLM Integration

Model: **Gemma 2B IT Q4_K_M GGUF** (~1.1 GB, downloaded to `${FileSystem.documentDirectory}models/` on first use)  
Context: 2048 tokens · Temperature: 0.7 · Streaming via callback

Workflow:
1. Off-topic guardrail (client-side pattern match)
2. Phase 1 — model decides which tools to call
3. Phase 2 — execute tools in parallel (library DB queries)
4. Phase 3 — stream final grounded response

---

## Authentication

**PIN storage** — Salted SHA-256, stored as `sha256s$<salt-hex>$<hash-hex>`. Salt is 16 random bytes from `expo-crypto.getRandomBytes`. Legacy formats (`pbkdf2$...`, bare SHA-256) still verify and are lazy-upgraded on successful login. `hashPin`/`verifyPin`/`isLegacyHash` in `src/db/database.ts`.

**HTTP API auth** — Bearer tokens. `POST /api/auth/member` issues a 32-byte hex token with 30-day expiry, stored in the `sessions` table. Per-member endpoints (`/api/me/borrows`, `/api/me/reservations`, `/api/me/favorites`, `POST /api/borrows/:id/renew`, `POST /api/books/:id/{reserve,favorite,reviews}`, `POST /api/gate/log`) resolve user identity from the token via `authResolve(req)` in `main.js`. **Never trust an idNumber from a request body.**

**Rate limiting** — In-memory per-account on `/api/auth/member` and `/gate/login`: 5 fails → 1 min, 10 → 5 min, 15+ → 15 min lockout. Returns `429` with `Retry-After`.

**Client session persistence** — AsyncStorage key `client_session` holds `{ user, token, expires_at, serverUrl }`. Restored at boot via `useAppStore.hydrateClientSession()`.

**Browser `/gate` page** — separate flow, still PIN-per-request (not token-based).

**Role hierarchy** — admin > librarian > member.

**Threat model** — LAN-only trust. See README "Security note" for documented residual risks (no HTTPS in v1, plaintext sniffing possible on the same Wi-Fi).

---

## Development

```bash
npm install --legacy-peer-deps   # `npx expo install` will fail — SDK-55 packages are pinned in this SDK-54 project
npm run db:generate              # regenerate Drizzle migrations after schema changes
npm start                        # Expo dev server
npm run android                  # build + run on device
```

Database migrations are generated to `drizzle/migrations.js` and run automatically on app start.

**Native config (Android):**
- `android/` is gitignored — `expo prebuild` regenerates it. Don't edit `android/app/build.gradle` or `AndroidManifest.xml` directly without also persisting the change via `expo-build-properties` in `app.json` or a custom Expo config plugin.
- Cleartext HTTP is enabled via the `expo-build-properties` plugin in `app.json` so client-mode `http://` fetches work in release builds.
- Release signing reads from `BOOKLEAF_UPLOAD_*` gradle properties (see comment in `android/app/build.gradle`); falls back to debug signing with a `logger.warn` if not set.
- `./gradlew clean` often fails on `externalNativeBuildCleanDebug` (CMake reconfigure) — usually safe to skip the clean step. If a hard rebuild is needed: `rm -rf android/app/.cxx android/app/build android/build && npx expo run:android`.
- Adding a native module (anything that autolinks) requires a full `expo run:android` rebuild, not just a Metro reload.

---

## File Conventions

- Screens: `app/(server)/*.tsx`, `app/(client)/*.tsx`
- Services: `src/services/*.ts` — plain TS classes, no React
- Components: `src/components/<domain>/<ComponentName>.tsx`
- Types: `src/types/index.ts` — all shared interfaces
- Query keys: `src/lib/queryKeys.ts` — use the factory, never inline keys
- DB: `src/db/schema.ts` (schema) · `src/db/database.ts` (init) · `src/db/index.ts` (exports)

---

## Common Pitfalls

- Always check `useMigrations` result before querying DB in layouts
- `nodejs-mobile` bridge messages are JSON strings — always `JSON.parse` / `JSON.stringify`
- `expo-camera` permissions must be requested before first scan
- Drizzle `eq`, `like`, `and` — import from `drizzle-orm`, not from schema
- NativeWind v4 uses `className` prop; inline `style` and `className` can coexist
- `useAppStore()` is a Zustand hook — only call inside React components/hooks
- `expo-file-system` SDK 54: `documentDirectory`, `writeAsStringAsync`, `readAsStringAsync` live at `expo-file-system/legacy`, NOT the default export
- `crypto.getRandomValues` is NOT available in Hermes. `src/polyfills.ts` patches it via `expo-crypto`. Don't make top-level (module-load-time) calls to `hashPin` / `encryptBackup` / `WordArray.random` — Expo Router evaluates route modules before `_layout.tsx` loads. Compute inside functions.
- SQL date compares: wrap the column in `datetime(...)` — `borrowed_at` is space-format (SQLite default), `due_date`/`returned_at`/`paid_at` are ISO `T...Z`. Plain text compare misorders them: `` sql`datetime(${col}) < datetime('now')` ``.
- Atomic claims (e.g. last-copy borrow race): use Drizzle conditional `UPDATE ... WHERE id=? AND status='X' RETURNING ...` and branch on `returning()` length — read-then-update is a TOCTOU race.
- Client mode HTTP calls: use `clientFetch` from `src/services/clientApi.ts`, not raw `fetch`. It prepends serverUrl, injects `Authorization`, and clears the session on 401.
- All per-member API endpoints live at `/api/me/*` and resolve identity from the bearer token. Don't add new endpoints that take an idNumber in the body.
- PIN hashing uses salted SHA-256 (not PBKDF2) — pure-JS PBKDF2 in Hermes locks the UI for ~60s on low-end Android. Backup encryption uses PBKDF2 at 2k iter (acceptable for one-shot interactive flow).
- Lost copies: `condition='lost'` is the source of truth; status stays `'available'` (no `'lost'` enum value). `getAvailableCopy` and `borrowBook` filter out lost copies via `ne(condition, 'lost')`.
- Pre-existing TS errors to ignore when assessing regressions: 5 in `BorrowService.ts` (SELECT casts missing `renewal_count`) and 1 in `NotificationService.ts` (deprecated `shouldShowAlert`). Filter with `npx tsc --noEmit 2>&1 | grep -E "^[^ ]+\.tsx?\(" | awk -F'(' '{print $1}' | sort -u` and compare against this list.
- Mode-based route guards: `(server)/_layout.tsx` and `(client)/_layout.tsx` redirect to `/` if `useAppStore.mode` doesn't match. Server bridge is also gated on `mode === 'server'`. Don't add layout-level side effects before the guard.
- `ServerBridge.requireInstitution()` throws if `start()` hasn't run — institution-scoped actions must go through it, never read the module-level `institutionId` directly.
