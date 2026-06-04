import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const gateRouter = router({
  log: protectedProcedure.mutation(async ({ ctx }) => {
    const data = await ctx.db.gateLogByUserId(
      ctx.principal.user_id,
      ctx.principal.institution_id,
      'app',
    );
    if (!data) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
    return data;
  }),
});
