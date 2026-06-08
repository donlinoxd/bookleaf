# Phase 4a — Desktop UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Bookleaf librarian desktop UI — Login, Dashboard, Books, Members, Circulation, and Settings (with Android SQLite import) — inside the existing Tauri 2 + Vite + React app.

**Architecture:** Single-page React app using react-router-dom (hash routing for Tauri). TanStack React Query + `@trpc/tanstack-react-query` for all data. Zustand for auth session (localStorage-persisted). shadcn/ui components on top of Tailwind v3. A fixed sidebar navigates between pages. The `importSQLite` tRPC procedure reads a source `.db` file with better-sqlite3 and copies records into the live database — invoked after the librarian picks a file via the Tauri dialog plugin.

**Tech Stack:** Vite 7, React 19, TypeScript, Tailwind CSS v3, shadcn/ui, react-hook-form, TanStack Table v8, TanStack React Query v5, @trpc/tanstack-react-query v11, react-router-dom v7, zustand, tauri-plugin-dialog

**Key fix:** Use `"@/"` (with trailing slash) as the Vite path alias key — NOT `"@"` alone. Using `"@"` without slash causes Vite to rewrite ALL imports starting with `@` (including `@tauri-apps/...`, `@trpc/...`, `@tanstack/...`) to wrong paths, breaking the entire app.

---

## File Map

```
apps/desktop/
├── package.json                      ← ADD new deps (zod, react-router-dom, etc.)
├── vite.config.ts                    ← ADD path alias "@/" (WITH trailing slash)
├── index.html                        ← UPDATE title to Bookleaf
├── tailwind.config.cjs               ← NEW (must be .cjs not .js — package has type:module)
├── postcss.config.cjs                ← NEW (must be .cjs)
└── src/
    ├── index.css                     ← NEW (Tailwind + shadcn CSS vars with Bookleaf green)
    ├── main.tsx                      ← REPLACE (add providers)
    ├── App.tsx                       ← REPLACE (hash router)
    ├── lib/
    │   ├── utils.ts                  ← NEW (shadcn cn() helper)
    │   └── trpc.ts                   ← NEW (tRPC client + TRPCProvider)
    ├── store/
    │   └── useAuthStore.ts           ← NEW (session token, user, persist)
    ├── components/
    │   ├── ui/                       ← NEW (shadcn/ui components via CLI)
    │   └── layout/
    │       ├── AppShell.tsx          ← NEW (sidebar + outlet)
    │       └── Sidebar.tsx           ← NEW (navigation links)
    └── pages/
        ├── Login.tsx                 ← NEW
        ├── Dashboard.tsx             ← NEW
        ├── Books.tsx                 ← NEW
        ├── Members.tsx               ← NEW
        ├── Circulation.tsx           ← NEW
        └── Settings.tsx              ← NEW

apps/desktop/src-tauri/
├── Cargo.toml                        ← ADD tauri-plugin-dialog
├── src/lib.rs                        ← ADD dialog plugin init
└── capabilities/default.json         ← ADD dialog:allow-open permission

packages/server/
├── src/adapter/types.ts              ← ADD adminImportSQLite method
├── src/adapter/sqlite.ts             ← IMPLEMENT adminImportSQLite
├── src/router/admin/backup.ts        ← ADD importSQLite procedure
└── dist/desktop/server.js            ← REBUILT
```

---

## Critical Setup Notes

### Tailwind/PostCSS config must be `.cjs` not `.js`
The `apps/desktop/package.json` has `"type": "module"`. This makes Node.js treat all `.js` files as ESM. Tailwind's config uses `module.exports` (CommonJS). Use `.cjs` extension to force CJS loading:
- `tailwind.config.cjs` (not `.js`)
- `postcss.config.cjs` (not `.js`)

### Vite path alias must use `"@/"` with trailing slash
```typescript
// ✅ CORRECT — only matches @/something imports
alias: { "@/": path.resolve(__dirname, "./src") + "/" }

// ❌ WRONG — matches @tauri-apps/@trpc/@tanstack too, breaks everything
alias: { "@": path.resolve(__dirname, "./src") }
```

### Binary must be unblocked on Windows
After building with `pkg`, Windows marks the `.exe` with a Zone.Identifier (blocks it). Run:
```powershell
Unblock-File apps/desktop/src-tauri/binaries/bookleaf-server-x86_64-pc-windows-msvc.exe
```

---

## Task 1: Install dependencies + Tailwind v3 + shadcn/ui

- [ ] **Step 1: Update apps/desktop/package.json** — add all UI deps (zod, react-router-dom, react-hook-form, @hookform/resolvers, @tanstack/react-table, @tanstack/react-query, @trpc/client, @trpc/tanstack-react-query, zustand, lucide-react, clsx, tailwind-merge, class-variance-authority, all @radix-ui/* packages, @tauri-apps/plugin-dialog, tailwindcss, postcss, autoprefixer)

- [ ] **Step 2: Create apps/desktop/tailwind.config.cjs** (note: `.cjs` extension required)

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      ...require('@bookleaf/tailwind-config'),
      colors: {
        ...require('@bookleaf/tailwind-config').colors,
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
      },
      borderRadius: { lg: 'var(--radius)', md: 'calc(var(--radius) - 2px)', sm: 'calc(var(--radius) - 4px)' },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Create apps/desktop/postcss.config.cjs**

```js
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 4: Create apps/desktop/src/index.css** — Tailwind directives + shadcn CSS vars with Bookleaf green primary (#2A5C33)

- [ ] **Step 5: Update apps/desktop/vite.config.ts** — add `"@/"` alias (with trailing slash, critical!)

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@/": path.resolve(__dirname, "./src") + "/",  // ← trailing slash on BOTH sides
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
```

- [ ] **Step 6: Update apps/desktop/index.html** — change title to `Bookleaf`

- [ ] **Step 7: Create apps/desktop/src/lib/utils.ts**

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
```

- [ ] **Step 8: Run pnpm install + shadcn init + add components**

```powershell
pnpm install
cd apps/desktop
npx shadcn@latest init --defaults
npx shadcn@latest add button input label form card table dialog alert-dialog badge select separator scroll-area dropdown-menu toast
```

- [ ] **Step 9: Ask user before committing**

---

## Task 2: tRPC client + auth store + app providers + router

- [ ] **Step 1: Create apps/desktop/src/lib/trpc.ts**

```typescript
import { createTRPCClient, httpLink, TRPCClientError } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@bookleaf/server';
import { useAuthStore } from '@/store/useAuthStore';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export function createTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://localhost:3000/trpc',
        headers: () => {
          const token = useAuthStore.getState().token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

export function getTRPCErrorMessage(e: unknown): string {
  if (e instanceof TRPCClientError) return e.message || 'Server error.';
  return 'Could not reach the server.';
}

export function isTRPCUnauthorized(e: unknown): boolean {
  return e instanceof TRPCClientError && e.data?.code === 'UNAUTHORIZED';
}
```

**Note:** URL is hardcoded string `'http://localhost:3000/trpc'` — NOT a function. tRPC v11's `httpLink` resolves `url` via `.toString()` at link creation time, so a function would be serialized as source code.

- [ ] **Step 2: Create apps/desktop/src/store/useAuthStore.ts**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser { id: number; name: string; id_number: string; role: string; institution_id: number; }
interface AuthState {
  token: string | null; user: AuthUser | null;
  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null, user: null,
      setSession: (token, user) => set({ token, user }),
      clearSession: () => set({ token: null, user: null }),
    }),
    { name: 'bookleaf-auth' },
  ),
);
```

- [ ] **Step 3: Replace apps/desktop/src/main.tsx** — add QueryClientProvider + TRPCProvider wrapping App

- [ ] **Step 4: Replace apps/desktop/src/App.tsx** — createHashRouter with protected routes

- [ ] **Step 5: Ask user before committing**

---

## Task 3: Login screen

- [ ] **Create apps/desktop/src/pages/Login.tsx** — PIN login form, `useMutation(trpc.auth.login.mutationOptions(...))`, role check (admin/librarian only), stores session

- [ ] **Ask user before committing**

---

## Task 4: App shell — sidebar + layout

- [ ] **Create apps/desktop/src/components/layout/Sidebar.tsx** — fixed sidebar with 5 nav items (Dashboard, Books, Members, Circulation, Settings), active route highlighting, logout button
- [ ] **Create apps/desktop/src/components/layout/AppShell.tsx** — sidebar + Outlet
- [ ] **Update App.tsx** — use real Login and AppShell imports

- [ ] **Ask user before committing**

---

## Task 5: Dashboard page

- [ ] **Create apps/desktop/src/pages/Dashboard.tsx** — 4 stat cards (Active Borrows, Overdue, Total Books, Members) using `useQuery` with `trpc.admin.circulation.activeBorrows`, `overdueBorrows`, `admin.books.list`, `admin.members.list`

- [ ] **Ask user before committing**

---

## Task 6: Books page

- [ ] **Create apps/desktop/src/pages/Books.tsx** — TanStack Table with search, Add/Edit Dialog (react-hook-form + zod), Delete AlertDialog, uses `admin.books.list/create/update/delete`

- [ ] **Ask user before committing**

---

## Task 7: Members page

- [ ] **Create apps/desktop/src/pages/Members.tsx** — TanStack Table, Add/Edit Dialog, Reset PIN Dialog, toggle active/inactive, uses `admin.members.*`

- [ ] **Ask user before committing**

---

## Task 8: Circulation page

- [ ] **Create apps/desktop/src/pages/Circulation.tsx** — Tabbed (Active/Overdue), Checkout Dialog, Return Dialog, Pay Fine Dialog, uses `admin.circulation.*`

- [ ] **Ask user before committing**

---

## Task 9: Backend — importSQLite tRPC procedure + Tauri dialog plugin

- [ ] **Add `adminImportSQLite(filePath)` to packages/server/src/adapter/types.ts**
- [ ] **Implement in packages/server/src/adapter/sqlite.ts** — opens source DB read-only with better-sqlite3, copies 14 tables with `INSERT OR IGNORE`
- [ ] **Add `importSQLite` procedure to packages/server/src/router/admin/backup.ts**
- [ ] **Rebuild desktop bundle:** `pnpm --filter @bookleaf/server build:desktop`
- [ ] **Rebuild binary with pkg** + copy to `src-tauri/binaries/` + `Unblock-File` it
- [ ] **Add `tauri-plugin-dialog = "2"` to apps/desktop/src-tauri/Cargo.toml**
- [ ] **Add `.plugin(tauri_plugin_dialog::init())` to lib.rs**
- [ ] **Add `"dialog:allow-open"` to capabilities/default.json**

- [ ] **Ask user before committing**

---

## Task 10: Settings page

- [ ] **Create apps/desktop/src/pages/Settings.tsx** — Institution config form (react-hook-form), "Import from Android" button using `open()` from `@tauri-apps/plugin-dialog`, calls `trpc.admin.backup.importSQLite.mutate({ filePath })`

- [ ] **Ask user before committing**

---

## Spec Coverage

| Phase 4a requirement | Task |
|---|---|
| Tailwind v3 + shadcn/ui + .cjs configs | Task 1 |
| tRPC client (fixed localhost:3000) + auth | Task 2 |
| Librarian login (role check) | Task 3 |
| Sidebar + app shell routing | Task 4 |
| Dashboard (stats) | Task 5 |
| Books (table + CRUD) | Task 6 |
| Members (table + CRUD + PIN reset) | Task 7 |
| Circulation (active borrows, checkout, return) | Task 8 |
| importSQLite + Tauri dialog plugin | Task 9 |
| Settings (institution config + Android import) | Task 10 |
