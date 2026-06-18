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
