import { MaterialType, CallNumberType } from '../types';

export const MATERIAL_TYPE_META: Record<MaterialType, { label: string; icon: string }> = {
  BOOK:        { label: 'Book',        icon: 'book-outline' },
  SERIAL:      { label: 'Serial',      icon: 'newspaper-outline' },
  ARTICLE:     { label: 'Article',     icon: 'document-text-outline' },
  AUDIOVISUAL: { label: 'A/V',         icon: 'film-outline' },
  MAP:         { label: 'Map',         icon: 'map-outline' },
  MANUSCRIPT:  { label: 'Manuscript',  icon: 'reader-outline' },
  DIGITAL:     { label: 'Digital',     icon: 'laptop-outline' },
  THESIS:      { label: 'Thesis',      icon: 'school-outline' },
  OTHER:       { label: 'Other',       icon: 'apps-outline' },
};

export const MATERIAL_TYPES: MaterialType[] = [
  'BOOK', 'SERIAL', 'ARTICLE', 'AUDIOVISUAL', 'MAP', 'MANUSCRIPT', 'DIGITAL', 'THESIS', 'OTHER',
];

export const CALL_NUMBER_TYPES: CallNumberType[] = ['DEWEY', 'LC', 'OTHER'];

export const IDENTIFIER_LABEL: Record<MaterialType, string> = {
  BOOK:        'ISBN',
  SERIAL:      'ISSN',
  ARTICLE:     'DOI',
  AUDIOVISUAL: 'Identifier',
  MAP:         'Identifier',
  MANUSCRIPT:  'Identifier',
  DIGITAL:     'URL / DOI',
  THESIS:      'Identifier',
  OTHER:       'Identifier',
};
