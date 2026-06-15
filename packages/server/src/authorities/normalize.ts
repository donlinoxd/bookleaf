/**
 * Canonical dedupe key for an authority record's preferred name.
 * Trims, collapses internal whitespace, applies Unicode NFC, lowercases.
 * The display name (stored separately) preserves the librarian's casing.
 * Personal names are NOT reordered to "Last, First" — they are stored as entered.
 */
export function normalizeAuthorityName(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
