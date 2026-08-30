import type { NotificationType } from '@prisma/client';
import { prisma, type TxClient } from '../db/prisma';
import { logger } from '../config/logger';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}

/**
 * In-app notifications only. The brief rules out real email/SMS delivery, and a
 * database-backed inbox is what the frontend actually renders - adding a mail
 * provider would be integration risk with no demo value.
 *
 * Like auditing, a notification failure never fails the business action that
 * triggered it.
 */
export async function notifyUser(
  userId: string,
  input: NotificationInput,
  client: TxClient = prisma,
): Promise<void> {
  try {
    await client.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
      },
    });
  } catch (error) {
    logger.error({ err: error, userId, type: input.type }, 'Failed to create notification');
  }
}

/** Notifies the login account attached to an employee, if one exists. */
export async function notifyEmployee(
  employeeId: string,
  input: NotificationInput,
  client: TxClient = prisma,
): Promise<void> {
  const user = await client.user.findUnique({ where: { employeeId }, select: { id: true } });
  if (!user) return;
  await notifyUser(user.id, input, client);
}

/**
 * Fans a notification out to everyone who could act on it: global admins plus
 * HR admins scoped to the relevant legal entity, plus the requester's direct
 * manager. This is what makes a submitted request appear in the right inboxes.
 */
export async function notifyApprovers(
  params: { legalEntityId: string; managerEmployeeId?: string | null },
  input: NotificationInput,
  client: TxClient = prisma,
): Promise<void> {
  const approvers = await client.user.findMany({
    where: {
      isActive: true,
      OR: [
        { role: 'ADMIN' },
        { role: 'HR_ADMIN', scopedLegalEntityId: null },
        { role: 'HR_ADMIN', scopedLegalEntityId: params.legalEntityId },
        ...(params.managerEmployeeId ? [{ employeeId: params.managerEmployeeId }] : []),
      ],
    },
    select: { id: true },
  });

  await Promise.all(approvers.map((approver) => notifyUser(approver.id, input, client)));
}
