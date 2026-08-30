import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { dateStringSchema, optionalTrimmedString, requiredTrimmedString, toUtcDate } from '../../common/validate';
import { NotFoundError, ValidationError } from '../../common/errors';
import type { AuthContext } from '../../common/auth-context';
import { assertEntityInScope, assertIsManagement, isManagement, scopedEntityId } from '../../services/access';
import { recordAudit, type AuditInput } from '../../services/audit.service';
import { countWorkingDays } from '../../services/working-days';

type Fingerprint = Pick<AuditInput, 'ipAddress' | 'userAgent'>;

export const leaveTypeSchema = z.object({
  legalEntityId: optionalTrimmedString(40),
  code: requiredTrimmedString(2, 30).transform((value) => value.toUpperCase()),
  name: requiredTrimmedString(2, 80),
  description: optionalTrimmedString(300),
  colorHex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex colour such as #2563eb')
    .default('#64748b'),
  annualEntitlementDays: z.coerce.number().min(0).max(365),
  isPaid: z.boolean().default(true),
  requiresAttachment: z.boolean().default(false),
  allowsHalfDay: z.boolean().default(true),
  minNoticeDays: z.coerce.number().int().min(0).max(180).default(0),
  maxConsecutiveDays: z.coerce.number().int().min(1).max(365).optional(),
  carryOverMaxDays: z.coerce.number().min(0).max(90).default(0),
  restrictedToGender: z.enum(['MALE', 'FEMALE', 'UNDISCLOSED']).optional(),
  isActive: z.boolean().default(true),
});

export const holidaySchema = z.object({
  legalEntityId: requiredTrimmedString(1, 40),
  name: requiredTrimmedString(2, 120),
  date: dateStringSchema,
  isRecurringAnnually: z.boolean().default(false),
});

export const calendarQuerySchema = z.object({
  from: dateStringSchema,
  to: dateStringSchema,
  legalEntityId: optionalTrimmedString(40),
});

export type LeaveTypeInput = z.infer<typeof leaveTypeSchema>;
export type HolidayInput = z.infer<typeof holidaySchema>;

function serializeLeaveType(type: {
  id: string;
  legalEntityId: string | null;
  code: string;
  name: string;
  description: string | null;
  colorHex: string;
  annualEntitlementDays: Prisma.Decimal;
  isPaid: boolean;
  requiresAttachment: boolean;
  allowsHalfDay: boolean;
  minNoticeDays: number;
  maxConsecutiveDays: number | null;
  carryOverMaxDays: Prisma.Decimal;
  restrictedToGender: string | null;
  isActive: boolean;
}) {
  return {
    id: type.id,
    legalEntityId: type.legalEntityId,
    code: type.code,
    name: type.name,
    description: type.description,
    colorHex: type.colorHex,
    annualEntitlementDays: Number(type.annualEntitlementDays),
    isPaid: type.isPaid,
    requiresAttachment: type.requiresAttachment,
    allowsHalfDay: type.allowsHalfDay,
    minNoticeDays: type.minNoticeDays,
    maxConsecutiveDays: type.maxConsecutiveDays,
    carryOverMaxDays: Number(type.carryOverMaxDays),
    restrictedToGender: type.restrictedToGender,
    isActive: type.isActive,
    /** Null entity means the policy is company-wide. */
    scope: type.legalEntityId ? 'ENTITY' : 'GLOBAL',
  };
}

/**
 * Leave policy applicable to one legal entity: its own types plus any
 * company-wide ones. This is how the same platform serves a UAE entity with 30
 * days of annual leave and an Egyptian entity with 21.
 */
export async function listLeaveTypes(
  auth: AuthContext,
  filters: { legalEntityId?: string; includeInactive?: boolean },
): Promise<unknown[]> {
  const entityId = filters.legalEntityId ?? scopedEntityId(auth) ?? undefined;

  const types = await prisma.leaveType.findMany({
    where: {
      ...(filters.includeInactive && isManagement(auth) ? {} : { isActive: true }),
      ...(entityId ? { OR: [{ legalEntityId: entityId }, { legalEntityId: null }] } : {}),
    },
    orderBy: [{ legalEntityId: 'asc' }, { name: 'asc' }],
  });

  return types.map(serializeLeaveType);
}

export async function createLeaveType(
  auth: AuthContext,
  input: LeaveTypeInput,
  fingerprint: Fingerprint,
): Promise<unknown> {
  assertIsManagement(auth);
  if (input.legalEntityId) assertEntityInScope(auth, input.legalEntityId);

  const created = await prisma.leaveType.create({
    data: {
      legalEntityId: input.legalEntityId ?? null,
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      colorHex: input.colorHex,
      annualEntitlementDays: new Prisma.Decimal(input.annualEntitlementDays),
      isPaid: input.isPaid,
      requiresAttachment: input.requiresAttachment,
      allowsHalfDay: input.allowsHalfDay,
      minNoticeDays: input.minNoticeDays,
      maxConsecutiveDays: input.maxConsecutiveDays ?? null,
      carryOverMaxDays: new Prisma.Decimal(input.carryOverMaxDays),
      restrictedToGender: input.restrictedToGender ?? null,
      isActive: input.isActive,
    },
  });

  await recordAudit({
    action: 'CREATE',
    entityType: 'LeaveType',
    entityId: created.id,
    summary: `Created leave type ${created.code} (${created.name})`,
    actor: auth,
    ...fingerprint,
  });

  return serializeLeaveType(created);
}

export async function updateLeaveType(
  auth: AuthContext,
  leaveTypeId: string,
  input: Partial<LeaveTypeInput>,
  fingerprint: Fingerprint,
): Promise<unknown> {
  assertIsManagement(auth);

  const existing = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
  if (!existing) {
    throw new NotFoundError('Leave type');
  }
  if (existing.legalEntityId) assertEntityInScope(auth, existing.legalEntityId);

  const updated = await prisma.leaveType.update({
    where: { id: leaveTypeId },
    data: {
      name: input.name,
      description: input.description,
      colorHex: input.colorHex,
      annualEntitlementDays:
        input.annualEntitlementDays === undefined ? undefined : new Prisma.Decimal(input.annualEntitlementDays),
      isPaid: input.isPaid,
      requiresAttachment: input.requiresAttachment,
      allowsHalfDay: input.allowsHalfDay,
      minNoticeDays: input.minNoticeDays,
      maxConsecutiveDays: input.maxConsecutiveDays,
      carryOverMaxDays: input.carryOverMaxDays === undefined ? undefined : new Prisma.Decimal(input.carryOverMaxDays),
      isActive: input.isActive,
    },
  });

  await recordAudit({
    action: 'UPDATE',
    entityType: 'LeaveType',
    entityId: leaveTypeId,
    summary: `Updated leave type ${updated.code}`,
    actor: auth,
    ...fingerprint,
  });

  return serializeLeaveType(updated);
}

export async function listHolidays(
  auth: AuthContext,
  filters: { legalEntityId?: string; year?: number },
): Promise<unknown[]> {
  const entityId = filters.legalEntityId ?? scopedEntityId(auth) ?? undefined;
  const year = filters.year;

  const holidays = await prisma.holiday.findMany({
    where: {
      ...(entityId ? { legalEntityId: entityId } : {}),
      ...(year
        ? { date: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) } }
        : {}),
    },
    include: { legalEntity: { select: { id: true, code: true, name: true, countryCode: true } } },
    orderBy: { date: 'asc' },
  });

  return holidays.map((holiday) => ({
    id: holiday.id,
    name: holiday.name,
    date: holiday.date.toISOString().slice(0, 10),
    isRecurringAnnually: holiday.isRecurringAnnually,
    legalEntity: holiday.legalEntity,
  }));
}

export async function createHoliday(
  auth: AuthContext,
  input: HolidayInput,
  fingerprint: Fingerprint,
): Promise<unknown> {
  assertIsManagement(auth);
  assertEntityInScope(auth, input.legalEntityId);

  const holiday = await prisma.holiday.create({
    data: {
      legalEntityId: input.legalEntityId,
      name: input.name,
      date: toUtcDate(input.date),
      isRecurringAnnually: input.isRecurringAnnually,
    },
  });

  await recordAudit({
    action: 'CREATE',
    entityType: 'Holiday',
    entityId: holiday.id,
    summary: `Added public holiday ${input.name} on ${input.date}`,
    actor: auth,
    ...fingerprint,
  });

  return { ...holiday, date: holiday.date.toISOString().slice(0, 10) };
}

export async function deleteHoliday(
  auth: AuthContext,
  holidayId: string,
  fingerprint: Fingerprint,
): Promise<void> {
  assertIsManagement(auth);
  const holiday = await prisma.holiday.findUnique({ where: { id: holidayId } });
  if (!holiday) {
    throw new NotFoundError('Holiday');
  }
  assertEntityInScope(auth, holiday.legalEntityId);

  await prisma.holiday.delete({ where: { id: holidayId } });
  await recordAudit({
    action: 'DELETE',
    entityType: 'Holiday',
    entityId: holidayId,
    summary: `Removed public holiday ${holiday.name}`,
    actor: auth,
    ...fingerprint,
  });
}

/**
 * Converts a date range into chargeable leave days using the employee's own
 * legal entity calendar. Shared by the request validator and by the "preview
 * before you submit" endpoint so the number the employee sees is the number
 * that gets deducted.
 */
export async function calculateLeaveDays(params: {
  legalEntityId: string;
  startDate: Date;
  endDate: Date;
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
}): Promise<{ workingDays: number; holidays: { date: string; name: string }[] }> {
  const entity = await prisma.legalEntity.findUnique({
    where: { id: params.legalEntityId },
    select: { workWeek: true },
  });
  if (!entity) {
    throw new NotFoundError('Legal entity');
  }

  const holidays = await prisma.holiday.findMany({
    where: {
      legalEntityId: params.legalEntityId,
      date: { gte: params.startDate, lte: params.endDate },
    },
    select: { date: true, name: true },
    orderBy: { date: 'asc' },
  });

  const workingDays = countWorkingDays({
    start: params.startDate,
    end: params.endDate,
    workWeek: entity.workWeek,
    holidays: holidays.map((holiday) => holiday.date),
    halfDayStart: params.halfDayStart,
    halfDayEnd: params.halfDayEnd,
  });

  return {
    workingDays,
    holidays: holidays.map((holiday) => ({ date: holiday.date.toISOString().slice(0, 10), name: holiday.name })),
  };
}

export async function getLeaveBalances(employeeId: string, year: number): Promise<unknown[]> {
  const balances = await prisma.leaveBalance.findMany({
    where: { employeeId, year },
    include: { leaveType: true },
    orderBy: { leaveType: { name: 'asc' } },
  });

  return balances.map((balance) => {
    const entitled = Number(balance.entitledDays) + Number(balance.carriedOverDays);
    const used = Number(balance.usedDays);
    const pending = Number(balance.pendingDays);
    return {
      id: balance.id,
      year: balance.year,
      leaveType: serializeLeaveType(balance.leaveType),
      entitledDays: Number(balance.entitledDays),
      carriedOverDays: Number(balance.carriedOverDays),
      usedDays: used,
      pendingDays: pending,
      // What the employee can still book today: entitlement minus what is taken
      // and what is already awaiting a decision.
      availableDays: Number((entitled - used - pending).toFixed(2)),
      totalEntitlement: Number(entitled.toFixed(2)),
    };
  });
}

/**
 * Team leave calendar. Everyone sees who is away and on what kind of leave,
 * which is the point of a shared calendar; the stated reason stays private to
 * the employee, their manager and HR.
 */
export async function getLeaveCalendar(
  auth: AuthContext,
  params: { from: Date; to: Date; legalEntityId?: string },
): Promise<unknown[]> {
  const entityId = params.legalEntityId ?? scopedEntityId(auth) ?? auth.legalEntityId ?? undefined;

  const entries = await prisma.leaveRequestDetail.findMany({
    where: {
      startDate: { lte: params.to },
      endDate: { gte: params.from },
      request: {
        status: 'APPROVED',
        ...(entityId ? { legalEntityId: entityId } : {}),
      },
    },
    include: {
      leaveType: { select: { id: true, name: true, colorHex: true, isPaid: true } },
      request: {
        select: {
          id: true,
          reference: true,
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              jobTitle: true,
              avatarUrl: true,
              managerId: true,
              legalEntityId: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { startDate: 'asc' },
  });

  return entries.map((entry) => {
    const employee = entry.request.employee;
    const maySeeReason =
      isManagement(auth) || employee.managerId === auth.employeeId || employee.id === auth.employeeId;

    return {
      requestId: entry.request.id,
      reference: entry.request.reference,
      startDate: entry.startDate.toISOString().slice(0, 10),
      endDate: entry.endDate.toISOString().slice(0, 10),
      workingDays: Number(entry.workingDays),
      halfDayStart: entry.halfDayStart,
      halfDayEnd: entry.halfDayEnd,
      leaveType: entry.leaveType,
      reason: maySeeReason ? entry.reason : null,
      employee: {
        id: employee.id,
        fullName: `${employee.firstName} ${employee.lastName}`,
        jobTitle: employee.jobTitle,
        avatarUrl: employee.avatarUrl,
        department: employee.department,
      },
    };
  });
}

/** Guards against a second request covering days already booked or pending. */
export async function assertNoOverlappingLeave(
  employeeId: string,
  startDate: Date,
  endDate: Date,
  excludeRequestId?: string,
): Promise<void> {
  const overlap = await prisma.leaveRequestDetail.findFirst({
    where: {
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      request: {
        employeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      },
    },
    include: { request: { select: { reference: true, status: true } } },
  });

  if (overlap) {
    throw new ValidationError('Validation failed', {
      startDate: [
        `These dates overlap request ${overlap.request.reference}, which is ${overlap.request.status.toLowerCase()}`,
      ],
    });
  }
}
