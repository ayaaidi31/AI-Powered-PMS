import { describe, it, expect, vi, beforeEach } from "vitest"
import { en } from "@/lib/i18n/messages/en"
import { translate } from "@/lib/i18n/translate"

// checkPrescriptionSafety (F13 — REQ-AI-04). The deterministic allergy match is
// the guaranteed layer: it must still be returned when the language model is not
// configured or its call fails, so a safety alert is never lost to an outage.
vi.mock("server-only", () => ({}))
const h = vi.hoisted(() => ({ isLlmConfigured: vi.fn(), mistralChat: vi.fn() }))
vi.mock("@/lib/db", () => ({ query: vi.fn(), sql: vi.fn(), withTransaction: vi.fn(), pool: {} }))
vi.mock("@/lib/llm/mistral", () => ({
  isLlmConfigured: (...a: unknown[]) => h.isLlmConfigured(...a),
  mistralChat: (...a: unknown[]) => h.mistralChat(...a),
}))
vi.mock("@/lib/i18n/server", () => ({
  getT: async () => ({ t: (k: string, vars?: Record<string, string | number>) => translate(en, k, vars), locale: "en" }),
  getLocale: async () => "en",
}))
vi.mock("@/lib/auth/guard", () => ({
  requireDoctor: async () => ({ ok: true, value: { userId: "u1", role: "doctor", profileId: "doc1", email: "d@c.de", name: "Doc" } }),
  requireStaff: vi.fn(),
  requireSession: vi.fn(),
}))
vi.mock("@/lib/queries", () => ({ getReportsByPatient: vi.fn(), getVitalsByPatient: vi.fn() }))
vi.mock("@/lib/codes/ebm", () => ({ getEbmCode: vi.fn(), searchEbmCodes: () => [] }))

import { checkPrescriptionSafety } from "@/lib/actions/ai"

beforeEach(() => { h.isLlmConfigured.mockReset(); h.mistralChat.mockReset() })

const input = (over: Record<string, unknown> = {}) => ({
  allergies: ["Penicillin"],
  conditions: [],
  currentMedications: [],
  prescriptions: [{ medication: "Penicillin V" }],
  diagnosis: "",
  ...over,
})

describe("checkPrescriptionSafety (F13 — graceful degradation)", () => {
  it("returns the deterministic allergy alert without the model when the LLM is unavailable", async () => {
    h.isLlmConfigured.mockReturnValue(false)
    const r = await checkPrescriptionSafety(input())
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.data.alerts).toHaveLength(1)
    expect(r.data.alerts[0].category).toBe("allergy")
    expect(r.data.alerts[0].severity).toBe("high")
    expect(h.mistralChat).not.toHaveBeenCalled()
  })

  it("falls back to the deterministic alert when the model call throws", async () => {
    h.isLlmConfigured.mockReturnValue(true)
    h.mistralChat.mockRejectedValue(new Error("model endpoint down"))
    const r = await checkPrescriptionSafety(input())
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.data.alerts).toHaveLength(1)
    expect(r.data.alerts[0].category).toBe("allergy")
  })

  it("returns no alerts when there is nothing to check", async () => {
    h.isLlmConfigured.mockReturnValue(false)
    const r = await checkPrescriptionSafety(input({ prescriptions: [], diagnosis: "" }))
    expect(r.status).toBe("ok")
    if (r.status === "ok") expect(r.data.alerts).toHaveLength(0)
    expect(h.mistralChat).not.toHaveBeenCalled()
  })
})
