/**
 * Password hashing for Feature 1. Uses bcrypt (work factor 10) — credentials
 * are only ever stored and compared as hashes, never in plaintext.
 *
 * Node-only (not Edge): used by the seed script and the login Server Action.
 */
import bcrypt from "bcryptjs"

const SALT_ROUNDS = 10

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}
