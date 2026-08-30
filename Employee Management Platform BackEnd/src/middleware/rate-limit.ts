import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

function limitReached(message: string) {
  return {
    error: {
      code: 'TOO_MANY_REQUESTS',
      message,
    },
  };
}

/**
 * Tight limit on the credential endpoints, keyed by IP, to make online password
 * guessing impractical. This works alongside the per-account lockout in the auth
 * service, which defends an individual account against a distributed attempt.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.RATE_LIMIT_AUTH_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: limitReached('Too many authentication attempts. Try again in 15 minutes.'),
});

/** Broad ceiling for the rest of the API - protects against runaway clients. */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.RATE_LIMIT_API_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: limitReached('Request limit exceeded. Please slow down.'),
});
