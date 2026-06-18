import type { MaterialType, RowVerdict, DuplicateStrategy } from '@bookleaf/types';

/** A row after coercion, ready to become a resource + copies. */
export interface NormalizedRow {
  rowIndex: number;
  title: string;
  author: string;
  isbn: string | null;        // stored value (canonical when valid, raw when malformed)
  isbnKey: string | null;     // dedup key: canonical ISBN-13 or null
  issn: string | null;
  publisher: string | null;
  year: number | null;
  genre: string | null;
  description: string | null;
  subtitle: string | null;
  edition: string | null;
  volume: string | null;
  series_title: string | null;
  language: string | null;
  call_number: string | null;
  call_number_type: 'DEWEY' | 'LC' | 'OTHER' | null;
  material_type: MaterialType;
  subject_headings: string[] | null;
  issue_number: string | null;
  doi: string | null;
  url: string | null;
  frequency: string | null;
  container_title: string | null;
  pages: string | null;
  thesis_degree: string | null;
  thesis_institution: string | null;
  thesis_advisor: string | null;
  copies: number;             // >= 1
  accession_number: string | null;
  barcode: string | null;
  shelf_location: string | null;
}

/** Validation outcome for a single row. */
export interface RowValidation {
  rowIndex: number;
  ok: boolean;
  normalized: NormalizedRow | null;  // null when ok === false
  reasons: string[];                 // hard errors when !ok; warnings when ok
}

/** Existing-catalog key loaded for dedup. */
export interface CatalogKey {
  id: number;
  isbn: string | null;
  title: string;
  author: string;
}

/** Everything the preview needs from the database, loaded in one shot. */
export interface ImportContext {
  catalog: CatalogKey[];
  barcodes: string[];
  accessions: string[];
}

/** A plan the adapter executes atomically. */
export interface CommitPlan {
  creates: NormalizedRow[];                          // new resources (+ their copies)
  copyAdds: { resourceId: number; copies: number }[]; // copies appended to existing resources
}

export interface ImportJobInput {
  institutionId: number;
  importedByUserId: number;
  filename: string;
  duplicateStrategy: DuplicateStrategy;
  rowCount: number;
  createdCount: number;
  copiesAddedCount: number;
  skippedCount: number;
}

/** Narrow DB port the import service depends on (so it is testable with a fake). */
export interface ImportRepo {
  loadContext(institutionId: number): Promise<ImportContext>;
  commit(
    institutionId: number,
    plan: CommitPlan,
    job: ImportJobInput,
  ): Promise<{ created: number; copiesAdded: number; jobId: number }>;
}

export type { RowVerdict };
