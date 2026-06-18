import { describe, it, expect } from 'vitest';
import { CALL_NUMBER_TYPES } from '@bookleaf/types';
import { MATERIAL_FIELDS, GENERIC_FIELDS, fieldsFor } from './materialFields';

const IN_SCOPE = ['BOOK', 'SERIAL', 'ARTICLE', 'THESIS'] as const;

describe('materialFields config', () => {
  it('defines a field set for every in-scope type', () => {
    for (const t of IN_SCOPE) expect(MATERIAL_FIELDS[t], t).toBeDefined();
  });

  it('every in-scope type requires a Title field', () => {
    for (const t of IN_SCOPE) {
      const title = MATERIAL_FIELDS[t]!.find(f => f.key === 'title');
      expect(title, t).toBeDefined();
      expect(title!.required, t).toBe(true);
    }
  });

  it('has no duplicate field keys within any type or the generic set', () => {
    const sets = [...Object.values(MATERIAL_FIELDS), GENERIC_FIELDS];
    for (const fields of sets) {
      const keys = fields!.map(f => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('every bibliographic descriptor has a non-empty marc tag', () => {
    const all = [...Object.values(MATERIAL_FIELDS).flat(), ...GENERIC_FIELDS];
    // total_copies is inventory, not a bibliographic MARC field — it carries no tag.
    for (const f of all.filter(f => f!.key !== 'total_copies')) {
      expect(f!.marc.length, f!.key).toBeGreaterThan(0);
    }
  });

  it('every select descriptor has non-empty options', () => {
    const all = [...Object.values(MATERIAL_FIELDS).flat(), ...GENERIC_FIELDS];
    for (const f of all.filter(f => f!.kind === 'select')) {
      expect(f!.options && f!.options.length, f!.key).toBeGreaterThan(0);
    }
  });

  it('call_number_type select options equal CALL_NUMBER_TYPES (no enum drift)', () => {
    const all = [...Object.values(MATERIAL_FIELDS).flat(), ...GENERIC_FIELDS];
    const cnt = all.find(f => f!.key === 'call_number_type');
    expect(cnt, 'call_number_type descriptor').toBeDefined();
    expect([...cnt!.options!]).toEqual([...CALL_NUMBER_TYPES]);
  });

  it('resolves in-scope types to their specific sets', () => {
    expect(fieldsFor('THESIS')).toBe(MATERIAL_FIELDS.THESIS);
  });

  it('falls back to GENERIC_FIELDS for a non-scoped enum and a non-enum string', () => {
    expect(fieldsFor('MAP')).toBe(GENERIC_FIELDS);
    expect(fieldsFor('GARBAGE')).toBe(GENERIC_FIELDS);
  });
});
