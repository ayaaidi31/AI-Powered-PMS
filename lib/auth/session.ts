/**
 * Server-side session helpers (Feature 1).
 *
 * Wraps the Edge-safe JWT routines in lib/auth/jwt.ts with cookie storage. The
 * session token is kept in an httpOnly, SameSite=Lax cookie and is never
 * readable by client-side JavaScript (NFR-SEC-01).
 */
import "server-only"
import { cookies } from "next/headers"
import {
  SESSION_COOKIE, MAX_AGE_SECONDS, verifySession, type SessionPayload,
} from "./jwt"

export type { Role, SessionPayload } from "./jwt"
export { roleHome } from "./jwt"

/** Read and verify the session from the request cookies (Server Components). */
export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySession(token)
}

/** Persist the session cookie after login. */
export async function setSessionCookie(token: string): Promise<void> {
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  })
}

/** Clear the session cookie on logout. */
export async function clearSessionCookie(): Promise<void> {
  ;(await cookies()).delete(SESSION_COOKIE)
}
