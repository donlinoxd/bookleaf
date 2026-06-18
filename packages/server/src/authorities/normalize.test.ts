import { describe, it, expect } from 'vitest';
import { normalizeAuthorityName } from './normalize';

describe('normalizeAuthorityName', () => {
  it('trims and lowercases', () => {
    expect(normalizeAuthorityName('  Tolkien  ')).toBe('tolkien');
  });
  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeAuthorityName('Tolkien,   J.R.R.')).toBe('tolkien, j.r.r.');
  });
  it('normalizes tabs and newlines to spaces', () => {
    expect(normalizeAuthorityName('Foo\t\nBar')).toBe('foo bar');
  });
  it('applies Unicode NFC so composed/decomposed forms match', () => {
    const composed = 'Émile';          // U+00C9 É
    const decomposed = 'Émile';      // E + combining acute U+0301
    expect(normalizeAuthorityName(composed)).toBe(normalizeAuthorityName(decomposed));
  });
  it('returns empty string for whitespace-only input', () => {
    expect(normalizeAuthorityName('   ')).toBe('');
  });
});
