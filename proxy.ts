/**
 * Route protection middleware (Feature 1 — REQ-AUTH-03).
 *
 * Runs on the Edge for every request to a role-specific area. It verifies the
 * session JWT from the cookie and enforces that the user's role matches the
 * area being accessed:
 *   - no / invalid session            → redirected to the login page
 *   - valid session, wrong role       → redirected to their own landing page
 *   - valid session, matching role    → allowed through
 *
 * Uses the Edge-safe routines in lib/auth/jwt.ts (no Node-only APIs).
 */
import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE, verifySession, roleHome, type Role } from "@/lib/auth/jwt"

// Maps the first path segment to the role permitted to access it.
const AREA_ROLE: Record<string, Role> = {
  doctor: "doctor",
  receptionist: "receptionist",
  patient: "patient",
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const area = pathname.split("/")[1] // e.g. "doctor"
  const requiredRole = AREA_ROLE[area]
  if (!requiredRole) return NextResponse.next() // unprotected route

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySession(token) : null

  // Not authenticated → send to login, remembering where they were headed.
  if (!session) {
    const loginUrl = new URL("/", request.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated but wrong role → bounce to their own area (admins pass).
  if (session.role !== requiredRole && session.role !== "admin") {
    return NextResponse.redirect(new URL(roleHome(session.role), request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/doctor/:path*", "/receptionist/:path*", "/patient/:path*"],
}
