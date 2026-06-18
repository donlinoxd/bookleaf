export interface MarcSubfield { code: string; value: string; }
export interface MarcDataField { tag: string; ind1: string; ind2: string; subfields: MarcSubfield[]; }
export interface MarcControlField { tag: string; value: string; }
export interface MarcRecord { leader: string; controlfields: MarcControlField[]; datafields: MarcDataField[]; }
