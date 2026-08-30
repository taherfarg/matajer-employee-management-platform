import type { Request, Response } from 'express';
import { sendCreated, sendData, sendPage } from '../../common/http';
import { idParamSchema, parseBody, parseParams, parseQuery } from '../../common/validate';
import { requireAuth } from '../../middleware/authenticate';
import { ForbiddenError } from '../../common/errors';
import {
  assertCanViewDocuments,
  assertCanViewPersonalData,
  canViewCompensation,
  isDirectManagerOf,
  isManagement,
  isSelf,
} from '../../services/access';
import { auditContextFromRequest } from '../../services/audit.service';
import {
  createCompensationRecord,
  createCompensationSchema,
  getCompensationHistory,
} from '../compensation/compensation.service';
import {
  createDocumentSchema,
  createEmployeeDocument,
  listEmployeeDocuments,
} from '../documents/documents.service';
import { getLeaveBalances } from '../leave/leave.service';
import {
  changeStatusSchema,
  createEmployeeSchema,
  employeeQuerySchema,
  updateEmployeeSchema,
} from './employees.schema';
import * as employeesService from './employees.service';

export async function listEmployees(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const query = parseQuery(req, employeeQuerySchema);
  const { items, meta } = await employeesService.listEmployees(auth, query);
  sendPage(res, items, meta);
}

export async function getEmployee(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseParams(req, idParamSchema);
  sendData(res, await employeesService.getEmployee(auth, id));
}

export async function createEmployee(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const input = parseBody(req, createEmployeeSchema);
  const result = await employeesService.createEmployee(auth, input, auditContextFromRequest(req));
  // The temporary password is returned exactly once, at creation. It is stored
  // only as a bcrypt hash, so it cannot be read back later.
  sendCreated(res, result);
}

export async function updateEmployee(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseParams(req, idParamSchema);
  const input = parseBody(req, updateEmployeeSchema);
  sendData(res, await employeesService.updateEmployee(auth, id, input, auditContextFromRequest(req)));
}

export async function changeStatus(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseParams(req, idParamSchema);
  const input = parseBody(req, changeStatusSchema);
  sendData(res, await employeesService.changeEmployeeStatus(auth, id, input, auditContextFromRequest(req)));
}

export async function getTimeline(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseParams(req, idParamSchema);
  const employee = await employeesService.loadAccessSubject(id);
  assertCanViewPersonalData(auth, employee);

  const timeline = await employeesService.getEmployeeTimeline(id, {
    includeCompensation: canViewCompensation(auth, employee),
  });
  sendData(res, timeline);
}

export async function getDirectReports(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseParams(req, idParamSchema);
  sendData(res, await employeesService.getDirectReports(id, auth));
}

export async function getCompensation(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseParams(req, idParamSchema);
  sendData(res, await getCompensationHistory(auth, id, auditContextFromRequest(req)));
}

export async function addCompensation(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseParams(req, idParamSchema);
  const input = parseBody(req, createCompensationSchema);
  sendCreated(res, await createCompensationRecord(auth, id, input, auditContextFromRequest(req)));
}

export async function getDocuments(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseParams(req, idParamSchema);
  sendData(res, await listEmployeeDocuments(auth, id));
}

export async function addDocument(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseParams(req, idParamSchema);
  const input = parseBody(req, createDocumentSchema);
  sendCreated(res, await createEmployeeDocument(auth, id, input, auditContextFromRequest(req)));
}

export async function getBalances(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const { id } = parseParams(req, idParamSchema);
  const employee = await employeesService.loadAccessSubject(id);

  // A line manager needs to see remaining leave to plan around it, so the rule
  // here is one step wider than for personal data.
  const allowed = isSelf(auth, employee) || isManagement(auth) || isDirectManagerOf(auth, employee);
  if (!allowed) {
    throw new ForbiddenError('You do not have access to this leave balance');
  }
  if (isManagement(auth)) {
    assertCanViewDocuments(auth, employee);
  }

  const year = Number(req.query.year ?? new Date().getUTCFullYear());
  sendData(res, await getLeaveBalances(id, Number.isNaN(year) ? new Date().getUTCFullYear() : year));
}
