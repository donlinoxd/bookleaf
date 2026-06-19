# MARC Import / Export (MARCXML) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a librarian import MARC records into the catalog and export catalog records as MARC, using the MARCXML (MARC21) serialization, with imported author/publisher/subjects auto-linked to authority records.

**Architecture:** MARC logic is pure server-side code in `packages/server/src/marc/` (parse, serialize, field/leader mapping). Import parses MARCXML → import rows → the existing import pipeline (validate → dedup → commit), extended so commit can get-or-create + link authorities. Export reuses `adminListBooks` and serializes the rows. The desktop only reads/writes files and calls tRPC.

**Tech Stack:** TypeScript, `fast-xml-parser` (new server dep), Drizzle + better-sqlite3, tRPC v11, React + Vite (desktop), Vitest.

## Global Constraints

- **Desktop-only feature.** Do NOT modify anything under `apps/server`. After implementation, `git diff --name-only master...HEAD -- apps/server` MUST be empty. (This slice legitimately changes `packages/types`, `packages/server`, and `apps/desktop`.)
- **Branch / worktree:** work in this worktree on branch `worktree-feat+marc-import-export`. Commit every task here. Do NOT create new git worktrees or branches.
- **MARCXML only** (no binary ISO 2709 in v1).
- **Serialization namespace:** `http://www.loc.gov/MARC21/slim`.
- **Auto-link authorities on MARC import** (get-or-create + link author/publisher/subjects, denormalized text kept in sync); CSV/XLSX import behavior must be unchanged (it passes `linkAuthorities: false`).
- **Author authority type defaults to `personal`** on import (corporate `110` detection deferred); publisher → `publisher`; subjects → `subject`.
- **Lossy v1:** unmapped MARC fields are dropped on import; export is bibliographic-only (no copy-level holdings).
- **Pre-existing typecheck baselines (NOT regressions):** server = 4 errors; desktop = 5 errors. A task is clean if it does not increase these.
- **Baseline tests:** server suite currently 54 passing.
- **Spec:** `docs/superpowers/specs/2026-06-18-marc-import-export-design.md`.

## Shared interfaces (defined across tasks — names are fixed)

- `FIELD_MARC_TAGS: Record<string, string>` (`@bookleaf/types`) — resource field key → primary MARC tag+subfield string (e.g. `'245$a'`).
- `MarcRecord` (`packages/server/src/marc/types.ts`):
  ```ts
  export interface MarcSubfield { code: string; value: string; }
  export interface MarcDataField { tag: string; ind1: string; ind2: string; subfields: MarcSubfield[]; }
  export interface MarcControlField { tag: string; value: string; }
  export interface MarcRecord { leader: string; controlfields: MarcControlField[]; datafields: MarcDataField[]; }
  ```
- `materialTypeFromLeader(leader: string, hasField: (tag: string) => boolean): MaterialType` and `leaderFor(materialType: MaterialType): string` (`marc/mapping.ts`).
- `parseMarcXml(xml: string): MarcRecord[]` (`marc/parse.ts`).
- `marcRecordToRow(rec: MarcRecord, rowIndex: number): ImportRow` (`marc/toRows.ts`).
- `serializeResourceToRecord(row: Record<string, unknown>): string` and `serializeCollection(rows: Record<string, unknown>[]): { xml: string; written: number; skipped: number }` (`marc/serialize.ts`).

---

### Task 1: `FIELD_MARC_TAGS` shared map + desktop consistency test

**Files:**
- Modify: `packages/types/src/index.ts` (add the const)
- Create: `apps/desktop/src/lib/materialFields.marc.test.ts`

**Interfaces:**
- Produces: `export const FIELD_MARC_TAGS: Record<string, string>` from `@bookleaf/types`.

- [ ] **Step 1: Add the shared map to types**

In `packages/types/src/index.ts`, append:

```ts
/** Resource field key → primary MARC tag+subfield. Shared by the desktop form's
 *  display `marc` values and the server MARC codec, so the two cannot drift.
 *  The server codec layers richer logic (subfields, leader, repeatable fields). */
export const FIELD_MARC_TAGS: Record<string, string> = {
  title: '245$a',
  subtitle: '245$b',
  author: '100$a',
  publisher: '264$b',
  year: '264$c',
  edition: '250$a',
  isbn: '020$a',
  issn: '022$a',
  genre: '655$a',
  series_title: '490$a',
  volume: '490$v',
  language: '041$a',
  call_number: '082',
  call_number_type: '082',
  description: '520$a',
  frequency: '310$a',
  container_title: '773$t',
  issue_number: '773$g',
  pages: '773$g',
  doi: '024$a',
  url: '856$u',
  thesis_degree: '502$b',
  thesis_institution: '502$c',
  thesis_advisor: '502$g',
  subject_authority_ids: '650$a',
};
```

- [ ] **Step 2: Write the failing desktop consistency test**

Create `apps/desktop/src/lib/materialFields.marc.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { FIELD_MARC_TAGS } from '@bookleaf/types';
import { MATERIAL_FIELDS, GENERIC_FIELDS } from './materialFields';

describe('materialFields marc tags vs shared FIELD_MARC_TAGS', () => {
  it('every descriptor with a non-empty marc tag matches the shared map', () => {
    const all = [...Object.values(MATERIAL_FIELDS).flat(), ...GENERIC_FIELDS];
    for (const f of all) {
      if (!f!.marc) continue; // inventory fields (total_copies) carry no tag
      expect(FIELD_MARC_TAGS[f!.key], f!.key).toBe(f!.marc);
    }
  });
});
```

- [ ] **Step 3: Run to verify it fails or passes**

Run: `cd apps/desktop && npx vitest run src/lib/materialFields.marc.test.ts`
Expected: PASS if the desktop `marc` values already match the map above. If it FAILS, the mismatch is a real drift — reconcile by making `FIELD_MARC_TAGS` match the existing descriptor values (the descriptors are the source of the agreed tags), then re-run to PASS. Do not change the descriptors.

- [ ] **Step 4: Typecheck**

Run: `cd packages/types && npx tsc --noEmit` → clean. Run: `cd apps/desktop && npx tsc --noEmit 2>&1 | grep -c "error TS"` → 5.

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/index.ts apps/desktop/src/lib/materialFields.marc.test.ts
git commit -m "feat(types): shared FIELD_MARC_TAGS map + desktop consistency test"
```

---

### Task 2: `marc/mapping.ts` — Leader ↔ material_type

**Files:**
- Create: `packages/server/src/marc/mapping.ts`
- Create: `packages/server/src/marc/mapping.test.ts`

**Interfaces:**
- Consumes: `MaterialType` from `@bookleaf/types`.
- Produces: `materialTypeFromLeader(leader, hasField)`, `leaderFor(materialType)`, `DEFAULT_LEADER`.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/marc/mapping.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { materialTypeFromLeader, leaderFor } from './mapping';

const lead = (type: string, level: string) => `00000n${type}${level} a2200000zu 4500`;

describe('materialTypeFromLeader', () => {
  it('detects THESIS when a 502 field is present', () => {
    expect(materialTypeFromLeader(lead('a', 'm'), t => t === '502')).toBe('THESIS');
  });
  it('detects SERIAL from bib level s', () => {
    expect(materialTypeFromLeader(lead('a', 's'), () => false)).toBe('SERIAL');
  });
  it('detects ARTICLE from component bib level a/b', () => {
    expect(materialTypeFromLeader(lead('a', 'a'), () => false)).toBe('ARTICLE');
    expect(materialTypeFromLeader(lead('a', 'b'), () => false)).toBe('ARTICLE');
  });
  it('detects MAP, AUDIOVISUAL, MANUSCRIPT, DIGITAL from type byte', () => {
    expect(materialTypeFromLeader(lead('e', 'm'), () => false)).toBe('MAP');
    expect(materialTypeFromLeader(lead('g', 'm'), () => false)).toBe('AUDIOVISUAL');
    expect(materialTypeFromLeader(lead('t', 'm'), () => false)).toBe('MANUSCRIPT');
    expect(materialTypeFromLeader(lead('m', 'm'), () => false)).toBe('DIGITAL');
  });
  it('defaults to BOOK', () => {
    expect(materialTypeFromLeader(lead('a', 'm'), () => false)).toBe('BOOK');
    expect(materialTypeFromLeader('', () => false)).toBe('BOOK');
  });
});

describe('leaderFor round-trips through materialTypeFromLeader', () => {
  for (const mt of ['BOOK', 'SERIAL', 'ARTICLE', 'MAP', 'AUDIOVISUAL', 'MANUSCRIPT', 'DIGITAL'] as const) {
    it(`${mt}`, () => {
      expect(materialTypeFromLeader(leaderFor(mt), () => false)).toBe(mt);
    });
  }
  it('THESIS round-trips when a 502 is present', () => {
    expect(materialTypeFromLeader(leaderFor('THESIS'), t => t === '502')).toBe('THESIS');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/server && npx vitest run src/marc/mapping.test.ts`
Expected: FAIL — cannot resolve `./mapping`.

- [ ] **Step 3: Implement**

Create `packages/server/src/marc/mapping.ts`:

```ts
import type { MaterialType } from '@bookleaf/types';

/** A minimal valid 24-char leader template; bytes 06 (type) and 07 (level) are overwritten. */
export const DEFAULT_LEADER = '00000nam a2200000zu 4500';

// material_type → [type byte (06), bib-level byte (07)]
const LEADER_BYTES: Record<MaterialType, [string, string]> = {
  BOOK: ['a', 'm'],
  SERIAL: ['a', 's'],
  ARTICLE: ['a', 'a'],
  AUDIOVISUAL: ['g', 'm'],
  MAP: ['e', 'm'],
  MANUSCRIPT: ['t', 'm'],
  DIGITAL: ['m', 'm'],
  THESIS: ['a', 'm'], // thesis-ness is signalled by a 502 field, not the leader
  OTHER: ['a', 'm'],
};

export function leaderFor(materialType: MaterialType): string {
  const [type, level] = LEADER_BYTES[materialType] ?? LEADER_BYTES.BOOK;
  const chars = DEFAULT_LEADER.split('');
  chars[6] = type;
  chars[7] = level;
  return chars.join('');
}

export function materialTypeFromLeader(leader: string, hasField: (tag: string) => boolean): MaterialType {
  const type = leader[6] ?? '';
  const level = leader[7] ?? '';
  if (hasField('502')) return 'THESIS';
  if (level === 'a' || level === 'b') return 'ARTICLE';
  if (level === 's') return 'SERIAL';
  if (type === 'm') return 'DIGITAL';
  if (type === 'e' || type === 'f') return 'MAP';
  if (type === 'g' || type === 'i' || type === 'j') return 'AUDIOVISUAL';
  if (type === 't') return 'MANUSCRIPT';
  return 'BOOK';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/server && npx vitest run src/marc/mapping.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/marc/mapping.ts packages/server/src/marc/mapping.test.ts
git commit -m "feat(marc): leader <-> material_type mapping"
```

---

### Task 3: `marc/serialize.ts` — resource row → MARCXML

**Files:**
- Create: `packages/server/src/marc/types.ts` (the `MarcRecord` interfaces above)
- Create: `packages/server/src/marc/serialize.ts`
- Create: `packages/server/src/marc/serialize.test.ts`

**Interfaces:**
- Consumes: `leaderFor` (Task 2); `MaterialType` from `@bookleaf/types`.
- Produces: `serializeResourceToRecord(row)`, `serializeCollection(rows)`.

- [ ] **Step 1: Create the shared MARC types file**

Create `packages/server/src/marc/types.ts`:

```ts
export interface MarcSubfield { code: string; value: string; }
export interface MarcDataField { tag: string; ind1: string; ind2: string; subfields: MarcSubfield[]; }
export interface MarcControlField { tag: string; value: string; }
export interface MarcRecord { leader: string; controlfields: MarcControlField[]; datafields: MarcDataField[]; }
```

- [ ] **Step 2: Write the failing test**

Create `packages/server/src/marc/serialize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeResourceToRecord, serializeCollection } from './serialize';

describe('serializeResourceToRecord', () => {
  it('emits 245/100/264 datafields for a book', () => {
    const xml = serializeResourceToRecord({
      material_type: 'BOOK', title: 'Hobbit & Co', subtitle: 'There', author: 'Tolkien, J.R.R.',
      publisher: 'Allen', year: 1937, isbn: '9780000000000', subject_headings: ['Fantasy'],
    });
    expect(xml).toContain('<datafield tag="245"');
    expect(xml).toContain('<subfield code="a">Hobbit &amp; Co</subfield>');
    expect(xml).toContain('<subfield code="b">There</subfield>');
    expect(xml).toContain('<datafield tag="100"');
    expect(xml).toContain('Tolkien, J.R.R.');
    expect(xml).toContain('<datafield tag="264"');
    expect(xml).toContain('<subfield code="b">Allen</subfield>');
    expect(xml).toContain('<subfield code="c">1937</subfield>');
    expect(xml).toContain('<datafield tag="650"');
    expect(xml).toContain('<leader>');
  });

  it('omits fields that are empty', () => {
    const xml = serializeResourceToRecord({ material_type: 'BOOK', title: 'T', author: '' });
    expect(xml).not.toContain('tag="100"');
    expect(xml).not.toContain('tag="020"');
  });
});

describe('serializeCollection', () => {
  it('wraps records and reports counts; empty input → empty collection', () => {
    const empty = serializeCollection([]);
    expect(empty.written).toBe(0);
    expect(empty.xml).toContain('<collection');
    const one = serializeCollection([{ material_type: 'BOOK', title: 'T', author: 'A' }]);
    expect(one.written).toBe(1);
    expect(one.xml).toContain('http://www.loc.gov/MARC21/slim');
  });
});
```

- [ ] **Step 3: Implement**

Create `packages/server/src/marc/serialize.ts`:

```ts
import type { MaterialType } from '@bookleaf/types';
import { leaderFor } from './mapping';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

interface Sub { code: string; value: string; }
function field(tag: string, ind1: string, ind2: string, subs: (Sub | null)[]): string {
  const present = subs.filter((s): s is Sub => s != null && s.value.length > 0);
  if (present.length === 0) return '';
  const inner = present.map(s => `<subfield code="${s.code}">${esc(s.value)}</subfield>`).join('');
  return `<datafield tag="${tag}" ind1="${ind1}" ind2="${ind2}">${inner}</datafield>`;
}
function sub(code: string, v: unknown): Sub | null {
  const s = str(v);
  return s == null ? null : { code, value: s };
}

export function serializeResourceToRecord(row: Record<string, unknown>): string {
  const mt = (str(row.material_type) ?? 'BOOK') as MaterialType;
  const parts: string[] = [];
  parts.push(`<leader>${leaderFor(mt)}</leader>`);
  parts.push(field('020', ' ', ' ', [sub('a', row.isbn)]));
  parts.push(field('022', ' ', ' ', [sub('a', row.issn)]));
  parts.push(field('024', '7', ' ', [sub('a', row.doi)]));
  parts.push(field('041', ' ', ' ', [sub('a', row.language)]));
  parts.push(field('082', '0', ' ', [sub('a', row.call_number)]));
  parts.push(field('100', '1', ' ', [sub('a', row.author)]));
  parts.push(field('245', '1', '0', [sub('a', row.title), sub('b', row.subtitle)]));
  parts.push(field('250', ' ', ' ', [sub('a', row.edition)]));
  parts.push(field('264', ' ', '1', [sub('b', row.publisher), sub('c', row.year)]));
  parts.push(field('310', ' ', ' ', [sub('a', row.frequency)]));
  parts.push(field('490', '0', ' ', [sub('a', row.series_title), sub('v', row.volume)]));
  parts.push(field('502', ' ', ' ', [sub('b', row.thesis_degree), sub('c', row.thesis_institution), sub('g', row.thesis_advisor)]));
  parts.push(field('520', ' ', ' ', [sub('a', row.description)]));
  parts.push(field('773', '0', ' ', [sub('t', row.container_title), sub('g', row.issue_number), sub('g', row.pages)]));
  parts.push(field('856', '4', '0', [sub('u', row.url)]));
  const subjects = Array.isArray(row.subject_headings) ? (row.subject_headings as unknown[]) : [];
  for (const s of subjects) parts.push(field('650', ' ', '0', [sub('a', s)]));
  return `<record>${parts.filter(Boolean).join('')}</record>`;
}

export function serializeCollection(rows: Record<string, unknown>[]): { xml: string; written: number; skipped: number } {
  let written = 0, skipped = 0;
  const records: string[] = [];
  for (const r of rows) {
    try { records.push(serializeResourceToRecord(r)); written += 1; }
    catch { skipped += 1; }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<collection xmlns="http://www.loc.gov/MARC21/slim">${records.join('')}</collection>`;
  return { xml, written, skipped };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/server && npx vitest run src/marc/serialize.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/marc/types.ts packages/server/src/marc/serialize.ts packages/server/src/marc/serialize.test.ts
git commit -m "feat(marc): MARCXML serializer (resource row -> record/collection)"
```

---

### Task 4: `admin.books.marcExport` tRPC endpoint

**Files:**
- Modify: `packages/server/src/router/admin/books.ts`
- Create: `packages/server/src/router/admin/books.marcExport.test.ts`

**Interfaces:**
- Consumes: `serializeCollection` (Task 3); existing `ctx.db.adminListBooks(institutionId, q)` (returns full mapped resource rows, including the new columns and parsed `subject_headings`).
- Produces: `admin.books.marcExport` query returning `{ xml: string; written: number; skipped: number }`.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/router/admin/books.marcExport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeCollection } from '../../marc/serialize';

// The endpoint is a thin wrapper over adminListBooks + serializeCollection.
// This test pins the contract of the serialization wrapper used by the endpoint.
describe('marcExport serialization contract', () => {
  it('serializes rows returned by the catalog list into a collection', () => {
    const rows = [
      { material_type: 'BOOK', title: 'A', author: 'X', subject_headings: ['S'] },
      { material_type: 'SERIAL', title: 'B', author: '', issn: '1234-5678' },
    ];
    const out = serializeCollection(rows);
    expect(out.written).toBe(2);
    expect(out.xml).toContain('1234-5678');
    expect(out.xml).toContain('<collection');
  });
});
```

(The endpoint itself is exercised end-to-end by the round-trip test in Task 14; this task verifies wiring + typecheck.)

- [ ] **Step 2: Run to verify it passes**

Run: `cd packages/server && npx vitest run src/router/admin/books.marcExport.test.ts`
Expected: PASS (it only imports `serializeCollection`).

- [ ] **Step 3: Add the endpoint**

In `packages/server/src/router/admin/books.ts`, add the import at the top:

```ts
import { serializeCollection } from '../../marc/serialize';
```

Then add this procedure inside `adminBooksRouter` (after `addCopy`):

```ts
  marcExport: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), q: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const rows = (await ctx.db.adminListBooks(input.institutionId, input.q)) as Record<string, unknown>[];
      return serializeCollection(rows);
    }),
```

- [ ] **Step 4: Typecheck + run server suite**

Run: `cd packages/server && npx tsc --noEmit 2>&1 | grep -c "error TS"` → 4.
Run: `cd packages/server && npm test` → all pass (55+).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/router/admin/books.ts packages/server/src/router/admin/books.marcExport.test.ts
git commit -m "feat(marc): admin.books.marcExport endpoint"
```

---

### Task 5: Desktop "Export MARCXML" button

**Files:**
- Modify: `apps/desktop/src/pages/Books.tsx`

**Interfaces:**
- Consumes: `admin.books.marcExport` (Task 4).

> No runtime unit test (no dialog/file harness). Verified by typecheck + manual smoke.

- [ ] **Step 1: Add the export action**

In `apps/desktop/src/pages/Books.tsx`, inside the `Books` component, add a query-client call. Add this handler near the other mutations/handlers:

```tsx
  const exportMarc = async () => {
    const trpcClient = qc; void trpcClient;
    const res = await fetchMarcExport();
    const blob = new Blob([res.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'bookleaf-export.xml';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };
```

Wire the query via the tRPC client. At the top of the component, add:

```tsx
  const trpc = useTRPC();
  // (already present) — add a one-shot fetcher:
  const fetchMarcExport = () =>
    qc.fetchQuery(trpc.admin.books.marcExport.queryOptions({ institutionId: iid, q: search }));
```

Then add the button next to "Import from file" in the header actions:

```tsx
          <Button variant="outline" size="sm" onClick={() => void exportMarc()}>Export MARCXML</Button>
```

(If `useTRPC`/`qc` are already in scope from the existing code, reuse them rather than re-declaring. Adjust to match the file's existing tRPC client access pattern — the goal is one `fetchQuery` of `marcExport` then a Blob download.)

- [ ] **Step 2: Typecheck**

Run: `cd apps/desktop && npx tsc --noEmit 2>&1 | grep -E "error TS" | wc -l` → 5 (baseline). Confirm no new error is in `Books.tsx` beyond the pre-existing one.

- [ ] **Step 3: Manual smoke (record in commit body, do not need to execute now)**

Rebuild sidecar (`cd packages/server && npm run build:desktop`) + `cd apps/desktop && pnpm tauri dev`; click "Export MARCXML" → a `bookleaf-export.xml` downloads containing a `<collection>` of the current books. (If the webview blocks the Blob download, fall back to `@tauri-apps/plugin-dialog` `save()` + adding `@tauri-apps/plugin-fs`; note this in the report.)

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/pages/Books.tsx
git commit -m "feat(desktop): Export MARCXML button on Books page"
```

---

### Task 6: `fast-xml-parser` dep + `marc/parse.ts`

**Files:**
- Modify: `packages/server/package.json` (add dependency)
- Create: `packages/server/src/marc/parse.ts`
- Create: `packages/server/src/marc/parse.test.ts`

**Interfaces:**
- Consumes: `MarcRecord` (Task 3 types).
- Produces: `parseMarcXml(xml: string): MarcRecord[]`.

- [ ] **Step 1: Add the dependency**

```bash
cd packages/server && pnpm add fast-xml-parser
```
(Verify it lands in `packages/server/package.json` dependencies; run `pnpm install` at repo root if needed.)

- [ ] **Step 2: Write the failing test**

Create `packages/server/src/marc/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseMarcXml } from './parse';

const SAMPLE = `<?xml version="1.0"?>
<collection xmlns="http://www.loc.gov/MARC21/slim">
  <record>
    <leader>00000nas a2200000zu 4500</leader>
    <controlfield tag="008">somevalue</controlfield>
    <datafield tag="245" ind1="1" ind2="0">
      <subfield code="a">The Title</subfield>
      <subfield code="b">a sub</subfield>
    </datafield>
    <datafield tag="100" ind1="1" ind2=" ">
      <subfield code="a">Doe, Jane</subfield>
    </datafield>
  </record>
</collection>`;

describe('parseMarcXml', () => {
  it('parses records, leader, controlfields, datafields and subfields', () => {
    const recs = parseMarcXml(SAMPLE);
    expect(recs).toHaveLength(1);
    expect(recs[0].leader[7]).toBe('s');
    expect(recs[0].datafields.find(d => d.tag === '245')?.subfields.map(s => s.value)).toEqual(['The Title', 'a sub']);
    expect(recs[0].datafields.find(d => d.tag === '100')?.subfields[0]).toEqual({ code: 'a', value: 'Doe, Jane' });
  });

  it('accepts a bare <record> without a collection wrapper', () => {
    const recs = parseMarcXml('<record><leader>00000nam a2200000zu 4500</leader><datafield tag="245" ind1="1" ind2="0"><subfield code="a">X</subfield></datafield></record>');
    expect(recs).toHaveLength(1);
    expect(recs[0].datafields[0].tag).toBe('245');
  });

  it('throws a clear error on malformed XML', () => {
    expect(() => parseMarcXml('<collection><record>')).toThrow(/MARCXML/i);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd packages/server && npx vitest run src/marc/parse.test.ts`
Expected: FAIL — cannot resolve `./parse`.

- [ ] **Step 4: Implement**

Create `packages/server/src/marc/parse.ts`:

```ts
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { MarcRecord, MarcDataField, MarcControlField, MarcSubfield } from './types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  isArray: (name) => ['record', 'datafield', 'subfield', 'controlfield'].includes(name),
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseMarcXml(xml: string): MarcRecord[] {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error('Could not parse MARCXML: malformed XML');
  let root: Record<string, unknown>;
  try {
    root = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new Error('Could not parse MARCXML: malformed XML');
  }
  const collection = root.collection as Record<string, unknown> | undefined;
  const recordsRaw = collection
    ? asArray(collection.record as unknown)
    : asArray(root.record as unknown);
  if (recordsRaw.length === 0) throw new Error('Could not parse MARCXML: no <record> elements found');

  return (recordsRaw as Record<string, unknown>[]).map((rec) => {
    const leader = typeof rec.leader === 'string' ? rec.leader : '';
    const controlfields: MarcControlField[] = asArray(rec.controlfield as unknown).map((c) => {
      const cf = c as Record<string, unknown>;
      return { tag: String(cf['@_tag'] ?? ''), value: String(cf['#text'] ?? '') };
    });
    const datafields: MarcDataField[] = asArray(rec.datafield as unknown).map((d) => {
      const df = d as Record<string, unknown>;
      const subfields: MarcSubfield[] = asArray(df.subfield as unknown).map((s) => {
        const sf = s as Record<string, unknown>;
        return { code: String(sf['@_code'] ?? ''), value: String(sf['#text'] ?? '') };
      });
      return {
        tag: String(df['@_tag'] ?? ''),
        ind1: String(df['@_ind1'] ?? ' '),
        ind2: String(df['@_ind2'] ?? ' '),
        subfields,
      };
    });
    return { leader, controlfields, datafields };
  });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd packages/server && npx vitest run src/marc/parse.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/server/package.json packages/server/src/marc/parse.ts packages/server/src/marc/parse.test.ts ../../pnpm-lock.yaml
git commit -m "feat(marc): MARCXML parser (fast-xml-parser)"
```

---

### Task 7: Extend `ImportRow` / `NormalizedRow` / `validateRow`

**Files:**
- Modify: `packages/types/src/import.ts` (extend `importRowSchema`)
- Modify: `packages/server/src/import/types.ts` (extend `NormalizedRow`)
- Modify: `packages/server/src/import/validate.ts`
- Modify: `packages/server/src/import/validate.test.ts` (add cases) — if no such file exists, create it.

**Interfaces:**
- Produces: `ImportRow` and `NormalizedRow` gain optional fields `issue_number`, `doi`, `url`, `frequency`, `container_title`, `pages`, `thesis_degree`, `thesis_institution`, `thesis_advisor`. `validateRow` no longer requires `author` when `material_type === 'SERIAL'`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/server/src/import/validate.test.ts` (create if absent — mirror existing imports `import { validateRow } from './validate'`):

```ts
import { describe, it, expect } from 'vitest';
import { validateRow } from './validate';

describe('validateRow material-type fields + serial author', () => {
  it('carries the new material-type fields through to the normalized row', () => {
    const v = validateRow({
      _rowIndex: 0, title: 'A', author: 'X', material_type: 'ARTICLE',
      container_title: 'J', issue_number: '3', pages: '44-58', doi: '10.1/x', url: 'http://e',
    } as never);
    expect(v.ok).toBe(true);
    expect(v.normalized?.container_title).toBe('J');
    expect(v.normalized?.pages).toBe('44-58');
    expect(v.normalized?.doi).toBe('10.1/x');
  });

  it('allows an empty author for SERIAL', () => {
    const v = validateRow({ _rowIndex: 1, title: 'Journal', author: '', material_type: 'SERIAL', frequency: 'Monthly' } as never);
    expect(v.ok).toBe(true);
    expect(v.normalized?.author).toBe('');
    expect(v.normalized?.frequency).toBe('Monthly');
  });

  it('still requires author for non-serials', () => {
    const v = validateRow({ _rowIndex: 2, title: 'Book', author: '', material_type: 'BOOK' } as never);
    expect(v.ok).toBe(false);
    expect(v.reasons).toContain('Missing author');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/server && npx vitest run src/import/validate.test.ts`
Expected: FAIL — new fields undefined on normalized; SERIAL-empty-author currently invalid.

- [ ] **Step 3: Extend `importRowSchema`**

In `packages/types/src/import.ts`, add these optional fields to `importRowSchema` (before `_rowIndex`):

```ts
  issue_number: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  frequency: z.string().optional(),
  container_title: z.string().optional(),
  pages: z.string().optional(),
  thesis_degree: z.string().optional(),
  thesis_institution: z.string().optional(),
  thesis_advisor: z.string().optional(),
```

- [ ] **Step 4: Extend `NormalizedRow`**

In `packages/server/src/import/types.ts`, add to the `NormalizedRow` interface (after `subject_headings`):

```ts
  issue_number: string | null;
  doi: string | null;
  url: string | null;
  frequency: string | null;
  container_title: string | null;
  pages: string | null;
  thesis_degree: string | null;
  thesis_institution: string | null;
  thesis_advisor: string | null;
```

- [ ] **Step 5: Update `validateRow`**

In `packages/server/src/import/validate.ts`: first compute `material_type` BEFORE the author check, and make author conditional. Replace the author guard:

```ts
  if (author.length === 0) {
    return { rowIndex: input._rowIndex, ok: false, normalized: null, reasons: ['Missing author'] };
  }
```

with:

```ts
  const material_type = coerceMaterialType(input.material_type, reasons);
  if (author.length === 0 && material_type !== 'SERIAL') {
    return { rowIndex: input._rowIndex, ok: false, normalized: null, reasons: ['Missing author'] };
  }
```

Then in the `normalized` object, replace `material_type: coerceMaterialType(input.material_type, reasons),` with `material_type,` and append the new fields:

```ts
    issue_number: trimOrNull(input.issue_number),
    doi: trimOrNull(input.doi),
    url: trimOrNull(input.url),
    frequency: trimOrNull(input.frequency),
    container_title: trimOrNull(input.container_title),
    pages: trimOrNull(input.pages),
    thesis_degree: trimOrNull(input.thesis_degree),
    thesis_institution: trimOrNull(input.thesis_institution),
    thesis_advisor: trimOrNull(input.thesis_advisor),
```

- [ ] **Step 6: Run to verify it passes + full suite**

Run: `cd packages/server && npx vitest run src/import/validate.test.ts` → PASS.
Run: `cd packages/server && npm test` → all pass (existing import tests must remain green; CSV rows simply have the new fields as `null`).

- [ ] **Step 7: Commit**

```bash
git add packages/types/src/import.ts packages/server/src/import/types.ts packages/server/src/import/validate.ts packages/server/src/import/validate.test.ts
git commit -m "feat(import): carry material-type fields; allow empty author for SERIAL"
```

---

### Task 8: `marc/toRows.ts` — MARC record → ImportRow

**Files:**
- Create: `packages/server/src/marc/toRows.ts`
- Create: `packages/server/src/marc/toRows.test.ts`

**Interfaces:**
- Consumes: `MarcRecord` (Task 3), `materialTypeFromLeader` (Task 2), `ImportRow` (Task 7-extended).
- Produces: `marcRecordToRow(rec: MarcRecord, rowIndex: number): ImportRow`.

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/marc/toRows.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { marcRecordToRow } from './toRows';
import type { MarcRecord } from './types';

const rec = (leader: string, fields: [string, [string, string][]][]): MarcRecord => ({
  leader,
  controlfields: [],
  datafields: fields.map(([tag, subs]) => ({ tag, ind1: ' ', ind2: ' ', subfields: subs.map(([code, value]) => ({ code, value })) })),
});

describe('marcRecordToRow', () => {
  it('maps title/author/publisher/subjects and detects BOOK', () => {
    const r = marcRecordToRow(rec('00000nam a2200000zu 4500', [
      ['245', [['a', 'The Title'], ['b', 'sub']]],
      ['100', [['a', 'Doe, Jane']]],
      ['264', [['b', 'Acme'], ['c', '2001']]],
      ['650', [['a', 'History']]],
      ['650', [['a', 'War']]],
    ]), 5);
    expect(r._rowIndex).toBe(5);
    expect(r.title).toBe('The Title');
    expect(r.subtitle).toBe('sub');
    expect(r.author).toBe('Doe, Jane');
    expect(r.publisher).toBe('Acme');
    expect(r.year).toBe('2001');
    expect(r.material_type).toBe('BOOK');
    expect(r.subject_headings).toBe('History;War');
  });

  it('detects THESIS from a 502 and maps thesis subfields', () => {
    const r = marcRecordToRow(rec('00000nam a2200000zu 4500', [
      ['245', [['a', 'A Dissertation']]],
      ['100', [['a', 'Roe, Sam']]],
      ['502', [['b', 'PhD'], ['c', 'State U'], ['g', 'Dr. Adviser']]],
    ]), 0);
    expect(r.material_type).toBe('THESIS');
    expect(r.thesis_degree).toBe('PhD');
    expect(r.thesis_institution).toBe('State U');
    expect(r.thesis_advisor).toBe('Dr. Adviser');
  });

  it('detects SERIAL and leaves author empty', () => {
    const r = marcRecordToRow(rec('00000nas a2200000zu 4500', [
      ['245', [['a', 'A Journal']]],
      ['022', [['a', '1234-5678']]],
      ['310', [['a', 'Monthly']]],
    ]), 0);
    expect(r.material_type).toBe('SERIAL');
    expect(r.author).toBe('');
    expect(r.issn).toBe('1234-5678');
    expect(r.frequency).toBe('Monthly');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/server && npx vitest run src/marc/toRows.test.ts`
Expected: FAIL — cannot resolve `./toRows`.

- [ ] **Step 3: Implement**

Create `packages/server/src/marc/toRows.ts`:

```ts
import type { ImportRow } from '@bookleaf/types';
import type { MarcRecord } from './types';
import { materialTypeFromLeader } from './mapping';

function sf(rec: MarcRecord, tag: string, code: string): string | undefined {
  for (const d of rec.datafields) {
    if (d.tag !== tag) continue;
    const s = d.subfields.find(x => x.code === code);
    if (s && s.value.trim().length > 0) return s.value.trim();
  }
  return undefined;
}

function year(rec: MarcRecord): string | undefined {
  const raw = sf(rec, '264', 'c') ?? sf(rec, '260', 'c');
  if (!raw) return undefined;
  const m = raw.match(/\d{4}/);
  return m ? m[0] : undefined;
}

export function marcRecordToRow(rec: MarcRecord, rowIndex: number): ImportRow {
  const has = (tag: string) => rec.datafields.some(d => d.tag === tag);
  const material_type = materialTypeFromLeader(rec.leader, has);

  const subjects = rec.datafields
    .filter(d => d.tag === '650')
    .map(d => d.subfields.find(s => s.code === 'a')?.value.trim())
    .filter((v): v is string => !!v);

  return {
    _rowIndex: rowIndex,
    title: sf(rec, '245', 'a') ?? '',
    subtitle: sf(rec, '245', 'b'),
    author: sf(rec, '100', 'a') ?? sf(rec, '110', 'a') ?? '',
    publisher: sf(rec, '264', 'b') ?? sf(rec, '260', 'b'),
    year: year(rec),
    edition: sf(rec, '250', 'a'),
    isbn: sf(rec, '020', 'a'),
    issn: sf(rec, '022', 'a'),
    genre: sf(rec, '655', 'a'),
    series_title: sf(rec, '490', 'a'),
    volume: sf(rec, '490', 'v'),
    language: sf(rec, '041', 'a'),
    call_number: sf(rec, '082', 'a') ?? sf(rec, '050', 'a'),
    call_number_type: sf(rec, '082', 'a') ? 'DEWEY' : (sf(rec, '050', 'a') ? 'LC' : undefined),
    material_type,
    subject_headings: subjects.length > 0 ? subjects.join(';') : undefined,
    description: sf(rec, '520', 'a'),
    frequency: sf(rec, '310', 'a'),
    container_title: sf(rec, '773', 't'),
    issue_number: undefined,
    pages: sf(rec, '300', 'a'),
    doi: sf(rec, '024', 'a'),
    url: sf(rec, '856', 'u'),
    thesis_degree: sf(rec, '502', 'b'),
    thesis_institution: sf(rec, '502', 'c'),
    thesis_advisor: sf(rec, '502', 'g'),
  };
}
```

(Note: the three `773$g` values cannot be split back reliably from one repeated subfield; on import we take `300$a` for `pages` and leave `issue_number` empty — documented v1 boundary. Export still emits them.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd packages/server && npx vitest run src/marc/toRows.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/marc/toRows.ts packages/server/src/marc/toRows.test.ts
git commit -m "feat(marc): map MARC record to import row (+ leader material-type)"
```

---

### Task 9: Persist new material-type columns in `adminBulkImport`

**Files:**
- Modify: `packages/server/src/adapter/sqlite.ts` (`adminBulkImport`, ~lines 689-757)
- Create/Modify: `packages/server/src/adapter/sqlite.import.test.ts` (add a case) — if the file exists, extend it; otherwise create following the harness in `sqlite.authorities.test.ts`.

**Interfaces:**
- Consumes: `NormalizedRow` with the new fields (Task 7).
- Produces: `adminBulkImport` writes `frequency`, `container_title`, `pages`, `thesis_degree`, `thesis_institution`, `thesis_advisor`, `issue_number`, `doi`, `url`.

- [ ] **Step 1: Write the failing test**

Add to `packages/server/src/adapter/sqlite.import.test.ts` (use the same `migrationSqls()`/`__seedTestInstitution()` harness as `sqlite.authorities.test.ts`):

```ts
it('persists new material-type fields through bulk import', async () => {
  const plan = {
    creates: [{
      rowIndex: 0, title: 'Thesis One', author: 'Roe, Sam', isbn: null, isbnKey: null, issn: null,
      publisher: null, year: 2020, genre: null, description: null, subtitle: null, edition: null,
      volume: null, series_title: null, language: null, call_number: null, call_number_type: null,
      material_type: 'THESIS', subject_headings: null, copies: 1, accession_number: null, barcode: null,
      shelf_location: null, issue_number: null, doi: null, url: null, frequency: null,
      container_title: null, pages: null, thesis_degree: 'PhD', thesis_institution: 'State U', thesis_advisor: 'Adviser',
    }],
    copyAdds: [],
  };
  const res = await db.adminBulkImport(iid, plan as never, {
    institutionId: iid, importedByUserId: 0, filename: 'x', duplicateStrategy: 'skip',
    rowCount: 1, createdCount: 0, copiesAddedCount: 0, skippedCount: 0,
  } as never);
  expect(res.created).toBe(1);
  const books = await db.adminListBooks(iid) as Record<string, unknown>[];
  const t = books.find(b => b.title === 'Thesis One')!;
  expect(t.thesis_degree).toBe('PhD');
  expect(t.thesis_institution).toBe('State U');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/server && npx vitest run src/adapter/sqlite.import.test.ts`
Expected: FAIL — `thesis_degree` reads back `null`/`undefined` (not inserted).

- [ ] **Step 3: Extend the INSERT**

In `adminBulkImport`, extend the `insertResource` prepared SQL column list + VALUES to include the new columns, and pass them in the `.run({...})` call:

Add to the column list (after `subject_headings`): `issue_number, doi, url, frequency, container_title, pages, thesis_degree, thesis_institution, thesis_advisor,` and matching `@issue_number, @doi, @url, @frequency, @container_title, @pages, @thesis_degree, @thesis_institution, @thesis_advisor,` in VALUES (before `total_copies`).

Add to the `.run({...})` object (after `subject_headings: serializeSubjectHeadings(n.subject_headings),`):

```ts
            issue_number: n.issue_number, doi: n.doi, url: n.url, frequency: n.frequency,
            container_title: n.container_title, pages: n.pages,
            thesis_degree: n.thesis_degree, thesis_institution: n.thesis_institution, thesis_advisor: n.thesis_advisor,
```

- [ ] **Step 4: Run to verify it passes + full suite**

Run: `cd packages/server && npx vitest run src/adapter/sqlite.import.test.ts` → PASS.
Run: `cd packages/server && npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/adapter/sqlite.ts packages/server/src/adapter/sqlite.import.test.ts
git commit -m "feat(import): persist material-type fields in bulk import"
```

---

### Task 10: `linkAuthorities` flag + authority get-or-create in `adminBulkImport`

**Files:**
- Modify: `packages/server/src/import/types.ts` (`ImportJobInput` gains `linkAuthorities?: boolean`)
- Modify: `packages/server/src/adapter/sqlite.ts` (`adminBulkImport`)
- Modify: `packages/server/src/adapter/sqlite.import.test.ts` (add cases)

**Interfaces:**
- Consumes: `normalizeAuthorityName` (already imported in `sqlite.ts`), the `authority_names` and `resource_subjects` tables.
- Produces: when `job.linkAuthorities === true`, each created resource gets `author_authority_id` (type `personal`), `publisher_authority_id` (type `publisher`), and one `resource_subjects` link per subject heading (type `subject`), all via get-or-create; denormalized text already stored. When falsy, no linking (CSV parity).

- [ ] **Step 1: Add the flag to the job type**

In `packages/server/src/import/types.ts`, add to `ImportJobInput`:

```ts
  linkAuthorities?: boolean;
```

- [ ] **Step 2: Write the failing test**

Add to `sqlite.import.test.ts`:

```ts
it('links authorities when linkAuthorities is true', async () => {
  const base = {
    rowIndex: 0, title: 'Linked', author: 'Tolkien, J.R.R.', isbn: null, isbnKey: null, issn: null,
    publisher: 'Allen', year: null, genre: null, description: null, subtitle: null, edition: null,
    volume: null, series_title: null, language: null, call_number: null, call_number_type: null,
    material_type: 'BOOK', subject_headings: ['Fantasy', 'Adventure'], copies: 1, accession_number: null,
    barcode: null, shelf_location: null, issue_number: null, doi: null, url: null, frequency: null,
    container_title: null, pages: null, thesis_degree: null, thesis_institution: null, thesis_advisor: null,
  };
  await db.adminBulkImport(iid, { creates: [base], copyAdds: [] } as never, {
    institutionId: iid, importedByUserId: 0, filename: 'x', duplicateStrategy: 'skip',
    rowCount: 1, createdCount: 0, copiesAddedCount: 0, skippedCount: 0, linkAuthorities: true,
  } as never);
  const authors = await db.adminListAuthorities(iid, { type: 'personal' });
  expect(authors.map(a => a.name)).toContain('Tolkien, J.R.R.');
  const publishers = await db.adminListAuthorities(iid, { type: 'publisher' });
  expect(publishers.map(a => a.name)).toContain('Allen');
  const subjects = await db.adminListAuthorities(iid, { type: 'subject' });
  expect(subjects.map(a => a.name).sort()).toEqual(['Adventure', 'Fantasy']);
});

it('does NOT create authorities when linkAuthorities is falsy (CSV parity)', async () => {
  const base = {
    rowIndex: 0, title: 'Unlinked', author: 'Nobody', isbn: null, isbnKey: null, issn: null,
    publisher: 'NoPub', year: null, genre: null, description: null, subtitle: null, edition: null,
    volume: null, series_title: null, language: null, call_number: null, call_number_type: null,
    material_type: 'BOOK', subject_headings: ['Misc'], copies: 1, accession_number: null,
    barcode: null, shelf_location: null, issue_number: null, doi: null, url: null, frequency: null,
    container_title: null, pages: null, thesis_degree: null, thesis_institution: null, thesis_advisor: null,
  };
  await db.adminBulkImport(iid, { creates: [base], copyAdds: [] } as never, {
    institutionId: iid, importedByUserId: 0, filename: 'x', duplicateStrategy: 'skip',
    rowCount: 1, createdCount: 0, copiesAddedCount: 0, skippedCount: 0,
  } as never);
  const authors = await db.adminListAuthorities(iid, { type: 'personal' });
  expect(authors.map(a => a.name)).not.toContain('Nobody');
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd packages/server && npx vitest run src/adapter/sqlite.import.test.ts`
Expected: FAIL — authorities not created when `linkAuthorities` true.

- [ ] **Step 4: Implement authority linking inside the transaction**

In `adminBulkImport`, inside the `rawDb.transaction(() => { ... })`, before the `for (const n of plan.creates)` loop, add synchronous get-or-create prepared statements + helpers:

```ts
        const link = job.linkAuthorities === true;
        const findAuth = rawDb.prepare(
          'SELECT id FROM authority_names WHERE institution_id = ? AND name_type = ? AND normalized_name = ?',
        );
        const insAuth = rawDb.prepare(
          'INSERT INTO authority_names (institution_id, name, name_type, normalized_name) VALUES (?, ?, ?, ?)',
        );
        const setAuthorAuth = rawDb.prepare('UPDATE resources SET author_authority_id = ? WHERE id = ?');
        const setPublisherAuth = rawDb.prepare('UPDATE resources SET publisher_authority_id = ? WHERE id = ?');
        const insSubjectLink = rawDb.prepare('INSERT INTO resource_subjects (resource_id, authority_id) VALUES (?, ?)');
        const getOrCreateAuthority = (name: string, type: string): number => {
          const norm = normalizeAuthorityName(name);
          const found = findAuth.get(institutionId, type, norm) as { id: number } | undefined;
          if (found) return found.id;
          return Number(insAuth.run(institutionId, name.trim(), type, norm).lastInsertRowid);
        };
```

Then inside the `for (const n of plan.creates)` loop, after `const resourceId = Number(r.lastInsertRowid);` and the copy-insert block, add:

```ts
          if (link) {
            if (n.author && n.author.trim()) setAuthorAuth.run(getOrCreateAuthority(n.author, 'personal'), resourceId);
            if (n.publisher && n.publisher.trim()) setPublisherAuth.run(getOrCreateAuthority(n.publisher, 'publisher'), resourceId);
            for (const s of n.subject_headings ?? []) {
              if (s && s.trim()) insSubjectLink.run(resourceId, getOrCreateAuthority(s, 'subject'));
            }
          }
```

(`normalizeAuthorityName` is already imported at the top of `sqlite.ts` from Slice 1. If not, add `import { normalizeAuthorityName } from '../authorities/normalize';`.)

- [ ] **Step 5: Run to verify it passes + full suite**

Run: `cd packages/server && npx vitest run src/adapter/sqlite.import.test.ts` → PASS.
Run: `cd packages/server && npm test` → all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/import/types.ts packages/server/src/adapter/sqlite.ts packages/server/src/adapter/sqlite.import.test.ts
git commit -m "feat(import): auto-link authorities on import when linkAuthorities is set"
```

---

### Task 11: `admin.books.marcImportPreview` endpoint

**Files:**
- Modify: `packages/server/src/import/service.ts` (thread `linkAuthorities` through preview → session → commit)
- Modify: `packages/server/src/import/session.ts` (`SessionPayload` gains `linkAuthorities?: boolean`)
- Modify: `packages/server/src/router/admin/books.ts` (new endpoint + input schema)
- Create: `packages/server/src/router/admin/books.marcImport.test.ts`

**Interfaces:**
- Consumes: `parseMarcXml` (Task 6), `marcRecordToRow` (Task 8), existing import service.
- Produces: `admin.books.marcImportPreview({ institutionId, xml })` → `ImportPreviewResult` (same shape as CSV preview), session created with `linkAuthorities: true`.

- [ ] **Step 1: Thread `linkAuthorities` through the service + session**

In `packages/server/src/import/session.ts`, add to `SessionPayload`:

```ts
  linkAuthorities?: boolean;
```

In `packages/server/src/import/service.ts`:
- Change the `preview` signature to accept an options arg:
  ```ts
  preview(institutionId: number, rows: ImportRow[], opts?: { linkAuthorities?: boolean }): Promise<ImportPreviewResult>;
  ```
- In the `preview` implementation, pass it into the session create:
  ```ts
  const sessionId = sessions.create({ institutionId, norms, verdicts, linkAuthorities: opts?.linkAuthorities ?? false });
  ```
- In `commit`, pass it into the job:
  ```ts
  const result = await repo.commit(payload.institutionId, plan, {
    /* ...existing fields... */
    linkAuthorities: payload.linkAuthorities ?? false,
  });
  ```

(The existing CSV `preview(institutionId, rows)` calls keep working — `opts` is optional, defaulting to `false`.)

- [ ] **Step 2: Write the failing endpoint test**

Create `packages/server/src/router/admin/books.marcImport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseMarcXml } from '../../marc/parse';
import { marcRecordToRow } from '../../marc/toRows';

// Pins the parse → toRows wiring the endpoint relies on.
describe('marc import wiring', () => {
  it('parses MARCXML into import rows', () => {
    const xml = `<collection xmlns="http://www.loc.gov/MARC21/slim"><record>
      <leader>00000nam a2200000zu 4500</leader>
      <datafield tag="245" ind1="1" ind2="0"><subfield code="a">T</subfield></datafield>
      <datafield tag="100" ind1="1" ind2=" "><subfield code="a">Doe, Jane</subfield></datafield>
    </record></collection>`;
    const rows = parseMarcXml(xml).map((r, i) => marcRecordToRow(r, i));
    expect(rows[0].title).toBe('T');
    expect(rows[0].author).toBe('Doe, Jane');
  });
});
```

- [ ] **Step 3: Run to verify it passes (wiring)**

Run: `cd packages/server && npx vitest run src/router/admin/books.marcImport.test.ts`
Expected: PASS.

- [ ] **Step 4: Add the endpoint**

In `packages/server/src/router/admin/books.ts`, add imports:

```ts
import { parseMarcXml } from '../../marc/parse';
import { marcRecordToRow } from '../../marc/toRows';
```

Add the procedure (reuse the existing `importSessions` store + `createImportService`/`ImportRepo` already wired in this file for CSV):

```ts
  marcImportPreview: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), xml: z.string() }))
    .mutation(async ({ input, ctx }) => {
      let rows;
      try {
        rows = parseMarcXml(input.xml).map((r, i) => marcRecordToRow(r, i));
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Could not parse MARCXML' });
      }
      const repo: ImportRepo = {
        loadContext: (iid) => ctx.db.adminLoadImportContext(iid),
        commit: (iid, plan, job) => ctx.db.adminBulkImport(iid, plan, job),
      };
      const svc = createImportService(repo, importSessions);
      try {
        return await svc.preview(input.institutionId, rows, { linkAuthorities: true });
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Preview failed' });
      }
    }),
```

- [ ] **Step 5: Typecheck + full suite**

Run: `cd packages/server && npx tsc --noEmit 2>&1 | grep -c "error TS"` → 4.
Run: `cd packages/server && npm test` → all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/import/service.ts packages/server/src/import/session.ts packages/server/src/router/admin/books.ts packages/server/src/router/admin/books.marcImport.test.ts
git commit -m "feat(marc): marcImportPreview endpoint + linkAuthorities threading"
```

---

### Task 12: `admin.books.marcImportCommit` endpoint

**Files:**
- Modify: `packages/server/src/router/admin/books.ts`

**Interfaces:**
- Consumes: the import service `commit` (now linkAuthorities-aware via the session, Task 11).
- Produces: `admin.books.marcImportCommit` reusing `importCommitInput` (same shape as CSV commit).

- [ ] **Step 1: Add the endpoint**

In `packages/server/src/router/admin/books.ts`, add `marcImportCommit` — identical to the existing CSV `importCommit` procedure (it resolves the session, which already carries `linkAuthorities`, and injects the authenticated user). Reuse the existing `importCommitInput`:

```ts
  marcImportCommit: librarianProcedure
    .input(importCommitInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.principal.user_id;
      const repo: ImportRepo = {
        loadContext: (iid) => ctx.db.adminLoadImportContext(iid),
        commit: (iid, plan, job) => ctx.db.adminBulkImport(iid, plan, { ...job, importedByUserId: userId }),
      };
      const svc = createImportService(repo, importSessions);
      try {
        const { _institutionId, ...result } = await svc.commit(input.sessionId, input.duplicateStrategy, input.filename);
        void _institutionId;
        return result;
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Import failed' });
      }
    }),
```

(`importCommitInput`, `createImportService`, `ImportRepo`, `importSessions`, and `TRPCError` are already imported/declared in this file from the CSV importer.)

- [ ] **Step 2: Typecheck + full suite**

Run: `cd packages/server && npx tsc --noEmit 2>&1 | grep -c "error TS"` → 4.
Run: `cd packages/server && npm test` → all pass.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/router/admin/books.ts
git commit -m "feat(marc): marcImportCommit endpoint"
```

---

### Task 13: Desktop — `.xml` import in `ImportBooks.tsx`

**Files:**
- Modify: `apps/desktop/src/pages/ImportBooks.tsx`

**Interfaces:**
- Consumes: `admin.books.marcImportPreview`, `admin.books.marcImportCommit` (Tasks 11-12).

> No runtime unit test (no file/dialog harness). Verified by typecheck + manual smoke.

- [ ] **Step 1: Accept `.xml` and route MARC files to a dedicated preview path**

In `apps/desktop/src/pages/ImportBooks.tsx`:
- Add the MARC mutations near the existing ones:
  ```tsx
  const marcPreviewMut = useMutation(trpc.admin.books.marcImportPreview.mutationOptions());
  const marcCommitMut = useMutation(trpc.admin.books.marcImportCommit.mutationOptions());
  ```
- Add `.xml` to the file input `accept`: `accept=".csv,.xlsx,.xml"`.
- In the file-handling (`onFile`), branch on extension: when the file name ends with `.xml`, read text and run the MARC preview, skipping the column-mapping step:
  ```tsx
  if (f.name.toLowerCase().endsWith('.xml')) {
    const xml = await f.text();
    const result = await marcPreviewMut.mutateAsync({ institutionId: iid, xml });
    setSessionId(result.sessionId); setStats(result.stats); setVerdicts(result.verdicts);
    setIsMarc(true); setStep('preview');
    return;
  }
  ```
  (Use whatever state setters the existing preview step uses — `setSessionId`/`setStats`/`setStep` etc. Add an `isMarc` boolean state, default false.)
- On commit, call the MARC commit when `isMarc`:
  ```tsx
  const commit = () => (isMarc ? marcCommitMut : commitMut).mutateAsync({ sessionId, duplicateStrategy: strategy, filename });
  ```
  (Adapt to the existing commit handler's exact shape; the goal is: MARC files use `marcImportCommit`, CSV/XLSX keep the existing path.)
- Add a helper line under the upload prompt: `<p className="text-sm text-muted-foreground">MARCXML (.xml) records import directly — no column mapping needed.</p>`

- [ ] **Step 2: Typecheck**

Run: `cd apps/desktop && npx tsc --noEmit 2>&1 | grep -E "error TS" | wc -l` → 5 (baseline). Confirm no new error is in `ImportBooks.tsx`.

- [ ] **Step 3: Manual smoke (record in commit body)**

Rebuild sidecar + `pnpm tauri dev`; upload a small MARCXML file (e.g. one exported via Task 5) → preview shows verdicts/stats with no mapping step → Commit → records appear in Books; open an imported book and confirm author/publisher/subjects are authority-linked.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/pages/ImportBooks.tsx
git commit -m "feat(desktop): MARCXML import path in ImportBooks"
```

---

### Task 14: Round-trip test + authority-link round-trip

**Files:**
- Create: `packages/server/src/marc/roundtrip.test.ts`

**Interfaces:**
- Consumes: `serializeResourceToRecord` (Task 3), `parseMarcXml` (Task 6), `marcRecordToRow` (Task 8).

- [ ] **Step 1: Write the round-trip test**

Create `packages/server/src/marc/roundtrip.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeResourceToRecord } from './serialize';
import { parseMarcXml } from './parse';
import { marcRecordToRow } from './toRows';

function roundtrip(row: Record<string, unknown>) {
  const xml = `<collection xmlns="http://www.loc.gov/MARC21/slim">${serializeResourceToRecord(row)}</collection>`;
  return marcRecordToRow(parseMarcXml(xml)[0], 0);
}

describe('serialize → parse → toRows round-trip', () => {
  it('preserves a book', () => {
    const r = roundtrip({ material_type: 'BOOK', title: 'Hobbit & Co', subtitle: 'There', author: 'Tolkien, J.R.R.', publisher: 'Allen', year: 1937, isbn: '9780000000000', subject_headings: ['Fantasy', 'Adventure'] });
    expect(r.material_type).toBe('BOOK');
    expect(r.title).toBe('Hobbit & Co');
    expect(r.subtitle).toBe('There');
    expect(r.author).toBe('Tolkien, J.R.R.');
    expect(r.publisher).toBe('Allen');
    expect(r.year).toBe('1937');
    expect(r.isbn).toBe('9780000000000');
    expect(r.subject_headings).toBe('Fantasy;Adventure');
  });

  it('preserves a serial (no author) and a thesis (502 → THESIS)', () => {
    const s = roundtrip({ material_type: 'SERIAL', title: 'J', author: '', issn: '1234-5678', frequency: 'Monthly' });
    expect(s.material_type).toBe('SERIAL');
    expect(s.author).toBe('');
    expect(s.frequency).toBe('Monthly');
    const t = roundtrip({ material_type: 'THESIS', title: 'D', author: 'Roe, Sam', thesis_degree: 'PhD', thesis_institution: 'State U' });
    expect(t.material_type).toBe('THESIS');
    expect(t.thesis_degree).toBe('PhD');
  });
});
```

- [ ] **Step 2: Run to verify it passes**

Run: `cd packages/server && npx vitest run src/marc/roundtrip.test.ts`
Expected: PASS. (If a field fails to round-trip, fix the serialize/toRows mapping for that field — the round-trip is the headline correctness guarantee.)

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/marc/roundtrip.test.ts
git commit -m "test(marc): serialize/parse/toRows round-trip"
```

---

### Task 15: Regression pass

**Files:** none (verification only).

- [ ] **Step 1: Full server suite**

Run: `cd packages/server && npm test`
Expected: all PASS (54 prior + new MARC/import tests).

- [ ] **Step 2: Desktop tests + typecheck**

Run: `cd apps/desktop && npx vitest run src/lib/materialFields.test.ts src/lib/materialFields.marc.test.ts src/lib/materialFormSchema.test.ts` → all PASS.
Run: `cd apps/desktop && npx tsc --noEmit 2>&1 | grep -c "error TS"` → 5.

- [ ] **Step 3: Server + types + db typechecks**

Run: `cd packages/server && npx tsc --noEmit 2>&1 | grep -c "error TS"` → 4.
Run: `cd packages/types && npx tsc --noEmit` → clean.
Run: `cd packages/db && npx tsc --noEmit` → clean.

- [ ] **Step 4: Prove no mobile changes**

Run: `git diff --name-only master...HEAD -- apps/server`
Expected: empty output.

- [ ] **Step 5: Commit (if any fixups were needed)**

```bash
git add -A
git commit -m "chore(marc): regression fixups" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- MARCXML serialize → Tasks 3 (serialize), 4 (export endpoint), 5 (desktop button).
- MARCXML parse → Task 6.
- Field↔tag mapping single source → Task 1 (`FIELD_MARC_TAGS`) + Task 2 (leader) + used by serialize/toRows.
- Leader↔material_type both directions → Task 2; round-trip → Task 14.
- Auto-link authorities on import → Task 10 (+ flag threaded in 11).
- CSV parity (no linking) → Task 10 negative test.
- Material-type fields round-trip on import → Tasks 7 (validate), 8 (toRows), 9 (persist).
- SERIAL empty-author convention → Task 7.
- Import reuses dedup/strategy/session → Tasks 11-12 (reuse service).
- Export = current view (`q`) as one collection → Task 4 (reuses `adminListBooks(q)`).
- Bibliographic-only export, lossy unmapped fields → documented in Tasks 3/8.
- Error handling (malformed XML, row-level, empty export) → Tasks 6 (throw), 4/3 (empty collection), pipeline verdicts (7).
- Desktop-only / mobile untouched → Global Constraints + Task 15 Step 4.

**Placeholder scan:** none — every code step shows complete code.

**Type consistency:** `FIELD_MARC_TAGS`, `MarcRecord`/`MarcDataField`/`MarcSubfield`, `materialTypeFromLeader`/`leaderFor`, `parseMarcXml`, `marcRecordToRow`, `serializeResourceToRecord`/`serializeCollection`, `linkAuthorities` (on `SessionPayload` + `ImportJobInput`), and the extended `ImportRow`/`NormalizedRow` field names are defined once and used consistently across tasks. The `marcImportPreview`/`marcImportCommit`/`marcExport` endpoint names match between server (Tasks 4/11/12) and desktop (Tasks 5/13).
