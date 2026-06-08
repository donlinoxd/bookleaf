# packages/ui Shared Component Library

**Date:** 2026-06-08  
**Status:** Approved  
**Approach:** Full migration (Approach A)

---

## Goal

Extract all shadcn/ui primitive components, the `use-toast` hook, and the `cn()` utility from `apps/desktop` into a new `packages/ui` shared library (`@bookleaf/ui`). The desktop app and an incoming web app will both consume this package. No build step — source-only, matching the existing `packages/types` and `packages/db` pattern.

---

## Scope

**Moves into `packages/ui`:**
- `apps/desktop/src/components/ui/` — all 15 shadcn/ui primitives
- `apps/desktop/src/hooks/use-toast.ts`
- `apps/desktop/src/lib/utils.ts` (the `cn()` function)
- CSS variable definitions from `apps/desktop/src/index.css` (`:root` and `.dark` blocks + `@layer base`)

**Stays in `apps/desktop`:**
- `src/components/layout/` (AppShell, Sidebar, TitleBar — desktop/Tauri-specific)
- `src/index.css` — keeps `@import "@bookleaf/ui/styles"` + Tailwind directives; loses the `:root` var block
- All pages and app-specific components

---

## Package Structure

```
packages/ui/
├── src/
│   ├── components/
│   │   ├── alert-dialog.tsx
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── scroll-area.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── table.tsx
│   │   ├── toast.tsx
│   │   └── toaster.tsx
│   ├── hooks/
│   │   └── use-toast.ts
│   ├── lib/
│   │   └── utils.ts
│   ├── styles/
│   │   └── globals.css
│   └── index.ts              ← barrel export for all of the above
├── components.json
├── package.json
├── tsconfig.json
└── eslint.config.ts
```

---

## Config Files

### `package.json`
- **Name:** `@bookleaf/ui`
- **Version:** `0.1.0`, `private: true`
- **Exports:**
  - `"."` → `./src/index.ts`
  - `"./styles"` → `./src/styles/globals.css`
- **Dependencies** (moved from desktop): all `@radix-ui/*` packages, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`
- **Peer dependencies:** `react@^19.0.0`, `react-dom@^19.0.0`
- **Dev dependencies:** `@bookleaf/tsconfig`, `@bookleaf/tailwind-config`, `typescript`, `tailwindcss`

### `tsconfig.json`
- Extends `@bookleaf/tsconfig/base.json`
- Adds `"jsx": "react-jsx"`
- Path alias: `"@bookleaf/ui/*"` → `"./src/*"`
- `"include": ["src"]`

### `components.json`
shadcn CLI config so `shadcn add` targets this package:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "../../tooling/tailwind/index.js",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@bookleaf/ui/components",
    "utils": "@bookleaf/ui/lib/utils",
    "ui": "@bookleaf/ui/components",
    "lib": "@bookleaf/ui/lib",
    "hooks": "@bookleaf/ui/hooks"
  }
}
```

---

## Barrel Export (`src/index.ts`)

Re-exports every component, hook, and utility so consumers can do:
```ts
import { Button, Card, useToast, cn } from "@bookleaf/ui"
```

---

## CSS / Tailwind

- **`packages/ui/src/styles/globals.css`** — contains the `@layer base { :root { ... } .dark { ... } }` CSS variable block currently in `apps/desktop/src/index.css`, plus `tw-animate-css` import.
- **`apps/desktop/src/index.css`** — stripped to just Tailwind directives + `@import "@bookleaf/ui/styles"`. No more raw `:root` block.
- **`apps/desktop/tailwind.config.js`** — add `../../packages/ui/src/**/*.{ts,tsx}` to `content` array so Tailwind scans the shared package.
- **Future web app** — imports `@bookleaf/ui/styles` and adds the same content glob.

---

## Desktop App Updates

### `apps/desktop/package.json`
- Add `"@bookleaf/ui": "workspace:*"` to dependencies
- Remove `@radix-ui/*`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` (they move to `packages/ui`)

### `apps/desktop/components.json`
- Update aliases to point at `@bookleaf/ui/*` paths (matching the package's `components.json`)

### `apps/desktop/tsconfig.json`
- Add path alias `"@bookleaf/ui/*"` → `"../../packages/ui/src/*"` so TypeScript resolves the source files directly (no build step needed)

### Import updates in desktop source files
All files importing from:
- `@/components/ui/*` → `@bookleaf/ui` (named imports from barrel, or direct path `@bookleaf/ui/components/button`)
- `@/lib/utils` → `@bookleaf/ui/lib/utils`
- `@/hooks/use-toast` → `@bookleaf/ui/hooks/use-toast`

Pages (`src/pages/*.tsx`) and layout components (`src/components/layout/*.tsx`) will have their imports updated accordingly.

---

## What Does NOT Change

- `apps/desktop/src/components/layout/` — unchanged, stays local
- `apps/desktop/src/pages/` — only their import paths update, no logic changes
- `tooling/tailwind/index.js` — untouched; `packages/ui` references it for brand colors
- `packages/db`, `packages/types`, `packages/server` — unaffected
- `apps/client` (mobile) — unaffected; uses NativeWind/React Native, not shadcn

---

## Future Web App Onboarding

A new web app only needs to:
1. Add `"@bookleaf/ui": "workspace:*"` to its `package.json`
2. Import `@bookleaf/ui/styles` in its root CSS/entry
3. Add `../../packages/ui/src/**/*.{ts,tsx}` to its Tailwind `content`
4. Add the tsconfig path alias

No component copying, no re-configuration.

---

## Out of Scope

- Any new shadcn components beyond what already exists in the desktop
- Web app scaffolding itself

---

## Notes

- `use-mobile.ts` is a standard shadcn utility hook that does not currently exist in the desktop. It will be created fresh in `packages/ui/src/hooks/use-mobile.ts` during setup (not migrated — there is nothing to move).
