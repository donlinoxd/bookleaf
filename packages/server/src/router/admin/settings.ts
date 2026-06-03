import { z } from 'zod';
import { router, librarianProcedure } from '../../trpc';

export const adminSettingsRouter = router({
  get: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminGetSettings(input.institutionId)),

  update: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), data: z.record(z.unknown()) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminUpdateSettings(input.institutionId, input.data);
      return { ok: true as const };
    }),
});
