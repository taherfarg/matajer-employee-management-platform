import { Router, type Request, type Response } from 'express';
import { asyncHandler, sendCreated, sendData } from '../../common/http';
import { idParamSchema, parseBody, parseParams } from '../../common/validate';
import { authenticate, requireAdmin, requireAuth } from '../../middleware/authenticate';
import { auditContextFromRequest } from '../../services/audit.service';
import {
  createLegalEntity,
  createLegalEntitySchema,
  getLegalEntity,
  listLegalEntities,
  updateLegalEntity,
  updateLegalEntitySchema,
} from './legal-entities.service';

export const legalEntitiesRouter: Router = Router();

legalEntitiesRouter.use(authenticate);

legalEntitiesRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    sendData(res, await listLegalEntities(requireAuth(req)));
  }),
);

legalEntitiesRouter.post(
  '/',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const input = parseBody(req, createLegalEntitySchema);
    sendCreated(res, await createLegalEntity(requireAuth(req), input, auditContextFromRequest(req)));
  }),
);

legalEntitiesRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parseParams(req, idParamSchema);
    sendData(res, await getLegalEntity(requireAuth(req), id));
  }),
);

legalEntitiesRouter.patch(
  '/:id',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parseParams(req, idParamSchema);
    const input = parseBody(req, updateLegalEntitySchema);
    sendData(res, await updateLegalEntity(requireAuth(req), id, input, auditContextFromRequest(req)));
  }),
);
