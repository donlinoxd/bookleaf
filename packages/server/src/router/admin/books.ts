import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';
import { importPreviewInput, importCommitInput } from '@bookleaf/types';
import { createImportService } from '../../import/service';
import { createSessionStore } from '../../import/session';
import type { ImportRepo } from '../../import/types';
import { serializeCollection } from '../../marc/serialize';
import { parseMarcXml } from '../../marc/parse';
import { marcRecordToRow } from '../../marc/toRows';

// Process-wide session store (desktop server is single-process).
const importSessions = createSessionStore();

export const adminBooksRouter = router({
  list: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), q: z.string().optional() }))
    .query(({ input, ctx }) => ctx.db.adminListBooks(input.institutionId, input.q)),

  get: librarianProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const book = await ctx.db.adminGetBookWithCopies(input.id);
      if (!book) throw new TRPCError({ code: 'NOT_FOUND', message: 'Book not found' });
      return book;
    }),

  create: librarianProcedure
    .input(
      z.object({
        institutionId: z.number().int(),
        data: z.record(z.unknown()),
        copies: z
          .array(
            z.object({
              accession_number: z.string().optional(),
              barcode: z.string().optional(),
              shelf_location: z.string().optional(),
            }),
          )
          .default([]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminCreateBook(input.institutionId, input.data, input.copies);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not create book',
        });
      }
    }),

  update: librarianProcedure
    .input(z.object({ id: z.number().int(), data: z.record(z.unknown()) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminUpdateBook(input.id, input.data);
      return { ok: true as const };
    }),

  delete: librarianProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminDeleteBook(input.id);
      return { ok: true as const };
    }),

  addCopy: librarianProcedure
    .input(z.object({ resourceId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminAddCopy(input.resourceId);
      return { ok: true as const };
    }),

  marcExport: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), q: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const rows = (await ctx.db.adminListBooks(input.institutionId, input.q)) as Record<string, unknown>[];
      // Export serializes the denormalized author/publisher/subject_headings columns, which Slice 1 keeps in sync with the linked authorities' canonical names.
      return serializeCollection(rows);
    }),

  importPreview: librarianProcedure
    .input(importPreviewInput)
    .mutation(async ({ input, ctx }) => {
      const repo: ImportRepo = {
        loadContext: (iid) => ctx.db.adminLoadImportContext(iid),
        commit: (iid, plan, job) => ctx.db.adminBulkImport(iid, plan, job),
      };
      const svc = createImportService(repo, importSessions);
      try {
        return await svc.preview(input.institutionId, input.rows);
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Preview failed' });
      }
    }),

  marcImportPreview: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), xml: z.string() }))
    .mutation(async ({ input, ctx }) => {
      let rows;
      try {
        rows = parseMarcXml(input.xml).map((r, i) => marcRecordToRow(r, i));
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Could not parse MARCXML' });
      }
      const repo: ImportRepo = {
        loadContext: (iid) => ctx.db.adminLoadImportContext(iid),
        commit: (iid, plan, job) => ctx.db.adminBulkImport(iid, plan, job),
      };
      const svc = createImportService(repo, importSessions);
      try {
        return await svc.preview(input.institutionId, rows, { linkAuthorities: true });
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Preview failed' });
      }
    }),

  importCommit: librarianProcedure
    .input(importCommitInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.principal.user_id;
      const repo: ImportRepo = {
        loadContext: (iid) => ctx.db.adminLoadImportContext(iid),
        // Inject the authenticated user as the importer.
        commit: (iid, plan, job) => ctx.db.adminBulkImport(iid, plan, { ...job, importedByUserId: userId }),
      };
      const svc = createImportService(repo, importSessions);
      try {
        const { _institutionId, ...result } = await svc.commit(input.sessionId, input.duplicateStrategy, input.filename);
        void _institutionId;
        return result;
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Import failed' });
      }
    }),

  marcImportCommit: librarianProcedure
    .input(importCommitInput)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.principal.user_id;
      const repo: ImportRepo = {
        loadContext: (iid) => ctx.db.adminLoadImportContext(iid),
        commit: (iid, plan, job) => ctx.db.adminBulkImport(iid, plan, { ...job, importedByUserId: userId }),
      };
      const svc = createImportService(repo, importSessions);
      try {
        const { _institutionId, ...result } = await svc.commit(input.sessionId, input.duplicateStrategy, input.filename);
        void _institutionId;
        return result;
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Import failed' });
      }
    }),
});
