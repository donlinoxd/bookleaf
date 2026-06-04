import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

export const adminBackupRouter = router({
  export: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), passphrase: z.string().min(6) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminExportBackup(input.institutionId, input.passphrase);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Export failed',
        });
      }
    }),

  import: librarianProcedure
    .input(
      z.object({
        institutionId: z.number().int(),
        encryptedData: z.string(),
        passphrase: z.string().min(6),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminImportBackup(
          input.institutionId,
          input.encryptedData,
          input.passphrase,
        );
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Import failed',
        });
      }
    }),
});
