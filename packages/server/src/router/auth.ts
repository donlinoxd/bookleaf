import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { rateLimitCheck, rateLimitRecordFailure, rateLimitRecordSuccess } from '../middleware/rateLimit';

export const authRouter = router({
  login: publicProcedure
    .input(z.object({ idNumber: z.string(), pin: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const rl = rateLimitCheck(`auth:${input.idNumber}`);
      if (rl.blocked) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: `Too many failed attempts. Try again in ${rl.retryAfter}s.`,
        });
      }
      const result = await ctx.db.authenticateMember(input.idNumber, input.pin);
      if (!result) {
        rateLimitRecordFailure(`auth:${input.idNumber}`);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid ID or PIN' });
      }
      rateLimitRecordSuccess(`auth:${input.idNumber}`);
      return result;
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.token) await ctx.db.logout(ctx.token);
    return { ok: true as const };
  }),
});
