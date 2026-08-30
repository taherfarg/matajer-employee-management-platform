import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { paginationSchema, buildPageMeta, toSkipTake, type PageMeta } from '../../common/http';
import { NotFoundError } from '../../common/errors';
import type { AuthContext } from '../../common/auth-context';

export const notificationQuerySchema = paginationSchema.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
});

export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

export async function listNotifications(
  auth: AuthContext,
  query: NotificationQuery,
): Promise<{ items: unknown[]; meta: PageMeta; unreadCount: number }> {
  const where = { userId: auth.userId, ...(query.unreadOnly ? { isRead: false } : {}) };
  const { skip, take } = toSkipTake(query);

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: auth.userId, isRead: false } }),
  ]);

  return { items, meta: buildPageMeta(query.page, query.pageSize, total), unreadCount };
}

/**
 * Scoped by `userId` in the `where` clause rather than by loading and checking,
 * so a caller cannot mark someone else's notification as read even with a valid
 * notification id.
 */
export async function markNotificationRead(auth: AuthContext, notificationId: string): Promise<unknown> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId: auth.userId },
    data: { isRead: true, readAt: new Date() },
  });

  if (result.count === 0) {
    throw new NotFoundError('Notification');
  }

  return prisma.notification.findUnique({ where: { id: notificationId } });
}

export async function markAllNotificationsRead(auth: AuthContext): Promise<{ updated: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId: auth.userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { updated: result.count };
}
