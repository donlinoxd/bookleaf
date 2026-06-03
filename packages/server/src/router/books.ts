import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';

export const booksRouter = router({
  reviews: publicProcedure
    .input(z.object({ resourceId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.getBookReviews(input.resourceId)),

  addReview: protectedProcedure
    .input(
      z.object({
        resourceId: z.number().int(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.submitReview(
          input.resourceId,
          ctx.principal.user_id,
          input.rating,
          input.comment ?? null,
        );
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not submit review',
        });
      }
    }),

  favoriteStatus: protectedProcedure
    .input(z.object({ resourceId: z.number().int() }))
    .query(({ input, ctx }) =>
      ctx.db.getFavoriteStatus(input.resourceId, ctx.principal.user_id),
    ),

  toggleFavorite: protectedProcedure
    .input(z.object({ resourceId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.toggleFavorite(input.resourceId, ctx.principal.user_id);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not toggle favorite',
        });
      }
    }),

  reserve: protectedProcedure
    .input(z.object({ resourceId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.reserveBook(input.resourceId, ctx.principal.user_id);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not reserve book',
        });
      }
    }),
});
