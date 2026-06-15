/** Strip to bare digits (keeping a trailing X for ISBN-10), upper-cased. */
function clean(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

function isValidIsbn13(s: string): boolean {
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
  return sum % 10 === 0;
}

function isValidIsbn10(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = s[i];
    const v = c === 'X' ? 10 : Number(c);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

function isbn10to13(s: string): string {
  const core = '978' + s.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return core + String(check);
}

/**
 * Normalize an ISBN to canonical ISBN-13 digits, or null if it is not a
 * structurally valid ISBN-10/13. Used as the deduplication key.
 */
export function normalizeIsbn(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const s = clean(raw);
  if (isValidIsbn13(s)) return s;
  if (isValidIsbn10(s)) return isbn10to13(s);
  return null;
}
