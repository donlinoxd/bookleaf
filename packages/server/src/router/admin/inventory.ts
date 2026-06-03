import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

export const adminInventoryRouter = router({
  activeSession: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminActiveInventorySession(input.institutionId)),

  startSession: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminStartInventorySession(input.institutionId);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not start session',
        });
      }
    }),

  scan: librarianProcedure
    .input(
      z.object({
        sessionId: z.number().int(),
        isbn: z.string(),
        institutionId: z.number().int(),
      }),
    )
    .mutation(({ input, ctx }) =>
      ctx.db.adminInventoryScan(input.sessionId, input.isbn, input.institutionId),
    ),

  finishSession: librarianProcedure
    .input(z.object({ sessionId: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminFinishInventorySession(input.sessionId);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not finish session',
        });
      }
    }),
});
