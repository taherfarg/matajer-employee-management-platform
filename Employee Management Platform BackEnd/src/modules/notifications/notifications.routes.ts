import { Router, type Request, type Response } from 'express';
import { asyncHandler, sendData } from '../../common/http';
import { idParamSchema, parseParams, parseQuery } from '../../common/validate';
import { authenticate, requireAuth } from '../../middleware/authenticate';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationQuerySchema,
} from './notifications.service';

export const notificationsRouter: Router = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const query = parseQuery(req, notificationQuerySchema);
    const { items, meta, unreadCount } = await listNotifications(auth, query);
    res.json({ data: items, meta, unreadCount });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req: Request, res: Response) => {
    sendData(res, await markAllNotificationsRead(requireAuth(req)));
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parseParams(req, idParamSchema);
    sendData(res, await markNotificationRead(requireAuth(req), id));
  }),
);
