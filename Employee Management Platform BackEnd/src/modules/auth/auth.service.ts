import crypto from 'node:crypto';
import type { Role } from '@prisma/client';
import { prisma } from '../../db/prisma';
import { env } from '../../config/env';
import { ConflictError, UnauthorizedError } from '../../common/errors';
import type { AuthContext } from '../../common/auth-context';
import { recordAudit } from '../../services/audit.service';
import { hashPassword, verifyPassword } from './password';
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from './token.service';
import type { ChangePasswordInput, LoginInput } from './auth.schema';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * A real bcrypt hash of a throwaway value, computed once at startup. The
 * "unknown email" branch compares against it so that path costs the same time as
 * a genuine password check and cannot be used to enumerate accounts.
 */
const timingDecoyHash = hashPassword(crypto.randomBytes(24).toString('hex'));

export interface ClientFingerprint {
  ipAddress: string | null;
  userAgent: string | null;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface AuthenticatedProfile {
  user: {
    id: string;
    email: string;
    role: string;
    mustChangePassword: boolean;
    lastLoginAt: Date | null;
    scopedLegalEntityId: string | null;
  };
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    fullName: string;
    jobTitle: string;
    status: string;
    avatarUrl: string | null;
    department: { id: string; name: string } | null;
    legalEntity: { id: string; code: string; name: string; countryCode: string; currency: string };
    manager: { id: string; fullName: string } | null;
  } | null;
}

const profileInclude = {
  employee: {
    select: {
      id: true,
      employeeNumber: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      status: true,
      avatarUrl: true,
      department: { select: { id: true, name: true } },
      legalEntity: { select: { id: true, code: true, name: true, countryCode: true, currency: true } },
      manager: { select: { id: true, firstName: true, lastName: true } },
    },
  },
} as const;

type UserWithProfile = {
  id: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  scopedLegalEntityId: string | null;
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    status: string;
    avatarUrl: string | null;
    department: { id: string; name: string } | null;
    legalEntity: { id: string; code: string; name: string; countryCode: string; currency: string };
    manager: { id: string; firstName: string; lastName: string } | null;
  } | null;
};

function toProfile(user: UserWithProfile): AuthenticatedProfile {
  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      lastLoginAt: user.lastLoginAt,
      scopedLegalEntityId: user.scopedLegalEntityId,
    },
    employee: user.employee
      ? {
          id: user.employee.id,
          employeeNumber: user.employee.employeeNumber,
          firstName: user.employee.firstName,
          lastName: user.employee.lastName,
          fullName: `${user.employee.firstName} ${user.employee.lastName}`,
          jobTitle: user.employee.jobTitle,
          status: user.employee.status,
          avatarUrl: user.employee.avatarUrl,
          department: user.employee.department,
          legalEntity: user.employee.legalEntity,
          manager: user.employee.manager
            ? {
                id: user.employee.manager.id,
                fullName: `${user.employee.manager.firstName} ${user.employee.manager.lastName}`,
              }
            : null,
        }
      : null,
  };
}

async function issueSession(
  user: { id: string; email: string; role: Role; employeeId: string | null },
  client: ClientFingerprint,
): Promise<SessionTokens> {
  const refreshToken = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshTokenExpiry(),
      userAgent: client.userAgent,
      ipAddress: client.ipAddress,
    },
  });

  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId,
  });

  return { accessToken, refreshToken, expiresIn: env.JWT_ACCESS_TTL };
}

/**
 * Authenticates a set of credentials.
 *
 * Every failure path returns the same message and takes a comparable amount of
 * time, so the response cannot be used to enumerate which email addresses exist.
 * Repeated failures lock the individual account, which - together with the IP
 * rate limiter on the route - covers both targeted and distributed guessing.
 */
export async function login(
  input: LoginInput,
  client: ClientFingerprint,
): Promise<{ tokens: SessionTokens; profile: AuthenticatedProfile }> {
  const genericFailure = new UnauthorizedError('Invalid email or password');

  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      email: true,
      role: true,
      employeeId: true,
      passwordHash: true,
      isActive: true,
      mustChangePassword: true,
      lastLoginAt: true,
      scopedLegalEntityId: true,
      failedLoginAttempts: true,
      lockedUntil: true,
      ...profileInclude,
    },
  });

  if (!user) {
    await verifyPassword(input.password, await timingDecoyHash);
    await recordAudit({
      action: 'LOGIN_FAILED',
      entityType: 'User',
      summary: `Failed login for unknown address ${input.email}`,
      actorLabel: input.email,
      ...client,
    });
    throw genericFailure;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new UnauthorizedError(
      `Account temporarily locked after too many failed attempts. Try again after ${user.lockedUntil.toISOString()}.`,
    );
  }

  const passwordMatches = await verifyPassword(input.password, user.passwordHash);

  if (!passwordMatches) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: attempts,
        lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null,
      },
    });
    await recordAudit({
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      summary: shouldLock
        ? `Account locked after ${attempts} failed login attempts`
        : `Failed login attempt ${attempts} of ${MAX_FAILED_ATTEMPTS}`,
      actorLabel: user.email,
      ...client,
    });
    throw genericFailure;
  }

  if (!user.isActive) {
    throw new UnauthorizedError('This account has been deactivated. Contact your administrator.');
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    select: { lastLoginAt: true },
  });

  const tokens = await issueSession(user, client);

  await recordAudit({
    action: 'LOGIN',
    entityType: 'User',
    entityId: user.id,
    summary: `Signed in as ${user.role}`,
    actorLabel: `${user.email} (${user.role})`,
    ...client,
  });

  return {
    tokens,
    profile: toProfile({ ...user, lastLoginAt: updated.lastLoginAt }),
  };
}

/**
 * Exchanges a refresh token for a new pair, rotating the old one.
 *
 * If a token that has already been used is presented again, the whole family is
 * revoked: either it leaked, or a client is misbehaving, and both warrant
 * forcing a fresh login.
 */
export async function refreshSession(
  rawToken: string,
  client: ClientFingerprint,
): Promise<SessionTokens> {
  const tokenHash = hashRefreshToken(rawToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
      user: { select: { id: true, email: true, role: true, employeeId: true, isActive: true } },
    },
  });

  if (!stored) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (stored.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAudit({
      action: 'LOGOUT',
      entityType: 'User',
      entityId: stored.userId,
      summary: 'All sessions revoked after a reused refresh token was presented',
      actorLabel: stored.user.email,
      ...client,
    });
    throw new UnauthorizedError('Refresh token has already been used. Please sign in again.');
  }

  if (stored.expiresAt <= new Date()) {
    throw new UnauthorizedError('Refresh token has expired. Please sign in again.');
  }

  if (!stored.user.isActive) {
    throw new UnauthorizedError('This account has been deactivated');
  }

  const tokens = await issueSession(stored.user, client);

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date(), replacedBy: hashRefreshToken(tokens.refreshToken) },
  });

  return tokens;
}

export async function logout(rawToken: string | undefined, auth: AuthContext | undefined): Promise<void> {
  if (rawToken) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else if (auth) {
    // No token supplied - end every session for this user instead.
    await prisma.refreshToken.updateMany({
      where: { userId: auth.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  if (auth) {
    await recordAudit({ action: 'LOGOUT', entityType: 'User', entityId: auth.userId, summary: 'Signed out', actor: auth });
  }
}

export async function getProfile(auth: AuthContext): Promise<AuthenticatedProfile> {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      email: true,
      role: true,
      mustChangePassword: true,
      lastLoginAt: true,
      scopedLegalEntityId: true,
      ...profileInclude,
    },
  });

  if (!user) {
    throw new UnauthorizedError('Account no longer exists');
  }

  return toProfile(user);
}

export async function changePassword(
  auth: AuthContext,
  input: ChangePasswordInput,
  client: ClientFingerprint,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, email: true, passwordHash: true },
  });

  if (!user) {
    throw new UnauthorizedError('Account no longer exists');
  }

  const matches = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!matches) {
    throw new ConflictError('Current password is incorrect');
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false },
    });
    // Changing a password ends every other session - the usual expectation
    // after "someone might know my password".
    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await recordAudit({
    action: 'PASSWORD_CHANGE',
    entityType: 'User',
    entityId: user.id,
    summary: 'Password changed; all sessions revoked',
    actor: auth,
    ...client,
  });
}
