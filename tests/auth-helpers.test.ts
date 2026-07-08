import { describe, it, expect, vi } from "vitest"

// twofactor.ts pulls in `server-only`, which throws outside a server bundle.
vi.mock("server-only", () => ({}))

// jose HS256 needs a secret; set one before the helpers run.
process.env.AUTH_SECRET ||= "test-secret-value-please-ignore-32chars!!"

import { hashPassword, verifyPassword } from "@/lib/auth/password"
import {
  signSession, verifySession, roleHome, twoFactorRequiredForRole,
  signTwoFactorTicket, verifyTwoFactorTicket, type Role,
} from "@/lib/auth/jwt"
import {
  generateTotpSecret, verifyTotp, generateBackupCodes, consumeBackupCode, normalizeBackupCode,
} from "@/lib/auth/twofactor"
import { generateSync } from "otplib"

describe("password hashing (bcrypt)", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("Sup3r-Secret!")
    expect(hash).not.toBe("Sup3r-Secret!")
    expect(await verifyPassword("Sup3r-Secret!", hash)).toBe(true)
    expect(await verifyPassword("wrong", hash)).toBe(false)
  })
})

describe("roleHome / twoFactorRequiredForRole", () => {
  it("maps each role to its landing page", () => {
    expect(roleHome("patient")).toBe("/patient/dashboard")
    expect(roleHome("doctor")).toBe("/doctor/dashboard")
    expect(roleHome("receptionist")).toBe("/receptionist/dashboard")
    expect(roleHome("admin")).toBe("/admin/staff")
  })
  it("requires 2FA for staff only, not patients", () => {
    expect(twoFactorRequiredForRole("doctor")).toBe(true)
    expect(twoFactorRequiredForRole("receptionist")).toBe(true)
    expect(twoFactorRequiredForRole("admin")).toBe(true)
    expect(twoFactorRequiredForRole("patient")).toBe(false)
  })
})

describe("session JWT", () => {
  const payload = {
    userId: "u1", role: "doctor" as Role, profileId: "d1",
    email: "a@b.com", name: "A B", mfa: true, mustChangePassword: false,
  }

  it("round-trips a session and preserves the claims", async () => {
    const token = await signSession(payload)
    const back = await verifySession(token)
    expect(back).toMatchObject({ userId: "u1", role: "doctor", profileId: "d1", mfa: true, mustChangePassword: false })
  })

  it("defaults mfa / mustChangePassword to false when absent", async () => {
    const token = await signSession({ userId: "u2", role: "patient", profileId: "p1", email: "p@x.com", name: "P" })
    const back = await verifySession(token)
    expect(back?.mfa).toBe(false)
    expect(back?.mustChangePassword).toBe(false)
  })

  it("returns null for a tampered/garbage token", async () => {
    expect(await verifySession("not-a-jwt")).toBeNull()
    const token = await signSession(payload)
    expect(await verifySession(token + "x")).toBeNull()
  })
})

describe("two-factor login ticket", () => {
  it("round-trips a ticket and yields the userId", async () => {
    const ticket = await signTwoFactorTicket("u9")
    expect(await verifyTwoFactorTicket(ticket)).toEqual({ userId: "u9" })
  })
  it("rejects garbage and a full session token (wrong purpose)", async () => {
    expect(await verifyTwoFactorTicket("bad")).toBeNull()
    const session = await signSession({ userId: "u1", role: "doctor", profileId: "d1", email: "a@b.com", name: "A" })
    expect(await verifyTwoFactorTicket(session)).toBeNull()
  })
})

describe("TOTP verification", () => {
  it("accepts a freshly generated code and rejects malformed input", async () => {
    const secret = generateTotpSecret()
    expect(secret.length).toBeGreaterThan(0)
    const token = generateSync({ secret })
    expect(await verifyTotp(secret, token)).toBe(true)
    expect(await verifyTotp(secret, "123")).toBe(false)     // too short
    expect(await verifyTotp(secret, "12ab56")).toBe(false)  // non-numeric
    expect(await verifyTotp(secret, "")).toBe(false)
  })
})

describe("backup codes", () => {
  it("generates 8 formatted codes with matching hashes", async () => {
    const { plain, hashed } = await generateBackupCodes()
    expect(plain).toHaveLength(8)
    expect(hashed).toHaveLength(8)
    for (const c of plain) expect(c).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  })

  it("consumes a valid code once and rejects an invalid one", async () => {
    const { plain, hashed } = await generateBackupCodes()
    const remaining = await consumeBackupCode(plain[0], hashed)
    expect(remaining).toHaveLength(7) // one removed
    expect(await consumeBackupCode("ZZZZ-ZZZZ", hashed)).toBeNull()
    expect(await consumeBackupCode(plain[0], null)).toBeNull()
  })

  it("normalises typed codes (case / spaces / dashes)", () => {
    expect(normalizeBackupCode(" ab cd-ef ")).toBe("ABCDEF")
  })
})
