import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import pinoHttp from 'pino-http';
import { logger } from '../config/logger';
import { env } from '../config/env';

/**
 * Assigns a correlation id to every request. It is echoed in the `X-Request-Id`
 * response header and in error payloads, so a user-reported failure can be
 * traced to exactly one log line.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && incoming.length <= 100 ? incoming : crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
};

export const httpLogger: RequestHandler = pinoHttp({
  logger,
  genReqId: (req) => (req as { id?: string }).id ?? crypto.randomUUID(),
  autoLogging: { ignore: (req) => req.url === '/health' },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return env.isProduction ? 'debug' : 'info';
  },
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
