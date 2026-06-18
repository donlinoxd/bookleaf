import { describe, it, expect } from 'vitest';
import { serializeResourceToRecord, serializeCollection } from './serialize';

describe('serializeResourceToRecord', () => {
  it('emits 245/100/264 datafields for a book', () => {
    const xml = serializeResourceToRecord({
      material_type: 'BOOK', title: 'Hobbit & Co', subtitle: 'There', author: 'Tolkien, J.R.R.',
      publisher: 'Allen', year: 1937, isbn: '9780000000000', subject_headings: ['Fantasy'],
    });
    expect(xml).toContain('<datafield tag="245"');
    expect(xml).toContain('<subfield code="a">Hobbit &amp; Co</subfield>');
    expect(xml).toContain('<subfield code="b">There</subfield>');
    expect(xml).toContain('<datafield tag="100"');
    expect(xml).toContain('Tolkien, J.R.R.');
    expect(xml).toContain('<datafield tag="264"');
    expect(xml).toContain('<subfield code="b">Allen</subfield>');
    expect(xml).toContain('<subfield code="c">1937</subfield>');
    expect(xml).toContain('<datafield tag="650"');
    expect(xml).toContain('<leader>');
  });

  it('omits fields that are empty', () => {
    const xml = serializeResourceToRecord({ material_type: 'BOOK', title: 'T', author: '' });
    expect(xml).not.toContain('tag="100"');
    expect(xml).not.toContain('tag="020"');
  });
});

describe('serializeCollection', () => {
  it('wraps records and reports counts; empty input → empty collection', () => {
    const empty = serializeCollection([]);
    expect(empty.written).toBe(0);
    expect(empty.xml).toContain('<collection');
    const one = serializeCollection([{ material_type: 'BOOK', title: 'T', author: 'A' }]);
    expect(one.written).toBe(1);
    expect(one.xml).toContain('http://www.loc.gov/MARC21/slim');
  });
});
