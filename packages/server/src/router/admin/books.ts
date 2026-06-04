import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

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
});
