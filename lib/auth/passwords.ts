/**
 * Password hashing — bcryptjs (pure JS, no native build step, unlike
 * argon2) since this is a small invite-only user list, not a
 * mass-registration surface that needs argon2's stronger GPU resistance.
 *
 * Server-only.
 */
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
