import { describe, it, expect } from 'vitest';
import { parseMarcXml } from '../../marc/parse';
import { marcRecordToRow } from '../../marc/toRows';

// Pins the parse → toRows wiring the endpoint relies on.
describe('marc import wiring', () => {
  it('parses MARCXML into import rows', () => {
    const xml = `<collection xmlns="http://www.loc.gov/MARC21/slim"><record>
      <leader>00000nam a2200000zu 4500</leader>
      <datafield tag="245" ind1="1" ind2="0"><subfield code="a">T</subfield></datafield>
      <datafield tag="100" ind1="1" ind2=" "><subfield code="a">Doe, Jane</subfield></datafield>
    </record></collection>`;
    const rows = parseMarcXml(xml).map((r, i) => marcRecordToRow(r, i));
    expect(rows[0].title).toBe('T');
    expect(rows[0].author).toBe('Doe, Jane');
  });
});
