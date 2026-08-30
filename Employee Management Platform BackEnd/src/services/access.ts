import type { Prisma } from '@prisma/client';
import type { AuthContext } from '../common/auth-context';
import { ForbiddenError } from '../common/errors';

/**
 * Every authorization decision in the API is made by a function in this file.
 *
 * Keeping them together means the privacy rules can be read in one sitting and
 * tested directly, instead of being spread across controllers where a missing
 * check is invisible.
 */

/** ADMIN and HR_ADMIN both manage people; they differ only in entity scope. */
export function isManagement(auth: AuthContext): boolean {
  return auth.role === 'ADMIN' || auth.role === 'HR_ADMIN';
}

/** A global ADMIN sees every legal entity; an HR_ADMIN may be pinned to one. */
export function scopedEntityId(auth: AuthContext): string | null {
  if (auth.role === 'ADMIN') return null;
  return auth.scopedLegalEntityId;
}

/**
 * Prisma `where` fragment restricting a query to the entities the caller may
 * see. Spread into any employee/request query that management can run.
 */
export function entityScopeWhere(auth: AuthContext): Prisma.EmployeeWhereInput {
  const entityId = scopedEntityId(auth);
  return entityId ? { legalEntityId: entityId } : {};
}

export function assertEntityInScope(auth: AuthContext, legalEntityId: string): void {
  const entityId = scopedEntityId(auth);
  if (entityId && entityId !== legalEntityId) {
    throw new ForbiddenError('This record belongs to a legal entity outside your access scope');
  }
}

/** The shape any authorization check needs from an employee row. */
export interface EmployeeAccessSubject {
  id: string;
  legalEntityId: string;
  managerId: string | null;
}

export function isSelf(auth: AuthContext, employee: EmployeeAccessSubject): boolean {
  return auth.employeeId !== null && auth.employeeId === employee.id;
}

export function isDirectManagerOf(auth: AuthContext, employee: EmployeeAccessSubject): boolean {
  return auth.employeeId !== null && employee.managerId === auth.employeeId;
}

function managesEmployee(auth: AuthContext, employee: EmployeeAccessSubject): boolean {
  if (!isManagement(auth)) return false;
  const entityId = scopedEntityId(auth);
  return entityId === null || entityId === employee.legalEntityId;
}

/**
 * How much of an employee record the caller is allowed to see.
 *
 *  FULL      - HR/admin within scope, or the employee themselves.
 *  MANAGER   - a direct manager: work context and contact details, no personal
 *              identity data and never compensation.
 *  DIRECTORY - any authenticated colleague: the same information a company
 *              address book would show. Real HRIS products do this, and it is
 *              far more useful than hiding colleagues entirely.
 */
export type EmployeeViewLevel = 'FULL' | 'MANAGER' | 'DIRECTORY';

export function employeeViewLevel(auth: AuthContext, employee: EmployeeAccessSubject): EmployeeViewLevel {
  if (isSelf(auth, employee) || managesEmployee(auth, employee)) return 'FULL';
  if (isDirectManagerOf(auth, employee)) return 'MANAGER';
  return 'DIRECTORY';
}

/**
 * Compensation is the most sensitive data in the system. Only HR/admin within
 * scope and the employee themselves may read it - explicitly not the line
 * manager, who can otherwise see most of the record.
 */
export function canViewCompensation(auth: AuthContext, employee: EmployeeAccessSubject): boolean {
  return isSelf(auth, employee) || managesEmployee(auth, employee);
}

export function assertCanViewCompensation(auth: AuthContext, employee: EmployeeAccessSubject): void {
  if (!canViewCompensation(auth, employee)) {
    throw new ForbiddenError('Compensation details are restricted to HR and the employee');
  }
}

/** Only HR/admin may change compensation - an employee cannot edit their own. */
export function assertCanEditCompensation(auth: AuthContext, employee: EmployeeAccessSubject): void {
  if (!managesEmployee(auth, employee)) {
    throw new ForbiddenError('Only HR can record a compensation change');
  }
}

export function canEditEmployee(auth: AuthContext, employee: EmployeeAccessSubject): boolean {
  return managesEmployee(auth, employee);
}

export function assertCanEditEmployee(auth: AuthContext, employee: EmployeeAccessSubject): void {
  if (!canEditEmployee(auth, employee)) {
    throw new ForbiddenError('Only HR can edit employee records');
  }
}

/**
 * Personal identity data - date of birth, home address, nationality, emergency
 * contact - is visible to HR within scope and to the employee only.
 */
export function assertCanViewPersonalData(auth: AuthContext, employee: EmployeeAccessSubject): void {
  if (!isSelf(auth, employee) && !managesEmployee(auth, employee)) {
    throw new ForbiddenError('You do not have access to this employee record');
  }
}

/**
 * Documents can hold passports and contracts, so the rule is stricter than the
 * directory: HR within scope, or the employee themselves. Records flagged
 * confidential are additionally hidden from the employee.
 */
export function assertCanViewDocuments(auth: AuthContext, employee: EmployeeAccessSubject): void {
  assertCanViewPersonalData(auth, employee);
}

export function canViewConfidentialDocuments(auth: AuthContext, employee: EmployeeAccessSubject): boolean {
  return managesEmployee(auth, employee);
}

/** A request is visible to its owner, the owner's manager, and HR within scope. */
export function canViewRequest(
  auth: AuthContext,
  request: { employeeId: string; legalEntityId: string },
  requesterManagerId: string | null,
): boolean {
  const subject: EmployeeAccessSubject = {
    id: request.employeeId,
    legalEntityId: request.legalEntityId,
    managerId: requesterManagerId,
  };
  return isSelf(auth, subject) || managesEmployee(auth, subject) || isDirectManagerOf(auth, subject);
}

/**
 * Approving is narrower than viewing: HR within scope, or the requester's direct
 * manager. Nobody may decide their own request, including an admin - the
 * four-eyes rule that keeps the audit trail meaningful.
 */
export function assertCanDecideRequest(
  auth: AuthContext,
  request: { employeeId: string; legalEntityId: string },
  requesterManagerId: string | null,
): void {
  const subject: EmployeeAccessSubject = {
    id: request.employeeId,
    legalEntityId: request.legalEntityId,
    managerId: requesterManagerId,
  };

  if (isSelf(auth, subject)) {
    throw new ForbiddenError('You cannot approve or reject your own request');
  }
  if (!managesEmployee(auth, subject) && !isDirectManagerOf(auth, subject)) {
    throw new ForbiddenError('Only HR or the direct manager can decide this request');
  }
}

export function assertIsManagement(auth: AuthContext): void {
  if (!isManagement(auth)) {
    throw new ForbiddenError('This action is restricted to HR and administrators');
  }
}
