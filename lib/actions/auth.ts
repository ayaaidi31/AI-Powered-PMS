"use server"

/**
 * Authentication actions (Feature 1 — UC-AUTH-01).
 *
 *  - REQ-AUTH-02: credentials are validated against the `users` table before
 *    any session is issued; passwords are compared as bcrypt hashes.
 *  - REQ-AUTH-04: on success the caller is told the role-specific landing page.
 *  - A generic error message is returned for both unknown email and wrong
 *    password so the form cannot be used to enumerate accounts.
 */
import { z } from "zod"
import { query } from "@/lib/db"
import { verifyPassword } from "@/lib/auth/password"
import { signSession, roleHome, type Role } from "@/lib/auth/jwt"
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/session"
import { ok, fail, type ActionResult } from "./types"

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
})

interface AccountRow {
  id: string
  password_hash: string
  role: Role
  is_active: boolean
  profile_id: string | null
  name: string | null
}

/**
 * Authenticate a user and open a session. Returns the role-specific redirect
 * path on success so the client can navigate there (REQ-AUTH-04).
 */
export async function login(
  input: { email: string; password: string },
): Promise<ActionResult<{ redirect: string }>> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return fail("Invalid credentials. Please try again.")
  const { email, password } = parsed.data

  const result = await query<AccountRow>(
    `SELECT u.id, u.password_hash, u.role, u.is_active,
            COALESCE(u.doctor_id, u.receptionist_id, u.patient_id) AS profile_id,
            COALESCE(d.first_name || ' ' || d.last_name,
                     r.first_name || ' ' || r.last_name,
                     p.first_name || ' ' || p.last_name) AS name
     FROM users u
     LEFT JOIN doctors d       ON d.id = u.doctor_id
     LEFT JOIN receptionists r ON r.id = u.receptionist_id
     LEFT JOIN patients p      ON p.id = u.patient_id
     WHERE lower(u.email) = lower($1)`,
    [email],
  )

  const account = result.rows[0]
  // Constant message regardless of which check fails (no account enumeration).
  const invalid = fail("Invalid credentials. Please try again.")
  if (!account || !account.is_active) return invalid

  const passwordOk = await verifyPassword(password, account.password_hash)
  if (!passwordOk) return invalid

  const token = await signSession({
    userId: account.id,
    role: account.role,
    profileId: account.profile_id,
    email,
    name: account.name ?? email,
  })
  await setSessionCookie(token)

  return ok({ redirect: roleHome(account.role) })
}

/** End the current session (clears the cookie). */
export async function logout(): Promise<ActionResult> {
  await clearSessionCookie()
  return ok(undefined)
}
