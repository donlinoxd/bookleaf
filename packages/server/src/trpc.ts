import { initTRPC, TRPCError } from '@trpc/server';
import type { DbAdapter, SessionPrincipal } from './adapter/types';

export type TRPCContext = {
  db: DbAdapter;
  principal: SessionPrincipal | null;
  token: string | null;
};

const t = initTRPC.context<TRPCContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

/** Requires a valid Bearer token — used for patron endpoints. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.principal) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, principal: ctx.principal } });
});

/** Requires admin or librarian role — used for librarian/admin endpoints. */
export const librarianProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.principal) throw new TRPCError({ code: 'UNAUTHORIZED' });
  if (ctx.principal.role !== 'admin' && ctx.principal.role !== 'librarian') {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx: { ...ctx, principal: ctx.principal } });
});
