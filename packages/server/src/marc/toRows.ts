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
