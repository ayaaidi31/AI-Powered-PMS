"use server"

/**
 * Patient registration and profile maintenance (Feature 8 — Receptionist
 * Patient Registration; UC-REC-03).
 *
 * Implements:
 *  - REQ-REC-09: mandatory demographics (name, DOB) enforced; digital contact
 *    (email, mobile) optional.
 *  - REQ-REC-10: server-side validation of required fields before persistence.
 *  - REQ-REC-11: duplicate detection by name + date of birth prior to creation.
 *  - REQ-REC-12: generation of a unique patient identifier (uuid) on insert.
 *  - REQ-REC-13: a patient with a valid email/phone is flagged as digitally
 *    active (portal-eligible); otherwise the record is stored for internal use
 *    only ("analog" patient).
 *
 * Deletion follows German retention law (§630f BGB): clinical records are never
 * hard-deleted. `deactivatePatient` performs a soft delete by setting
 * `deleted_at`, preserving the record for the statutory retention period.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { sql, query } from "@/lib/db"
import type { PatientRow } from "@/lib/seed-data"
import { ok, fail, conflict, type ActionResult } from "./types"

const patientSchema = z.object({
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

/** Normalise an optional form field: empty string becomes NULL in the database. */
const orNull = (value?: string) => (value && value.trim() !== "" ? value.trim() : null)

/**
 * Register a new patient.
 *
 * When `allowDuplicate` is false (the default), a patient sharing the same name
 * and date of birth triggers a `conflict` result so the Receptionist can decide
 * whether to open the existing record or proceed (UC-REC-03 alternate flow).
 */
export async function registerPatient(
  input: PatientInput,
  allowDuplicate = false,
): Promise<ActionResult<PatientRow>> {
  const parsed = patientSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0])] = issue.message
    }
    return fail("Please correct the highlighted fields.", fieldErrors)
  }
  const data = parsed.data

  if (!allowDuplicate) {
    const existing = await sql<PatientRow>`
      SELECT * FROM patients
      WHERE lower(first_name) = lower(${data.first_name})
        AND lower(last_name)  = lower(${data.last_name})
        AND birth_date = ${data.birth_date}::date
        AND deleted_at IS NULL`
    if (existing.length > 0) {
      return conflict(
        `A patient named ${data.first_name} ${data.last_name} born on ${data.birth_date} already exists.`,
        existing[0],
      )
    }
  }

  // A patient is portal-eligible only if a digital contact channel was provided.
  const email = orNull(data.email)
  const phone = orNull(data.phone)
  const isDigitalActive = Boolean(email || phone)

  const rows = await sql<PatientRow>`
    INSERT INTO patients (
      first_name, last_name, birth_date, email, phone, insurance_type,
      versicherten_id, is_digital_active, guardian_contact,
      street, city, postal_code, country, last_updated_by
    ) VALUES (
      ${data.first_name}, ${data.last_name}, ${data.birth_date}, ${email}, ${phone},
      ${data.insurance_type}, ${orNull(data.versicherten_id)}, ${isDigitalActive},
      ${orNull(data.guardian_contact)}, ${orNull(data.street)}, ${orNull(data.city)},
      ${orNull(data.postal_code)}, ${orNull(data.country)}, ${"User: Reception"}
    )
    RETURNING *`

  revalidatePath("/receptionist/patients")
  return ok(rows[0])
}

/**
 * Update an existing patient's profile. Accepts a partial set of fields; only
 * the supplied columns are modified. Every update stamps `last_updated_by` for
 * the audit trail (REQ-PROF-04).
 */
export async function updatePatient(
  id: string,
  input: Partial<PatientInput>,
  updatedBy = "User: Reception",
): Promise<ActionResult<PatientRow>> {
  const parsed = patientSchema.partial().safeParse(input)
  if (!parsed.success) {
    return fail("Invalid update payload.")
  }

  // Build the SET clause dynamically from the provided fields only.
  const entries = Object.entries(parsed.data).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return fail("No fields to update.")

  const sets: string[] = []
  const values: unknown[] = []
  for (const [column, value] of entries) {
    values.push(orNull(value as string))
    sets.push(`${column} = $${values.length}`)
  }
  values.push(updatedBy)
  sets.push(`last_updated_by = $${values.length}`)
  values.push(id)

  const result = await query<PatientRow>(
    `UPDATE patients SET ${sets.join(", ")}
     WHERE id = $${values.length} AND deleted_at IS NULL
     RETURNING *`,
    values,
  )
  if (result.rowCount === 0) return fail("Patient not found.")

  revalidatePath("/receptionist/patients")
  revalidatePath("/patient/profile")
  return ok(result.rows[0])
}

/**
 * Soft-delete a patient (§630f BGB retention). The record and all linked
 * clinical data are preserved; the patient is simply excluded from active
 * listings by setting `deleted_at`.
 */
export async function deactivatePatient(id: string): Promise<ActionResult> {
  const result = await query(
    `UPDATE patients SET deleted_at = now(), last_updated_by = 'User: Reception'
     WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  )
  if (result.rowCount === 0) return fail("Patient not found or already inactive.")

  revalidatePath("/receptionist/patients")
  return ok(undefined)
}
