import { describe, it, expect } from 'vitest';
import { normalizeIsbn } from './isbn';

describe('normalizeIsbn', () => {
  it('strips hyphens and spaces from a valid ISBN-13', () => {
    expect(normalizeIsbn('978-0-596-52068-7')).toBe('9780596520687');
  });

  it('converts a valid ISBN-10 to ISBN-13', () => {
    expect(normalizeIsbn('0-596-52068-9')).toBe('9780596520687');
  });

  it('treats an ISBN-10 with X check digit', () => {
    expect(normalizeIsbn('080442957X')).toBe('9780804429573');
  });

  it('returns null for a malformed ISBN', () => {
    expect(normalizeIsbn('not-an-isbn')).toBeNull();
    expect(normalizeIsbn('1234567890')).toBeNull(); // bad checksum
    expect(normalizeIsbn('')).toBeNull();
    expect(normalizeIsbn(undefined)).toBeNull();
  });
});
