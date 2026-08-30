import bcrypt from 'bcryptjs';
import { z } from 'zod';

/**
 * bcryptjs rather than native bcrypt: it is pure JavaScript, so the project
 * installs and runs identically on Windows, macOS, Linux and in a container
 * with no build toolchain. Cost 12 is roughly 250ms on modern hardware - slow
 * enough to matter to an attacker, fast enough for an interactive login.
 */
const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Length is the dominant factor in password strength, so the floor is 10 rather
 * than the traditional 8, with a light character-mix requirement to rule out the
 * most obvious choices.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((value) => /[a-z]/.test(value), 'Password must contain a lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Password must contain an uppercase letter')
  .refine((value) => /\d/.test(value), 'Password must contain a number');
