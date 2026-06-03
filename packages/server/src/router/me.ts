import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';

export const meRouter = router({
  borrows: protectedProcedure.query(async ({ ctx }) => {
    const data = await ctx.db.getMemberBorrows(ctx.principal.user_id);
    if (!data) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
    return data;
  }),

  reservations: protectedProcedure.query(async ({ ctx }) => {
    const data = await ctx.db.getMemberReservations(ctx.principal.user_id);
    if (!data) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
    return data;
  }),

  favorites: protectedProcedure.query(async ({ ctx }) => {
    const data = await ctx.db.getMemberFavorites(ctx.principal.user_id);
    if (!data) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
    return data;
  }),
});
