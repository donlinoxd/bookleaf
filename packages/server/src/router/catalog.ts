import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';

export const catalogRouter = router({
  search: publicProcedure
    .input(
      z.object({
        institutionId: z.number().int(),
        q: z.string().default(''),
        type: z.string().optional(),
        yearFrom: z.number().int().optional(),
        yearTo: z.number().int().optional(),
        language: z.string().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const hasFilters = input.type || input.yearFrom || input.yearTo || input.language;
      if (hasFilters || input.q) {
        return ctx.db.searchBooksFiltered(input.institutionId, input.q, {
          materialType: input.type,
          yearFrom: input.yearFrom,
          yearTo: input.yearTo,
          language: input.language,
        });
      }
      return ctx.db.searchBooks(input.institutionId, input.q);
    }),

  byId: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const book = await ctx.db.getBookDetail(input.id);
      if (!book) throw new TRPCError({ code: 'NOT_FOUND', message: 'Book not found' });
      return book;
    }),

  recent: publicProcedure
    .input(z.object({ institutionId: z.number().int(), limit: z.number().int().default(10) }))
    .query(({ input, ctx }) => ctx.db.getRecentlyAdded(input.institutionId, input.limit)),

  popular: publicProcedure
    .input(z.object({ institutionId: z.number().int(), limit: z.number().int().default(10) }))
    .query(({ input, ctx }) => ctx.db.getPopular(input.institutionId, input.limit)),

  similar: publicProcedure
    .input(z.object({ id: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.getSimilarBooks(input.id)),
});
