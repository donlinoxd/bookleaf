import { router } from '../trpc';
import { authRouter } from './auth';
import { catalogRouter } from './catalog';
import { meRouter } from './me';
import { borrowsRouter } from './borrows';
import { booksRouter } from './books';
import { gateRouter } from './gate';
import { adminRouter } from './admin';

export const appRouter = router({
  auth: authRouter,
  catalog: catalogRouter,
  me: meRouter,
  borrows: borrowsRouter,
  books: booksRouter,
  gate: gateRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
