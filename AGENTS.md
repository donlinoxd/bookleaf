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
| Crypto | crypto-js (SHA-256 PIN hashing) | 4.2.0 |
| Icons | @expo/vector-icons (Ionicons) | 15.1.1 |
| QR codes | react-native-qrcode-svg | — |

---

## Architecture

### Server / Client Split

**Server mode** (librarian's device):
- Runs a Node.js HTTP server on port 3000 via `nodejs-mobile-react-native`
- Owns the SQLite database (Drizzle ORM)
- Publishes mDNS service `_bookleaf._tcp.local.`
- Full CRUD: books, members, borrow/return, inventory, reports, AI chat

**Client mode** (patron's device):
- No local DB
- Discovers server by manual IP entry (mDNS auto-discovery is planned)
- REST API calls to `http://<serverIp>:3000`
- Read-only: catalog search, self-lookup (borrows, fines, due dates), gate check-in

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
**Server hidden routes** (href: null): ai-chat, borrow, settings, book/[id], member/[id], inventory-scan, gate-scan, reports/*

**Client tabs**: home, my-books *(accent)*, my-card, gate

### Global State (`src/store/appStore.ts`)
```typescript
useAppStore() → { mode, currentUser, institution, settings, serverUrl, setMode, setCurrentUser, setInstitution, setSettings, setServerUrl, reset }
```

### Data Fetching
React Query with a key factory at `src/lib/queryKeys.ts`. Pattern:
```typescript
useQuery({ queryKey: queryKeys.resources(iid, q), queryFn: () => BookService.search(iid, q), enabled: !!iid })
```

### Database Schema (`src/db/schema.ts`)
Core tables: `institutions`, `users`, `resources`, `resource_copies`, `borrowing_records`, `reservations`, `fines`, `scan_sessions`, `scan_entries`, `gate_logs`, `settings`

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
- `UserService` — auth, member CRUD, PIN (SHA-256)
- `BorrowService` — checkout, return, fine calculation
- `GateService` — gate entry/exit logging
- `LlmService` — Gemma 2B inference + tool calling
- `LibraryTools` — 6 LLM tool definitions (search_resources, get_patron_info, get_patron_fines, get_overdue_books, get_circulation_stats, get_today_gate_activity)
- `*ReportService` — circulation, collection, fines, patron, inventory analytics
- `MdnsService` — mDNS publish/scan
- `BackupService` — export/import

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

- PIN hashed with SHA-256 (`crypto-js`)
- Role hierarchy: admin > librarian > member
- Session stored in AsyncStorage (`app_mode`, user context)
- Local HTTP API has no formal auth token (trusts LAN)

---

## Development

```bash
npm install
npm run db:generate   # regenerate Drizzle migrations after schema changes
npm start             # Expo dev server
npm run android       # build + run on device
```

Database migrations are generated to `drizzle/migrations.js` and run automatically on app start.

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
