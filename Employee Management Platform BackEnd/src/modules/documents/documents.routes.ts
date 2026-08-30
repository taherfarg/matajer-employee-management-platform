import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../common/http';
import { idParamSchema, parseParams } from '../../common/validate';
import { authenticate, requireAdmin, requireAuth } from '../../middleware/authenticate';
import { auditContextFromRequest } from '../../services/audit.service';
import { sendData } from '../../common/http';
import { deleteEmployeeDocument, getDocumentContent } from './documents.service';

/**
 * Documents are created and listed under `/employees/:id/documents`, where they
 * belong. Deleting only needs the document id, so it lives here.
 */
export const documentsRouter: Router = Router();

documentsRouter.use(authenticate);

/** Letter body. Open to the employee it belongs to, and to HR within scope. */
documentsRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parseParams(req, idParamSchema);
    sendData(res, await getDocumentContent(requireAuth(req), id));
  }),
);

documentsRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = parseParams(req, idParamSchema);
    await deleteEmployeeDocument(requireAuth(req), id, auditContextFromRequest(req));
    res.status(204).send();
  }),
);
