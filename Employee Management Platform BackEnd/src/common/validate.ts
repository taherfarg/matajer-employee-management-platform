import type { Request } from 'express';
import { z } from 'zod';

/**
 * Input parsing happens inside the controller rather than as middleware, so the
 * result carries the schema's inferred type with no casts and no `any` leaking
 * into service calls. A failed parse throws ZodError, which the central error
 * handler turns into a 422 with per-field messages.
 */
export function parseBody<T extends z.ZodTypeAny>(req: Request, schema: T): z.infer<T> {
  return schema.parse(req.body) as z.infer<T>;
}

export function parseQuery<T extends z.ZodTypeAny>(req: Request, schema: T): z.infer<T> {
  return schema.parse(req.query) as z.infer<T>;
}

export function parseParams<T extends z.ZodTypeAny>(req: Request, schema: T): z.infer<T> {
  return schema.parse(req.params) as z.infer<T>;
}

/** Route params that carry a single resource id. */
export const idParamSchema = z.object({ id: z.string().min(1) });

/** ISO calendar date (YYYY-MM-DD) parsed as UTC midnight. */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Not a valid calendar date');

/** Converts a validated YYYY-MM-DD string into a UTC-midnight Date. */
export function toUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Trims incoming strings and converts empty ones to undefined, so a form that
 * submits `""` for an untouched optional field does not overwrite stored data
 * with an empty string.
 */
export const optionalTrimmedString = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional();

export const requiredTrimmedString = (min = 1, max = 255) => z.string().trim().min(min).max(max);

export const emailSchema = z.string().trim().toLowerCase().email().max(255);

/**
 * Deliberately permissive: this is a multi-country platform, and phone formats
 * differ enough that a strict pattern would reject valid numbers.
 */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+]?[\d\s()-]{7,20}$/, 'Enter a valid phone number');
