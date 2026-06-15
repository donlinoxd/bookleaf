import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

const AUTHORITY_TYPES = ['personal', 'corporate', 'geographic', 'subject', 'publisher'] as const;

export const adminAuthoritiesRouter = router({
  list: librarianProcedure
    .input(z.object({
      institutionId: z.number().int(),
      type: z.enum(AUTHORITY_TYPES).optional(),
      q: z.string().optional(),
    }))
    .query(({ input, ctx }) => ctx.db.adminListAuthorities(input.institutionId, { type: input.type, q: input.q })),

  get: librarianProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const a = await ctx.db.adminGetAuthority(input.id);
      if (!a) throw new TRPCError({ code: 'NOT_FOUND', message: 'Authority not found' });
      return a;
    }),

  create: librarianProcedure
    .input(z.object({
      institutionId: z.number().int(),
      name: z.string().min(1),
      type: z.enum(AUTHORITY_TYPES),
      variants: z.array(z.string()).optional(),
    }))
    .mutation(({ input, ctx }) => ctx.db.adminCreateAuthority({
      institutionId: input.institutionId, name: input.name, type: input.type, variants: input.variants ?? null,
    })),

  update: librarianProcedure
    .input(z.object({
      id: z.number().int(),
      data: z.object({
        name: z.string().min(1).optional(),
        type: z.enum(AUTHORITY_TYPES).optional(),
        variants: z.array(z.string()).optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.adminUpdateAuthority(input.id, input.data);
      return { ok: true as const };
    }),

  delete: librarianProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      try {
        await ctx.db.adminDeleteAuthority(input.id);
        return { ok: true as const };
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Could not delete authority' });
      }
    }),

  merge: librarianProcedure
    .input(z.object({ survivorId: z.number().int(), loserIds: z.array(z.number().int()).min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        await ctx.db.adminMergeAuthorities(input.survivorId, input.loserIds);
        return { ok: true as const };
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Merge failed' });
      }
    }),
});
