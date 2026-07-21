import { describe, it, expect, vi, beforeEach } from "vitest"

// jose needs a secret (openSession / tickets use the real jwt module).
process.env.AUTH_SECRET ||= "test-secret-value-please-ignore-32chars!!"

const h = vi.hoisted(() => ({
  query: vi.fn(),
  getSession: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  verifyTotp: vi.fn(),
  consumeBackupCode: vi.fn(),
  isEmailConfigured: vi.fn(),
  sendSignupCodeEmail: vi.fn(),
  sendStaffCredentialsEmail: vi.fn(),
  appUrl: vi.fn(),
}))

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db", () => ({
  query: (...a: unknown[]) => h.query(...a),
  sql: vi.fn(),
  withTransaction: async (fn: (c: { query: typeof h.query }) => unknown) => fn({ query: h.query }),
  pool: {},
}))
vi.mock("@/lib/auth/session", () => ({
  getSession: (...a: unknown[]) => h.getSession(...a),
  setSessionCookie: (...a: unknown[]) => h.setSessionCookie(...a),
  clearSessionCookie: (...a: unknown[]) => h.clearSessionCookie(...a),
}))
vi.mock("@/lib/auth/password", () => ({
  hashPassword: (...a: unknown[]) => h.hashPassword(...a),
  verifyPassword: (...a: unknown[]) => h.verifyPassword(...a),
}))
vi.mock("@/lib/auth/twofactor", () => ({
  verifyTotp: (...a: unknown[]) => h.verifyTotp(...a),
  consumeBackupCode: (...a: unknown[]) => h.consumeBackupCode(...a),
  generateTotpSecret: vi.fn(() => "SECRET"),
  totpQrDataUrl: vi.fn(async () => "data:image/png;base64,xxx"),
  generateBackupCodes: vi.fn(async () => ({ plain: ["AAAA-BBBB"], hashed: ["h1"] })),
}))
vi.mock("@/lib/email", () => ({
  isEmailConfigured: (...a: unknown[]) => h.isEmailConfigured(...a),
  sendSignupCodeEmail: (...a: unknown[]) => h.sendSignupCodeEmail(...a),
  sendStaffCredentialsEmail: (...a: unknown[]) => h.sendStaffCredentialsEmail(...a),
  appUrl: (...a: unknown[]) => h.appUrl(...a),
}))

import {
  login, verifyTwoFactorLogin, startSignup, verifySignup, createStaffAccount, changeOwnPassword,
} from "@/lib/actions/auth"
import { signTwoFactorTicket } from "@/lib/auth/jwt"

const account = (over: Record<string, unknown> = {}) => ({
  id: "u1", email: "a@b.com", password_hash: "HASH", role: "patient",
  is_active: true, profile_id: "p1", name: "A B",
  two_factor_enabled: false, totp_secret: null, backup_codes: null, must_change_password: false,
  ...over,
})

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset())
  h.hashPassword.mockResolvedValue("HASH")
  h.isEmailConfigured.mockReturnValue(false)
  h.appUrl.mockResolvedValue("http://localhost:3000/")
  h.setSessionCookie.mockResolvedValue(undefined)
})

describe("login", () => {
  it("rejects an unknown account", async () => {
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    expect((await login({ email: "x@y.com", password: "p" })).status).toBe("error")
    expect(h.verifyPassword).not.toHaveBeenCalled()
  })

  it("rejects a wrong password", async () => {
    h.query.mockResolvedValueOnce({ rows: [account()], rowCount: 1 })
    h.verifyPassword.mockResolvedValue(false)
    expect((await login({ email: "a@b.com", password: "bad" })).status).toBe("error")
  })

  it("opens a session directly when 2FA is off", async () => {
    h.query.mockResolvedValueOnce({ rows: [account()], rowCount: 1 })
    h.verifyPassword.mockResolvedValue(true)
    const r = await login({ email: "a@b.com", password: "good" })
    if (r.status !== "ok") throw new Error(r.message)
    expect(r.data).toMatchObject({ step: "done", redirect: "/patient/dashboard" })
    expect(h.setSessionCookie).toHaveBeenCalledOnce()
  })

  it("returns a 2FA ticket (no session) when 2FA is on", async () => {
    h.query.mockResolvedValueOnce({ rows: [account({ two_factor_enabled: true, totp_secret: "S", role: "doctor" })], rowCount: 1 })
    h.verifyPassword.mockResolvedValue(true)
    const r = await login({ email: "a@b.com", password: "good" })
    if (r.status !== "ok") throw new Error(r.message)
    expect(r.data.step).toBe("twofa")
    if (r.data.step === "twofa") expect(r.data.ticket).toBeTruthy()
    expect(h.setSessionCookie).not.toHaveBeenCalled()
  })
})

describe("verifyTwoFactorLogin", () => {
  it("rejects an invalid ticket", async () => {
    expect((await verifyTwoFactorLogin("garbage", "123456")).status).toBe("error")
    expect(h.query).not.toHaveBeenCalled()
  })

  it("opens the session on a correct TOTP code", async () => {
    const ticket = await signTwoFactorTicket("u1")
    h.query.mockResolvedValueOnce({ rows: [account({ two_factor_enabled: true, totp_secret: "S", role: "doctor" })], rowCount: 1 })
    h.verifyTotp.mockResolvedValue(true)
    const r = await verifyTwoFactorLogin(ticket, "123456")
    if (r.status !== "ok") throw new Error(r.message)
    expect(r.data.redirect).toBe("/doctor/dashboard")
    expect(h.setSessionCookie).toHaveBeenCalledOnce()
  })

  it("rejects a wrong code that is neither TOTP nor a backup code", async () => {
    const ticket = await signTwoFactorTicket("u1")
    h.query.mockResolvedValueOnce({ rows: [account({ two_factor_enabled: true, totp_secret: "S" })], rowCount: 1 })
    h.verifyTotp.mockResolvedValue(false)
    h.consumeBackupCode.mockResolvedValue(null)
    expect((await verifyTwoFactorLogin(ticket, "000000")).status).toBe("error")
  })
})

describe("startSignup", () => {
  it("rejects a weak password (validation)", async () => {
    const r = await startSignup({ first_name: "A", last_name: "B", email: "a@b.com", password: "short", birth_date: "1990-01-01", insurance_type: "gkv", phone: "0151 23456789" })
    expect(r.status).toBe("error")
  })

  it("rejects an email that is already registered", async () => {
    h.query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 })
    const r = await startSignup({ first_name: "A", last_name: "B", email: "a@b.com", password: "longenough", birth_date: "1990-01-01", insurance_type: "gkv", phone: "0151 23456789" })
    expect(r.status).toBe("error")
  })

  it("stores a pending code and returns devCode when email is off", async () => {
    h.query.mockResolvedValue({ rows: [], rowCount: 0 }) // users check + uniqueness + DELETE + INSERT
    const r = await startSignup({ first_name: "A", last_name: "B", email: "new@b.com", password: "longenough", birth_date: "1990-01-01", insurance_type: "gkv", phone: "0151 23456789" })
    if (r.status !== "ok") throw new Error(r.message)
    expect(r.data.email).toBe("new@b.com")
    expect(r.data.devCode).toMatch(/^\d{6}$/)
    expect(h.sendSignupCodeEmail).not.toHaveBeenCalled()
  })
})

describe("verifySignup", () => {
  const pending = (over: Record<string, unknown> = {}) => ({
    id: "v1", code_hash: "CH", attempts: 0,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    payload: { first_name: "A", last_name: "B", birth_date: "1990-01-01", insurance_type: "gkv", phone: null, passwordHash: "PH" },
    ...over,
  })

  it("fails when there is no pending verification", async () => {
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    expect((await verifySignup("a@b.com", "123456")).status).toBe("error")
  })

  it("rejects a wrong code and bumps the attempt counter", async () => {
    h.query.mockResolvedValueOnce({ rows: [pending()], rowCount: 1 }) // SELECT
    h.verifyPassword.mockResolvedValue(false)
    h.query.mockResolvedValueOnce({ rowCount: 1 }) // UPDATE attempts
    const r = await verifySignup("a@b.com", "000000")
    expect(r.status).toBe("error")
    expect(h.query).toHaveBeenCalledTimes(2)
  })

  it("creates the account and opens a session on a correct code", async () => {
    h.query.mockResolvedValueOnce({ rows: [pending()], rowCount: 1 })      // SELECT
    h.verifyPassword.mockResolvedValue(true)
    h.query.mockResolvedValueOnce({ rows: [{ id: "pat1" }], rowCount: 1 })  // INSERT patient
    h.query.mockResolvedValueOnce({ rows: [{ id: "usr1" }], rowCount: 1 })  // INSERT user
    h.query.mockResolvedValueOnce({ rowCount: 1 })                          // DELETE verification
    const r = await verifySignup("a@b.com", "123456")
    if (r.status !== "ok") throw new Error(r.message)
    expect(r.data.redirect).toBe("/patient/dashboard")
    expect(h.setSessionCookie).toHaveBeenCalledOnce()
  })
})

describe("createStaffAccount (admin only)", () => {
  const input = { role: "doctor" as const, first_name: "Doc", last_name: "Tor", email: "doc@clinic.com" }

  it("refuses a non-admin caller", async () => {
    h.getSession.mockResolvedValue({ role: "receptionist", userId: "r1" })
    expect((await createStaffAccount(input)).status).toBe("error")
    expect(h.query).not.toHaveBeenCalled()
  })

  it("refuses when there is no session", async () => {
    h.getSession.mockResolvedValue(null)
    expect((await createStaffAccount(input)).status).toBe("error")
  })

  it("creates a staff account and returns the temp password when email is off", async () => {
    h.getSession.mockResolvedValue({ role: "admin", userId: "admin1" })
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })                // SELECT email free
    h.query.mockResolvedValueOnce({ rows: [{ id: "doc1" }], rowCount: 1 })  // INSERT doctor
    h.query.mockResolvedValueOnce({ rowCount: 1 })                          // INSERT user
    const r = await createStaffAccount(input)
    if (r.status !== "ok") throw new Error(r.message)
    expect(r.data.role).toBe("doctor")
    expect(r.data.emailed).toBe(false)
    expect(r.data.tempPassword).toBeTruthy()
  })

  it("emails the password (and hides it) when email is configured", async () => {
    h.getSession.mockResolvedValue({ role: "admin", userId: "admin1" })
    h.isEmailConfigured.mockReturnValue(true)
    h.sendStaffCredentialsEmail.mockResolvedValue({ sent: true })
    h.query.mockResolvedValueOnce({ rows: [], rowCount: 0 })
    h.query.mockResolvedValueOnce({ rows: [{ id: "doc1" }], rowCount: 1 })
    h.query.mockResolvedValueOnce({ rowCount: 1 })
    const r = await createStaffAccount(input)
    if (r.status !== "ok") throw new Error(r.message)
    expect(r.data.emailed).toBe(true)
    expect(r.data.tempPassword).toBeUndefined()
    expect(h.sendStaffCredentialsEmail).toHaveBeenCalledOnce()
  })
})

describe("changeOwnPassword", () => {
  it("requires a session", async () => {
    h.getSession.mockResolvedValue(null)
    expect((await changeOwnPassword({ currentPassword: "a", newPassword: "abcdefgh" })).status).toBe("error")
  })

  it("rejects a wrong current password", async () => {
    h.getSession.mockResolvedValue({ userId: "u1", role: "doctor", mfa: true })
    h.query.mockResolvedValueOnce({ rows: [account({ role: "doctor" })], rowCount: 1 }) // loadAccountById
    h.verifyPassword.mockResolvedValue(false)
    expect((await changeOwnPassword({ currentPassword: "wrong", newPassword: "abcdefgh" })).status).toBe("error")
  })

  it("updates the password, clears the flag and re-issues the session", async () => {
    h.getSession.mockResolvedValue({ userId: "u1", role: "doctor", mfa: true })
    h.query.mockResolvedValueOnce({ rows: [account({ role: "doctor", must_change_password: true })], rowCount: 1 }) // load
    h.verifyPassword.mockResolvedValue(true)
    h.query.mockResolvedValueOnce({ rowCount: 1 }) // UPDATE
    const r = await changeOwnPassword({ currentPassword: "temp", newPassword: "brand-new-pass" })
    if (r.status !== "ok") throw new Error(r.message)
    expect(r.data.redirect).toBe("/doctor/dashboard")
    expect(h.setSessionCookie).toHaveBeenCalledOnce()
  })
})
