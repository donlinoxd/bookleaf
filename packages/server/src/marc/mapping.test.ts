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
