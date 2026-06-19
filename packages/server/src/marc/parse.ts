import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { MarcRecord, MarcDataField, MarcControlField, MarcSubfield } from './types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  isArray: (name) => ['record', 'datafield', 'subfield', 'controlfield'].includes(name),
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseMarcXml(xml: string): MarcRecord[] {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error('Could not parse MARCXML: malformed XML');
  let root: Record<string, unknown>;
  try {
    root = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new Error('Could not parse MARCXML: malformed XML');
  }
  const collection = root.collection as Record<string, unknown> | undefined;
  const recordsRaw = collection
    ? asArray(collection.record as unknown)
    : asArray(root.record as unknown);
  if (recordsRaw.length === 0) throw new Error('Could not parse MARCXML: no <record> elements found');

  return (recordsRaw as Record<string, unknown>[]).map((rec) => {
    const leader = typeof rec.leader === 'string' ? rec.leader : '';
    const controlfields: MarcControlField[] = asArray(rec.controlfield as unknown).map((c) => {
      const cf = c as Record<string, unknown>;
      return { tag: String(cf['@_tag'] ?? ''), value: String(cf['#text'] ?? '') };
    });
    const datafields: MarcDataField[] = asArray(rec.datafield as unknown).map((d) => {
      const df = d as Record<string, unknown>;
      const subfields: MarcSubfield[] = asArray(df.subfield as unknown).map((s) => {
        const sf = s as Record<string, unknown>;
        return { code: String(sf['@_code'] ?? ''), value: String(sf['#text'] ?? '') };
      });
      return {
        tag: String(df['@_tag'] ?? ''),
        ind1: String(df['@_ind1'] ?? ' '),
        ind2: String(df['@_ind2'] ?? ' '),
        subfields,
      };
    });
    return { leader, controlfields, datafields };
  });
}
