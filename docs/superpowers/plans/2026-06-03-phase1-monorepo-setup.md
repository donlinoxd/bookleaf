# Phase 1 — Monorepo Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the existing Bookleaf repo into a Turborepo + pnpm workspaces monorepo with `apps/server` (current app), `packages/types`, `packages/db`, and `tooling/` — no functional changes, Metro starts and the app runs identically.

**Architecture:** pnpm workspaces with `node-linker=hoisted` (required for Metro/React Native symlink compatibility). Current app code moves into `apps/server/`. Shared TypeScript interfaces extract to `packages/types`. DB schema + Drizzle init + PIN hashing extract to `packages/db`. All shared tooling configs live in `tooling/`. Two placeholder apps (`apps/client`, `apps/desktop`) created for future phases.

**Tech Stack:** pnpm 10, Turborepo 2, Expo SDK 54, NativeWind v4, Drizzle ORM, TypeScript 5.9

---

## Final Repo Shape

```
bookleaf/
├── .npmrc                          ← NEW
├── pnpm-workspace.yaml             ← NEW
├── turbo.json                      ← NEW
├── package.json                    ← REPLACED (monorepo root)
├── apps/
│   ├── server/                     ← current app code moved here
│   │   ├── assets/
│   │   ├── nodejs-assets/
│   │   ├── src/                    ← minus src/types/index.ts and src/db/*
│   │   │   ├── app/                ← Expo Router app dir (moved inside src/)
│   │   │   ├── components/
│   │   │   ├── lib/
│   │   │   ├── services/
│   │   │   ├── store/
│   │   │   ├── utils/
│   │   │   ├── polyfills.ts
│   │   │   └── types/nodejs-mobile-react-native.d.ts  ← stays
│   │   ├── app.json                ← expo-router root set to "src"
│   │   ├── babel.config.js
│   │   ├── global.css
│   │   ├── index.ts
│   │   ├── App.tsx
│   │   ├── metro.config.js         ← updated for monorepo
│   │   ├── nativewind-env.d.ts
│   │   ├── package.json            ← NEW (@bookleaf/server-app)
│   │   ├── tailwind.config.js      ← content: ["./src/**"] only
│   │   └── tsconfig.json           ← extends @bookleaf/tsconfig/expo.json
│   ├── client/                     ← NEW placeholder
│   │   └── package.json
│   └── desktop/                    ← NEW placeholder
│       └── package.json
├── packages/
│   ├── types/
│   │   ├── src/index.ts            ← moved from src/types/index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── db/
│       ├── src/
│       │   ├── schema.ts           ← moved from src/db/schema.ts
│       │   ├── database.ts         ← moved from src/db/database.ts
│       │   └── index.ts            ← moved from src/db/index.ts (+ re-exports)
│       ├── drizzle/                ← moved from drizzle/
│       ├── drizzle.config.ts       ← moved from drizzle.config.ts (paths updated)
│       ├── package.json
│       └── tsconfig.json
└── tooling/
    ├── typescript/
    │   ├── package.json
    │   ├── base.json
    │   └── expo.json
    ├── eslint/
    │   ├── package.json
    │   └── index.js
    ├── prettier/
    │   ├── package.json
    │   └── index.js
    └── tailwind/
        ├── package.json
        └── index.js
```

> **Note on seedDummy.ts:** `src/db/seedDummy.ts` is a dev-only helper. It stays in `apps/server` as `src/utils/seedDummy.ts` (not in `packages/db`) to avoid a circular dep through `db/index.ts`. Its one import site (`src/app/(server)/settings.tsx`) updates from `../../src/db/seedDummy` → `../utils/seedDummy` (one level shorter now that `app/` lives inside `src/`).

---

## Task 1: Replace root package.json and add pnpm/Turborepo config files

**Files:**
- Replace: `package.json` (root becomes monorepo coordinator — delete old content)
- Create: `.npmrc`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Delete: `package-lock.json`

- [ ] **Step 1: Replace root package.json**

```json
{
  "name": "bookleaf",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "typecheck": "turbo typecheck",
    "start": "pnpm --filter @bookleaf/server-app start",
    "android": "pnpm --filter @bookleaf/server-app android"
  },
  "devDependencies": {
    "prettier": "^3.5.3",
    "turbo": "^2.5.4"
  },
  "packageManager": "pnpm@10.11.1"
}
```

- [ ] **Step 2: Create .npmrc**

```ini
node-linker=hoisted
```

`node-linker=hoisted` makes pnpm use a flat `node_modules` layout (like npm). Required for Metro bundler and React Native native modules, which don't follow symlinks correctly with pnpm's default isolated layout.

- [ ] **Step 3: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "tooling/*"
```

- [ ] **Step 4: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 5: Delete package-lock.json**

```powershell
Remove-Item package-lock.json
```

- [ ] **Step 6: Commit**

```powershell
git add package.json .npmrc pnpm-workspace.yaml turbo.json
git rm package-lock.json
git commit -m "chore: initialize turborepo + pnpm workspace root"
```

---

## Task 2: Create tooling/typescript

**Files:**
- Create: `tooling/typescript/package.json`
- Create: `tooling/typescript/base.json`
- Create: `tooling/typescript/expo.json`

- [ ] **Step 1: Create tooling/typescript/package.json**

```json
{
  "name": "@bookleaf/tsconfig",
  "version": "0.1.0",
  "private": true,
  "files": ["*.json"]
}
```

- [ ] **Step 2: Create tooling/typescript/base.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  }
}
```

- [ ] **Step 3: Create tooling/typescript/expo.json**

Extends Expo's base tsconfig (available after pnpm install hoists expo to root node_modules).

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  }
}
```

- [ ] **Step 4: Commit**

```powershell
git add tooling/
git commit -m "chore: add tooling/typescript shared tsconfig package"
```

---

## Task 3: Create tooling/prettier

**Files:**
- Create: `tooling/prettier/package.json`
- Create: `tooling/prettier/index.js`

- [ ] **Step 1: Create tooling/prettier/package.json**

```json
{
  "name": "@bookleaf/prettier-config",
  "version": "0.1.0",
  "private": true,
  "main": "index.js"
}
```

- [ ] **Step 2: Create tooling/prettier/index.js**

```js
/** @type {import('prettier').Config} */
module.exports = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
};
```

- [ ] **Step 3: Commit**

```powershell
git add tooling/prettier/
git commit -m "chore: add tooling/prettier shared config"
```

---

## Task 4: Create tooling/eslint

**Files:**
- Create: `tooling/eslint/package.json`
- Create: `tooling/eslint/index.js`

- [ ] **Step 1: Create tooling/eslint/package.json**

```json
{
  "name": "@bookleaf/eslint-config",
  "version": "0.1.0",
  "private": true,
  "main": "index.js",
  "dependencies": {
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0"
  }
}
```

- [ ] **Step 2: Create tooling/eslint/index.js**

```js
/** @type {import('eslint').Linter.Config} */
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
  },
};
```

- [ ] **Step 3: Commit**

```powershell
git add tooling/eslint/
git commit -m "chore: add tooling/eslint shared config"
```

---

## Task 5: Create tooling/tailwind

**Files:**
- Create: `tooling/tailwind/package.json`
- Create: `tooling/tailwind/index.js`

- [ ] **Step 1: Create tooling/tailwind/package.json**

```json
{
  "name": "@bookleaf/tailwind-config",
  "version": "0.1.0",
  "private": true,
  "main": "index.js"
}
```

- [ ] **Step 2: Create tooling/tailwind/index.js**

The shared Bookleaf color theme — consumed by `apps/server` and eventually `apps/client` and `apps/desktop`.

```js
/** @type {import('tailwindcss').Config['theme']} */
module.exports = {
  extend: {
    colors: {
      brand: {
        DEFAULT: '#2A5C33',
        light: '#3A7A45',
        dark: '#1C3E23',
      },
      mint: {
        DEFAULT: '#E2EFE0',
        dark: '#C8DFC5',
      },
      leaf: '#5CB85C',
      bio: '#FAFDF9',
    },
  },
};
```

- [ ] **Step 3: Commit**

```powershell
git add tooling/tailwind/
git commit -m "chore: add tooling/tailwind shared theme config"
```

---

## Task 6: Create packages/types

Move `src/types/index.ts` to `packages/types/src/index.ts` via `git mv` to preserve history. The sibling `src/types/nodejs-mobile-react-native.d.ts` stays — it will travel with `src/` when the app moves in Task 8.

**Files:**
- Create dir: `packages/types/src/`
- Move: `src/types/index.ts` → `packages/types/src/index.ts`
- Create: `packages/types/package.json`
- Create: `packages/types/tsconfig.json`

- [ ] **Step 1: Create directory and move index.ts**

```powershell
New-Item -ItemType Directory -Force -Path "packages/types/src"
git mv src/types/index.ts packages/types/src/index.ts
```

- [ ] **Step 2: Create packages/types/package.json**

```json
{
  "name": "@bookleaf/types",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

- [ ] **Step 3: Create packages/types/tsconfig.json**

```json
{
  "extends": "@bookleaf/tsconfig/base.json",
  "include": ["src"]
}
```

- [ ] **Step 4: Commit**

```powershell
git add packages/types/
git commit -m "chore: extract packages/types from src/types/index.ts"
```

---

## Task 7: Create packages/db

Move `src/db/schema.ts`, `src/db/database.ts`, `src/db/index.ts` to `packages/db/src/` via `git mv`. Move `drizzle/` and `drizzle.config.ts` too. `src/db/seedDummy.ts` does NOT move here — it goes to `apps/server/src/utils/seedDummy.ts` in Task 9 to avoid a circular dependency through `db/index.ts`.

**Files:**
- Create dir: `packages/db/src/`
- Move: `src/db/schema.ts` → `packages/db/src/schema.ts`
- Move: `src/db/database.ts` → `packages/db/src/database.ts`
- Move: `src/db/index.ts` → `packages/db/src/index.ts` (then update to re-export)
- Move: `drizzle/` → `packages/db/drizzle/`
- Move: `drizzle.config.ts` → `packages/db/drizzle.config.ts` (then update paths)
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`

- [ ] **Step 1: Create directories and move db source files**

```powershell
New-Item -ItemType Directory -Force -Path "packages/db/src"
git mv src/db/schema.ts packages/db/src/schema.ts
git mv src/db/database.ts packages/db/src/database.ts
git mv src/db/index.ts packages/db/src/index.ts
git mv drizzle packages/db/drizzle
git mv drizzle.config.ts packages/db/drizzle.config.ts
```

- [ ] **Step 2: Update packages/db/src/index.ts to re-export schema and database symbols**

The current `src/db/index.ts` only exports `db` and `seedDefaults`. Consumers that currently import from `../db/schema` or `../db/database` will now import from `@bookleaf/db` — so re-export everything.

Replace the full content of `packages/db/src/index.ts` with:

```ts
import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';
import { DEFAULT_SETTINGS, settings } from './schema';

const expo = SQLite.openDatabaseSync('library.db');
export const db = drizzle(expo, { schema });

export async function seedDefaults(): Promise<void> {
  await db
    .insert(settings)
    .values(DEFAULT_SETTINGS.map(s => ({ key: s.key, value: s.value })))
    .onConflictDoNothing();
}

export * from './schema';
export * from './database';
```

- [ ] **Step 3: Update packages/db/drizzle.config.ts paths**

Replace the full content with:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  driver: 'expo',
  schema: './src/schema.ts',
  out: './drizzle',
});
```

- [ ] **Step 4: Create packages/db/package.json**

`expo-sqlite`, `expo-crypto`, `drizzle-orm`, and `crypto-js` are declared as peer deps because they must be installed in the native app (`apps/server`). They're listed as devDeps too so TypeScript resolves them during type-checking.

```json
{
  "name": "@bookleaf/db",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
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

- [ ] **Step 5: Create packages/db/tsconfig.json**

```json
{
  "extends": "@bookleaf/tsconfig/base.json",
  "include": ["src"]
}
```

- [ ] **Step 6: Commit**

```powershell
git add packages/db/
git commit -m "chore: extract packages/db from src/db/ and drizzle/"
```

---

## Task 8: Move app code into apps/server/ using git mv

All remaining root-level app files move into `apps/server/`. A new `apps/server/package.json` is created (the root `package.json` was already replaced in Task 1 to be the monorepo root).

At this point `src/` still contains `src/types/` (with only `nodejs-mobile-react-native.d.ts` remaining after Task 6) and `src/db/` (with only `seedDummy.ts` remaining after Task 7). Both travel with `src/` to `apps/server/src/`.

**Files to move:**
- `src/` → `apps/server/src/` (move first, so src/ exists before app/ goes into it)
- `app/` → `apps/server/src/app/` (Expo Router app dir now lives inside src/)
- `assets/` → `apps/server/assets/`
- `nodejs-assets/` → `apps/server/nodejs-assets/`
- `app.json` → `apps/server/app.json`
- `App.tsx` → `apps/server/App.tsx`
- `babel.config.js` → `apps/server/babel.config.js`
- `global.css` → `apps/server/global.css`
- `index.ts` → `apps/server/index.ts`
- `metro.config.js` → `apps/server/metro.config.js`
- `nativewind-env.d.ts` → `apps/server/nativewind-env.d.ts`
- `tailwind.config.js` → `apps/server/tailwind.config.js`
- `tsconfig.json` → `apps/server/tsconfig.json`

**Files NOT moved (stay at root):**
- `package.json` — already the monorepo root
- `README.md`, `docs/`, `.gitignore`, `.npmrc`, `pnpm-workspace.yaml`, `turbo.json`

- [ ] **Step 1: Create apps/server/ directory and git mv everything**

`src/` must be moved first so that `apps/server/src/` exists before `app/` is moved into it.

```powershell
New-Item -ItemType Directory -Force -Path "apps/server"
git mv src apps/server/src
git mv app apps/server/src/app
git mv assets apps/server/assets
git mv nodejs-assets apps/server/nodejs-assets
git mv app.json apps/server/app.json
git mv App.tsx apps/server/App.tsx
git mv babel.config.js apps/server/babel.config.js
git mv global.css apps/server/global.css
git mv index.ts apps/server/index.ts
git mv metro.config.js apps/server/metro.config.js
git mv nativewind-env.d.ts apps/server/nativewind-env.d.ts
git mv tailwind.config.js apps/server/tailwind.config.js
git mv tsconfig.json apps/server/tsconfig.json
```

- [ ] **Step 2: Move seedDummy.ts to utils/ and remove empty src/db/**

After the git mv above, `apps/server/src/db/` only contains `seedDummy.ts`. Move it to `utils/` and clean up the empty dir.

```powershell
git mv apps/server/src/db/seedDummy.ts apps/server/src/utils/seedDummy.ts
git rm -r apps/server/src/db
```

- [ ] **Step 3: Create apps/server/package.json**

All production dependencies come from the original root `package.json`. Add `@bookleaf/types` and `@bookleaf/db` as workspace deps.

```json
{
  "name": "@bookleaf/server-app",
  "version": "1.1.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "db:generate": "drizzle-kit generate --config=../../packages/db/drizzle.config.ts"
  },
  "dependencies": {
    "@bookleaf/db": "workspace:*",
    "@bookleaf/types": "workspace:*",
    "@expo/metro": "^55.1.1",
    "@expo/metro-runtime": "~6.1.2",
    "@expo/vector-icons": "^15.1.1",
    "@react-native-async-storage/async-storage": "2.2.0",
    "@tanstack/react-query": "^5.100.10",
    "axios": "^1.16.1",
    "crypto-js": "^4.2.0",
    "drizzle-orm": "^0.45.2",
    "expo": "~54.0.33",
    "expo-build-properties": "~1.0.10",
    "expo-camera": "~17.0.10",
    "expo-constants": "~18.0.13",
    "expo-crypto": "~15.0.9",
    "expo-document-picker": "~14.0.8",
    "expo-file-system": "~19.0.22",
    "expo-linking": "~8.0.12",
    "expo-network": "~8.0.7",
    "expo-notifications": "~0.32.17",
    "expo-print": "~15.0.8",
    "expo-router": "~6.0.23",
    "expo-sharing": "~14.0.8",
    "expo-splash-screen": "~31.0.13",
    "expo-sqlite": "~16.0.10",
    "expo-status-bar": "~3.0.9",
    "llama.rn": "^0.12.0",
    "nativewind": "^4.2.4",
    "nodejs-mobile-react-native": "^18.20.4",
    "react": "19.1.0",
    "react-native": "0.81.5",
    "react-native-gesture-handler": "~2.28.0",
    "react-native-get-random-values": "^2.0.0",
    "react-native-qrcode-svg": "^6.3.21",
    "react-native-reanimated": "~4.1.1",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-svg": "^15.12.1",
    "react-native-udp": "^4.1.7",
    "react-native-worklets": "^0.8.3",
    "react-native-zeroconf": "^0.14.0",
    "tailwindcss": "^3.4.19",
    "zustand": "^5.0.13"
  },
  "devDependencies": {
    "@bookleaf/tsconfig": "workspace:*",
    "@types/crypto-js": "^4.2.2",
    "@types/react": "~19.1.0",
    "@types/react-native": "^0.72.8",
    "babel-plugin-inline-import": "^3.0.0",
    "babel-preset-expo": "^55.0.21",
    "drizzle-kit": "^0.31.10",
    "typescript": "~5.9.2"
  }
}
```

- [ ] **Step 4: Commit the move**

```powershell
git add apps/server/
git commit -m "chore: move app code into apps/server/"
```

---

## Task 9: Configure apps/server (metro, tsconfig, app.json, tailwind)

Update `metro.config.js`, `tsconfig.json`, `app.json`, and `tailwind.config.js` now that the app lives inside a monorepo workspace and `app/` has moved into `src/`.

**Files:**
- Modify: `apps/server/metro.config.js`
- Modify: `apps/server/tsconfig.json`
- Modify: `apps/server/app.json`
- Modify: `apps/server/tailwind.config.js`

- [ ] **Step 1: Replace apps/server/metro.config.js**

The key additions for monorepo: `watchFolders` (so Metro sees package changes) and `nodeModulesPaths` (so Metro resolves from both the app's and the root's `node_modules`).

```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const { FileStore } = require('metro-cache');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all workspace packages so Metro picks up changes without restart
config.watchFolders = [monorepoRoot];

// Resolve packages from the app's node_modules first, then the root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Persist Metro cache across runs
config.cacheStores = [
  new FileStore({ root: path.join(projectRoot, 'node_modules/.cache/metro') }),
];

config.resolver.sourceExts.push('sql');

module.exports = withNativeWind(config, { input: './global.css' });
```

- [ ] **Step 2: Replace apps/server/tsconfig.json**

```json
{
  "extends": "@bookleaf/tsconfig/expo.json",
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.d.ts",
    "nativewind-env.d.ts"
  ]
}
```

- [ ] **Step 3: Update apps/server/app.json — set expo-router root to "src"**

Expo Router needs to know the `app/` directory has moved inside `src/`. Change the `expo-router` plugin entry:

```json
"plugins": [
    ["expo-router", { "root": "src" }],
    "expo-sqlite",
    ...
]
```

Full updated `plugins` array in `apps/server/app.json`:

```json
"plugins": [
    ["expo-router", { "root": "src" }],
    "expo-sqlite",
    [
        "expo-camera",
        {
            "cameraPermission": "Allow Bookleaf to access the camera for barcode scanning."
        }
    ],
    [
        "expo-build-properties",
        {
            "android": {
                "usesCleartextTraffic": true
            }
        }
    ]
]
```

- [ ] **Step 4: Update apps/server/tailwind.config.js content paths**

`app/` is now inside `src/`, so `./app/**` is gone and `./src/**` covers everything.

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: require('@bookleaf/tailwind-config'),
  },
  plugins: [],
};
```

- [ ] **Step 5: Commit**

```powershell
git add apps/server/metro.config.js apps/server/tsconfig.json apps/server/app.json apps/server/tailwind.config.js
git commit -m "chore: configure apps/server metro, tsconfig, expo-router root, and tailwind for monorepo"
```

---

## Task 10: Update all imports in apps/server to use workspace packages

All files that imported from the old `src/types/` and `src/db/` must now import from `@bookleaf/types` and `@bookleaf/db`. Run one PowerShell bulk-replace across the entire `apps/server/` tree.

The patterns differ by file depth, so each relative-path variant is replaced explicitly.

**Files affected (representative — bulk replace covers all):**

`src/` files (services, store, lib, components, utils — relative paths within src/):
- `apps/server/src/services/*.ts` — `'../types'`, `'../db'`, `'../db/schema'`, `'../db/database'`
- `apps/server/src/store/appStore.ts` — `'../types'`
- `apps/server/src/lib/materialTypes.ts` — `'../types'`
- `apps/server/src/components/**/*.tsx` — `'../../types'`
- `apps/server/src/utils/*.ts` — `'../types'`

`src/app/` files (screens — now one level shallower than before since app/ is inside src/):
- `apps/server/src/app/index.tsx` — `'../../types'`, `'../../db'`, `'../../db/schema'` (was `../src/...`)
- `apps/server/src/app/_layout.tsx` — `'../../db'` (was `../src/db`)
- `apps/server/src/app/(auth)/*.tsx` — `'../../../types'`, `'../../../db'`, `'../../../db/schema'` (was `../../src/...`)
- `apps/server/src/app/(server)/*.tsx` — `'../../../types'` (was `../../src/types`)
- `apps/server/src/app/(server)/book/*.tsx` — `'../../../../types'` (was `../../../src/types`)
- `apps/server/src/app/(server)/member/*.tsx` — `'../../../../types'`
- `apps/server/src/app/(server)/inventory-report/*.tsx` — `'../../../../types'`
- `apps/server/src/app/(client)/*.tsx` — `'../../../types'`

- [ ] **Step 1: Run bulk import replacement**

With `app/` now inside `src/`, the relative import patterns from screen files have changed depth. The bulk replace handles all variants — both the original root-relative paths (from before the move) and any leftover patterns from within `src/` subdirectories.

```powershell
Get-ChildItem -Recurse -Path "apps/server" -Include "*.ts","*.tsx" | ForEach-Object {
    $c = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)

    # --- @bookleaf/types replacements (all relative-depth variants) ---
    $c = $c -replace [regex]::Escape("from '../../../../src/types'"), "from '@bookleaf/types'"
    $c = $c -replace [regex]::Escape("from '../../../src/types'"),    "from '@bookleaf/types'"
    $c = $c -replace [regex]::Escape("from '../../src/types'"),       "from '@bookleaf/types'"
    $c = $c -replace [regex]::Escape("from '../src/types'"),          "from '@bookleaf/types'"
    $c = $c -replace [regex]::Escape("from '../../../../types'"),     "from '@bookleaf/types'"
    $c = $c -replace [regex]::Escape("from '../../../types'"),        "from '@bookleaf/types'"
    $c = $c -replace [regex]::Escape("from '../../types'"),           "from '@bookleaf/types'"
    $c = $c -replace [regex]::Escape("from '../types'"),              "from '@bookleaf/types'"

    # --- @bookleaf/db replacements (all relative-depth variants) ---
    $c = $c -replace [regex]::Escape("from '../../../src/db/schema'"),  "from '@bookleaf/db'"
    $c = $c -replace [regex]::Escape("from '../../src/db/schema'"),     "from '@bookleaf/db'"
    $c = $c -replace [regex]::Escape("from '../../../src/db'"),         "from '@bookleaf/db'"
    $c = $c -replace [regex]::Escape("from '../../src/db'"),            "from '@bookleaf/db'"
    $c = $c -replace [regex]::Escape("from '../src/db'"),               "from '@bookleaf/db'"
    $c = $c -replace [regex]::Escape("from '../db/database'"),          "from '@bookleaf/db'"
    $c = $c -replace [regex]::Escape("from '../db/schema'"),            "from '@bookleaf/db'"
    $c = $c -replace [regex]::Escape("from '../db'"),                   "from '@bookleaf/db'"

    [System.IO.File]::WriteAllText($_.FullName, $c, [System.Text.Encoding]::UTF8)
}
```

- [ ] **Step 2: Fix the seedDummy import in settings.tsx**

The original import was `from '../../src/db/seedDummy'`. The bulk replace above will mangle it into `from '@bookleaf/db/seedDummy'` (it matched the `../../src/db` prefix). `seedDummy` is in `apps/server/src/utils/`, not in `packages/db`. Fix it:

Open `apps/server/src/app/(server)/settings.tsx` and change:
```ts
// Before (after bulk replace mangled it):
import { seedDummyData } from '@bookleaf/db/seedDummy'
// After (seedDummy lives in src/utils/, one level up from src/app/(server)/):
import { seedDummyData } from '../../utils/seedDummy'
```

- [ ] **Step 3: Update seedDummy.ts itself to import from @bookleaf/db**

Open `apps/server/src/utils/seedDummy.ts` and update its two imports:

```ts
// Before:
import { db } from './index'
import {
  borrowingRecords, fines, gateLogs, institutions,
  reservations, resourceCopies, resources, scanEntries, scanSessions, users,
} from './schema'

// After:
import { db } from '@bookleaf/db'
import {
  borrowingRecords, fines, gateLogs, institutions,
  reservations, resourceCopies, resources, scanEntries, scanSessions, users,
} from '@bookleaf/db'
```

- [ ] **Step 4: Verify no stale relative db/types imports remain**

```powershell
# Each should return nothing
Select-String -Recurse -Path "apps/server" -Include "*.ts","*.tsx" -Pattern "from '(\.\./)+src/(db|types)"
Select-String -Recurse -Path "apps/server" -Include "*.ts","*.tsx" -Pattern "from '(\.\./)+db['/]"
Select-String -Recurse -Path "apps/server" -Include "*.ts","*.tsx" -Pattern "from '(\.\./)+types['/]"
# seedDummy should point to utils, not @bookleaf/db
Select-String -Recurse -Path "apps/server" -Include "*.ts","*.tsx" -Pattern "bookleaf/db/seedDummy"
```

- [ ] **Step 5: Commit**

```powershell
git add apps/server/
git commit -m "chore: update apps/server imports to @bookleaf/types and @bookleaf/db"
```

---

## Task 11: Create placeholder apps/client and apps/desktop

Minimal package.json stubs so pnpm discovers them as workspace members. No source code yet.

**Files:**
- Create: `apps/client/package.json`
- Create: `apps/desktop/package.json`

- [ ] **Step 1: Create apps/client/package.json**

```json
{
  "name": "@bookleaf/client-app",
  "version": "0.1.0",
  "private": true,
  "description": "Patron device app — Phase 3"
}
```

- [ ] **Step 2: Create apps/desktop/package.json**

```json
{
  "name": "@bookleaf/desktop-app",
  "version": "0.1.0",
  "private": true,
  "description": "Desktop librarian app (Tauri) — Phase 4"
}
```

- [ ] **Step 3: Commit**

```powershell
git add apps/client/ apps/desktop/
git commit -m "chore: add placeholder apps/client and apps/desktop"
```

---

## Task 12: Install with pnpm and verify Metro starts

- [ ] **Step 1: Install pnpm if not already installed**

```powershell
npm install -g pnpm@10.11.1
```

Verify:
```powershell
pnpm --version
# Expected: 10.11.1
```

- [ ] **Step 2: Install all workspace dependencies**

Run from the repo root:

```powershell
pnpm install
```

Expected: pnpm resolves all workspaces, creates `pnpm-lock.yaml`, installs all deps into a hoisted `node_modules/` at the root. No errors.

If any peer dep warnings appear, they are expected (same packages as before, same underlying conflicts — now managed by pnpm instead of npm `--legacy-peer-deps`).

- [ ] **Step 3: Start Metro from the repo root**

```powershell
pnpm start
# or equivalently:
pnpm --filter @bookleaf/server-app start
```

Expected: Metro bundler starts, shows the QR code, and reports no module resolution errors.

- [ ] **Step 4: Verify TypeScript compiles**

```powershell
pnpm --filter @bookleaf/server-app exec npx tsc --noEmit 2>&1
```

Expected: Only the 6 known pre-existing errors (5 in `BorrowService.ts`, 1 in `NotificationService.ts`). Zero new errors.

- [ ] **Step 5: Update .gitignore to track pnpm-lock.yaml**

Open `.gitignore` and add:
```
# pnpm
pnpm-debug.log*
```

`pnpm-lock.yaml` should be committed (lockfile). It is not in `.gitignore` by default so no action needed there.

- [ ] **Step 6: Commit lockfile and final state**

```powershell
git add pnpm-lock.yaml .gitignore
git commit -m "chore: pnpm install — add lockfile"
```

---

## Spec Coverage Check

| Spec requirement | Covered by |
|---|---|
| Initialize Turborepo + pnpm workspaces | Task 1 |
| Create `packages/types` | Task 6 |
| Create `packages/db` (spec: db-schema) | Task 7 |
| Move current app into `apps/server/` | Task 8 |
| Wire packages as workspace deps | Tasks 6–8 (workspace:* in package.json) |
| `tooling/` shared configs | Tasks 2–5 |
| Placeholder `apps/client`, `apps/desktop` | Task 11 |
| Verify `apps/server` builds identically | Task 12 |
| No functional changes | Confirmed — only file moves + import path updates |
