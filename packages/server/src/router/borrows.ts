import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';

export const borrowsRouter = router({
  renew: protectedProcedure
    .input(z.object({ borrowingId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.renewBorrow(input.borrowingId, ctx.principal.user_id);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not renew',
        });
      }
    }),
});
