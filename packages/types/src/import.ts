import { z } from 'zod';

export const MAX_IMPORT_ROWS = 10_000;

export const MATERIAL_TYPES = [
  'BOOK', 'SERIAL', 'ARTICLE', 'AUDIOVISUAL', 'MAP',
  'MANUSCRIPT', 'DIGITAL', 'THESIS', 'OTHER',
] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

/** A row after column-mapping in the renderer. All cell values are raw strings. */
export const importRowSchema = z.object({
  title: z.string(),
  author: z.string(),
  isbn: z.string().optional(),
  issn: z.string().optional(),
  publisher: z.string().optional(),
  year: z.string().optional(),
  genre: z.string().optional(),
  description: z.string().optional(),
  subtitle: z.string().optional(),
  edition: z.string().optional(),
  volume: z.string().optional(),
  series_title: z.string().optional(),
  language: z.string().optional(),
  call_number: z.string().optional(),
  call_number_type: z.string().optional(),
  material_type: z.string().optional(),
  subject_headings: z.string().optional(),
  issue_number: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  frequency: z.string().optional(),
  container_title: z.string().optional(),
  pages: z.string().optional(),
  thesis_degree: z.string().optional(),
  thesis_institution: z.string().optional(),
  thesis_advisor: z.string().optional(),
  copies: z.string().optional(),
  accession_number: z.string().optional(),
  barcode: z.string().optional(),
  shelf_location: z.string().optional(),
  _rowIndex: z.number().int(),
});
export type ImportRow = z.infer<typeof importRowSchema>;

export type RowStatus = 'valid' | 'invalid' | 'duplicate_existing' | 'duplicate_file';

export interface RowVerdict {
  rowIndex: number;
  status: RowStatus;
  reasons?: string[];
  matchedResourceId?: number;
  matchedBy?: 'isbn' | 'title_author';
  firstRowIndex?: number;
}

export type DuplicateStrategy = 'skip' | 'add_copies' | 'force_create_duplicate';

export interface StrategyProjection {
  resources: number;
  copies: number;
}

export interface PreviewStats {
  rows: number;
  valid: number;
  duplicateExisting: number;
  duplicateFile: number;
  invalid: number;
  willCreateResources: number;
  willCreateCopies: number;
  perStrategy: {
    skip: StrategyProjection;
    add_copies: StrategyProjection;
    force_create_duplicate: StrategyProjection;
  };
}

export const importPreviewInput = z.object({
  institutionId: z.number().int(),
  rows: z.array(importRowSchema),
});

export const importCommitInput = z.object({
  sessionId: z.string(),
  duplicateStrategy: z.enum(['skip', 'add_copies', 'force_create_duplicate']),
  filename: z.string().default('import'),
});

export interface ImportPreviewResult {
  sessionId: string;
  verdicts: RowVerdict[];
  stats: PreviewStats;
}

export interface ImportCommitResult {
  created: number;
  copiesAdded: number;
  skipped: { rowIndex: number; reasons: string[] }[];
  jobId: number;
}
