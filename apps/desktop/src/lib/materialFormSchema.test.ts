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

describe('buildMaterialSchema number fields', () => {
  const numFields: FieldDescriptor[] = [
    { key: 'title', label: 'Title', kind: 'text', marc: '245$a', required: true },
    { key: 'year', label: 'Year', kind: 'number', marc: '264$c' },
    { key: 'total_copies', label: 'Copies', kind: 'number', marc: '' },
  ];

  it('defaults a blank Copies field to 1', () => {
    const r = buildMaterialSchema(numFields).safeParse({ title: 'X', total_copies: '' });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as Record<string, unknown>).total_copies).toBe(1);
  });

  it('rejects 0 copies', () => {
    const r = buildMaterialSchema(numFields).safeParse({ title: 'X', total_copies: 0 });
    expect(r.success).toBe(false);
  });

  it('treats a blank optional number as unset (undefined), not 0', () => {
    const r = buildMaterialSchema(numFields).safeParse({ title: 'X', year: '' });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as Record<string, unknown>).year).toBeUndefined();
  });
});
