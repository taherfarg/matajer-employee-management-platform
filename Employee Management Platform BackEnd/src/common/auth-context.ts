import type { Role } from '@prisma/client';

/**
 * The authenticated caller, resolved once per request from the access token and
 * a fresh database read. Everything the authorization layer needs is here, so
 * services never have to re-query "who is asking".
 */
export interface AuthContext {
  userId: string;
  email: string;
  role: Role;
  /** The employee record this login belongs to. Null for pure system accounts. */
  employeeId: string | null;
  /** Legal entity of the caller's own employee record, if any. */
  legalEntityId: string | null;
  /** Restricts an HR_ADMIN to a single legal entity. Null means all entities. */
  scopedLegalEntityId: string | null;
}
