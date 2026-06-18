import { CALL_NUMBER_TYPES, type MaterialType } from '@bookleaf/types';

export type FieldKind =
  | 'text' | 'number' | 'textarea' | 'select'
  | 'author-authority' | 'publisher-authority' | 'subjects';

export interface FieldDescriptor {
  key: string;            // resources column name
  label: string;
  kind: FieldKind;
  marc: string;           // under-the-hood mapping, e.g. '245$a'
  required?: boolean;
  options?: readonly string[]; // required when kind === 'select'
  group?: string;
}

export const SERIAL_FREQUENCIES = [
  'Daily', 'Weekly', 'Biweekly', 'Monthly', 'Bimonthly',
  'Quarterly', 'Semiannual', 'Annual', 'Irregular',
] as const;

// Shared building blocks
const TITLE: FieldDescriptor = { key: 'title', label: 'Title', kind: 'text', marc: '245$a', required: true, group: 'Identity' };
const SUBTITLE: FieldDescriptor = { key: 'subtitle', label: 'Subtitle', kind: 'text', marc: '245$b', group: 'Identity' };
const LANGUAGE: FieldDescriptor = { key: 'language', label: 'Language', kind: 'text', marc: '041$a', group: 'Details' };
const CALL_NUMBER: FieldDescriptor = { key: 'call_number', label: 'Call number', kind: 'text', marc: '082', group: 'Shelving' };
const CALL_NUMBER_TYPE: FieldDescriptor = { key: 'call_number_type', label: 'Call number type', kind: 'select', marc: '082', options: CALL_NUMBER_TYPES, group: 'Shelving' };
const SUBJECTS: FieldDescriptor = { key: 'subject_authority_ids', label: 'Subjects', kind: 'subjects', marc: '650$a', group: 'Subjects' };
const DESCRIPTION: FieldDescriptor = { key: 'description', label: 'Notes / description', kind: 'textarea', marc: '520$a', group: 'Details' };
// total_copies is inventory, not a bibliographic MARC field — it carries no tag.
const COPIES: FieldDescriptor = { key: 'total_copies', label: 'Copies', kind: 'number', marc: '', group: 'Inventory' };
const AUTHOR: FieldDescriptor = { key: 'author', label: 'Author', kind: 'author-authority', marc: '100$a', group: 'Identity' };
const PUBLISHER: FieldDescriptor = { key: 'publisher', label: 'Publisher', kind: 'publisher-authority', marc: '264$b', group: 'Publication' };

export const GENERIC_FIELDS: FieldDescriptor[] = [
  TITLE,
  AUTHOR,
  { key: 'isbn', label: 'ISBN', kind: 'text', marc: '020$a', group: 'Identity' },
  { key: 'genre', label: 'Genre', kind: 'text', marc: '655$a', group: 'Details' },
  { key: 'year', label: 'Year', kind: 'number', marc: '264$c', group: 'Publication' },
  PUBLISHER,
  LANGUAGE,
  CALL_NUMBER, CALL_NUMBER_TYPE,
  SUBJECTS,
  COPIES,
];

export const MATERIAL_FIELDS: Partial<Record<MaterialType, FieldDescriptor[]>> = {
  BOOK: [
    TITLE, SUBTITLE, AUTHOR,
    { key: 'edition', label: 'Edition', kind: 'text', marc: '250$a', group: 'Identity' },
    PUBLISHER,
    { key: 'year', label: 'Year', kind: 'number', marc: '264$c', group: 'Publication' },
    { key: 'isbn', label: 'ISBN', kind: 'text', marc: '020$a', group: 'Identity' },
    { key: 'genre', label: 'Genre', kind: 'text', marc: '655$a', group: 'Details' },
    { key: 'series_title', label: 'Series title', kind: 'text', marc: '490$a', group: 'Details' },
    { key: 'volume', label: 'Volume', kind: 'text', marc: '490$v', group: 'Details' },
    LANGUAGE, CALL_NUMBER, CALL_NUMBER_TYPE, DESCRIPTION, SUBJECTS, COPIES,
  ],
  SERIAL: [
    TITLE, SUBTITLE, PUBLISHER,
    { key: 'year', label: 'Year began', kind: 'number', marc: '264$c', group: 'Publication' },
    { key: 'issn', label: 'ISSN', kind: 'text', marc: '022$a', group: 'Identity' },
    { key: 'frequency', label: 'Frequency', kind: 'select', marc: '310$a', options: SERIAL_FREQUENCIES, group: 'Publication' },
    { key: 'volume', label: 'Volume', kind: 'text', marc: '490$v', group: 'Details' },
    LANGUAGE, CALL_NUMBER, CALL_NUMBER_TYPE, DESCRIPTION, SUBJECTS, COPIES,
  ],
  ARTICLE: [
    TITLE, AUTHOR,
    { key: 'container_title', label: 'Container / journal title', kind: 'text', marc: '773$t', group: 'Publication' },
    { key: 'volume', label: 'Volume', kind: 'text', marc: '490$v', group: 'Publication' },
    { key: 'issue_number', label: 'Issue number', kind: 'text', marc: '773$g', group: 'Publication' },
    { key: 'pages', label: 'Pages', kind: 'text', marc: '773$g', group: 'Publication' },
    { key: 'year', label: 'Year', kind: 'number', marc: '264$c', group: 'Publication' },
    { key: 'doi', label: 'DOI', kind: 'text', marc: '024$a', group: 'Identity' },
    { key: 'url', label: 'URL', kind: 'text', marc: '856$u', group: 'Identity' },
    LANGUAGE, SUBJECTS, COPIES,
  ],
  THESIS: [
    TITLE, AUTHOR,
    { key: 'year', label: 'Year', kind: 'number', marc: '264$c', group: 'Publication' },
    { key: 'thesis_degree', label: 'Degree', kind: 'text', marc: '502$b', group: 'Thesis' },
    { key: 'thesis_institution', label: 'Granting institution', kind: 'text', marc: '502$c', group: 'Thesis' },
    { key: 'thesis_advisor', label: 'Advisor', kind: 'text', marc: '502$g', group: 'Thesis' },
    { key: 'isbn', label: 'ISBN', kind: 'text', marc: '020$a', group: 'Identity' },
    LANGUAGE, CALL_NUMBER, CALL_NUMBER_TYPE, DESCRIPTION, SUBJECTS, COPIES,
  ],
};

export function fieldsFor(materialType: string): FieldDescriptor[] {
  return MATERIAL_FIELDS[materialType as MaterialType] ?? GENERIC_FIELDS;
}
