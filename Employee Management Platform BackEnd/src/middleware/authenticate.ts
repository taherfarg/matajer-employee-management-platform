import type { Role } from '@prisma/client';
import type { Request, RequestHandler } from 'express';
import { prisma } from '../db/prisma';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import type { AuthContext } from '../common/auth-context';
import { verifyAccessToken } from '../modules/auth/token.service';

function readBearerToken(req: Request): string {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing bearer token');
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    throw new UnauthorizedError('Missing bearer token');
  }
  return token;
}

/**
 * Verifies the access token and then re-reads the user from the database.
 *
 * The extra read is deliberate. A deactivated account, a changed role or a
 * revoked entity scope takes effect on the next request rather than whenever the
 * 15-minute token happens to expire.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  void (async () => {
    const payload = verifyAccessToken(readBearerToken(req));

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        employeeId: true,
        scopedLegalEntityId: true,
        employee: { select: { legalEntityId: true, status: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedError('Account no longer exists');
    }
    if (!user.isActive) {
      throw new UnauthorizedError('This account has been deactivated');
    }

    const auth: AuthContext = {
      userId: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employeeId,
      legalEntityId: user.employee?.legalEntityId ?? null,
      scopedLegalEntityId: user.scopedLegalEntityId,
    };

    req.auth = auth;
    next();
  })().catch(next);
};

/** Narrows `req.auth` for handlers that run behind `authenticate`. */
export function requireAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw new UnauthorizedError();
  }
  return req.auth;
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    try {
      const auth = requireAuth(req);
      if (!roles.includes(auth.role)) {
        throw new ForbiddenError('Your role does not permit this action');
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** ADMIN and HR_ADMIN share management capabilities; scope is applied separately. */
export const requireAdmin = requireRole('ADMIN', 'HR_ADMIN');
