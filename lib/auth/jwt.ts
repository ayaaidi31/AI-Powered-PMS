/**
 * Edge-safe JWT signing/verification (Feature 1).
 *
 * This module deliberately avoids `next/headers` and `server-only` so it can be
 * imported by middleware (Edge runtime) as well as by Server Components. Cookie
 * handling lives separately in lib/auth/session.ts.
 */
import { SignJWT, jwtVerify } from "jose"

export const SESSION_COOKIE = "session"
export const MAX_AGE_SECONDS = 60 * 60 * 2 // 2-hour session (shorter = safer)

export type Role = "doctor" | "receptionist" | "patient" | "admin"

export interface SessionPayload {
  userId: string
  role: Role
  profileId: string | null // doctor_id / receptionist_id / patient_id
  email: string
  name: string
  /** True once this session has cleared two-factor (or the account has none). */
  mfa?: boolean
  /** True while the account still holds an admin-issued temporary password. */
  mustChangePassword?: boolean
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is not set in the environment.")
  return new TextEncoder().encode(secret)
}

/** Sign a session token for the given payload. */
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey())
}

/** Verify a raw token string. Returns the payload, or null if invalid/expired. */
export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] })
    return {
      userId: String(payload.userId),
      role: payload.role as Role,
      profileId: (payload.profileId as string | null) ?? null,
      email: String(payload.email),
      name: String(payload.name),
      mfa: payload.mfa === true,
      mustChangePassword: payload.mustChangePassword === true,
    }
  } catch {
    return null
  }
}

/** Roles for which two-factor is mandatory (staff see all patient data). */
export function twoFactorRequiredForRole(role: Role): boolean {
  return role === "doctor" || role === "receptionist" || role === "admin"
}

const TWO_FACTOR_TICKET_TTL = "5m"

/**
 * Short-lived ticket issued after a correct password when the account has 2FA
 * enabled. It authorises ONLY the second-factor step — it is not a session and
 * grants no access on its own.
 */
export async function signTwoFactorTicket(userId: string): Promise<string> {
  return new SignJWT({ userId, purpose: "twofa" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TWO_FACTOR_TICKET_TTL)
    .sign(secretKey())
}

/** Verify a 2FA ticket; returns the userId or null. */
export async function verifyTwoFactorTicket(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] })
    if (payload.purpose !== "twofa" || !payload.userId) return null
    return { userId: String(payload.userId) }
  } catch {
    return null
  }
}

/** Default landing route for a role (REQ-AUTH-04). */
export function roleHome(role: Role): string {
  switch (role) {
    case "doctor": return "/doctor/dashboard"
    case "receptionist": return "/receptionist/dashboard"
    case "patient": return "/patient/dashboard"
    case "admin": return "/admin/staff"
  }
}
