import { Router, type Request, type Response } from 'express';
import { asyncHandler, sendPage } from '../../common/http';
import { parseQuery } from '../../common/validate';
import { authenticate, requireAdmin, requireAuth } from '../../middleware/authenticate';
import { auditQuerySchema, listAuditLogs } from './audit-log.service';

export const auditRouter: Router = Router();

auditRouter.use(authenticate, requireAdmin);

auditRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const query = parseQuery(req, auditQuerySchema);
    const { items, meta } = await listAuditLogs(auth, query);
    sendPage(res, items, meta);
  }),
);
