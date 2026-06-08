# packages/ui Shared Component Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all shadcn/ui primitives, the `use-toast` hook, and `cn()` from `apps/desktop` into a source-only shared package `@bookleaf/ui`, consumed by the desktop app (and soon a web app) via workspace imports.

**Architecture:** Source-only package (no build step) matching the `packages/types` and `packages/db` pattern. Consumers resolve `@bookleaf/ui` via tsconfig path aliases pointing directly at `packages/ui/src/`. The desktop's internal imports change from `@/components/ui/*` → `@bookleaf/ui/components/*`, `@/lib/utils` → `@bookleaf/ui/lib/utils`, and `@/hooks/use-toast` → `@bookleaf/ui/hooks/use-toast`.

**Tech Stack:** pnpm workspaces, Turbo, TypeScript 5.8, React 19, shadcn/ui, Radix UI, Tailwind CSS 3, class-variance-authority, clsx, tailwind-merge, lucide-react.

---

## File Map

**Created in `packages/ui`:**
- `package.json` — `@bookleaf/ui`, exports `"."` and `"./styles"`
- `tsconfig.json` — extends `@bookleaf/tsconfig/base.json`, adds DOM, jsx, path alias
- `components.json` — shadcn CLI config targeting this package
- `eslint.config.ts` — minimal ESLint config
- `src/lib/utils.ts` — `cn()` helper
- `src/styles/globals.css` — CSS variable definitions (`:root` + `.dark` blocks)
- `src/hooks/use-mobile.ts` — fresh standard shadcn hook
- `src/hooks/use-toast.ts` — moved from desktop, internal imports updated
- `src/components/alert-dialog.tsx` — moved, `@/lib/utils` → `../lib/utils`, `@/components/ui/button` → `./button`
- `src/components/badge.tsx` — moved, `@/lib/utils` → `../lib/utils`
- `src/components/button.tsx` — moved, `@/lib/utils` → `../lib/utils`
- `src/components/card.tsx` — moved, same
- `src/components/dialog.tsx` — moved, same
- `src/components/dropdown-menu.tsx` — moved, same
- `src/components/form.tsx` — moved, same
- `src/components/input.tsx` — moved, same
- `src/components/label.tsx` — moved, same
- `src/components/scroll-area.tsx` — moved, same
- `src/components/select.tsx` — moved, same
- `src/components/separator.tsx` — moved, same
- `src/components/table.tsx` — moved, same
- `src/components/toast.tsx` — moved, `@/lib/utils` → `../lib/utils`
- `src/components/toaster.tsx` — moved, `@/hooks/use-toast` → `../hooks/use-toast`, `@/components/ui/toast` → `./toast`
- `src/index.ts` — barrel export for all components, hooks, and utilities

**Modified in `apps/desktop`:**
- `package.json` — add `@bookleaf/ui: workspace:*`, remove 9 deps now owned by the package
- `tsconfig.json` — add `@bookleaf/ui` and `@bookleaf/ui/*` path aliases
- `tailwind.config.js` — add `packages/ui/src` to `content` array
- `src/index.css` — replace `:root`/`.dark` CSS var block with `@import "@bookleaf/ui/styles"`
- `components.json` — update all `aliases` to point at `@bookleaf/ui/*` paths
- All `src/**/*.{ts,tsx}` files importing `@/components/ui/*`, `@/lib/utils`, or `@/hooks/use-toast`

**Deleted from `apps/desktop`:**
- `src/components/ui/` (entire directory — 15 files)
- `src/hooks/use-toast.ts`
- `src/lib/utils.ts`

---

## Task 1: Scaffold packages/ui config files

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/components.json`
- Create: `packages/ui/eslint.config.ts`

- [ ] **Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@bookleaf/ui",
  "version": "0.1.0",
  "private": true,
  "exports": {
    ".": "./src/index.ts",
    "./styles": "./src/styles/globals.css"
  },
  "dependencies": {
    "@radix-ui/react-alert-dialog": "^1.1.15",
    "@radix-ui/react-dialog": "^1.1.15",
    "@radix-ui/react-dropdown-menu": "^2.1.16",
    "@radix-ui/react-label": "^2.1.8",
    "@radix-ui/react-scroll-area": "^1.2.10",
    "@radix-ui/react-select": "^2.2.6",
    "@radix-ui/react-separator": "^1.1.8",
    "@radix-ui/react-slot": "^1.2.3",
    "@radix-ui/react-toast": "^1.2.15",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^0.513.0",
    "tailwind-merge": "^2.6.1",
    "tw-animate-css": "^1.4.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@bookleaf/tailwind-config": "workspace:*",
    "@bookleaf/tsconfig": "workspace:*",
    "@types/react": "~19.1.0",
    "@types/react-dom": "~19.1.0",
    "autoprefixer": "^10.4.21",
    "postcss": "^8.5.3",
    "tailwindcss": "^3.4.19",
    "typescript": "~5.8.3"
  }
}
```

- [ ] **Step 2: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "@bookleaf/tsconfig/base.json",
  "compilerOptions": {
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "allowImportingTsExtensions": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/ui/components.json`**

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

- [ ] **Step 4: Create `packages/ui/eslint.config.ts`**

```ts
export default []
```

- [ ] **Step 5: Commit**

```bash
git add packages/ui/package.json packages/ui/tsconfig.json packages/ui/components.json packages/ui/eslint.config.ts
git commit -m "feat(ui): scaffold @bookleaf/ui package config"
```

---

## Task 2: Create utilities and global styles

**Files:**
- Create: `packages/ui/src/lib/utils.ts`
- Create: `packages/ui/src/styles/globals.css`

- [ ] **Step 1: Create `packages/ui/src/lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 2: Create `packages/ui/src/styles/globals.css`**

This is the CSS variable block extracted from `apps/desktop/src/index.css`. The desktop's `@tailwind` directives stay in the desktop; only the theme vars move here.

```css
@layer base {
  :root {
    --background: 120 33% 98%;
    --foreground: 144 40% 10%;
    --card: 0 0% 100%;
    --card-foreground: 144 40% 10%;
    --popover: 0 0% 100%;
    --popover-foreground: 144 40% 10%;
    --border: 120 20% 85%;
    --input: 120 20% 85%;
    --primary: 135 37% 27%;
    --primary-foreground: 120 33% 98%;
    --secondary: 120 25% 90%;
    --secondary-foreground: 135 37% 27%;
    --muted: 120 20% 94%;
    --muted-foreground: 120 10% 45%;
    --accent: 120 25% 90%;
    --accent-foreground: 135 37% 27%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 98%;
    --ring: 135 37% 27%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 144 30% 8%;
    --foreground: 120 20% 95%;
    --card: 144 25% 10%;
    --card-foreground: 120 20% 95%;
    --popover: 144 25% 10%;
    --popover-foreground: 120 20% 95%;
    --border: 144 20% 20%;
    --input: 144 20% 20%;
    --primary: 135 45% 55%;
    --primary-foreground: 144 40% 10%;
    --secondary: 144 20% 18%;
    --secondary-foreground: 120 20% 95%;
    --muted: 144 20% 15%;
    --muted-foreground: 120 10% 60%;
    --accent: 144 20% 18%;
    --accent-foreground: 120 20% 95%;
    --destructive: 0 62% 45%;
    --destructive-foreground: 0 0% 98%;
    --ring: 135 45% 55%;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/lib/utils.ts packages/ui/src/styles/globals.css
git commit -m "feat(ui): add cn utility and CSS variable theme"
```

---

## Task 3: Create use-mobile hook

**Files:**
- Create: `packages/ui/src/hooks/use-mobile.ts`

- [ ] **Step 1: Create `packages/ui/src/hooks/use-mobile.ts`**

```ts
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/hooks/use-mobile.ts
git commit -m "feat(ui): add useIsMobile hook"
```

---

## Task 4: Move simple components (those with only @/lib/utils internal import)

These 12 files each contain `import { cn } from "@/lib/utils"` as their only internal cross-reference. The change is always `"@/lib/utils"` → `"../lib/utils"`.

**Files:**
- Create (×12): `packages/ui/src/components/{badge,button,card,dialog,dropdown-menu,form,input,label,scroll-area,select,separator,table}.tsx`

- [ ] **Step 1: Copy and update each file using PowerShell**

Run from the repo root:

```powershell
$components = @("badge","button","card","dialog","dropdown-menu","form","input","label","scroll-area","select","separator","table")
New-Item -ItemType Directory -Force -Path "packages/ui/src/components" | Out-Null
foreach ($comp in $components) {
    $src = "apps/desktop/src/components/ui/$comp.tsx"
    $dst = "packages/ui/src/components/$comp.tsx"
    $content = Get-Content $src -Raw -Encoding UTF8
    $updated = $content -replace '"@/lib/utils"', '"../lib/utils"'
    [System.IO.File]::WriteAllText((Resolve-Path ".").Path + "\$dst", $updated, [System.Text.Encoding]::UTF8)
    Write-Host "Copied: $comp.tsx"
}
```

- [ ] **Step 2: Verify all 12 files exist and contain `../lib/utils`**

```powershell
Get-ChildItem "packages/ui/src/components" | Select-Object Name
Select-String -Pattern "@/lib/utils" -Path "packages/ui/src/components/*.tsx"
```

Expected: 12 files listed. Select-String output should be empty (no remaining `@/lib/utils`).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/
git commit -m "feat(ui): move 12 shadcn primitive components to @bookleaf/ui"
```

---

## Task 5: Move cross-referencing components (alert-dialog, toast, toaster)

These files import from other components within the package and need their cross-references updated too.

**Files:**
- Create: `packages/ui/src/components/alert-dialog.tsx`
- Create: `packages/ui/src/components/toast.tsx`
- Create: `packages/ui/src/components/toaster.tsx`

- [ ] **Step 1: Create `packages/ui/src/components/alert-dialog.tsx`**

Changes from desktop original: `"@/lib/utils"` → `"../lib/utils"`, `"@/components/ui/button"` → `"./button"`.

```tsx
import * as React from "react"
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog"

import { cn } from "../lib/utils"
import { buttonVariants } from "./button"

const AlertDialog = AlertDialogPrimitive.Root

const AlertDialogTrigger = AlertDialogPrimitive.Trigger

const AlertDialogPortal = AlertDialogPrimitive.Portal

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
))
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className
      )}
      {...props}
    />
  </AlertDialogPortal>
))
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
AlertDialogHeader.displayName = "AlertDialogHeader"

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
AlertDialogFooter.displayName = "AlertDialogFooter"

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold", className)}
    {...props}
  />
))
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants(), className)}
    {...props}
  />
))
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(
      buttonVariants({ variant: "outline" }),
      "mt-2 sm:mt-0",
      className
    )}
    {...props}
  />
))
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
```

- [ ] **Step 2: Create `packages/ui/src/components/toast.tsx`**

Change: `"@/lib/utils"` → `"../lib/utils"`. All other imports are from `@radix-ui/react-toast` and `lucide-react` (external deps — no change needed).

```powershell
$content = Get-Content "apps/desktop/src/components/ui/toast.tsx" -Raw -Encoding UTF8
$updated = $content -replace '"@/lib/utils"', '"../lib/utils"'
[System.IO.File]::WriteAllText(
  (Join-Path (Resolve-Path ".").Path "packages/ui/src/components/toast.tsx"),
  $updated,
  [System.Text.Encoding]::UTF8
)
```

- [ ] **Step 3: Create `packages/ui/src/components/toaster.tsx`**

Changes: `"@/hooks/use-toast"` → `"../hooks/use-toast"`, `"@/components/ui/toast"` → `"./toast"`.

```tsx
"use client"

import { useToast } from "../hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "./toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/alert-dialog.tsx packages/ui/src/components/toast.tsx packages/ui/src/components/toaster.tsx
git commit -m "feat(ui): move alert-dialog, toast, toaster with updated internal imports"
```

---

## Task 6: Move use-toast hook

**Files:**
- Create: `packages/ui/src/hooks/use-toast.ts`

- [ ] **Step 1: Create `packages/ui/src/hooks/use-toast.ts`**

Change: `"@/components/ui/toast"` → `"../components/toast"`.

```powershell
New-Item -ItemType Directory -Force -Path "packages/ui/src/hooks" | Out-Null
$content = Get-Content "apps/desktop/src/hooks/use-toast.ts" -Raw -Encoding UTF8
$updated = $content -replace '"@/components/ui/toast"', '"../components/toast"'
[System.IO.File]::WriteAllText(
  (Join-Path (Resolve-Path ".").Path "packages/ui/src/hooks/use-toast.ts"),
  $updated,
  [System.Text.Encoding]::UTF8
)
```

- [ ] **Step 2: Verify the import was updated**

```powershell
Select-String -Pattern "@/components" -Path "packages/ui/src/hooks/use-toast.ts"
```

Expected: no output (no remaining `@/` imports).

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/hooks/use-toast.ts
git commit -m "feat(ui): move use-toast hook to @bookleaf/ui"
```

---

## Task 7: Create barrel export

**Files:**
- Create: `packages/ui/src/index.ts`

- [ ] **Step 1: Create `packages/ui/src/index.ts`**

```ts
export * from "./components/alert-dialog"
export * from "./components/badge"
export * from "./components/button"
export * from "./components/card"
export * from "./components/dialog"
export * from "./components/dropdown-menu"
export * from "./components/form"
export * from "./components/input"
export * from "./components/label"
export * from "./components/scroll-area"
export * from "./components/select"
export * from "./components/separator"
export * from "./components/table"
export * from "./components/toast"
export * from "./components/toaster"
export * from "./hooks/use-toast"
export * from "./hooks/use-mobile"
export * from "./lib/utils"
```

- [ ] **Step 2: Commit**

```bash
git add packages/ui/src/index.ts
git commit -m "feat(ui): add barrel export index"
```

---

## Task 8: Update apps/desktop/package.json

Remove the 9 deps now owned by `@bookleaf/ui` and add the workspace reference.

**Files:**
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Edit `apps/desktop/package.json`**

In the `"dependencies"` object:
- **Add:** `"@bookleaf/ui": "workspace:*"`
- **Remove** these keys (they're now owned by `@bookleaf/ui`):
  - `"@radix-ui/react-alert-dialog"`
  - `"@radix-ui/react-dialog"`
  - `"@radix-ui/react-dropdown-menu"`
  - `"@radix-ui/react-label"`
  - `"@radix-ui/react-scroll-area"`
  - `"@radix-ui/react-select"`
  - `"@radix-ui/react-separator"`
  - `"@radix-ui/react-slot"`
  - `"@radix-ui/react-toast"`
  - `"class-variance-authority"`
  - `"clsx"`
  - `"lucide-react"`
  - `"tailwind-merge"`
  - `"tw-animate-css"`

The resulting `"dependencies"` object should be:

```json
"dependencies": {
  "@base-ui/react": "^1.5.0",
  "@bookleaf/tailwind-config": "workspace:*",
  "@bookleaf/types": "workspace:*",
  "@bookleaf/ui": "workspace:*",
  "@fontsource-variable/geist": "^5.2.9",
  "@hookform/resolvers": "^3.10.0",
  "@tanstack/react-query": "^5.100.10",
  "@tanstack/react-table": "^8.21.3",
  "@tauri-apps/api": "^2",
  "@tauri-apps/plugin-dialog": "^2",
  "@tauri-apps/plugin-opener": "^2",
  "@trpc/client": "^11.0.0",
  "@trpc/tanstack-react-query": "^11.0.0",
  "react": "19.1.0",
  "react-dom": "19.1.0",
  "react-hook-form": "^7.77.0",
  "react-qr-code": "^2.0.21",
  "react-router-dom": "^7.6.0",
  "shadcn": "^4.10.0",
  "zod": "^3.25.76",
  "zustand": "^5.0.3"
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/package.json
git commit -m "chore(desktop): replace radix/cva/clsx deps with @bookleaf/ui workspace ref"
```

---

## Task 9: Update apps/desktop/tsconfig.json

Add path aliases so TypeScript resolves `@bookleaf/ui` directly to source without a build step.

**Files:**
- Modify: `apps/desktop/tsconfig.json`

- [ ] **Step 1: Edit `apps/desktop/tsconfig.json`**

Add `@bookleaf/ui` entries to `compilerOptions.paths`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@bookleaf/ui": ["../../packages/ui/src/index.ts"],
      "@bookleaf/ui/*": ["../../packages/ui/src/*"]
    },
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/tsconfig.json
git commit -m "chore(desktop): add @bookleaf/ui tsconfig path aliases"
```

---

## Task 10: Update apps/desktop/tailwind.config.js

Add `packages/ui/src` to the `content` array so Tailwind scans the shared package's class names.

**Files:**
- Modify: `apps/desktop/tailwind.config.js`

- [ ] **Step 1: Edit `apps/desktop/tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
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
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/tailwind.config.js
git commit -m "chore(desktop): add packages/ui to tailwind content paths"
```

---

## Task 11: Update apps/desktop/src/index.css

Replace the extracted CSS var block with an import from the shared package. The `@tailwind` directives and `@layer base { * { ... } body { ... } }` block stay in the desktop.

**Files:**
- Modify: `apps/desktop/src/index.css`

- [ ] **Step 1: Replace `apps/desktop/src/index.css` content**

`@import` must come before `@tailwind` directives — CSS spec requires `@import` first.

```css
@import "@bookleaf/ui/styles";

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/index.css
git commit -m "chore(desktop): import CSS vars from @bookleaf/ui/styles"
```

---

## Task 12: Update apps/desktop/components.json

Point the shadcn CLI aliases at `@bookleaf/ui` so future `shadcn add` commands in the desktop context target the shared package.

**Files:**
- Modify: `apps/desktop/components.json`

- [ ] **Step 1: Edit `apps/desktop/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "rtl": false,
  "aliases": {
    "components": "@bookleaf/ui/components",
    "utils": "@bookleaf/ui/lib/utils",
    "ui": "@bookleaf/ui/components",
    "lib": "@bookleaf/ui/lib",
    "hooks": "@bookleaf/ui/hooks"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/components.json
git commit -m "chore(desktop): update shadcn aliases to point at @bookleaf/ui"
```

---

## Task 13: Install dependencies

Sync the workspace so `@bookleaf/ui` is linked and all moved deps are resolved.

- [ ] **Step 1: Run pnpm install from repo root**

```bash
pnpm install
```

Expected: no errors. `packages/ui` appears in `node_modules/@bookleaf/ui` as a symlink.

- [ ] **Step 2: Verify the symlink exists**

```powershell
Test-Path "node_modules/@bookleaf/ui"
```

Expected: `True`

---

## Task 14: Update desktop source import paths

Replace every `@/components/ui/`, `@/lib/utils`, and `@/hooks/use-toast` import in `apps/desktop/src/` with the `@bookleaf/ui` equivalents.

**Files:**
- Modify: all `apps/desktop/src/**/*.{ts,tsx}` files that contain the old import paths

- [ ] **Step 1: Run the bulk replacement (PowerShell)**

Run from the repo root:

```powershell
$files = Get-ChildItem -Recurse -Include "*.tsx","*.ts" -Path "apps/desktop/src"
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $updated = $content `
        -replace '"@/components/ui/', '"@bookleaf/ui/components/' `
        -replace "'@/components/ui/", "'@bookleaf/ui/components/" `
        -replace '"@/lib/utils"', '"@bookleaf/ui/lib/utils"' `
        -replace "'@/lib/utils'", "'@bookleaf/ui/lib/utils'" `
        -replace '"@/hooks/use-toast"', '"@bookleaf/ui/hooks/use-toast"' `
        -replace "'@/hooks/use-toast'", "'@bookleaf/ui/hooks/use-toast'"
    if ($content -ne $updated) {
        [System.IO.File]::WriteAllText($file.FullName, $updated, [System.Text.Encoding]::UTF8)
        Write-Host "Updated: $($file.Name)"
    }
}
```

- [ ] **Step 2: Verify no old imports remain in desktop src**

```powershell
Select-String -Pattern "@/components/ui/|@/lib/utils|@/hooks/use-toast" -Path "apps/desktop/src/**/*.tsx","apps/desktop/src/**/*.ts" -Recurse
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/
git commit -m "chore(desktop): update imports to use @bookleaf/ui"
```

---

## Task 15: Delete moved files from desktop

Now that the desktop is fully importing from `@bookleaf/ui`, remove the old source files.

**Files:**
- Delete: `apps/desktop/src/components/ui/` (15 files)
- Delete: `apps/desktop/src/hooks/use-toast.ts`
- Delete: `apps/desktop/src/lib/utils.ts`

- [ ] **Step 1: Delete the moved files**

```powershell
Remove-Item -Recurse -Force "apps/desktop/src/components/ui"
Remove-Item -Force "apps/desktop/src/hooks/use-toast.ts"
Remove-Item -Force "apps/desktop/src/lib/utils.ts"
```

- [ ] **Step 2: Verify they're gone**

```powershell
Test-Path "apps/desktop/src/components/ui"
Test-Path "apps/desktop/src/hooks/use-toast.ts"
Test-Path "apps/desktop/src/lib/utils.ts"
```

Expected: all three return `False`.

- [ ] **Step 3: Commit**

```bash
git add -A apps/desktop/src/components/ui apps/desktop/src/hooks/use-toast.ts apps/desktop/src/lib/utils.ts
git commit -m "chore(desktop): remove files now living in @bookleaf/ui"
```

---

## Task 16: Verify TypeScript compilation

Run the TypeScript compiler against both packages to confirm zero errors introduced by this refactor.

- [ ] **Step 1: Typecheck packages/ui**

```bash
cd packages/ui && npx tsc --noEmit
```

Expected: no output (zero errors).

- [ ] **Step 2: Typecheck apps/desktop**

```bash
cd apps/desktop && npx tsc --noEmit
```

Expected: only the 5 pre-existing errors in `BorrowService.ts` and 1 in `NotificationService.ts` (documented in AGENTS.md). Zero new errors.

- [ ] **Step 3: If any new errors appear, fix them before proceeding**

Common fixes:
- Missing import in a page file → add `import { X } from "@bookleaf/ui/components/x"`
- Type not re-exported → add it to `packages/ui/src/index.ts`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify @bookleaf/ui migration — tsc clean"
```
