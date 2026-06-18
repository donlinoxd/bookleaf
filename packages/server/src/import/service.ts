import {
  MAX_IMPORT_ROWS,
  type ImportRow, type DuplicateStrategy,
  type ImportPreviewResult, type ImportCommitResult, type RowVerdict,
} from '@bookleaf/types';
import { validateRow } from './validate';
import { buildVerdicts } from './dedup';
import { computeStats } from './stats';
import type { SessionStore } from './session';
import type { ImportRepo, NormalizedRow, CommitPlan, ImportContext } from './types';

export interface ImportService {
  preview(institutionId: number, rows: ImportRow[], opts?: { linkAuthorities?: boolean }): Promise<ImportPreviewResult>;
  commit(sessionId: string, strategy: DuplicateStrategy, filename: string): Promise<ImportCommitResult & { _institutionId: number }>;
}

/** Build verdicts + a normalized-row map from raw rows against a context. */
function evaluate(rows: ImportRow[], ctx: ImportContext) {
  const validations = rows.map(validateRow);
  const norms = new Map<number, NormalizedRow>();
  for (const v of validations) if (v.normalized) norms.set(v.rowIndex, v.normalized);
  const verdicts = buildVerdicts(validations, ctx);
  return { verdicts, norms };
}

function buildPlan(
  verdicts: RowVerdict[],
  norms: Map<number, NormalizedRow>,
  strategy: DuplicateStrategy,
): { plan: CommitPlan; skipped: { rowIndex: number; reasons: string[] }[] } {
  const creates: NormalizedRow[] = [];
  const copyAdds: { resourceId: number; copies: number }[] = [];
  const skipped: { rowIndex: number; reasons: string[] }[] = [];

  for (const v of verdicts) {
    const n = norms.get(v.rowIndex);
    switch (v.status) {
      case 'valid':
        if (n) creates.push(n);
        break;
      case 'invalid':
      case 'duplicate_file':
        skipped.push({ rowIndex: v.rowIndex, reasons: v.reasons ?? [] });
        break;
      case 'duplicate_existing':
        if (!n) { skipped.push({ rowIndex: v.rowIndex, reasons: v.reasons ?? [] }); break; }
        if (strategy === 'add_copies' && v.matchedResourceId != null) {
          copyAdds.push({ resourceId: v.matchedResourceId, copies: n.copies });
        } else if (strategy === 'force_create_duplicate' && v.matchedBy === 'title_author') {
          creates.push(n);
        } else {
          skipped.push({ rowIndex: v.rowIndex, reasons: v.reasons ?? ['Duplicate of an existing record'] });
        }
        break;
    }
  }
  return { plan: { creates, copyAdds }, skipped };
}

export function createImportService(repo: ImportRepo, sessions: SessionStore): ImportService {
  return {
    async preview(institutionId, rows, opts?) {
      if (rows.length > MAX_IMPORT_ROWS) {
        throw new Error(`Too many rows: ${rows.length}. The limit is ${MAX_IMPORT_ROWS.toLocaleString()} per import.`);
      }
      const ctx = await repo.loadContext(institutionId);
      const { verdicts, norms } = evaluate(rows, ctx);
      const stats = computeStats(verdicts, norms);
      const sessionId = sessions.create({ institutionId, norms, verdicts, linkAuthorities: opts?.linkAuthorities ?? false });
      return { sessionId, verdicts, stats };
    },

    async commit(sessionId, strategy, filename) {
      const payload = sessions.get(sessionId);
      if (!payload) throw new Error('Import session not found or expired. Please re-run the preview.');

      // Re-derive verdicts against a freshly-loaded context using the cached
      // normalized rows. This repeats the full dedup (in-file + existing-catalog +
      // barcode/accession collisions) so codes/ISBNs that appeared since the preview
      // cannot slip through; row validation/coercion is NOT repeated (the cached
      // normalized rows are the source of truth).
      const ctx = await repo.loadContext(payload.institutionId);
      const recheck = reverify(payload.verdicts, payload.norms, ctx);

      const { plan, skipped } = buildPlan(recheck, payload.norms, strategy);
      const result = await repo.commit(payload.institutionId, plan, {
        institutionId: payload.institutionId,
        importedByUserId: 0, // set by the router from the authenticated principal
        filename,
        duplicateStrategy: strategy,
        rowCount: payload.verdicts.length,
        createdCount: 0,
        copiesAddedCount: 0,
        skippedCount: skipped.length,
        linkAuthorities: payload.linkAuthorities ?? false,
      });
      sessions.evict(sessionId);
      return {
        created: result.created,
        copiesAdded: result.copiesAdded,
        skipped,
        jobId: result.jobId,
        _institutionId: payload.institutionId,
      };
    },
  };
}

/**
 * Re-derive verdicts at commit time by running the full dedup engine over the
 * cached normalized rows against a freshly-loaded context. Validation/coercion
 * is not re-run: each cached normalized row is wrapped back into a passing
 * RowValidation (rows with no cached norm stay invalid).
 */
function reverify(
  prior: RowVerdict[],
  norms: Map<number, NormalizedRow>,
  ctx: ImportContext,
): RowVerdict[] {
  const validations = prior.map(v => {
    const n = norms.get(v.rowIndex);
    if (!n) return { rowIndex: v.rowIndex, ok: false as const, normalized: null, reasons: v.reasons ?? [] };
    return { rowIndex: v.rowIndex, ok: true as const, normalized: n, reasons: v.reasons ?? [] };
  });
  return buildVerdicts(validations, ctx);
}
