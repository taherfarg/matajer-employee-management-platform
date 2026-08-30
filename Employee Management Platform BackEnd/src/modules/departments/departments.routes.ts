import { Router, type Request, type Response } from 'express';
import { asyncHandler, sendCreated, sendData } from '../../common/http';
import { idParamSchema, parseBody, parseParams } from '../../common/validate';
import { authenticate, requireAdmin, requireAuth } from '../../middleware/authenticate';
import { auditContextFromRequest } from '../../services/audit.service';
import {
  createDepartment,
  departmentSchema,
  listDepartments,
  updateDepartment,
  updateDepartmentSchema,
} from './departments.service';

export const departmentsRouter: Router = Router();

departmentsRouter.use(authenticate);

departmentsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    sendData(res, await listDepartments(requireAuth(req)));
  }),
);

departmentsRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const input = parseBody(req, departmentSchema);
    sendCreated(res, await createDepartment(requireAuth(req), input, auditContextFromRequest(req)));
  }),
);

departmentsRouter.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parseParams(req, idParamSchema);
    const input = parseBody(req, updateDepartmentSchema);
    sendData(res, await updateDepartment(requireAuth(req), id, input, auditContextFromRequest(req)));
  }),
);
