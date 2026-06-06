import { z } from 'zod';
import { router, librarianProcedure } from '../../trpc';

export const adminGateRouter = router({
  recentLogs: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), limit: z.number().int().max(100).default(50) }))
    .query(({ input, ctx }) => ctx.db.adminGateRecentLogs(input.institutionId, input.limit)),
});
