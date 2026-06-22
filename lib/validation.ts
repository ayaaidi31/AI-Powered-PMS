/**
 * Shared input validation schemas (zod) for the CRUD actions. Kept dependency-
 * free (no DB) so the validation rules can be unit-tested directly and reused
 * across actions.
 */
import { z } from "zod"

/** Normalise an optional form field: empty/whitespace becomes NULL. */
export const orNull = (value?: string | null): string | null =>
  value && value.trim() !== "" ? value.trim() : null

/** Patient registration / profile (Feature 8 — REQ-REC-09/10). */
export const patientSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required."),
  last_name: z.string().trim().min(1, "Last name is required."),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth must be YYYY-MM-DD."),
  insurance_type: z.enum(["gkv", "pkv", "selbstzahler"]),
  email: z.string().trim().email("Invalid email address.").optional().or(z.literal("")),
  phone: z.string().trim().optional().or(z.literal("")),
  versicherten_id: z.string().trim().optional().or(z.literal("")),
  guardian_contact: z.string().trim().optional().or(z.literal("")),
  street: z.string().trim().optional().or(z.literal("")),
  city: z.string().trim().optional().or(z.literal("")),
  postal_code: z.string().trim().optional().or(z.literal("")),
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
