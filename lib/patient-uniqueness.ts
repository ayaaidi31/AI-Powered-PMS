import "server-only"

/**
 * Cross-patient uniqueness checks for identifying fields. A patient's email,
 * mobile number, and insurance number (KVNR) must not collide with another
 * active patient record. The KVNR additionally has a database UNIQUE constraint;
 * these checks run first so the caller can return a field-level message instead
 * of surfacing a raw constraint violation.
 *
 * Comparisons are case-insensitive and ignore soft-deleted records, so a
 * deactivated patient's details can be reused. On update, the patient's own row
 * is excluded via `excludeId`.
 */
import { query } from "@/lib/db"

export interface PatientIdentifiers {
  email?: string | null
  phone?: string | null
  versicherten_id?: string | null
}

/** Returns a field->message map of any conflicts; empty when all fields are free. */
export async function patientFieldConflicts(
  fields: PatientIdentifiers,
  excludeId?: string,
): Promise<Record<string, string>> {
  const email = fields.email?.trim() || null
  const phone = fields.phone?.trim() || null
  const kvnr = fields.versicherten_id?.trim() || null
  if (!email && !phone && !kvnr) return {}

  const res = await query<{ email_taken: boolean | null; phone_taken: boolean | null; kvnr_taken: boolean | null }>(
    `SELECT
        bool_or($1::text IS NOT NULL AND lower(email)           = lower($1)) AS email_taken,
        bool_or($2::text IS NOT NULL AND lower(phone)           = lower($2)) AS phone_taken,
        bool_or($3::text IS NOT NULL AND lower(versicherten_id) = lower($3)) AS kvnr_taken
       FROM patients
      WHERE deleted_at IS NULL AND ($4::uuid IS NULL OR id <> $4::uuid)`,
    [email, phone, kvnr, excludeId ?? null],
  )
  const row = res.rows[0]
  const errors: Record<string, string> = {}
  if (row?.email_taken) errors.email = "This email is already registered to another patient."
  if (row?.phone_taken) errors.phone = "This phone number is already registered to another patient."
  if (row?.kvnr_taken) errors.versicherten_id = "This insurance number is already on file for another patient."
  return errors
}
