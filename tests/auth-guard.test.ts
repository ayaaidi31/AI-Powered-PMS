import { describe, it, expect, vi, beforeEach } from "vitest"

// guard.ts is `server-only` and reads the session from the cookie layer — mock both.
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({ getSession: (...a: unknown[]) => h.getSession(...a) }))

import {
  requireSession, requireRole, requireStaff, requireDoctor, requireReceptionist,
  requirePatient, requireSessionScoped,
} from "@/lib/auth/guard"

const session = (over: Record<string, unknown> = {}) => ({
  userId: "u1", role: "doctor", profileId: "d1", email: "a@b.com", name: "A", ...over,
})

beforeEach(() => h.getSession.mockReset())

describe("requireSession", () => {
  it("denies when there is no session", async () => {
    h.getSession.mockResolvedValue(null)
    const g = await requireSession()
    expect(g.ok).toBe(false)
  })
  it("allows any authenticated user", async () => {
    h.getSession.mockResolvedValue(session({ role: "patient" }))
    const g = await requireSession()
    expect(g.ok).toBe(true)
  })
})

describe("requireRole", () => {
  it("denies a non-matching role", async () => {
    h.getSession.mockResolvedValue(session({ role: "patient" }))
    expect((await requireRole("doctor")).ok).toBe(false)
  })
  it("allows a matching role", async () => {
    h.getSession.mockResolvedValue(session({ role: "receptionist" }))
    expect((await requireRole("receptionist")).ok).toBe(true)
  })
  it("always allows admin (superuser)", async () => {
    h.getSession.mockResolvedValue(session({ role: "admin", profileId: null }))
    expect((await requireRole("doctor")).ok).toBe(true)
  })
})

describe("requireStaff", () => {
  it.each(["doctor", "receptionist", "admin"] as const)("allows %s", async (role) => {
    h.getSession.mockResolvedValue(session({ role }))
    expect((await requireStaff()).ok).toBe(true)
  })
  it("denies a patient", async () => {
    h.getSession.mockResolvedValue(session({ role: "patient" }))
    expect((await requireStaff()).ok).toBe(false)
  })
})

describe("requireDoctor", () => {
  it("allows a doctor with a profile id", async () => {
    h.getSession.mockResolvedValue(session({ role: "doctor", profileId: "d1" }))
    const g = await requireDoctor()
    expect(g.ok).toBe(true)
    if (g.ok) expect(g.value.profileId).toBe("d1")
  })
  it("denies a doctor account with no linked profile", async () => {
    h.getSession.mockResolvedValue(session({ role: "doctor", profileId: null }))
    expect((await requireDoctor()).ok).toBe(false)
  })
  it("denies a patient", async () => {
    h.getSession.mockResolvedValue(session({ role: "patient" }))
    expect((await requireDoctor()).ok).toBe(false)
  })
})

describe("requireReceptionist", () => {
  it("allows receptionist and admin, denies doctor", async () => {
    h.getSession.mockResolvedValue(session({ role: "receptionist" }))
    expect((await requireReceptionist()).ok).toBe(true)
    h.getSession.mockResolvedValue(session({ role: "doctor" }))
    expect((await requireReceptionist()).ok).toBe(false)
  })
})

describe("requirePatient", () => {
  it("allows a patient and resolves their id", async () => {
    h.getSession.mockResolvedValue(session({ role: "patient", profileId: "p1" }))
    const g = await requirePatient()
    expect(g.ok).toBe(true)
    if (g.ok) expect(g.value.patientId).toBe("p1")
  })
  it("denies a doctor and a patient with no profile", async () => {
    h.getSession.mockResolvedValue(session({ role: "doctor" }))
    expect((await requirePatient()).ok).toBe(false)
    h.getSession.mockResolvedValue(session({ role: "patient", profileId: null }))
    expect((await requirePatient()).ok).toBe(false)
  })
})

describe("requireSessionScoped", () => {
  it("marks staff and gives no patient id", async () => {
    h.getSession.mockResolvedValue(session({ role: "receptionist" }))
    const g = await requireSessionScoped()
    expect(g.ok).toBe(true)
    if (g.ok) expect(g.value).toMatchObject({ isStaff: true, patientId: null })
  })
  it("marks a patient as non-staff and carries their own id", async () => {
    h.getSession.mockResolvedValue(session({ role: "patient", profileId: "p9" }))
    const g = await requireSessionScoped()
    if (g.ok) expect(g.value).toMatchObject({ isStaff: false, patientId: "p9" })
  })
  it("denies when unauthenticated", async () => {
    h.getSession.mockResolvedValue(null)
    expect((await requireSessionScoped()).ok).toBe(false)
  })
})
