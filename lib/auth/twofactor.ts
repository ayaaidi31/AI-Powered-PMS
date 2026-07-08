/**
 * TOTP two-factor helpers (Feature 1 hardening).
 *
 * Node-only (uses otplib + bcrypt); imported by the auth Server Actions, never
 * by the Edge proxy. The secret and backup-code hashes live on the `users` row.
 */
import "server-only"
import { generateSecret, generateURI, verify } from "otplib"
import QRCode from "qrcode"
import { hashPassword, verifyPassword } from "./password"
import { CLINIC } from "@/lib/clinic"

// Accept a ±30s (one step) drift so a code entered right at a boundary still works.
const EPOCH_TOLERANCE = 30

/** Generate a fresh base32 TOTP secret. */
export function generateTotpSecret(): string {
  return generateSecret()
}

/** otpauth:// URI for the account, used to build the enrollment QR. */
export function totpKeyUri(secret: string, accountEmail: string): string {
  return generateURI({ issuer: CLINIC.name, label: accountEmail, secret })
}

/** Render the enrollment QR (otpauth URI) as a data URL for an <img>. */
export function totpQrDataUrl(secret: string, accountEmail: string): Promise<string> {
  return QRCode.toDataURL(totpKeyUri(secret, accountEmail), { width: 240, margin: 1 })
}

/** Verify a 6-digit TOTP code against the secret. */
export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  const clean = token.replace(/\s+/g, "")
  if (!/^\d{6}$/.test(clean)) return false
  try {
    const result = await verify({ secret, token: clean, epochTolerance: EPOCH_TOLERANCE })
    return result.valid
  } catch {
    return false
  }
}

const BACKUP_CODE_COUNT = 8
const BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

/** Generate recovery codes: returns the plaintext (show once) and their hashes (store). */
export async function generateBackupCodes(): Promise<{ plain: string[]; hashed: string[] }> {
  const { randomInt } = await import("node:crypto")
  const plain: string[] = []
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    let code = ""
    for (let j = 0; j < 8; j++) code += BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)]
    plain.push(`${code.slice(0, 4)}-${code.slice(4)}`)
  }
  const hashed = await Promise.all(plain.map((c) => hashPassword(normalizeBackupCode(c))))
  return { plain, hashed }
}

/** Normalise a typed backup code for comparison (uppercase, no spaces/dashes). */
export function normalizeBackupCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, "")
}

/**
 * Check a typed backup code against the stored hashes. Returns the REMAINING
 * hashes (with the used one removed) when it matches, or null when it doesn't.
 */
export async function consumeBackupCode(
  input: string,
  hashes: string[] | null,
): Promise<string[] | null> {
  if (!hashes?.length) return null
  const candidate = normalizeBackupCode(input)
  if (!candidate) return null
  for (let i = 0; i < hashes.length; i++) {
    if (await verifyPassword(candidate, hashes[i])) {
      return hashes.filter((_, idx) => idx !== i)
    }
  }
  return null
}
