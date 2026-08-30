import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../../config/env';
import { UnauthorizedError } from '../../common/errors';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  employeeId: string | null;
}

/**
 * Two different token types, on purpose:
 *
 *  - The access token is a short-lived JWT. It is self-describing so middleware
 *    can reject a bad token without touching the database.
 *  - The refresh token is opaque random bytes stored as an HMAC in the database.
 *    Being stateful is the point: it can be revoked on logout, and rotation on
 *    every use means a stolen token is detectable and short-lived.
 */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'ems-api',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'ems-api' });
    if (typeof decoded === 'string') {
      throw new UnauthorizedError('Malformed access token');
    }
    return decoded as unknown as AccessTokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Access token has expired');
    }
    throw new UnauthorizedError('Invalid access token');
  }
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

/**
 * Keyed with the refresh secret rather than a bare SHA-256, so a leaked database
 * dump alone is not enough to forge a lookup for a known token value.
 */
export function hashRefreshToken(rawToken: string): string {
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(rawToken).digest('hex');
}

export function refreshTokenExpiry(from: Date = new Date()): Date {
  const expiresAt = new Date(from);
  expiresAt.setDate(expiresAt.getDate() + env.JWT_REFRESH_TTL_DAYS);
  return expiresAt;
}
