import { describe, it, expect } from "vitest"
import { patientSchema, doctorSchema, receptionistSchema, orNull } from "@/lib/validation"

describe("orNull", () => {
  it("turns empty / whitespace into null and trims otherwise", () => {
    expect(orNull("")).toBeNull()
    expect(orNull("   ")).toBeNull()
    expect(orNull(undefined)).toBeNull()
    expect(orNull(null)).toBeNull()
    expect(orNull("  hi ")).toBe("hi")
  })
})

describe("patientSchema (REQ-REC-09/10)", () => {
  const valid = { first_name: "Max", last_name: "Mustermann", birth_date: "1985-04-14", insurance_type: "gkv" as const }

  it("accepts a minimal valid patient", () => {
    expect(patientSchema.safeParse(valid).success).toBe(true)
  })
  it("requires first and last name", () => {
    expect(patientSchema.safeParse({ ...valid, first_name: "" }).success).toBe(false)
    expect(patientSchema.safeParse({ ...valid, last_name: " " }).success).toBe(false)
  })
  it("enforces the YYYY-MM-DD birth date format", () => {
    expect(patientSchema.safeParse({ ...valid, birth_date: "14.04.1985" }).success).toBe(false)
  })
  it("restricts insurance type to the three German categories", () => {
    expect(patientSchema.safeParse({ ...valid, insurance_type: "private" }).success).toBe(false)
    for (const t of ["gkv", "pkv", "selbstzahler"]) {
      expect(patientSchema.safeParse({ ...valid, insurance_type: t }).success).toBe(true)
    }
  })
  it("accepts empty optional contact but rejects a malformed email", () => {
    expect(patientSchema.safeParse({ ...valid, email: "" }).success).toBe(true)
    expect(patientSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false)
    expect(patientSchema.safeParse({ ...valid, email: "a@b.de" }).success).toBe(true)
  })
  it("rejects a future or implausible date of birth", () => {
    expect(patientSchema.safeParse({ ...valid, birth_date: "2999-01-01" }).success).toBe(false)
    expect(patientSchema.safeParse({ ...valid, birth_date: "1850-01-01" }).success).toBe(false)
  })
  it("validates the KVNR format (one letter + 9 digits)", () => {
    expect(patientSchema.safeParse({ ...valid, versicherten_id: "A123456789" }).success).toBe(true)
    expect(patientSchema.safeParse({ ...valid, versicherten_id: "123456789" }).success).toBe(false)
    expect(patientSchema.safeParse({ ...valid, versicherten_id: "A12345" }).success).toBe(false)
    expect(patientSchema.safeParse({ ...valid, versicherten_id: "" }).success).toBe(true)
  })
  it("validates the insurer IK (9 digits) and PLZ (5 digits)", () => {
    expect(patientSchema.safeParse({ ...valid, insurer_ik: "101097008" }).success).toBe(true)
    expect(patientSchema.safeParse({ ...valid, insurer_ik: "12345" }).success).toBe(false)
    expect(patientSchema.safeParse({ ...valid, postal_code: "10115" }).success).toBe(true)
    expect(patientSchema.safeParse({ ...valid, postal_code: "1011" }).success).toBe(false)
  })
  it("validates German phone numbers, accepting +49 and 0 forms", () => {
    expect(patientSchema.safeParse({ ...valid, phone: "0151 23456789" }).success).toBe(true)
    expect(patientSchema.safeParse({ ...valid, phone: "+49 30 12345678" }).success).toBe(true)
    expect(patientSchema.safeParse({ ...valid, phone: "abc" }).success).toBe(false)
    expect(patientSchema.safeParse({ ...valid, phone: "030" }).success).toBe(false)
  })
})

describe("doctorSchema", () => {
  const valid = { first_name: "Sarah", last_name: "Smith", email: "s@c.de", max_daily_capacity: 20, is_available: true }
  it("accepts a valid doctor profile", () => {
    expect(doctorSchema.safeParse(valid).success).toBe(true)
  })
  it("requires a valid email", () => {
    expect(doctorSchema.safeParse({ ...valid, email: "x" }).success).toBe(false)
  })
  it("coerces and bounds the daily capacity", () => {
    expect(doctorSchema.safeParse({ ...valid, max_daily_capacity: "30" }).success).toBe(true) // coerced
    expect(doctorSchema.safeParse({ ...valid, max_daily_capacity: 0 }).success).toBe(false)
    expect(doctorSchema.safeParse({ ...valid, max_daily_capacity: 999 }).success).toBe(false)
  })
})

describe("receptionistSchema", () => {
  it("requires name + valid email", () => {
    expect(receptionistSchema.safeParse({ first_name: "Maria", last_name: "Braun", email: "m@c.de" }).success).toBe(true)
    expect(receptionistSchema.safeParse({ first_name: "", last_name: "Braun", email: "m@c.de" }).success).toBe(false)
    expect(receptionistSchema.safeParse({ first_name: "Maria", last_name: "Braun", email: "nope" }).success).toBe(false)
  })
})
