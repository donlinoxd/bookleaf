import { describe, it, expect } from 'vitest';
import { serializeCollection } from '../../marc/serialize';

// The endpoint is a thin wrapper over adminListBooks + serializeCollection.
// This test pins the contract of the serialization wrapper used by the endpoint.
describe('marcExport serialization contract', () => {
  it('serializes rows returned by the catalog list into a collection', () => {
    const rows = [
      { material_type: 'BOOK', title: 'A', author: 'X', subject_headings: ['S'] },
      { material_type: 'SERIAL', title: 'B', author: '', issn: '1234-5678' },
    ];
    const out = serializeCollection(rows);
    expect(out.written).toBe(2);
    expect(out.xml).toContain('1234-5678');
    expect(out.xml).toContain('<collection');
  });
});
