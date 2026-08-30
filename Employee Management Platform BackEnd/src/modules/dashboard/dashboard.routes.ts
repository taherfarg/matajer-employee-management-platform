import { Router, type Request, type Response } from 'express';
import { asyncHandler, sendData } from '../../common/http';
import { authenticate, requireAdmin, requireAuth } from '../../middleware/authenticate';
import {
  getCompensationOverview,
  getDashboard,
  getManagementAlerts,
} from './dashboard.service';

export const dashboardRouter: Router = Router();

dashboardRouter.use(authenticate);

/** One entry point that returns the management or employee view by role. */
dashboardRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    sendData(res, await getDashboard(requireAuth(req)));
  }),
);

dashboardRouter.get(
  '/alerts',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    sendData(res, await getManagementAlerts(requireAuth(req)));
  }),
);

/** Salary aggregates, so restricted to the roles that may see compensation. */
dashboardRouter.get(
  '/compensation-overview',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    sendData(res, await getCompensationOverview(requireAuth(req)));
  }),
);
