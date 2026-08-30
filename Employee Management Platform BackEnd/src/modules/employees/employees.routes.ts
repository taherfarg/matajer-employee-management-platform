import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { authenticate, requireAdmin } from '../../middleware/authenticate';
import * as controller from './employees.controller';

export const employeesRouter: Router = Router();

employeesRouter.use(authenticate);

/**
 * Reads are open to any authenticated user; the serializer decides how much of
 * each record comes back. Writes are gated on the management roles here, and
 * checked again per record in the service so entity scope is enforced.
 */
employeesRouter.get('/', asyncHandler(controller.listEmployees));
employeesRouter.post('/', requireAdmin, asyncHandler(controller.createEmployee));

employeesRouter.get('/:id', asyncHandler(controller.getEmployee));
employeesRouter.patch('/:id', requireAdmin, asyncHandler(controller.updateEmployee));
employeesRouter.post('/:id/status', requireAdmin, asyncHandler(controller.changeStatus));

employeesRouter.get('/:id/timeline', asyncHandler(controller.getTimeline));
employeesRouter.get('/:id/reports', asyncHandler(controller.getDirectReports));
employeesRouter.get('/:id/leave-balances', asyncHandler(controller.getBalances));

employeesRouter.get('/:id/compensation', asyncHandler(controller.getCompensation));
employeesRouter.post('/:id/compensation', requireAdmin, asyncHandler(controller.addCompensation));

employeesRouter.get('/:id/documents', asyncHandler(controller.getDocuments));
employeesRouter.post('/:id/documents', requireAdmin, asyncHandler(controller.addDocument));
