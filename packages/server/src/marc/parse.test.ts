import { describe, it, expect } from 'vitest';
import { parseMarcXml } from './parse';

const SAMPLE = `<?xml version="1.0"?>
<collection xmlns="http://www.loc.gov/MARC21/slim">
  <record>
    <leader>00000nas a2200000zu 4500</leader>
    <controlfield tag="008">somevalue</controlfield>
    <datafield tag="245" ind1="1" ind2="0">
      <subfield code="a">The Title</subfield>
      <subfield code="b">a sub</subfield>
    </datafield>
    <datafield tag="100" ind1="1" ind2=" ">
      <subfield code="a">Doe, Jane</subfield>
    </datafield>
  </record>
</collection>`;

describe('parseMarcXml', () => {
  it('parses records, leader, controlfields, datafields and subfields', () => {
    const recs = parseMarcXml(SAMPLE);
    expect(recs).toHaveLength(1);
    expect(recs[0].leader[7]).toBe('s');
    expect(recs[0].datafields.find(d => d.tag === '245')?.subfields.map(s => s.value)).toEqual(['The Title', 'a sub']);
    expect(recs[0].datafields.find(d => d.tag === '100')?.subfields[0]).toEqual({ code: 'a', value: 'Doe, Jane' });
  });

  it('accepts a bare <record> without a collection wrapper', () => {
    const recs = parseMarcXml('<record><leader>00000nam a2200000zu 4500</leader><datafield tag="245" ind1="1" ind2="0"><subfield code="a">X</subfield></datafield></record>');
    expect(recs).toHaveLength(1);
    expect(recs[0].datafields[0].tag).toBe('245');
  });

  it('throws a clear error on malformed XML', () => {
    expect(() => parseMarcXml('<collection><record>')).toThrow(/MARCXML/i);
  });
});
