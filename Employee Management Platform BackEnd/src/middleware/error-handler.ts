import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { AppError } from '../common/errors';

interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

/** Turns a ZodError into `{ field: [messages] }`, which forms map onto directly. */
function formatZodIssues(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    const bucket = fields[key] ?? [];
    bucket.push(issue.message);
    fields[key] = bucket;
  }
  return fields;
}

function translatePrismaError(error: Prisma.PrismaClientKnownRequestError): ErrorBody & { status: number } {
  switch (error.code) {
    case 'P2002': {
      const target = error.meta?.target;
      const fields = Array.isArray(target) ? target.join(', ') : String(target ?? 'field');
      return {
        status: 409,
        code: 'CONFLICT',
        message: `A record with this ${fields} already exists`,
        details: { fields: Array.isArray(target) ? target : [String(target ?? '')] },
      };
    }
    case 'P2003':
      return {
        status: 409,
        code: 'FOREIGN_KEY_CONSTRAINT',
        message: 'The referenced record does not exist or is still in use',
      };
    case 'P2025':
      return { status: 404, code: 'NOT_FOUND', message: 'The requested record does not exist' };
    default:
      return { status: 500, code: 'DATABASE_ERROR', message: 'A database error occurred' };
  }
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Cannot ${req.method} ${req.path}`,
      requestId: req.id,
    },
  });
};

/**
 * The single place an error becomes an HTTP response. Expected failures keep
 * their meaning; anything unrecognised is logged in full and reported as an
 * opaque 500 so internal details never reach the client.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let body: ErrorBody = { code: 'INTERNAL_ERROR', message: 'Something went wrong' };

  if (err instanceof ZodError) {
    status = 422;
    body = { code: 'VALIDATION_ERROR', message: 'Validation failed', details: formatZodIssues(err) };
  } else if (err instanceof AppError) {
    status = err.statusCode;
    body = { code: err.code, message: err.message, details: err.details };
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const translated = translatePrismaError(err);
    status = translated.status;
    body = { code: translated.code, message: translated.message, details: translated.details };
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    status = 400;
    body = { code: 'BAD_REQUEST', message: 'The request could not be processed' };
  } else if (err instanceof SyntaxError && 'body' in err) {
    status = 400;
    body = { code: 'MALFORMED_JSON', message: 'Request body is not valid JSON' };
  }

  if (status >= 500) {
    logger.error({ err, requestId: req.id, path: req.originalUrl, method: req.method }, 'Unhandled error');
  } else {
    logger.warn({ requestId: req.id, path: req.originalUrl, code: body.code }, body.message);
  }

  // Stack traces are useful while developing and a liability in production.
  // pino-http widens Request['id'] to string | number, so normalise it here.
  const payload: ErrorBody & { stack?: string } = { ...body, requestId: String(req.id) };
  if (!env.isProduction && status >= 500 && err instanceof Error) {
    payload.stack = err.stack;
  }

  res.status(status).json({ error: payload });
};
