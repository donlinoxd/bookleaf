import { z } from 'zod';
import { router, librarianProcedure } from '../../trpc';

export const adminReportsRouter = router({
  circulation: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminCirculationReport(input.institutionId)),

  collection: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminCollectionReport(input.institutionId)),

  fines: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminFinesReport(input.institutionId)),

  patron: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminPatronReport(input.institutionId)),
});
