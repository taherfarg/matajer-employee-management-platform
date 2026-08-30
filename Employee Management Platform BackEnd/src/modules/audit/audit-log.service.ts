import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { buildPageMeta, paginationSchema, toSkipTake, type PageMeta } from '../../common/http';
import { dateStringSchema, optionalTrimmedString, toUtcDate } from '../../common/validate';
import type { AuthContext } from '../../common/auth-context';
import { assertIsManagement } from '../../services/access';

export const auditQuerySchema = paginationSchema.extend({
  entityType: optionalTrimmedString(60),
  entityId: optionalTrimmedString(40),
  actorUserId: optionalTrimmedString(40),
  action: z
    .enum([
      'CREATE',
      'UPDATE',
      'DELETE',
      'APPROVE',
      'REJECT',
      'CANCEL',
      'LOGIN',
      'LOGIN_FAILED',
      'LOGOUT',
      'PASSWORD_CHANGE',
      'VIEW_SENSITIVE',
    ])
    .optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  q: optionalTrimmedString(120),
});

export type AuditQuery = z.infer<typeof auditQuerySchema>;

/**
 * The audit trail is management-only and read-only. There is no update or delete
 * endpoint anywhere in the API - a trail that can be edited proves nothing.
 */
export async function listAuditLogs(
  auth: AuthContext,
  query: AuditQuery,
): Promise<{ items: unknown[]; meta: PageMeta }> {
  assertIsManagement(auth);

  const filters: Prisma.AuditLogWhereInput[] = [];
  if (query.entityType) filters.push({ entityType: query.entityType });
  if (query.entityId) filters.push({ entityId: query.entityId });
  if (query.actorUserId) filters.push({ actorUserId: query.actorUserId });
  if (query.action) filters.push({ action: query.action });
  if (query.from) filters.push({ createdAt: { gte: toUtcDate(query.from) } });
  if (query.to) {
    const to = toUtcDate(query.to);
    to.setUTCHours(23, 59, 59, 999);
    filters.push({ createdAt: { lte: to } });
  }
  if (query.q) {
    filters.push({
      OR: [
        { summary: { contains: query.q, mode: 'insensitive' } },
        { actorLabel: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }

  const where: Prisma.AuditLogWhereInput = filters.length > 0 ? { AND: filters } : {};
  const { skip, take } = toSkipTake(query);

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, meta: buildPageMeta(query.page, query.pageSize, total) };
}
