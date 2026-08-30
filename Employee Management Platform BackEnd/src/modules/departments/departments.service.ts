import { z } from 'zod';
import { prisma } from '../../db/prisma';
import { optionalTrimmedString, requiredTrimmedString } from '../../common/validate';
import { NotFoundError, ValidationError } from '../../common/errors';
import type { AuthContext } from '../../common/auth-context';
import { assertIsManagement, entityScopeWhere } from '../../services/access';
import { recordAudit, type AuditInput } from '../../services/audit.service';

type Fingerprint = Pick<AuditInput, 'ipAddress' | 'userAgent'>;

/**
 * Departments are company-wide rather than per legal entity.
 *
 * In a group that operates one business through several legal entities,
 * Engineering is one function that happens to employ people in the UAE and in
 * Egypt. Modelling it per entity would fragment reporting for no benefit; the
 * per-entity headcount is a grouping of the same department instead.
 */
export const departmentSchema = z.object({
  code: requiredTrimmedString(2, 20).transform((value) => value.toUpperCase()),
  name: requiredTrimmedString(2, 80),
  description: optionalTrimmedString(300),
  headId: optionalTrimmedString(40),
});

export const updateDepartmentSchema = departmentSchema.partial().omit({ code: true });

export type DepartmentInput = z.infer<typeof departmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export async function listDepartments(auth: AuthContext): Promise<unknown[]> {
  const scope = entityScopeWhere(auth);

  const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    include: {
      head: { select: { id: true, firstName: true, lastName: true, jobTitle: true, avatarUrl: true } },
    },
  });

  // Headcount is counted within the caller's entity scope, so a scoped HR_ADMIN
  // sees the size of each department in their own entity.
  const counts = await prisma.employee.groupBy({
    by: ['departmentId'],
    where: { status: { not: 'OFFBOARDED' }, ...scope },
    _count: { _all: true },
  });
  const countByDepartment = new Map(counts.map((row) => [row.departmentId, row._count._all]));

  return departments.map((department) => ({
    id: department.id,
    code: department.code,
    name: department.name,
    description: department.description,
    head: department.head
      ? {
          id: department.head.id,
          fullName: `${department.head.firstName} ${department.head.lastName}`,
          jobTitle: department.head.jobTitle,
          avatarUrl: department.head.avatarUrl,
        }
      : null,
    headcount: countByDepartment.get(department.id) ?? 0,
  }));
}

export async function createDepartment(
  auth: AuthContext,
  input: DepartmentInput,
  fingerprint: Fingerprint,
): Promise<unknown> {
  assertIsManagement(auth);

  if (input.headId) {
    const head = await prisma.employee.findUnique({ where: { id: input.headId }, select: { id: true } });
    if (!head) {
      throw new ValidationError('Validation failed', { headId: ['That employee does not exist'] });
    }
  }

  const department = await prisma.department.create({
    data: {
      code: input.code,
      name: input.name,
      description: input.description ?? null,
      headId: input.headId ?? null,
    },
  });

  await recordAudit({
    action: 'CREATE',
    entityType: 'Department',
    entityId: department.id,
    summary: `Created department ${department.code} (${department.name})`,
    actor: auth,
    ...fingerprint,
  });

  return department;
}

export async function updateDepartment(
  auth: AuthContext,
  departmentId: string,
  input: UpdateDepartmentInput,
  fingerprint: Fingerprint,
): Promise<unknown> {
  assertIsManagement(auth);

  const existing = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!existing) {
    throw new NotFoundError('Department');
  }

  const department = await prisma.department.update({
    where: { id: departmentId },
    data: {
      name: input.name,
      description: input.description,
      headId: input.headId === undefined ? undefined : (input.headId ?? null),
    },
  });

  await recordAudit({
    action: 'UPDATE',
    entityType: 'Department',
    entityId: departmentId,
    summary: `Updated department ${department.code}`,
    actor: auth,
    ...fingerprint,
  });

  return department;
}
