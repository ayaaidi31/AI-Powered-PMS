/**
 * Edge-safe JWT signing/verification (Feature 1).
 *
 * This module deliberately avoids `next/headers` and `server-only` so it can be
 * imported by middleware (Edge runtime) as well as by Server Components. Cookie
 * handling lives separately in lib/auth/session.ts.
 */
import { SignJWT, jwtVerify } from "jose"

export const SESSION_COOKIE = "session"
export const MAX_AGE_SECONDS = 60 * 60 * 8 // 8-hour working session

export type Role = "doctor" | "receptionist" | "patient" | "admin"

export interface SessionPayload {
  userId: string
  role: Role
  profileId: string | null // doctor_id / receptionist_id / patient_id
  email: string
  name: string
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
    }
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
    case "admin": return "/receptionist/dashboard"
  }
}
