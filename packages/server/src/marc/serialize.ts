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
  parts.push(field('024', ' ', ' ', [sub('a', row.doi)]));
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
