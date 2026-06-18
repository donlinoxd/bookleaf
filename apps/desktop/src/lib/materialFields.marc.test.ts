import { describe, it, expect } from 'vitest';
import { FIELD_MARC_TAGS } from '@bookleaf/types';
import { MATERIAL_FIELDS, GENERIC_FIELDS } from './materialFields';

describe('materialFields marc tags vs shared FIELD_MARC_TAGS', () => {
  it('every descriptor with a non-empty marc tag matches the shared map', () => {
    const all = [...Object.values(MATERIAL_FIELDS).flat(), ...GENERIC_FIELDS];
    for (const f of all) {
      if (!f!.marc) continue;            // inventory fields (total_copies) carry no tag
      if (f!.key === 'volume') continue; // volume's MARC tag varies by material type (490$v book / 362 serial / 773$g article)
      expect(FIELD_MARC_TAGS[f!.key], f!.key).toBe(f!.marc);
    }
  });
});
