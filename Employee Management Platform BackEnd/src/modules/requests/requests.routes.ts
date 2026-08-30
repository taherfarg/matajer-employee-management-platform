import { Router, type Request, type Response } from 'express';
import { asyncHandler, sendCreated, sendData } from '../../common/http';
import { idParamSchema, parseBody, parseParams, parseQuery } from '../../common/validate';
import { authenticate, requireAuth } from '../../middleware/authenticate';
import { auditContextFromRequest } from '../../services/audit.service';
import {
  cancelSchema,
  decisionSchema,
  documentRequestSchema,
  leavePreviewSchema,
  leaveRequestSchema,
  profileChangeRequestSchema,
  rejectionSchema,
  requestQuerySchema,
} from './requests.schema';
import * as requestsService from './requests.service';

export const requestsRouter: Router = Router();

requestsRouter.use(authenticate);

/**
 * One inbox for every request type. What a caller sees is decided in the
 * service: HR sees their entity, a manager sees their team plus their own, an
 * employee sees only their own.
 */
requestsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const query = parseQuery(req, requestQuerySchema);
    const { items, meta, summary } = await requestsService.listRequests(auth, query);
    res.json({ data: items, meta, summary });
  }),
);

/**
 * Shows how many leave days a date range will actually cost before the employee
 * commits to it, using their own entity's working week and holidays.
 */
requestsRouter.post(
  '/leave/preview',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const input = parseBody(req, leavePreviewSchema);
    sendData(res, await requestsService.previewLeaveDays(auth, input));
  }),
);

requestsRouter.post(
  '/leave',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const input = parseBody(req, leaveRequestSchema);
    sendCreated(res, await requestsService.submitLeaveRequest(auth, input, auditContextFromRequest(req)));
  }),
);

requestsRouter.post(
  '/document',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const input = parseBody(req, documentRequestSchema);
    sendCreated(res, await requestsService.submitDocumentRequest(auth, input, auditContextFromRequest(req)));
  }),
);

requestsRouter.post(
  '/profile-change',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const input = parseBody(req, profileChangeRequestSchema);
    sendCreated(res, await requestsService.submitProfileChangeRequest(auth, input, auditContextFromRequest(req)));
  }),
);

requestsRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { id } = parseParams(req, idParamSchema);
    sendData(res, await requestsService.getRequest(auth, id));
  }),
);

// Approve and reject are not role-gated at the router: a line manager is not an
// admin but may still decide their own team's requests. The rule lives in
// assertCanDecideRequest, which also blocks deciding your own.
requestsRouter.post(
  '/:id/approve',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { id } = parseParams(req, idParamSchema);
    const input = parseBody(req, decisionSchema);
    sendData(res, await requestsService.approveRequest(auth, id, input, auditContextFromRequest(req)));
  }),
);

requestsRouter.post(
  '/:id/reject',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { id } = parseParams(req, idParamSchema);
    const input = parseBody(req, rejectionSchema);
    sendData(res, await requestsService.rejectRequest(auth, id, input, auditContextFromRequest(req)));
  }),
);

requestsRouter.post(
  '/:id/cancel',
  asyncHandler(async (req: Request, res: Response) => {
    const auth = requireAuth(req);
    const { id } = parseParams(req, idParamSchema);
    const { note } = parseBody(req, cancelSchema);
    sendData(res, await requestsService.cancelRequest(auth, id, note, auditContextFromRequest(req)));
  }),
);
