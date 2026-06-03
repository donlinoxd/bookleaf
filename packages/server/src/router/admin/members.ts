import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

export const adminMembersRouter = router({
  list: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), q: z.string().optional() }))
    .query(({ input, ctx }) => ctx.db.adminListMembers(input.institutionId, input.q)),

  get: librarianProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const member = await ctx.db.adminGetMember(input.id);
      if (!member) throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
      return member;
    }),

  create: librarianProcedure
    .input(z.object({ data: z.record(z.unknown()) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminCreateMember(input.data);
      } catch (e) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: e instanceof Error ? e.message : 'Could not create member',
        });
      }
    }),

  update: librarianProcedure
    .input(z.object({ id: z.number().int(), data: z.record(z.unknown()) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminUpdateMember(input.id, input.data);
      return { ok: true as const };
    }),

  setActive: librarianProcedure
    .input(z.object({ id: z.number().int(), isActive: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminSetMemberActive(input.id, input.isActive);
      return { ok: true as const };
    }),

  resetPin: librarianProcedure
    .input(z.object({ id: z.number().int(), newPin: z.string().min(4) }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminResetMemberPin(input.id, input.newPin);
      return { ok: true as const };
    }),
});
