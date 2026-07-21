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
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { query, withTransaction } from "@/lib/db"
import { verifyPassword, hashPassword } from "@/lib/auth/password"
import { patientFieldConflicts } from "@/lib/patient-uniqueness"
import { isGermanMobile, isGermanPhone, isKvnr, isIk } from "@/lib/validation"
import {
  signSession, roleHome, type Role,
  signTwoFactorTicket, verifyTwoFactorTicket, twoFactorRequiredForRole,
} from "@/lib/auth/jwt"
import { setSessionCookie, clearSessionCookie, getSession } from "@/lib/auth/session"
import {
  generateTotpSecret, totpQrDataUrl, verifyTotp, generateBackupCodes, consumeBackupCode,
} from "@/lib/auth/twofactor"
import { isEmailConfigured, sendSignupCodeEmail, sendStaffCredentialsEmail, appUrl } from "@/lib/email"
import { ok, fail, type ActionResult } from "./types"

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
})

interface AccountRow {
  id: string
  email: string
  password_hash: string
  role: Role
  is_active: boolean
  profile_id: string | null
  name: string | null
  two_factor_enabled: boolean
  totp_secret: string | null
  backup_codes: string[] | null
  must_change_password: boolean
}

const ACCOUNT_SELECT = `
  SELECT u.id, u.email, u.password_hash, u.role, u.is_active,
         u.two_factor_enabled, u.totp_secret, u.backup_codes, u.must_change_password,
         COALESCE(u.doctor_id, u.receptionist_id, u.patient_id) AS profile_id,
         COALESCE(d.first_name || ' ' || d.last_name,
                  r.first_name || ' ' || r.last_name,
                  p.first_name || ' ' || p.last_name) AS name
  FROM users u
  LEFT JOIN doctors d       ON d.id = u.doctor_id
  LEFT JOIN receptionists r ON r.id = u.receptionist_id
  LEFT JOIN patients p      ON p.id = u.patient_id`

async function loadAccountByEmail(email: string): Promise<AccountRow | null> {
  const res = await query<AccountRow>(`${ACCOUNT_SELECT} WHERE lower(u.email) = lower($1)`, [email])
  return res.rows[0] ?? null
}
async function loadAccountById(id: string): Promise<AccountRow | null> {
  const res = await query<AccountRow>(`${ACCOUNT_SELECT} WHERE u.id = $1`, [id])
  return res.rows[0] ?? null
}

/** Issue the real session cookie for an account (mfa = has cleared 2FA / none required). */
async function openSession(account: AccountRow, mfa: boolean): Promise<void> {
  const token = await signSession({
    userId: account.id,
    role: account.role,
    profileId: account.profile_id,
    email: account.email,
    name: account.name ?? account.email,
    mfa,
    mustChangePassword: account.must_change_password,
  })
  await setSessionCookie(token)
}

/** Result of the first login step: either a session was opened, or 2FA is required. */
export type LoginOutcome =
  | { step: "done"; redirect: string }
  | { step: "twofa"; ticket: string }

/**
 * Step 1 of login: validate the password. If the account has 2FA enabled, NO
 * session is opened — a short-lived ticket is returned and the caller must pass
 * `verifyTwoFactorLogin`. Otherwise a session opens immediately.
 */
export async function login(
  input: { email: string; password: string },
): Promise<ActionResult<LoginOutcome>> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) return fail("Invalid credentials. Please try again.")
  const { email, password } = parsed.data

  const account = await loadAccountByEmail(email)
  // Constant message regardless of which check fails (no account enumeration).
  const invalid = fail("Invalid credentials. Please try again.")
  if (!account || !account.is_active) return invalid

  const passwordOk = await verifyPassword(password, account.password_hash)
  if (!passwordOk) return invalid

  if (account.two_factor_enabled && account.totp_secret) {
    const ticket = await signTwoFactorTicket(account.id)
    return ok({ step: "twofa", ticket })
  }

  // No 2FA yet. Staff still get a session, but the proxy will route them to
  // enrollment (mandatory) until they set it up.
  await openSession(account, false)
  return ok({ step: "done", redirect: roleHome(account.role) })
}

/**
 * Step 2 of login: verify the TOTP code (or a backup code) against the ticket
 * from step 1, then open the session.
 */
export async function verifyTwoFactorLogin(
  ticket: string,
  code: string,
): Promise<ActionResult<{ redirect: string }>> {
  const parsed = await verifyTwoFactorTicket(ticket)
  if (!parsed) return fail("Your verification session expired. Please sign in again.")

  const account = await loadAccountById(parsed.userId)
  if (!account || !account.is_active || !account.two_factor_enabled || !account.totp_secret) {
    return fail("Two-factor is not set up for this account.")
  }

  if (await verifyTotp(account.totp_secret, code)) {
    await openSession(account, true)
    return ok({ redirect: roleHome(account.role) })
  }

  // Fall back to a one-time backup code.
  const remaining = await consumeBackupCode(code, account.backup_codes)
  if (remaining) {
    await query(`UPDATE users SET backup_codes = $2 WHERE id = $1`, [account.id, remaining])
    await openSession(account, true)
    return ok({ redirect: roleHome(account.role) })
  }

  return fail("That code is not valid. Try the current code from your authenticator app.")
}

const signupSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required."),
  last_name: z.string().trim().min(1, "Last name is required."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  birth_date: z.string()
    .refine((v) => {
      const d = new Date(v)
      return !Number.isNaN(d.getTime()) && d <= new Date() && d.getFullYear() >= 1900
    }, "Enter a valid date of birth."),
  insurance_type: z.enum(["gkv", "pkv", "selbstzahler"], { message: "Choose your insurance type." }),
  insurer_name: z.string().trim().max(120).optional(),
  insurer_ik: z.string().trim().max(20).optional()
    .refine((v) => !v || isIk(v), "The insurer ID (IK) must be 9 digits."),
  versicherten_id: z.string().trim().max(20).optional()
    .refine((v) => !v || isKvnr(v), "Insurance number must be one letter followed by 9 digits, e.g. A123456789."),
  guardian_name: z.string().trim().max(120).optional(),
  guardian_contact: z.string().trim().max(40).optional()
    .refine((v) => !v || isGermanPhone(v), "Enter a valid German phone number, e.g. 0151 23456789."),
  phone: z.string().trim().min(6, "Enter your mobile number.").max(40)
    .refine(isGermanMobile, "Enter a valid German mobile number, e.g. 0151 23456789."),
})
export type SignupInput = z.infer<typeof signupSchema>

/** Pending-signup payload stashed in email_verifications until the code is confirmed. */
interface SignupPayload {
  first_name: string
  last_name: string
  birth_date: string
  insurance_type: "gkv" | "pkv" | "selbstzahler"
  insurer_name: string | null
  insurer_ik: string | null
  versicherten_id: string | null
  guardian_name: string | null
  guardian_contact: string | null
  phone: string | null
  passwordHash: string
}

/** Generate a numeric email-verification code. */
async function generateNumericCode(length = 6): Promise<string> {
  const { randomInt } = await import("node:crypto")
  let code = ""
  for (let i = 0; i < length; i++) code += randomInt(10).toString()
  return code
}

/**
 * Patient self-registration, step 1: validate the details and email a
 * verification code. No account exists yet — the pending data is held in
 * `email_verifications` until `verifySignup` confirms the code.
 *
 * Deliberately patient-only: staff accounts (doctor/receptionist/admin) are
 * provisioned internally, never self-registered.
 *
 * When email isn't configured, the code is returned as `devCode` so the flow is
 * still testable locally (never in production).
 */
export async function startSignup(
  input: SignupInput,
): Promise<ActionResult<{ email: string; devCode?: string }>> {
  const parsed = signupSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return fail("Please correct the highlighted fields.", fieldErrors)
  }
  const d = parsed.data

  const existing = await query(`SELECT 1 FROM users WHERE lower(email) = lower($1)`, [d.email])
  if (existing.rowCount && existing.rowCount > 0) {
    return fail("An account with this email already exists.", { email: "This email is already registered." })
  }

  // Reject a signup whose email, mobile, or insurance number is already held by
  // another patient record (e.g. one created earlier at reception).
  const conflicts = await patientFieldConflicts({
    email: d.email, phone: d.phone, versicherten_id: d.versicherten_id,
  })
  if (Object.keys(conflicts).length > 0) {
    return fail("Please correct the highlighted fields.", conflicts)
  }

  const passwordHash = await hashPassword(d.password)
  const code = await generateNumericCode(6)
  const codeHash = await hashPassword(code)
  const payload: SignupPayload = {
    first_name: d.first_name, last_name: d.last_name, birth_date: d.birth_date,
    insurance_type: d.insurance_type,
    insurer_name: d.insurer_name?.trim() || null,
    insurer_ik: d.insurer_ik?.trim() || null,
    versicherten_id: d.versicherten_id?.trim() || null,
    guardian_name: d.guardian_name?.trim() || null,
    guardian_contact: d.guardian_contact?.trim() || null,
    phone: d.phone ?? null, passwordHash,
  }

  // Replace any earlier pending code for this email, then store the new one (15 min).
  await query(`DELETE FROM email_verifications WHERE lower(email) = lower($1) AND purpose = 'signup'`, [d.email])
  await query(
    `INSERT INTO email_verifications (email, code_hash, purpose, payload, expires_at)
     VALUES ($1, $2, 'signup', $3::jsonb, now() + interval '15 minutes')`,
    [d.email, codeHash, JSON.stringify(payload)],
  )

  let emailSent = false
  if (isEmailConfigured()) {
    const r = await sendSignupCodeEmail({ to: d.email, firstName: d.first_name, code })
    emailSent = r.sent
    if (!r.sent) console.error(`[signup] verification email to ${d.email} not sent: ${r.error}`)
  }
  // If the email actually went out, never expose the code. Otherwise (email not
  // configured, or the send failed) fall back to returning it so the flow is
  // still testable — but never in production.
  const showDevCode = !emailSent && process.env.NODE_ENV !== "production"
  return ok({ email: d.email, devCode: showDevCode ? code : undefined })
}

/**
 * Patient self-registration, step 2: verify the emailed code, then create the
 * patient + `patient`-role user in one transaction and open a session.
 */
export async function verifySignup(
  email: string,
  code: string,
): Promise<ActionResult<{ redirect: string }>> {
  const trimmedCode = code.trim()
  if (!trimmedCode) return fail("Enter the code from your email.")

  const rows = await query<{
    id: string; code_hash: string; payload: SignupPayload; attempts: number; expires_at: string
  }>(
    `SELECT id, code_hash, payload, attempts, expires_at FROM email_verifications
     WHERE lower(email) = lower($1) AND purpose = 'signup'
     ORDER BY created_at DESC LIMIT 1`,
    [email],
  )
  const v = rows.rows[0]
  if (!v) return fail("No pending verification found. Please sign up again.")

  if (new Date(v.expires_at).getTime() < Date.now()) {
    await query(`DELETE FROM email_verifications WHERE id = $1`, [v.id])
    return fail("This code has expired. Please sign up again.")
  }
  if (v.attempts >= 5) {
    await query(`DELETE FROM email_verifications WHERE id = $1`, [v.id])
    return fail("Too many attempts. Please sign up again.")
  }
  if (!(await verifyPassword(trimmedCode, v.code_hash))) {
    await query(`UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1`, [v.id])
    return fail("That code is not correct. Please check your email and try again.")
  }

  const p = v.payload
  let created: { userId: string; patientId: string }
  try {
    created = await withTransaction(async (client) => {
      const pr = await client.query<{ id: string }>(
        `INSERT INTO patients
           (first_name, last_name, birth_date, email, phone, insurance_type,
            insurer_name, insurer_ik, versicherten_id, guardian_name, guardian_contact,
            is_digital_active, last_updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, 'Self sign-up')
         RETURNING id`,
        [p.first_name, p.last_name, p.birth_date, email, p.phone, p.insurance_type,
         p.insurer_name ?? null, p.insurer_ik ?? null, p.versicherten_id ?? null,
         p.guardian_name ?? null, p.guardian_contact ?? null],
      )
      const patientId = pr.rows[0].id
      const u = await client.query<{ id: string }>(
        `INSERT INTO users (email, password_hash, role, patient_id) VALUES ($1, $2, 'patient', $3) RETURNING id`,
        [email, p.passwordHash, patientId],
      )
      return { userId: u.rows[0].id, patientId }
    })
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "23505") {
      return fail("An account with this email already exists.")
    }
    return fail("Could not create your account. Please try again.")
  }

  await query(`DELETE FROM email_verifications WHERE id = $1`, [v.id])
  const token = await signSession({
    userId: created.userId,
    role: "patient",
    profileId: created.patientId,
    email,
    name: `${p.first_name} ${p.last_name}`,
    mfa: false,
  })
  await setSessionCookie(token)
  return ok({ redirect: roleHome("patient") })
}

// ─────────────────────────── Two-factor (TOTP) ───────────────────────────

/** Status for the security settings page. */
export async function getTwoFactorStatus(): Promise<{ enabled: boolean; required: boolean } | null> {
  const session = await getSession()
  if (!session) return null
  const account = await loadAccountById(session.userId)
  if (!account) return null
  return { enabled: account.two_factor_enabled, required: twoFactorRequiredForRole(account.role) }
}

/**
 * Begin TOTP enrollment for the signed-in user: generate a secret and the QR to
 * scan. Not enabled until `confirmTotpEnrollment` verifies a code.
 */
export async function startTotpEnrollment(): Promise<ActionResult<{ secret: string; qr: string }>> {
  const session = await getSession()
  if (!session) return fail("Please sign in first.")
  const secret = generateTotpSecret()
  await query(`UPDATE users SET totp_secret = $2, two_factor_enabled = false WHERE id = $1`, [session.userId, secret])
  const qr = await totpQrDataUrl(secret, session.email)
  return ok({ secret, qr })
}

/**
 * Confirm enrollment by verifying a code from the authenticator app. Turns 2FA
 * on, issues one-time backup codes (shown once), and re-opens the session as
 * MFA-cleared so the staff enrollment gate is satisfied.
 */
export async function confirmTotpEnrollment(
  code: string,
): Promise<ActionResult<{ backupCodes: string[]; redirect: string }>> {
  const session = await getSession()
  if (!session) return fail("Please sign in first.")
  const account = await loadAccountById(session.userId)
  if (!account || !account.totp_secret) return fail("Start the setup again — no pending secret was found.")
  if (!(await verifyTotp(account.totp_secret, code))) {
    return fail("That code is not correct. Check your authenticator app and try again.")
  }
  const { plain, hashed } = await generateBackupCodes()
  await query(`UPDATE users SET two_factor_enabled = true, backup_codes = $2 WHERE id = $1`, [account.id, hashed])
  await openSession(account, true)
  return ok({ backupCodes: plain, redirect: roleHome(account.role) })
}

/** Turn off 2FA (patients only — it's mandatory for staff). Requires a valid code. */
export async function disableTwoFactor(code: string): Promise<ActionResult<null>> {
  const session = await getSession()
  if (!session) return fail("Please sign in first.")
  if (twoFactorRequiredForRole(session.role)) {
    return fail("Two-factor is required for staff accounts and can't be turned off.")
  }
  const account = await loadAccountById(session.userId)
  if (!account || !account.two_factor_enabled || !account.totp_secret) return ok(null)
  const valid = (await verifyTotp(account.totp_secret, code)) || (await consumeBackupCode(code, account.backup_codes)) !== null
  if (!valid) return fail("Enter a valid code to turn off two-factor.")
  await query(
    `UPDATE users SET two_factor_enabled = false, totp_secret = NULL, backup_codes = NULL WHERE id = $1`,
    [account.id],
  )
  await openSession(account, true)
  return ok(null)
}

// ─────────────────────────── Admin: staff accounts ───────────────────────────

const staffSchema = z.object({
  role: z.enum(["doctor", "receptionist"], { message: "Choose a role." }),
  first_name: z.string().trim().min(1, "First name is required."),
  last_name: z.string().trim().min(1, "Last name is required."),
  email: z.string().trim().email("Enter a valid email address."),
  phone: z.string().trim().max(40).optional(),
  department: z.string().trim().max(120).optional(),
  specialization: z.string().trim().max(120).optional(),
})
export type StaffInput = z.infer<typeof staffSchema>

/** Generate a readable temporary password (no ambiguous characters). */
async function generateTempPassword(length = 12): Promise<string> {
  const { randomInt } = await import("node:crypto")
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"
  let out = ""
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)]
  return out
}

/**
 * Provision a staff (doctor / receptionist) account — ADMIN ONLY. Creates the
 * role profile and the linked user with a one-time temporary password that the
 * holder must change on first login (`must_change_password`). Staff are never
 * self-registered, so this is the only way a staff login comes into being.
 *
 * The temporary password is returned once for the admin to hand over.
 */
export async function createStaffAccount(
  input: StaffInput,
): Promise<ActionResult<{ email: string; role: "doctor" | "receptionist"; emailed: boolean; tempPassword?: string }>> {
  const session = await getSession()
  if (!session || session.role !== "admin") {
    return fail("Only an administrator can create staff accounts.")
  }

  const parsed = staffSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return fail("Please correct the highlighted fields.", fieldErrors)
  }
  const d = parsed.data

  const existing = await query(`SELECT 1 FROM users WHERE lower(email) = lower($1)`, [d.email])
  if (existing.rowCount && existing.rowCount > 0) {
    return fail("An account with this email already exists.", { email: "This email is already registered." })
  }

  const tempPassword = await generateTempPassword()
  const passwordHash = await hashPassword(tempPassword)

  try {
    await withTransaction(async (client) => {
      let profileId: string
      let profileCol: "doctor_id" | "receptionist_id"
      if (d.role === "doctor") {
        const r = await client.query<{ id: string }>(
          `INSERT INTO doctors (first_name, last_name, email, phone, specialization, department)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [d.first_name, d.last_name, d.email, d.phone ?? null, d.specialization ?? null, d.department ?? null],
        )
        profileId = r.rows[0].id
        profileCol = "doctor_id"
      } else {
        const r = await client.query<{ id: string }>(
          `INSERT INTO receptionists (first_name, last_name, email, phone, department)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [d.first_name, d.last_name, d.email, d.phone ?? null, d.department ?? null],
        )
        profileId = r.rows[0].id
        profileCol = "receptionist_id"
      }
      await client.query(
        `INSERT INTO users (email, password_hash, role, ${profileCol}, must_change_password)
         VALUES ($1, $2, $3, $4, true)`,
        [d.email, passwordHash, d.role, profileId],
      )
    })
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "23505") {
      return fail("An account with this email already exists.", { email: "This email is already registered." })
    }
    return fail("Could not create the account. Please try again.")
  }

  // Email the temporary password to the new staff member. Only fall back to
  // showing it on-screen (for the admin to hand over) when email didn't go out.
  let emailed = false
  if (isEmailConfigured()) {
    const loginUrl = await appUrl("/")
    const r = await sendStaffCredentialsEmail({
      to: d.email, firstName: d.first_name, role: d.role, tempPassword, loginUrl,
    })
    emailed = r.sent
    if (!r.sent) console.error(`[staff] credentials email to ${d.email} not sent: ${r.error}`)
  }

  revalidatePath("/admin/staff")
  return ok({ email: d.email, role: d.role, emailed, tempPassword: emailed ? undefined : tempPassword })
}

// ─────────────────────────── Change own password ─────────────────────────────

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
})

/**
 * Change the signed-in user's own password. Used both for the forced first-login
 * change (temporary password) and voluntary changes. Clears `must_change_password`
 * and re-issues the session so the proxy stops gating on it.
 */
export async function changeOwnPassword(
  input: { currentPassword: string; newPassword: string },
): Promise<ActionResult<{ redirect: string }>> {
  const session = await getSession()
  if (!session) return fail("Please sign in again.")

  const parsed = passwordChangeSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] = issue.message
    return fail("Please correct the highlighted fields.", fieldErrors)
  }

  const account = await loadAccountById(session.userId)
  if (!account) return fail("Account not found.")
  if (!(await verifyPassword(parsed.data.currentPassword, account.password_hash))) {
    return fail("Your current password is incorrect.", { currentPassword: "Incorrect password." })
  }
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return fail("Choose a password different from your current one.", { newPassword: "Must differ from the current password." })
  }

  const newHash = await hashPassword(parsed.data.newPassword)
  await query(`UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1`, [account.id, newHash])
  // Re-issue the session with the flag cleared (keep the current 2FA state).
  await openSession({ ...account, must_change_password: false }, session.mfa === true)
  return ok({ redirect: roleHome(account.role) })
}

/** End the current session (clears the cookie). */
export async function logout(): Promise<ActionResult> {
  await clearSessionCookie()
  return ok(undefined)
}
