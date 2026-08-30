import type { Request, Response } from 'express';
import { parseBody } from '../../common/validate';
import { sendData } from '../../common/http';
import { requireAuth } from '../../middleware/authenticate';
import { changePasswordSchema, loginSchema, refreshSchema } from './auth.schema';
import * as authService from './auth.service';

function fingerprint(req: Request): authService.ClientFingerprint {
  return { ipAddress: req.ip ?? null, userAgent: req.get('user-agent') ?? null };
}

export async function postLogin(req: Request, res: Response): Promise<void> {
  const input = parseBody(req, loginSchema);
  const { tokens, profile } = await authService.login(input, fingerprint(req));
  sendData(res, { ...tokens, ...profile });
}

export async function postRefresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = parseBody(req, refreshSchema);
  const tokens = await authService.refreshSession(refreshToken, fingerprint(req));
  sendData(res, tokens);
}

export async function postLogout(req: Request, res: Response): Promise<void> {
  // The refresh token is optional here: a client that has already discarded it
  // can still end every session by presenting a valid access token.
  const refreshToken = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken : undefined;
  await authService.logout(refreshToken, req.auth);
  sendData(res, { message: 'Signed out' });
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const profile = await authService.getProfile(auth);
  sendData(res, profile);
}

export async function postChangePassword(req: Request, res: Response): Promise<void> {
  const auth = requireAuth(req);
  const input = parseBody(req, changePasswordSchema);
  await authService.changePassword(auth, input, fingerprint(req));
  sendData(res, { message: 'Password updated. Please sign in again on your other devices.' });
}
