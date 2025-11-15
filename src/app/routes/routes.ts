import { Router } from 'express';
import tagsController from './tag/tag.controller';
import articlesController from './article/article.controller';
import authController from './auth/auth.controller';
import profileController from './profile/profile.controller';
import congressController from './congress/congress.controller';
import syncController from './sync/sync.controller';
import billsController from './bills/bills.controller';
import membersController from './members/members.controller';
import adminController from './admin/admin.controller';

const api = Router()
  .use(tagsController)
  .use(articlesController)
  .use(profileController)
  .use(authController)
  // New database-backed routes (primary API for CivicLens)
  .use('/bills', billsController)
  .use('/members', membersController)
  .use('/sync', syncController)
  // Legacy direct Congress.gov API routes (mounted under /congress to avoid conflicts)
  .use('/congress', congressController);

export default Router()
  .use('/admin', adminController)
  .use('/api', api);
