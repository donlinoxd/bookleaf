import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';
import { PolicyError } from '../../adapter/loanPolicy';

export const adminCirculationRouter = router({
  activeBorrows: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminActiveBorrows(input.institutionId)),

  overdueBorrows: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminOverdueBorrows(input.institutionId)),

  checkout: librarianProcedure
    .input(z.object({
      copyId: z.number().int(),
      userId: z.number().int(),
      override: z.boolean().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const res = await ctx.db.adminCheckout(input.copyId, input.userId, {
          override: input.override,
          note: input.note,
          actedByUserId: ctx.principal.user_id,
          institutionId: ctx.principal.institution_id,
        });
        return { ok: true as const, borrowingId: res.borrowingId };
      } catch (e) {
        if (e instanceof PolicyError) {
          return { ok: false as const, violations: e.violations };
        }
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Could not check out' });
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

  resolvePatron: librarianProcedure
    .input(z.object({ idNumber: z.string().min(1) }))
    .query(({ input, ctx }) => ctx.db.adminResolvePatron(ctx.principal.institution_id, input.idNumber)),

  checkoutByAccession: librarianProcedure
    .input(z.object({
      userId: z.number().int(),
      accession: z.string().min(1),
      override: z.boolean().optional(),
      note: z.string().optional(),
    }))
    .mutation(({ input, ctx }) => ctx.db.adminCheckoutByAccession(
      ctx.principal.institution_id,
      input.userId,
      input.accession,
      { override: input.override, note: input.note, actedByUserId: ctx.principal.user_id, institutionId: ctx.principal.institution_id },
    )),
});
