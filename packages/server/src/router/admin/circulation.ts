import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

export const adminCirculationRouter = router({
  activeBorrows: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminActiveBorrows(input.institutionId)),

  overdueBorrows: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminOverdueBorrows(input.institutionId)),

  checkout: librarianProcedure
    .input(z.object({ copyId: z.number().int(), userId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminCheckout(input.copyId, input.userId);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not check out',
        });
      }
    }),

  return: librarianProcedure
    .input(
      z.object({
        borrowingId: z.number().int(),
        condition: z.enum(['good', 'damaged', 'lost']).default('good'),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminReturn(input.borrowingId, input.condition);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not return book',
        });
      }
    }),

  pendingReservations: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminPendingReservations(input.institutionId)),

  cancelReservation: librarianProcedure
    .input(z.object({ reservationId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminCancelReservation(input.reservationId);
      return { ok: true as const };
    }),

  payFine: librarianProcedure
    .input(z.object({ borrowingId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminPayFine(input.borrowingId);
      return { ok: true as const };
    }),
});
