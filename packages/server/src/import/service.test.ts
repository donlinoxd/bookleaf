import { describe, it, expect } from 'vitest';
import { createImportService } from './service';
import { createSessionStore } from './session';
import type { ImportRow } from '@bookleaf/types';
import type { ImportContext, CommitPlan, ImportJobInput, ImportRepo } from './types';

function fakeRepo(ctx: ImportContext): { repo: ImportRepo; lastPlan?: CommitPlan; lastJob?: ImportJobInput } {
  const holder: { repo: ImportRepo; lastPlan?: CommitPlan; lastJob?: ImportJobInput } = {
    repo: {
      loadContext: async () => ctx,
      commit: async (_iid, plan, jobInput) => {
        holder.lastPlan = plan;
        holder.lastJob = jobInput;
        return { created: plan.creates.length, copiesAdded: plan.copyAdds.reduce((a, c) => a + c.copies, 0), jobId: 1 };
      },
    },
  };
  return holder;
}

function row(p: Partial<ImportRow>, i: number): ImportRow {
  return { title: 'T', author: 'A', _rowIndex: i, ...p };
}

const emptyCtx: ImportContext = { catalog: [], barcodes: [], accessions: [] };

describe('import service', () => {
  it('rejects payloads over the row cap', async () => {
    const svc = createImportService(fakeRepo(emptyCtx).repo, createSessionStore());
    const rows = Array.from({ length: 10_001 }, (_, i) => row({}, i));
    await expect(svc.preview(1, rows)).rejects.toThrow(/10,?000/);
  });

  it('previews and then commits valid rows', async () => {
    const holder = fakeRepo(emptyCtx);
    const svc = createImportService(holder.repo, createSessionStore({ genId: () => 'sess1' }));
    const { sessionId, stats } = await svc.preview(1, [row({ title: 'Dune', author: 'Herbert', copies: '2' }, 0)]);
    expect(sessionId).toBe('sess1');
    expect(stats.willCreateResources).toBe(1);
    const res = await svc.commit('sess1', 'skip', 'f.csv');
    expect(res.created).toBe(1);
    expect(holder.lastPlan!.creates).toHaveLength(1);
  });

  it('downgrades force_create_duplicate to skip on an ISBN match', async () => {
    const ctx: ImportContext = {
      catalog: [{ id: 5, isbn: '9780596520687', title: 'X', author: 'Y' }], barcodes: [], accessions: [],
    };
    const holder = fakeRepo(ctx);
    const svc = createImportService(holder.repo, createSessionStore({ genId: () => 's' }));
    await svc.preview(1, [row({ isbn: '0-596-52068-9' }, 0)]);
    const res = await svc.commit('s', 'force_create_duplicate', 'f.csv');
    expect(res.created).toBe(0);
    expect(holder.lastPlan!.creates).toHaveLength(0);
  });

  it('add_copies appends to the matched resource', async () => {
    const ctx: ImportContext = {
      catalog: [{ id: 5, isbn: null, title: 'Dune', author: 'Herbert' }], barcodes: [], accessions: [],
    };
    const holder = fakeRepo(ctx);
    const svc = createImportService(holder.repo, createSessionStore({ genId: () => 's' }));
    await svc.preview(1, [row({ title: 'Dune', author: 'Herbert', copies: '4' }, 0)]);
    const res = await svc.commit('s', 'add_copies', 'f.csv');
    expect(res.copiesAdded).toBe(4);
    expect(holder.lastPlan!.copyAdds).toEqual([{ resourceId: 5, copies: 4 }]);
  });

  it('throws on an expired/unknown session', async () => {
    const svc = createImportService(fakeRepo(emptyCtx).repo, createSessionStore());
    await expect(svc.commit('nope', 'skip', 'f.csv')).rejects.toThrow(/session/i);
  });
});
