import type { PreviewStats, RowVerdict } from '@bookleaf/types';
import type { NormalizedRow } from './types';

export function computeStats(
  verdicts: RowVerdict[],
  norms: Map<number, NormalizedRow>,
): PreviewStats {
  const stats: PreviewStats = {
    rows: verdicts.length,
    valid: 0, duplicateExisting: 0, duplicateFile: 0, invalid: 0,
    willCreateResources: 0, willCreateCopies: 0,
    perStrategy: {
      skip: { resources: 0, copies: 0 },
      add_copies: { resources: 0, copies: 0 },
      force_create_duplicate: { resources: 0, copies: 0 },
    },
  };

  for (const v of verdicts) {
    const copies = norms.get(v.rowIndex)?.copies ?? 0;
    switch (v.status) {
      case 'valid':
        stats.valid++;
        stats.willCreateResources++;
        stats.willCreateCopies += copies;
        break;
      case 'invalid':
        stats.invalid++;
        break;
      case 'duplicate_file':
        stats.duplicateFile++;
        break;
      case 'duplicate_existing':
        stats.duplicateExisting++;
        // skip: nothing
        stats.perStrategy.add_copies.copies += copies;
        if (v.matchedBy === 'title_author') {
          stats.perStrategy.force_create_duplicate.resources++;
          stats.perStrategy.force_create_duplicate.copies += copies;
        }
        break;
    }
  }

  return stats;
}
