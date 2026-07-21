/**
 * Shared input validation schemas (zod) for the CRUD actions. Kept dependency-
 * free (no DB) so the validation rules can be unit-tested directly and reused
 * across actions.
 */
import { z } from "zod"

/** Normalise an optional form field: empty/whitespace becomes NULL. */
export const orNull = (value?: string | null): string | null =>
  value && value.trim() !== "" ? value.trim() : null

/**
 * Validate a German mobile number. Accepts the international (+49 / 0049) and
 * national (0) forms, ignoring spaces, slashes, hyphens, and parentheses. The
 * national number must carry a mobile prefix (015x / 016x / 017x) and a plausible
 * length. Landline numbers are intentionally rejected here.
 */
export function isGermanMobile(value: string): boolean {
  const compact = value.replace(/[\s/().-]/g, "")
  let national = compact
  if (national.startsWith("+49")) national = "0" + national.slice(3)
  else if (national.startsWith("0049")) national = "0" + national.slice(4)
  else if (national.startsWith("49")) national = "0" + national.slice(2)
  return /^01[567]\d{7,9}$/.test(national)
}

/**
 * Validate a German phone number (landline or mobile). Accepts the international
 * (+49 / 0049) and national (0) forms, ignoring common separators. The national
 * number begins with a non-zero area digit and carries a plausible length.
 */
export function isGermanPhone(value: string): boolean {
  const compact = value.replace(/[\s/().-]/g, "")
  let national = compact
  if (national.startsWith("+49")) national = "0" + national.slice(3)
  else if (national.startsWith("0049")) national = "0" + national.slice(4)
  else if (national.startsWith("49")) national = "0" + national.slice(2)
  return /^0[1-9]\d{4,13}$/.test(national)
}

/** German insurance number (KVNR): one letter followed by nine digits. */
export const isKvnr = (v: string): boolean => /^[A-Za-z]\d{9}$/.test(v.trim())

/** Institutionskennzeichen of an insurer: nine digits. */
export const isIk = (v: string): boolean => /^\d{9}$/.test(v.trim())

/** German postal code (PLZ): five digits. */
export const isPlz = (v: string): boolean => /^\d{5}$/.test(v.trim())

/** An optional text field that, when present, must satisfy a format predicate. */
const optionalFormat = (test: (v: string) => boolean, message: string) =>
  z.string().trim().optional().or(z.literal("")).refine((v) => !v || test(v), message)

/** Patient registration / profile (Feature 5 — REQ-REC-09/10). */
export const patientSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required."),
  last_name: z.string().trim().min(1, "Last name is required."),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD.")
    .refine((v) => {
      const d = new Date(v)
      return !Number.isNaN(d.getTime()) && d <= new Date() && d.getFullYear() >= 1900
    }, "Enter a realistic date of birth."),
  insurance_type: z.enum(["gkv", "pkv", "selbstzahler"]),
  email: z.string().trim().email("Invalid email address.").optional().or(z.literal("")),
  phone: optionalFormat(isGermanPhone, "Enter a valid German phone number, e.g. 0151 23456789."),
  versicherten_id: optionalFormat(isKvnr, "Insurance number must be one letter followed by 9 digits, e.g. A123456789."),
  insurer_name: z.string().trim().max(120).optional().or(z.literal("")),
  insurer_ik: optionalFormat(isIk, "The insurer ID (IK) must be 9 digits."),
  guardian_name: z.string().trim().max(120).optional().or(z.literal("")),
  guardian_contact: optionalFormat(isGermanPhone, "Enter a valid German phone number, e.g. 0151 23456789."),
  street: z.string().trim().optional().or(z.literal("")),
  city: z.string().trim().optional().or(z.literal("")),
  postal_code: optionalFormat(isPlz, "Postal code must be 5 digits."),
  country: z.string().trim().optional().or(z.literal("")),
})
export type PatientInput = z.infer<typeof patientSchema>

/** Doctor self-profile (Settings). */
export const doctorSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required."),
  last_name: z.string().trim().min(1, "Last name is required."),
  email: z.string().trim().email("Invalid email address."),
  phone: z.string().trim().optional().or(z.literal("")),
  specialization: z.string().trim().optional().or(z.literal("")),
  department: z.string().trim().optional().or(z.literal("")),
  max_daily_capacity: z.coerce.number().int().min(1, "Capacity must be at least 1.").max(200),
  is_available: z.boolean(),
})

/** Receptionist self-profile (Settings). */
export const receptionistSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required."),
  last_name: z.string().trim().min(1, "Last name is required."),
  email: z.string().trim().email("Invalid email address."),
  phone: z.string().trim().optional().or(z.literal("")),
  department: z.string().trim().optional().or(z.literal("")),
})
