import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, librarianProcedure } from '../../trpc';

const RULE_USER_TYPES = ['student', 'faculty', 'alumni', 'external', 'ANY'] as const;
const RULE_MATERIAL_TYPES = ['BOOK', 'SERIAL', 'ARTICLE', 'AUDIOVISUAL', 'MAP', 'MANUSCRIPT', 'DIGITAL', 'THESIS', 'OTHER', 'ANY'] as const;

const ruleInput = z.object({
  id: z.number().int().optional(),
  user_type: z.enum(RULE_USER_TYPES),
  material_type: z.enum(RULE_MATERIAL_TYPES),
  loan_period_days: z.number().int().min(0),
  type_limit: z.number().int().min(0).nullable(),
  max_renewals: z.number().int().min(0),
  renewal_period_days: z.number().int().min(0).nullable(),
  fine_per_day: z.number().min(0),
  grace_period_days: z.number().int().min(0),
  fine_max: z.number().min(0).nullable(),
  is_loanable: z.boolean(),
  is_holdable: z.boolean(),
});

const limitInput = z.object({
  id: z.number().int().optional(),
  user_type: z.enum(RULE_USER_TYPES),
  overall_limit: z.number().int().min(0).nullable(),
  fines_block_threshold: z.number().min(0),
});

export const adminLoanRulesRouter = router({
  listRules: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminListLoanRules(input.institutionId)),

  upsertRule: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), data: ruleInput }))
    .mutation(({ input, ctx }) => ctx.db.adminUpsertLoanRule(input.institutionId, input.data)),

  deleteRule: librarianProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => { await ctx.db.adminDeleteLoanRule(input.id); return { ok: true as const }; }),

  getCategoryLimits: librarianProcedure
    .input(z.object({ institutionId: z.number().int() }))
    .query(({ input, ctx }) => ctx.db.adminGetCategoryLimits(input.institutionId)),

  upsertCategoryLimit: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), data: limitInput }))
    .mutation(({ input, ctx }) => ctx.db.adminUpsertCategoryLimit(input.institutionId, input.data)),

  resolvePreview: librarianProcedure
    .input(z.object({ institutionId: z.number().int(), userId: z.number().int(), resourceId: z.number().int() }))
    .query(async ({ input, ctx }) => {
      try {
        return await ctx.db.adminResolvePolicy(input.institutionId, input.userId, input.resourceId);
      } catch (e) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: e instanceof Error ? e.message : 'Could not resolve policy' });
      }
    }),
});
