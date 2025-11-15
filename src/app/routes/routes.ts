import { Router } from 'express';
import tagsController from './tag/tag.controller';
import articlesController from './article/article.controller';
import authController from './auth/auth.controller';
import profileController from './profile/profile.controller';
import congressController from './congress/congress.controller';
import cronController from './cron/cron.controller';
import watchlistController from './watchlist/watchlist.controller';
import adminController from './admin/admin.controller';
import notificationsController from './notifications/notifications.controller';

const api = Router()
  .use(tagsController)
  .use(articlesController)
  .use(profileController)
  .use(authController)
  .use(congressController)
  .use(cronController)
  .use(watchlistController)
  .use(adminController)
  .use(notificationsController);

export default Router().use('/api', api);
