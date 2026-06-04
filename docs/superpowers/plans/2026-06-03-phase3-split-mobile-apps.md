# Phase 3 — Split Mobile Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `apps/client` as a standalone Expo patron app using tRPC, extract all client-mode code from `apps/server`, add SQLite export to `apps/server` Settings, and verify both apps build and connect.

**Architecture:** `apps/client` is a new lightweight Expo app (no DB, no nodejs-mobile). It discovers the server via UDP beacon, connects, then uses `@trpc/tanstack-react-query` (tRPC v11's React Query integration) for fully reactive data fetching — screens use `useQuery`/`useMutation` hooks, not manual `useEffect` fetching. A single `QueryClient` + `TRPCProvider` wraps the app in `_layout.tsx`. `apps/server` is cleaned of all patron-mode screens. `packages/server` gains a `/info` endpoint so the client can learn the `institutionId` after connecting.

**Tech Stack:** Expo SDK 54, Expo Router 6, NativeWind v4, `@trpc/client` v11, `@trpc/tanstack-react-query` v11, `@tanstack/react-query` v5, `react-native-udp` (server discovery), zustand, TypeScript 5.9

---

## File Map

### New — `packages/server/`
```
src/types.ts                  ← re-exports AppRouter (safe type-only entry, no rn-bridge)
```
Modified: `src/adapter/types.ts` · `src/adapter/bridge.ts` · `src/server.ts` · `package.json`

### Modified — `apps/server/`
```
src/services/ServerBridge.ts  ← add getInstitutionInfo bridge action
src/store/appStore.ts         ← remove all client-mode state
src/app/index.tsx             ← server-only boot (remove client mode)
src/app/(server)/settings.tsx ← add raw SQLite export button
```
Deleted: `src/app/(client)/` · `src/app/(auth)/connect.tsx` · `src/app/(auth)/client-login.tsx` · `src/services/clientApi.ts`

### New — `apps/client/`
```
apps/client/
├── package.json
├── app.json
├── tsconfig.json
├── babel.config.js
├── metro.config.js
├── tailwind.config.js
├── global.css
├── index.ts
├── nativewind-env.d.ts
├── assets/                              ← copied from apps/server/assets
└── src/
    ├── polyfills.ts
    ├── lib/trpc.ts                      ← tRPC client + handleAuthError helper
    ├── store/appStore.ts                ← client-only state
    ├── services/MdnsService.ts          ← UDP discovery (same as apps/server)
    ├── components/
    │   ├── books/HorizontalBookCard.tsx ← copied from apps/server
    │   ├── common/ErrorBoundary.tsx     ← copied from apps/server
    │   ├── members/MemberCard.tsx       ← copied from apps/server
    │   └── navigation/CustomTabBar.tsx  ← copied from apps/server
    └── app/
        ├── _layout.tsx
        ├── index.tsx
        ├── (auth)/
        │   ├── _layout.tsx
        │   ├── connect.tsx
        │   └── login.tsx
        └── (client)/
            ├── _layout.tsx
            ├── dashboard.tsx
            ├── home.tsx
            ├── my-books.tsx
            ├── my-card.tsx
            ├── gate.tsx
            └── book/[id].tsx
```

---

## Task 1: Add /info endpoint to packages/server + types entry + rebuild

The `/info` endpoint lets `apps/client` discover the institution ID after connecting. The `src/types.ts` entry lets `apps/client` import `AppRouter` as a type without pulling in `rn-bridge`.

**Files:**
- Create: `packages/server/src/types.ts`
- Modify: `packages/server/package.json`
- Modify: `packages/server/src/adapter/types.ts`
- Modify: `packages/server/src/adapter/bridge.ts`
- Modify: `packages/server/src/server.ts`
- Modify: `apps/server/src/services/ServerBridge.ts`
- Rebuild: `packages/server` bundle

- [ ] **Step 1: Create packages/server/src/types.ts**

Safe re-export that avoids importing `index.android.ts` (which pulls in `rn-bridge`):

```typescript
export type { AppRouter } from './router';
```

- [ ] **Step 2: Update packages/server/package.json — add types field**

Open `packages/server/package.json` and add `"types": "./src/types.ts"`:

```json
{
  "name": "@bookleaf/server",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.android.ts",
  "types": "./src/types.ts",
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

- [ ] **Step 3: Add getInstitutionInfo to packages/server/src/adapter/types.ts**

Open the file and add one method to the `DbAdapter` interface (after the `logout` entry, under `// ── Auth`):

```typescript
  getInstitutionInfo(): Promise<{ institutionId: number; institutionName: string }>;
```

- [ ] **Step 4: Implement getInstitutionInfo in packages/server/src/adapter/bridge.ts**

Open the file and add inside the returned object (after the `logout` entry):

```typescript
    getInstitutionInfo: () =>
      q('getInstitutionInfo', {}) as Promise<{ institutionId: number; institutionName: string }>,
```

- [ ] **Step 5: Add GET /info route to packages/server/src/server.ts**

Open `packages/server/src/server.ts` and add the route after the `/ping` route:

```typescript
  app.get('/info', async (c) => {
    const info = await db.getInstitutionInfo();
    return c.json(info);
  });
```

- [ ] **Step 6: Handle getInstitutionInfo bridge action in apps/server/src/services/ServerBridge.ts**

Open `ServerBridge.ts` and find the `handlePatronAction` function. Add this case to the switch before the `default`:

```typescript
    case 'getInstitutionInfo': {
      const { eq } = await import('drizzle-orm');
      const { institutions } = await import('@bookleaf/db');
      const iid = requireInstitution();
      const row = await db
        .select({ id: institutions.id, name: institutions.name })
        .from(institutions)
        .where(eq(institutions.id, iid))
        .limit(1)
        .then((r) => r[0] ?? null);
      return { institutionId: iid, institutionName: row?.name ?? 'Library' };
    }
```

- [ ] **Step 7: Rebuild packages/server bundle**

```powershell
pnpm --filter @bookleaf/server build
```

Expected: `✓ packages/server bundled to apps/server/nodejs-assets/nodejs-project/main.js`

- [ ] **Step 8: Commit**

```powershell
git add packages/server/ apps/server/src/services/ServerBridge.ts apps/server/nodejs-assets/nodejs-project/main.js
git commit -m "feat(server): add /info endpoint, types export, getInstitutionInfo bridge action"
```

---

## Task 2: Scaffold apps/client

Create all config files for the new patron Expo app.

**Files:** `apps/client/package.json`, `app.json`, `tsconfig.json`, `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `global.css`, `index.ts`, `nativewind-env.d.ts`, `src/polyfills.ts`, `assets/` (copied)

- [ ] **Step 1: Create apps/client/package.json**

```json
{
  "name": "@bookleaf/client-app",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android"
  },
  "dependencies": {
    "@bookleaf/tailwind-config": "workspace:*",
    "@bookleaf/types": "workspace:*",
    "@expo/vector-icons": "^15.1.1",
    "@react-native-async-storage/async-storage": "2.2.0",
    "@tanstack/react-query": "^5.100.10",
    "@trpc/client": "^11.0.0",
    "@trpc/tanstack-react-query": "^11.0.0",
    "expo": "~54.0.33",
    "expo-build-properties": "~1.0.10",
    "expo-camera": "~17.0.10",
    "expo-constants": "~18.0.13",
    "expo-crypto": "~15.0.9",
    "expo-linking": "~8.0.12",
    "expo-router": "~6.0.23",
    "expo-splash-screen": "~31.0.13",
    "expo-status-bar": "~3.0.9",
    "nativewind": "^4.2.4",
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
    "tailwindcss": "^3.4.19",
    "zustand": "^5.0.13"
  },
  "devDependencies": {
    "@bookleaf/server": "workspace:*",
    "@bookleaf/tsconfig": "workspace:*",
    "@types/react": "~19.1.0",
    "babel-plugin-inline-import": "^3.0.0",
    "babel-preset-expo": "^55.0.21",
    "typescript": "~5.9.2"
  }
}
```

- [ ] **Step 2: Create apps/client/app.json**

```json
{
    "expo": {
        "name": "Bookleaf Client",
        "slug": "bookleaf-client",
        "version": "1.0.0",
        "orientation": "portrait",
        "icon": "./assets/icon.png",
        "userInterfaceStyle": "light",
        "newArchEnabled": true,
        "scheme": "bookleaf-client",
        "splash": {
            "image": "./assets/splash-icon.png",
            "resizeMode": "cover",
            "backgroundColor": "#2A5C33"
        },
        "ios": {
            "supportsTablet": true,
            "bundleIdentifier": "com.bookleaf.client"
        },
        "android": {
            "adaptiveIcon": {
                "foregroundImage": "./assets/adaptive-icon.png",
                "backgroundColor": "#2A5C33"
            },
            "edgeToEdgeEnabled": true,
            "predictiveBackGestureEnabled": false,
            "versionCode": 1,
            "package": "com.bookleaf.client",
            "permissions": [
                "android.permission.CAMERA",
                "android.permission.ACCESS_WIFI_STATE",
                "android.permission.ACCESS_NETWORK_STATE",
                "android.permission.INTERNET"
            ]
        },
        "web": {
            "favicon": "./assets/favicon.ico"
        },
        "plugins": [
            ["expo-router", { "root": "src/app" }],
            [
                "expo-camera",
                {
                    "cameraPermission": "Allow Bookleaf Client to access the camera for gate check-in."
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
    }
}
```

- [ ] **Step 3: Create apps/client/tsconfig.json**

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

- [ ] **Step 4: Create apps/client/babel.config.js**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo', 'nativewind/babel'],
    plugins: [
      ['inline-import', { extensions: ['.sql'] }],
      'react-native-worklets/plugin',
    ],
  };
};
```

- [ ] **Step 5: Create apps/client/metro.config.js**

```js
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

config.cacheStores = [
  new FileStore({
    root: path.join(projectRoot, 'node_modules', '.cache', 'metro'),
  }),
];

config.resolver.sourceExts.push('sql');

module.exports = withNativeWind(config, { input: './global.css' });
```

- [ ] **Step 6: Create apps/client/tailwind.config.js**

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

- [ ] **Step 7: Create apps/client/global.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create apps/client/index.ts**

```typescript
import 'expo-router/entry';
```

- [ ] **Step 9: Create apps/client/nativewind-env.d.ts**

```typescript
/// <reference types="react-native-css-interop" />

declare module '*.png' {
  const value: number;
  export default value;
}
declare module '*.jpg' {
  const value: number;
  export default value;
}
declare module '*.jpeg' {
  const value: number;
  export default value;
}
declare module '*.gif' {
  const value: number;
  export default value;
}
declare module '*.webp' {
  const value: number;
  export default value;
}
```

- [ ] **Step 10: Create apps/client/src/polyfills.ts**

```typescript
import 'react-native-get-random-values';
```

- [ ] **Step 11: Copy assets from apps/server**

```powershell
Copy-Item -Recurse apps/server/assets apps/client/assets
```

- [ ] **Step 12: Run pnpm install**

```powershell
pnpm install
```

Expected: `@bookleaf/client-app` recognized, `@trpc/client` installed.

- [ ] **Step 13: Commit**

```powershell
git add apps/client/
git commit -m "feat(client): scaffold apps/client Expo patron app"
```

---

## Task 3: Create apps/client store, tRPC client, and MdnsService

**Files:**
- Create: `apps/client/src/store/appStore.ts`
- Create: `apps/client/src/lib/trpc.ts`
- Create: `apps/client/src/services/MdnsService.ts`

- [ ] **Step 1: Create apps/client/src/store/appStore.ts**

Client-only state — no `mode`, `institution` (server app concerns). Stores connection info and patron session.

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { User } from '@bookleaf/types';

const CLIENT_SESSION_KEY = 'client_session';

interface PersistedSession {
  serverUrl: string;
  institutionId: number;
  institutionName: string;
  user: User;
  token: string;
  expires_at: string;
}

interface ClientState {
  serverUrl: string | null;
  institutionId: number | null;
  institutionName: string | null;
  sessionToken: string | null;
  sessionExpiresAt: string | null;
  currentUser: User | null;

  setServerUrl: (url: string | null) => void;
  setInstitutionInfo: (info: { institutionId: number; institutionName: string }) => void;
  setClientSession: (data: {
    user: User;
    token: string;
    expires_at: string;
    serverUrl: string;
    institutionId: number;
    institutionName: string;
  }) => Promise<void>;
  clearClientSession: () => Promise<void>;
  hydrateClientSession: () => Promise<boolean>;
}

export const useAppStore = create<ClientState>((set) => ({
  serverUrl: null,
  institutionId: null,
  institutionName: null,
  sessionToken: null,
  sessionExpiresAt: null,
  currentUser: null,

  setServerUrl: (url) => set({ serverUrl: url }),

  setInstitutionInfo: ({ institutionId, institutionName }) =>
    set({ institutionId, institutionName }),

  setClientSession: async ({ user, token, expires_at, serverUrl, institutionId, institutionName }) => {
    const payload: PersistedSession = { user, token, expires_at, serverUrl, institutionId, institutionName };
    await AsyncStorage.setItem(CLIENT_SESSION_KEY, JSON.stringify(payload));
    set({ currentUser: user, sessionToken: token, sessionExpiresAt: expires_at, serverUrl, institutionId, institutionName });
  },

  clearClientSession: async () => {
    await AsyncStorage.removeItem(CLIENT_SESSION_KEY);
    set({ currentUser: null, sessionToken: null, sessionExpiresAt: null });
  },

  hydrateClientSession: async () => {
    const raw = await AsyncStorage.getItem(CLIENT_SESSION_KEY);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw) as PersistedSession;
      if (!parsed.token || !parsed.user || !parsed.expires_at || !parsed.serverUrl) return false;
      if (new Date(parsed.expires_at).getTime() < Date.now()) {
        await AsyncStorage.removeItem(CLIENT_SESSION_KEY);
        return false;
      }
      set({
        currentUser: parsed.user,
        sessionToken: parsed.token,
        sessionExpiresAt: parsed.expires_at,
        serverUrl: parsed.serverUrl,
        institutionId: parsed.institutionId ?? 1,
        institutionName: parsed.institutionName ?? 'Library',
      });
      return true;
    } catch {
      await AsyncStorage.removeItem(CLIENT_SESSION_KEY);
      return false;
    }
  },
}));
```

- [ ] **Step 2: Create apps/client/src/lib/trpc.ts**

Sets up the tRPC React Query integration. `createTrpcClient()` is called once in `_layout.tsx`. Screens call `useTRPC()` to get the typed tRPC hooks, then use standard `useQuery`/`useMutation` from React Query.

```typescript
import { createTRPCClient, httpLink, TRPCClientError } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '@bookleaf/server';
import { useAppStore } from '../store/appStore';

// Creates a typed tRPC React Query context: TRPCProvider + useTRPC hook
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// Call once in _layout.tsx — reads serverUrl and token dynamically per request
export function createTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: () => `${useAppStore.getState().serverUrl ?? ''}/trpc`,
        headers: () => {
          const token = useAppStore.getState().sessionToken;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

/** Human-readable error message from a tRPC error or unknown exception. */
export function getTRPCErrorMessage(e: unknown): string {
  if (e instanceof TRPCClientError) {
    return e.message || 'Server error. Please try again.';
  }
  return 'Could not reach the library server.';
}

/** Returns true if the error is UNAUTHORIZED (caller should handle session expiry). */
export function isTRPCUnauthorized(e: unknown): boolean {
  return e instanceof TRPCClientError && e.data?.code === 'UNAUTHORIZED';
}
```

- [ ] **Step 3: Create apps/client/src/services/MdnsService.ts**

Identical to `apps/server/src/services/MdnsService.ts` — UDP discovery of the bookleaf beacon. Copy verbatim:

```typescript
import UdpSocket from 'react-native-udp';

const DISCOVERY_PORT = 41234;

export type DiscoveredServer = {
  name: string;
  host: string;
  port: number;
  url: string;
};

let listenSocket: ReturnType<typeof UdpSocket.createSocket> | null = null;

export const MdnsService = {
  startScan(
    onFound: (server: DiscoveredServer) => void,
    _onRemove: (name: string) => void,
    onTimeout: () => void,
  ) {
    if (listenSocket) return;

    listenSocket = UdpSocket.createSocket({ type: 'udp4', reusePort: true });

    listenSocket.on('message', (data: Buffer, rinfo: { address: string; port: number }) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'bookleaf_beacon') {
          onFound({
            name: msg.name,
            host: rinfo.address,
            port: msg.port,
            url: `http://${rinfo.address}:${msg.port}`,
          });
        }
      } catch {}
    });

    listenSocket.on('error', () => {
      onTimeout();
    });

    listenSocket.bind(DISCOVERY_PORT);
  },

  stopScan() {
    if (listenSocket) {
      try { listenSocket.close(); } catch {}
      listenSocket = null;
    }
  },
};
```

- [ ] **Step 4: Commit**

```powershell
git add apps/client/src/
git commit -m "feat(client): add appStore, tRPC client, MdnsService"
```

---

## Task 4: Create apps/client root layout, boot screen, and auth screens

**Files:**
- Create: `apps/client/src/app/_layout.tsx`
- Create: `apps/client/src/app/index.tsx`
- Create: `apps/client/src/app/(auth)/_layout.tsx`
- Create: `apps/client/src/app/(auth)/connect.tsx`
- Create: `apps/client/src/app/(auth)/login.tsx`

- [ ] **Step 1: Create apps/client/src/app/_layout.tsx**

Mounts `QueryClientProvider` + `TRPCProvider` so every screen can use `useTRPC()` + React Query hooks. Both clients are created once via `useState` so they survive re-renders but reset when the component unmounts (app restart).

```typescript
import '../polyfills';
import '../../global.css';
import { useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { TRPCProvider, createTrpcClient } from '../lib/trpc';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );
  const [trpcClient] = useState(() => createTrpcClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }} />
        </GestureHandlerRootView>
      </TRPCProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: Create apps/client/src/app/index.tsx**

Boot screen: hydrate persisted session → go to `/(client)/home` if valid, else `/(auth)/connect`.

```typescript
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '../store/appStore';

export default function Index() {
  const router = useRouter();
  const hydrateClientSession = useAppStore((s) => s.hydrateClientSession);

  useEffect(() => {
    (async () => {
      const restored = await hydrateClientSession();
      router.replace(restored ? '/(client)/home' : '/(auth)/connect');
    })();
  }, []);

  return (
    <View className="flex-1 justify-center items-center bg-[#2A5C33]">
      <ActivityIndicator size="large" color="#E2EFE0" />
    </View>
  );
}
```

- [ ] **Step 3: Create apps/client/src/app/(auth)/_layout.tsx**

```typescript
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 4: Create apps/client/src/app/(auth)/connect.tsx**

Server discovery screen. Listens for UDP beacon, shows discovered servers, allows manual IP entry. On connect: pings `/ping`, then calls `/info` for `institutionId`.

```typescript
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../store/appStore';
import { MdnsService, type DiscoveredServer } from '../../services/MdnsService';

export default function ConnectScreen() {
  const router = useRouter();
  const { setServerUrl, setInstitutionInfo } = useAppStore();
  const [servers, setServers] = useState<DiscoveredServer[]>([]);
  const [scanning, setScanning] = useState(true);
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('3000');
  const [connecting, setConnecting] = useState(false);
  const scanStarted = useRef(false);

  useEffect(() => {
    if (scanStarted.current) return;
    scanStarted.current = true;
    MdnsService.startScan(
      (found) => setServers((prev) => {
        const exists = prev.some((s) => s.name === found.name);
        return exists ? prev.map((s) => (s.name === found.name ? found : s)) : [...prev, found];
      }),
      (removedName) => setServers((prev) => prev.filter((s) => s.name !== removedName)),
      () => setScanning(false),
    );
    const timer = setTimeout(() => setScanning(false), 15000);
    return () => { clearTimeout(timer); MdnsService.stopScan(); };
  }, []);

  const connect = async (url: string) => {
    setConnecting(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const pingRes = await fetch(`${url}/ping`, { signal: controller.signal });
      if (!pingRes.ok) {
        Alert.alert('Connection Failed', 'Server responded with an error.');
        return;
      }
      clearTimeout(timer);

      // Fetch institution info for catalog queries
      let institutionId = 1;
      let institutionName = 'Library';
      try {
        const infoRes = await fetch(`${url}/info`);
        if (infoRes.ok) {
          const info = await infoRes.json();
          institutionId = info.institutionId ?? 1;
          institutionName = info.institutionName ?? 'Library';
        }
      } catch {}

      setServerUrl(url);
      setInstitutionInfo({ institutionId, institutionName });
      router.replace('/(auth)/login');
    } catch {
      Alert.alert('Connection Failed', 'Could not reach the library server. Check the IP address and try again.');
    } finally {
      clearTimeout(timer);
      setConnecting(false);
    }
  };

  const connectManual = () => {
    if (!ip.trim()) { Alert.alert('Enter IP', 'Please enter the server IP address.'); return; }
    connect(`http://${ip.trim()}:${port.trim() || '3000'}`);
  };

  return (
    <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ flexGrow: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />
      <View className="bg-brand px-5 pb-8 pt-[52px] rounded-b-[32px]">
        <Text className="text-2xl font-extrabold text-white">Connect to Library</Text>
        <Text className="text-xs text-[#A8D5A2] mt-1">
          {scanning ? 'Scanning for nearby servers…' : 'Tap a server below or enter the IP manually.'}
        </Text>
      </View>

      <View className="px-5 pt-5 gap-3">
        {scanning && (
          <View className="flex-row items-center gap-2 py-3">
            <ActivityIndicator color="#2A5C33" />
            <Text className="text-sm text-[#7A9A7E]">Scanning for Bookleaf servers…</Text>
          </View>
        )}

        {servers.map((s) => (
          <TouchableOpacity
            key={s.name}
            className="bg-white rounded-2xl px-4 py-4 flex-row items-center justify-between"
            style={{ elevation: 2 }}
            onPress={() => connect(s.url)}
            disabled={connecting}
          >
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 bg-mint rounded-xl items-center justify-center">
                <Ionicons name="server-outline" size={20} color="#2A5C33" />
              </View>
              <View>
                <Text className="text-sm font-bold text-[#1C2B1E]">{s.name}</Text>
                <Text className="text-xs text-[#7A9A7E]">{s.url}</Text>
              </View>
            </View>
            {connecting ? <ActivityIndicator color="#2A5C33" /> : <Ionicons name="chevron-forward" size={18} color="#2A5C33" />}
          </TouchableOpacity>
        ))}

        {!scanning && servers.length === 0 && (
          <View className="items-center py-6 gap-2">
            <Ionicons name="wifi-outline" size={40} color="#C8DFC5" />
            <Text className="text-sm text-[#7A9A7E] text-center">No servers found. Make sure the librarian device is on and on the same Wi-Fi.</Text>
          </View>
        )}

        <View className="bg-white rounded-2xl px-4 py-4 gap-3 mt-2" style={{ elevation: 2 }}>
          <Text className="text-xs font-bold text-brand uppercase tracking-wider">Enter IP Manually</Text>
          <View className="flex-row gap-2">
            <TextInput
              className="flex-1 border border-mint-dark rounded-xl px-3 py-3 text-sm text-[#1C2B1E]"
              placeholder="192.168.1.x"
              value={ip}
              onChangeText={setIp}
              keyboardType="decimal-pad"
              autoCapitalize="none"
            />
            <TextInput
              className="w-20 border border-mint-dark rounded-xl px-3 py-3 text-sm text-[#1C2B1E]"
              placeholder="3000"
              value={port}
              onChangeText={setPort}
              keyboardType="number-pad"
            />
          </View>
          <TouchableOpacity
            className="bg-leaf rounded-xl py-3.5 items-center"
            onPress={connectManual}
            disabled={connecting}
            style={{ elevation: 4, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 }}
          >
            {connecting
              ? <ActivityIndicator color="#fff" />
              : <Text className="text-white font-bold">Connect</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
```

- [ ] **Step 5: Create apps/client/src/app/(auth)/login.tsx**

Patron PIN login. Replaces the old REST call to `/api/auth/member` with `trpc.auth.login.mutate`.

```typescript
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useAppStore } from '../../store/appStore';
import { useTRPC, getTRPCErrorMessage } from '../../lib/trpc';
import MASCOT from '../../../assets/images/bookleaf-mascot.png';

export default function LoginScreen() {
  const router = useRouter();
  const { serverUrl, institutionId, institutionName, setClientSession } = useAppStore();
  const [idNumber, setIdNumber] = useState('');
  const [pin, setPin] = useState('');
  const trpc = useTRPC();

  const loginMutation = useMutation(
    trpc.auth.login.mutationOptions({
      onSuccess: async (result) => {
        if (!result?.user || !result.token || !result.expires_at) {
          Alert.alert('Login Failed', 'Server returned incomplete data.');
          return;
        }
        await setClientSession({
          user: result.user as any,
          token: result.token,
          expires_at: result.expires_at,
          serverUrl: serverUrl!,
          institutionId: institutionId ?? 1,
          institutionName: institutionName ?? 'Library',
        });
        router.replace('/(client)/home');
      },
      onError: (e) => Alert.alert('Login Failed', getTRPCErrorMessage(e)),
    }),
  );

  const handleSignIn = () => {
    if (!idNumber.trim() || !pin.trim()) {
      Alert.alert('Error', 'Please enter your ID and PIN');
      return;
    }
    loginMutation.mutate({ idNumber: idNumber.trim(), pin: pin.trim() });
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
      <ScrollView className="flex-1 bg-bio" contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <StatusBar barStyle="light-content" backgroundColor="#2A5C33" />
        <View className="bg-brand px-5 pb-8 pt-[52px] rounded-b-[32px] items-center">
          <Image source={MASCOT} className="w-20 h-20 mb-3" resizeMode="contain" />
          <Text className="text-2xl font-extrabold text-white">
            {institutionName ?? 'Library'}
          </Text>
          <Text className="text-xs text-[#A8D5A2] mt-1">Sign in with your library ID and PIN</Text>
        </View>

        <View className="px-5 pt-8 gap-4">
          <View className="gap-1.5">
            <Text className="text-xs font-bold text-brand uppercase tracking-wider">Library ID</Text>
            <TextInput
              className="bg-white border border-mint-dark rounded-2xl px-4 py-4 text-[15px] text-[#1C2B1E]"
              placeholder="e.g. 2024-001"
              value={idNumber}
              onChangeText={setIdNumber}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View className="gap-1.5">
            <Text className="text-xs font-bold text-brand uppercase tracking-wider">PIN</Text>
            <TextInput
              className="bg-white border border-mint-dark rounded-2xl px-4 py-4 text-[15px] text-[#1C2B1E]"
              placeholder="4-digit PIN"
              value={pin}
              onChangeText={setPin}
              secureTextEntry
              keyboardType="number-pad"
            />
          </View>

          <TouchableOpacity
            className="bg-leaf rounded-2xl py-4 items-center mt-2"
            onPress={handleSignIn}
            disabled={loginMutation.isPending}
            style={{ elevation: 6, shadowColor: '#5CB85C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 }}
          >
            <Text className="text-white font-bold text-base">
              {loginMutation.isPending ? 'Signing in…' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="py-3 items-center flex-row justify-center gap-1"
            onPress={() => router.replace('/(auth)/connect')}
          >
            <Ionicons name="arrow-back-outline" size={14} color="#7A9A7E" />
            <Text className="text-sm text-[#7A9A7E]">Change server</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 6: Commit**

```powershell
git add apps/client/src/app/
git commit -m "feat(client): add root layout, boot screen, and auth screens"
```

---

## Task 5: Copy shared components to apps/client

Components used by patron screens that exist in `apps/server/src/components/`. Copy them verbatim — they have no server-specific deps.

**Files:**
- Create: `apps/client/src/components/books/HorizontalBookCard.tsx`
- Create: `apps/client/src/components/common/ErrorBoundary.tsx`
- Create: `apps/client/src/components/members/MemberCard.tsx`
- Create: `apps/client/src/components/navigation/CustomTabBar.tsx`

- [ ] **Step 1: Copy components**

```powershell
New-Item -ItemType Directory -Force -Path "apps/client/src/components/books"
New-Item -ItemType Directory -Force -Path "apps/client/src/components/common"
New-Item -ItemType Directory -Force -Path "apps/client/src/components/members"
New-Item -ItemType Directory -Force -Path "apps/client/src/components/navigation"

Copy-Item apps/server/src/components/books/HorizontalBookCard.tsx apps/client/src/components/books/
Copy-Item apps/server/src/components/common/ErrorBoundary.tsx apps/client/src/components/common/
Copy-Item apps/server/src/components/members/MemberCard.tsx apps/client/src/components/members/
Copy-Item apps/server/src/components/navigation/CustomTabBar.tsx apps/client/src/components/navigation/
```

- [ ] **Step 2: Verify no server-only imports**

```powershell
Select-String -Recurse -Path "apps/client/src/components" -Include "*.tsx" -Pattern "@bookleaf/db|from '.*services/|ServerBridge|ApiServer"
```

Expected: no matches. If any are found, remove those imports — components should only import from `@bookleaf/types`, `react-native`, `expo-*`, and `@expo/vector-icons`.

- [ ] **Step 3: Commit**

```powershell
git add apps/client/src/components/
git commit -m "feat(client): copy shared UI components from apps/server"
```

---

## Task 6: Create apps/client patron screens with tRPC

Create the `(client)` tab layout and all 6 patron screens. Each screen is a port from `apps/server/src/app/(client)/` with `clientFetch` replaced by `trpc.*` calls.

**Files:**
- Create: `apps/client/src/app/(client)/_layout.tsx`
- Create: `apps/client/src/app/(client)/dashboard.tsx`
- Create: `apps/client/src/app/(client)/home.tsx`
- Create: `apps/client/src/app/(client)/my-books.tsx`
- Create: `apps/client/src/app/(client)/my-card.tsx`
- Create: `apps/client/src/app/(client)/gate.tsx`
- Create: `apps/client/src/app/(client)/book/[id].tsx`

- [ ] **Step 1: Create apps/client/src/app/(client)/_layout.tsx**

Copy `apps/server/src/app/(client)/_layout.tsx` exactly, but update two things:
1. The import path: `from '../../components/navigation/CustomTabBar'` (same relative path — already correct)
2. Remove the mode guard (`if (mode !== null && mode !== 'client')`) — in apps/client there is only one mode.

```typescript
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CustomTabBar } from '../../components/navigation/CustomTabBar';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';

export default function ClientLayout() {
  return (
    <ErrorBoundary>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <CustomTabBar {...props} />}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: 'Dashboard',
            tabBarLabel: 'Home',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="home"
          options={{
            title: 'Catalog',
            tabBarLabel: 'Catalog',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'book' : 'book-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="my-books"
          options={{
            title: 'My Books',
            tabBarLabel: 'My Books',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'bookmark' : 'bookmark-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="my-card"
          options={{
            title: 'My Card',
            tabBarLabel: 'My Card',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'card' : 'card-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="gate"
          options={{
            title: 'Gate',
            tabBarLabel: 'Gate',
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? 'qr-code' : 'qr-code-outline'} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen name="book/[id]" options={{ href: null }} />
      </Tabs>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 2: Create apps/client/src/app/(client)/dashboard.tsx**

Copy `apps/server/src/app/(client)/dashboard.tsx` then apply these changes. The `useEffect` data-fetching pattern is replaced by React Query hooks — React Query handles loading, error, caching, and refetch automatically.

1. Remove: `import { clientFetch } from '../../services/clientApi';`
2. Add at the top:
```typescript
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc';
```

3. Inside the component, replace manual state (`loading`, `borrows`, `reservations`, `recentBooks`) + `useEffect` data-fetching with React Query hooks:

```typescript
const trpc = useTRPC();
const { institutionId, currentUser } = useAppStore();
const iid = institutionId ?? 1;

const { data: borrowsData, isLoading: loadingBorrows } = useQuery({
  ...trpc.me.borrows.queryOptions(),
  enabled: !!currentUser,
});
const { data: resvData } = useQuery({
  ...trpc.me.reservations.queryOptions(),
  enabled: !!currentUser,
});
const { data: recentData } = useQuery(
  trpc.catalog.recent.queryOptions({ institutionId: iid, limit: 5 }),
);
const { data: popularData } = useQuery(
  trpc.catalog.popular.queryOptions({ institutionId: iid, limit: 5 }),
);
```

4. In the JSX, replace the old state variables with the new ones:
- `loading` → `loadingBorrows`
- `borrows` → `(borrowsData as any)?.borrows ?? []`
- `reservations` → `(resvData as any)?.reservations ?? []`
- `recentBooks` → `(recentData as any) ?? []`
- `popularBooks` → `(popularData as any) ?? []`

- [ ] **Step 3: Create apps/client/src/app/(client)/home.tsx**

Copy `apps/server/src/app/(client)/home.tsx` and apply these changes:

1. Remove: `import { clientFetch } from '../../services/clientApi';`
2. Add:
```typescript
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc';
```

3. Replace the search `useEffect` + state with:
```typescript
const trpc = useTRPC();
const { institutionId } = useAppStore();
const [query, setQuery] = useState('');

const { data: results, isLoading } = useQuery({
  ...trpc.catalog.search.queryOptions({ institutionId: institutionId ?? 1, q: query }),
  enabled: query.length > 0 || true, // always search (empty q returns all)
});
```

For debounced search (prevents a query per keystroke), wrap the query in a debounced value:
```typescript
const [query, setQuery] = useState('');
const [debouncedQuery, setDebouncedQuery] = useState('');

useEffect(() => {
  const t = setTimeout(() => setDebouncedQuery(query), 300);
  return () => clearTimeout(t);
}, [query]);

const { data: results, isLoading } = useQuery(
  trpc.catalog.search.queryOptions({ institutionId: institutionId ?? 1, q: debouncedQuery }),
);
```

4. Replace `results` in JSX with `(results as any) ?? []`.

- [ ] **Step 4: Create apps/client/src/app/(client)/my-books.tsx**

Copy `apps/server/src/app/(client)/my-books.tsx` and apply these changes:

1. Remove: `import { clientFetch } from '../../services/clientApi';`
2. Add:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc';
import { isTRPCUnauthorized } from '../../lib/trpc';
```

3. Replace data loading + renew + reserve with React Query:
```typescript
const trpc = useTRPC();
const queryClient = useQueryClient();
const { currentUser } = useAppStore();

const { data, isLoading } = useQuery({
  ...trpc.me.borrows.queryOptions(),
  enabled: !!currentUser,
});

const renewMutation = useMutation(trpc.borrows.renew.mutationOptions({
  onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.me.borrows.queryKey() }),
  onError: (e) => {
    if (isTRPCUnauthorized(e)) { useAppStore.getState().clearClientSession(); return; }
    Alert.alert('Renewal Failed', getTRPCErrorMessage(e));
  },
}));

const reserveMutation = useMutation(trpc.books.reserve.mutationOptions({
  onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.me.reservations.queryKey() }),
  onError: (e) => Alert.alert('Reserve Failed', getTRPCErrorMessage(e)),
}));
```

4. Replace inline handlers:
```typescript
// Renew:
renewMutation.mutate({ borrowingId: item.id });

// Reserve:
reserveMutation.mutate({ resourceId: item.resource_id });
```

5. Replace state in JSX:
- `loading` → `isLoading`
- `borrows` → `(data as any)?.borrows ?? []`
- `reservations` → fetched separately with `trpc.me.reservations.queryOptions()`
- `fines` → `(data as any)?.total_fines ?? 0`

- [ ] **Step 5: Create apps/client/src/app/(client)/my-card.tsx**

Copy `apps/server/src/app/(client)/my-card.tsx` and apply these changes:

1. Remove: `import { clientFetch } from '../../services/clientApi';`
2. Add:
```typescript
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '../../lib/trpc';
```

3. Replace logout handler:
```typescript
const trpc = useTRPC();
const logoutMutation = useMutation(trpc.auth.logout.mutationOptions());

const handleLogout = () => {
  Alert.alert('Sign Out', 'Sign out of your account?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Sign Out',
      style: 'destructive',
      onPress: async () => {
        try { await logoutMutation.mutateAsync(); } catch {}
        await clearClientSession();
        router.replace('/(auth)/login');
      },
    },
  ]);
};
```

4. Update route reference: `/(auth)/client-login` → `/(auth)/login` everywhere in the file.

- [ ] **Step 6: Create apps/client/src/app/(client)/gate.tsx**

Copy `apps/server/src/app/(client)/gate.tsx` and apply these changes:

1. Remove: `import { clientFetch } from '../../services/clientApi';`
2. Add:
```typescript
import { useMutation } from '@tanstack/react-query';
import { useTRPC, isTRPCUnauthorized } from '../../lib/trpc';
```

3. Replace gate log call. The QR scan triggers a gate check-in using the already-stored server connection — the URL in the QR is just a trigger signal:

```typescript
const trpc = useTRPC();
const gateMutation = useMutation(trpc.gate.log.mutationOptions());

// In handleBarcodeScan, replace the clientFetch block with:
try {
  const json = await gateMutation.mutateAsync() as any;
  showResult({ direction: json.direction, user_name: json.user_name });
} catch (e) {
  if (isTRPCUnauthorized(e)) {
    setError('Your session expired. Please sign in again.');
    await useAppStore.getState().clearClientSession();
    return;
  }
  setError('Check-in failed. Try again.');
}
```

- [ ] **Step 7: Create apps/client/src/app/(client)/book/[id].tsx**

Copy `apps/server/src/app/(client)/book/[id].tsx` and apply these changes:

1. Remove: `import { clientFetch } from '../../../services/clientApi';`
2. Add:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC, getTRPCErrorMessage, isTRPCUnauthorized } from '../../../lib/trpc';
```

3. Replace data loading with React Query hooks:
```typescript
const trpc = useTRPC();
const queryClient = useQueryClient();
const resourceId = Number(id);

const { data: book, isLoading } = useQuery(trpc.catalog.byId.queryOptions({ id: resourceId }));
const { data: reviewsData } = useQuery(trpc.books.reviews.queryOptions({ resourceId }));
const { data: favStatus } = useQuery({
  ...trpc.books.favoriteStatus.queryOptions({ resourceId }),
  enabled: !!currentUser,
});

const toggleFavMutation = useMutation(trpc.books.toggleFavorite.mutationOptions({
  onSuccess: () => queryClient.invalidateQueries({
    queryKey: trpc.books.favoriteStatus.queryKey({ resourceId }),
  }),
}));

const reserveMutation = useMutation(trpc.books.reserve.mutationOptions({
  onError: (e) => Alert.alert('Reserve Failed', getTRPCErrorMessage(e)),
}));

const addReviewMutation = useMutation(trpc.books.addReview.mutationOptions({
  onSuccess: () => queryClient.invalidateQueries({
    queryKey: trpc.books.reviews.queryKey({ resourceId }),
  }),
  onError: (e) => Alert.alert('Review Failed', getTRPCErrorMessage(e)),
}));
```

4. Replace inline handlers:
```typescript
// Toggle favorite:
toggleFavMutation.mutate({ resourceId });

// Reserve:
reserveMutation.mutate({ resourceId });

// Submit review:
addReviewMutation.mutate({ resourceId, rating, comment: comment || undefined });
```

5. Replace state in JSX:
- `loading` → `isLoading`
- `book` → `book as any`
- `reviews` → `(reviewsData as any)?.reviews ?? []`
- `avgRating` → `(reviewsData as any)?.avg_rating`
- `isFavorited` → `(favStatus as any)?.favorited ?? false`

- [ ] **Step 8: Commit**

```powershell
git add apps/client/src/app/(client)/
git commit -m "feat(client): add patron screens with tRPC (dashboard, home, my-books, my-card, gate, book detail)"
```

---

## Task 7: Clean up apps/server

Remove all client-mode code from `apps/server`. Simplify `appStore` and `index.tsx` to server-only.

**Files:**
- Delete: `apps/server/src/app/(client)/` (entire dir)
- Delete: `apps/server/src/app/(auth)/connect.tsx`
- Delete: `apps/server/src/app/(auth)/client-login.tsx`
- Delete: `apps/server/src/services/clientApi.ts`
- Modify: `apps/server/src/store/appStore.ts`
- Modify: `apps/server/src/app/index.tsx`

- [ ] **Step 1: Delete client-mode files**

```powershell
git rm -r apps/server/src/app/`(client`)/
git rm apps/server/src/app/`(auth`)/connect.tsx
git rm apps/server/src/app/`(auth`)/client-login.tsx
git rm apps/server/src/services/clientApi.ts
```

- [ ] **Step 2: Replace apps/server/src/store/appStore.ts**

Remove all client-session state. Keep only server-app state:

```typescript
import { create } from 'zustand';
import { AppMode, User, Institution, Settings } from '@bookleaf/types';

interface AppState {
  mode: AppMode;
  currentUser: User | null;
  institution: Institution | null;
  settings: Settings | null;

  setMode: (mode: AppMode) => void;
  setCurrentUser: (user: User | null) => void;
  setInstitution: (institution: Institution | null) => void;
  setSettings: (settings: Settings) => void;
  reset: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  mode: null,
  currentUser: null,
  institution: null,
  settings: null,

  setMode: (mode) => set({ mode }),
  setCurrentUser: (user) => set({ currentUser: user }),
  setInstitution: (institution) => set({ institution }),
  setSettings: (settings) => set({ settings }),

  reset: () => set({ currentUser: null, institution: null, settings: null }),
}));
```

- [ ] **Step 3: Replace apps/server/src/app/index.tsx**

Remove client-mode routing. Server app always boots to librarian login or setup:

```typescript
import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '@bookleaf/db';
import { institutions } from '@bookleaf/db';
import { useAppStore } from '../store/appStore';

export default function Index() {
  const router = useRouter();
  const setMode = useAppStore((s) => s.setMode);

  useEffect(() => {
    (async () => {
      const savedMode = await AsyncStorage.getItem('app_mode');
      if (savedMode === 'server') {
        setMode('server');
        const existing = await db.select({ id: institutions.id }).from(institutions).limit(1);
        router.replace(existing.length > 0 ? '/(auth)/login' : '/(auth)/register');
      } else {
        router.replace('/(auth)/setup');
      }
    })();
  }, []);

  return (
    <View className="flex-1 justify-center items-center bg-[#2A5C33]">
      <ActivityIndicator size="large" color="#E2EFE0" />
    </View>
  );
}
```

- [ ] **Step 4: Verify typecheck**

```powershell
pnpm --filter @bookleaf/server-app exec npx tsc --noEmit 2>&1 | Select-String "error TS" | Select-Object -First 20
```

Expected: same 6 pre-existing errors only (5 in BorrowService.ts, 1 in NotificationService.ts).

- [ ] **Step 5: Commit**

```powershell
git add apps/server/src/
git commit -m "feat(server-app): remove all client-mode code, simplify to server-only"
```

---

## Task 8: Add SQLite database export to apps/server Settings

Adds an "Export Database" button to the Settings screen. The librarian taps it, the raw `library.db` file is shared via the OS share sheet — the starting point for migrating to the desktop app.

**Files:**
- Modify: `apps/server/src/app/(server)/settings.tsx`

- [ ] **Step 1: Add imports to settings.tsx**

Open `apps/server/src/app/(server)/settings.tsx` and add these imports at the top:

```typescript
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
```

Also add `expo-file-system` and `expo-sharing` to `apps/server/package.json` if not already present — they are already listed in the current deps, so no package.json change needed.

- [ ] **Step 2: Add exportDatabase state variable**

In the component body, add alongside the existing state variables:

```typescript
const [exportingDb, setExportingDb] = useState(false);
```

- [ ] **Step 3: Add handleExportDatabase function**

Add this function inside the component, below the existing handlers:

```typescript
const handleExportDatabase = async () => {
  setExportingDb(true);
  try {
    const dbPath = `${FileSystem.documentDirectory}SQLite/library.db`;
    const fileInfo = await FileSystem.getInfoAsync(dbPath);
    if (!fileInfo.exists) {
      Alert.alert('Export Failed', 'Database file not found. Make sure the library has been used at least once.');
      return;
    }
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert('Export Failed', 'Sharing is not available on this device.');
      return;
    }
    await Sharing.shareAsync(dbPath, {
      mimeType: 'application/x-sqlite3',
      dialogTitle: 'Export Library Database',
      UTI: 'public.database',
    });
  } catch (e) {
    Alert.alert('Export Failed', e instanceof Error ? e.message : 'An error occurred.');
  } finally {
    setExportingDb(false);
  }
};
```

- [ ] **Step 4: Add Export Database button to the settings JSX**

Find the section in `settings.tsx` where the Backup section renders (near `BackupService.exportJson`). Add the new export button in a new "Database" section below the existing backup section:

```tsx
{/* Database Export — raw .db file for migrating to Desktop */}
<View className="bg-white rounded-2xl px-4 py-4 gap-3 mb-4" style={{ elevation: 2 }}>
  <Text className="text-sm font-bold text-[#1C2B1E]">Database Export</Text>
  <Text className="text-xs text-[#7A9A7E] leading-4">
    Export the raw SQLite database file to migrate your library data to the Bookleaf Desktop app.
  </Text>
  <TouchableOpacity
    className="bg-mint rounded-xl py-3 items-center flex-row justify-center gap-2"
    onPress={handleExportDatabase}
    disabled={exportingDb}
  >
    {exportingDb
      ? <ActivityIndicator size="small" color="#2A5C33" />
      : <Ionicons name="archive-outline" size={18} color="#2A5C33" />}
    <Text className="text-brand font-bold text-sm">
      {exportingDb ? 'Exporting…' : 'Export Database (.db)'}
    </Text>
  </TouchableOpacity>
</View>
```

- [ ] **Step 5: Commit**

```powershell
git add apps/server/src/app/`(server`)/settings.tsx
git commit -m "feat(server-app): add raw SQLite database export to Settings"
```

---

## Task 9: Verify both apps build and patron connects

- [ ] **Step 1: Build apps/server**

```powershell
pnpm --filter @bookleaf/server-app android -- --device
```

Expected: Gradle build succeeds, app installs. Librarian UI works (login, library management screens accessible). Patron-mode screens are gone.

- [ ] **Step 2: Build apps/client**

```powershell
pnpm --filter @bookleaf/client-app android -- --device
```

This is a fresh Expo app — first build will take several minutes (generates `apps/client/android/`).

Expected: Gradle build succeeds, app installs on a second device (or emulator).

- [ ] **Step 3: Test patron connect flow**

1. Open Bookleaf Client on the patron device.
2. Connect screen appears. Device auto-discovers the server or enter IP manually.
3. After connecting, Login screen appears showing the library name.
4. Log in with a patron ID and PIN.
5. Home (Catalog) tab loads books from the server.

- [ ] **Step 4: Test tRPC call (catalog)**

From a browser on the same Wi-Fi, verify the tRPC endpoint works:

```
http://LIBRARIAN_IP:3000/trpc/catalog.search?input={"json":{"q":"","institutionId":1}}
```

Expected: JSON response with book data.

- [ ] **Step 5: Commit the generated android folder gitignore update if needed**

Verify `apps/client/android/` is in `.gitignore` (it was added in Phase 1). If not:

```powershell
# Check:
Select-String -Path ".gitignore" -Pattern "apps/client/android"
# If missing, it was already added in Phase 1 gitignore update — should be there.
```

- [ ] **Step 6: Final commit**

```powershell
git add .
git status  # verify nothing unexpected is staged
git commit -m "feat: Phase 3 complete — apps/client patron app with tRPC, apps/server cleaned up"
```

---

## Spec Coverage Check

| Spec requirement | Covered by |
|---|---|
| Create `apps/client` as new Expo project | Task 2 |
| Extract client-mode screens into `apps/client` | Task 6 |
| Replace `clientApi.ts` with tRPC client | Tasks 3, 6 |
| `apps/client` discovers server via UDP beacon | Task 3 (MdnsService), Task 4 (connect.tsx) |
| `apps/client` connects to Android OR Desktop server transparently | Confirmed — same tRPC endpoints, same UDP beacon format |
| Remove client-mode code from `apps/server` | Task 7 |
| Add raw SQLite export to `apps/server` Settings | Task 8 |
| Verify both apps build and patron connects | Task 9 |
| `/info` endpoint for `institutionId` | Task 1 |
| `AppRouter` type importable in `apps/client` | Task 1 (types.ts entry) |
