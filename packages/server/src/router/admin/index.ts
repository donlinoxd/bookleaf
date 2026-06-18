import { router } from '../../trpc';
import { adminBooksRouter } from './books';
import { adminMembersRouter } from './members';
import { adminCirculationRouter } from './circulation';
import { adminReportsRouter } from './reports';
import { adminInventoryRouter } from './inventory';
import { adminSettingsRouter } from './settings';
import { adminBackupRouter } from './backup';
import { adminGateRouter } from './gate';
import { adminAuthoritiesRouter } from './authorities';

export const adminRouter = router({
  books: adminBooksRouter,
  members: adminMembersRouter,
  circulation: adminCirculationRouter,
  reports: adminReportsRouter,
  inventory: adminInventoryRouter,
  settings: adminSettingsRouter,
  backup: adminBackupRouter,
  gate: adminGateRouter,
  authorities: adminAuthoritiesRouter,
});
