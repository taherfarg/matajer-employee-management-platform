import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { departmentsRouter } from './modules/departments/departments.routes';
import { documentsRouter } from './modules/documents/documents.routes';
import { employeesRouter } from './modules/employees/employees.routes';
import { leaveRouter } from './modules/leave/leave.routes';
import { legalEntitiesRouter } from './modules/legal-entities/legal-entities.routes';
import { meRouter } from './modules/me/me.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { requestsRouter } from './modules/requests/requests.routes';

/**
 * Single mount point for every versioned route. Adding `/api/v2` later means
 * adding a second router here, not restructuring the app.
 */
export const apiRouter: Router = Router();

apiRouter.get('/', (_req, res) => {
  res.json({
    data: {
      name: 'Employee Management Platform API',
      version: '1.0.0',
      endpoints: {
        auth: '/api/v1/auth',
        me: '/api/v1/me',
        employees: '/api/v1/employees',
        legalEntities: '/api/v1/legal-entities',
        departments: '/api/v1/departments',
        requests: '/api/v1/requests',
        leave: '/api/v1/leave',
        documents: '/api/v1/documents',
        dashboard: '/api/v1/dashboard',
        notifications: '/api/v1/notifications',
        auditLogs: '/api/v1/audit-logs',
      },
    },
  });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/me', meRouter);
apiRouter.use('/employees', employeesRouter);
apiRouter.use('/legal-entities', legalEntitiesRouter);
apiRouter.use('/departments', departmentsRouter);
apiRouter.use('/requests', requestsRouter);
apiRouter.use('/leave', leaveRouter);
apiRouter.use('/documents', documentsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/audit-logs', auditRouter);
