import { Router } from 'express';
import { asyncHandler } from '../../common/http';
import { authenticate } from '../../middleware/authenticate';
import { authRateLimiter } from '../../middleware/rate-limit';
import * as controller from './auth.controller';

export const authRouter: Router = Router();

// Credential endpoints carry the strict IP rate limit.
authRouter.post('/login', authRateLimiter, asyncHandler(controller.postLogin));
authRouter.post('/refresh', authRateLimiter, asyncHandler(controller.postRefresh));

authRouter.post('/logout', authenticate, asyncHandler(controller.postLogout));
authRouter.get('/me', authenticate, asyncHandler(controller.getMe));
authRouter.post(
  '/change-password',
  authRateLimiter,
  authenticate,
  asyncHandler(controller.postChangePassword),
);
