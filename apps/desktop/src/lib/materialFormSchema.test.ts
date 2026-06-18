import { describe, it, expect } from 'vitest';
import { buildMaterialSchema } from './materialFormSchema';
import type { FieldDescriptor } from './materialFields';

const fields: FieldDescriptor[] = [
  { key: 'title', label: 'Title', kind: 'text', marc: '245$a', required: true },
  { key: 'frequency', label: 'Frequency', kind: 'select', marc: '310$a', options: ['Monthly', 'Quarterly'] },
  { key: 'isbn', label: 'ISBN', kind: 'text', marc: '020$a' },
];

describe('buildMaterialSchema', () => {
  it('rejects an empty title', () => {
    const r = buildMaterialSchema(fields).safeParse({ title: '' });
    expect(r.success).toBe(false);
  });

  it('accepts a valid title with everything else omitted', () => {
    const r = buildMaterialSchema(fields).safeParse({ title: 'Hello' });
    expect(r.success).toBe(true);
  });

  it('allows an unselected (empty) frequency', () => {
    const r = buildMaterialSchema(fields).safeParse({ title: 'Hello', frequency: '' });
    expect(r.success).toBe(true);
  });

  it('rejects a frequency outside its options', () => {
    const r = buildMaterialSchema(fields).safeParse({ title: 'Hello', frequency: 'Hourly' });
    expect(r.success).toBe(false);
  });
});
