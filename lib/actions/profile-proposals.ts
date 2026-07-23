"use server"

/**
 * Patient-profile change proposals (Feature 10 / AI-Module-15).
 *
 * Flow: the AI suggests profile updates from a confirmed consultation → the
 * doctor confirms a subset (createProfileProposals, stored 'pending_patient') →
 * the patient accepts or rejects (respondToProposal). On accept the change is
 * applied to the profile atomically and stamped `last_updated_by`.
 */
import { query, withTransaction } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { requireDoctor, requirePatient, requireSessionScoped } from "@/lib/auth/guard"
import { ok, fail, type ActionResult } from "./types"
import type { ProfileUpdateSuggestion } from "./ai"

export interface ProfileProposalRow {
  id: string
  patient_id: string
  appointment_id: string | null
  field: string
  operation: "set" | "add" | "remove"
  label: string
  current_value: string | null
  proposed_value: string
  reason: string | null
  status: "pending_patient" | "accepted" | "rejected" | "applied"
  created_at: string
  resolved_at: string | null
}

// Plain patient columns that may be set directly (whitelist — never interpolate
// an un-checked field name into SQL). `allergy`/`condition` are handled separately.
const PATIENT_COLUMNS = new Set(["phone", "email", "street", "city", "postal_code", "country"])

/**
 * Doctor confirms the AI-detected changes at the end of a consultation. The two
 * kinds of data are routed differently:
 *  - Administrative data (contact, address) is owned by the patient, so it is
 *    stored as a pending proposal the patient must accept.
 *  - Clinical data (allergies, conditions) is the doctor's medical record, so it
 *    is applied immediately (add or remove) and recorded as 'applied' for the
 *    patient's information. Removed entries stay auditable in this table.
 */
export async function createProfileProposals(
  patientId: string,
  appointmentId: string | null,
  items: ProfileUpdateSuggestion[],
): Promise<ActionResult<{ applied: number; sentToPatient: number }>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  if (!patientId) return fail("Missing patient.")
  const valid = items.filter(
    (i) => i.proposedValue?.trim() && (PATIENT_COLUMNS.has(i.field) || i.field === "allergy" || i.field === "condition"),
  )
  if (valid.length === 0) return ok({ applied: 0, sentToPatient: 0 })

  let applied = 0
  let sentToPatient = 0
  await withTransaction(async (client) => {
    for (const i of valid) {
      const value = i.proposedValue.trim()
      const isClinical = i.field === "allergy" || i.field === "condition"

      if (!isClinical) {
        // Administrative change — patient decides.
        await client.query(
          `INSERT INTO profile_change_proposals
             (patient_id, appointment_id, field, operation, label, current_value, proposed_value, reason, status)
           VALUES ($1, $2, $3, 'set', $4, $5, $6, $7, 'pending_patient')`,
          [patientId, appointmentId, i.field, i.label, i.currentValue ?? null, value, i.reason || null],
        )
        sentToPatient++
        continue
      }

      // Clinical change — the doctor is the authority; apply it now.
      const operation = i.operation === "remove" ? "remove" : "add"
      const table = i.field === "allergy" ? "patient_allergies" : "patient_conditions"
      const column = i.field === "allergy" ? "substance" : "label"
      if (operation === "add") {
        await client.query(`INSERT INTO ${table} (patient_id, ${column}) VALUES ($1, $2)`, [patientId, value])
      } else {
        // Hard-delete from the active list; the audit stays in the row below.
        await client.query(`DELETE FROM ${table} WHERE patient_id = $1 AND lower(${column}) = lower($2)`, [patientId, value])
      }
      await client.query(
        `INSERT INTO profile_change_proposals
           (patient_id, appointment_id, field, operation, label, current_value, proposed_value, reason, status, resolved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'applied', now())`,
        [patientId, appointmentId, i.field, operation, i.label, i.currentValue ?? null, value, i.reason || null],
      )
      applied++
    }
  })
  revalidatePath("/patient/profile")
  revalidatePath("/patient/dashboard")
  return ok({ applied, sentToPatient })
}

/** Pending proposals shown to the patient on their profile. */
export async function getPendingProfileProposals(patientId: string): Promise<ProfileProposalRow[]> {
  // A patient may only read their own proposals; staff may read any.
  const g = await requireSessionScoped()
  if (!g.ok) return []
  if (!g.value.isStaff && patientId !== g.value.patientId) return []
  const res = await query<ProfileProposalRow>(
    `SELECT * FROM profile_change_proposals
      WHERE patient_id = $1 AND status = 'pending_patient'
      ORDER BY created_at DESC`,
    [patientId],
  )
  return res.rows
}

/**
 * Clinical record changes the doctor applied directly (status 'applied'), for
 * the patient's information. Windowed to the recent past so the notification
 * doesn't surface indefinitely.
 */
export async function getAppliedRecordChanges(patientId: string): Promise<ProfileProposalRow[]> {
  const g = await requireSessionScoped()
  if (!g.ok) return []
  if (!g.value.isStaff && patientId !== g.value.patientId) return []
  const res = await query<ProfileProposalRow>(
    `SELECT * FROM profile_change_proposals
      WHERE patient_id = $1 AND status = 'applied'
        AND resolved_at >= now() - interval '14 days'
      ORDER BY resolved_at DESC`,
    [patientId],
  )
  return res.rows
}

/** Patient accepts (apply + mark accepted) or rejects a proposed change. */
export async function respondToProposal(proposalId: string, accept: boolean): Promise<ActionResult<null>> {
  const g = await requirePatient()
  if (!g.ok) return g.error
  const res = await query<ProfileProposalRow>(
    `SELECT * FROM profile_change_proposals WHERE id = $1`,
    [proposalId],
  )
  const p = res.rows[0]
  if (!p) return fail("Proposal not found.")
  // A patient may only respond to their own proposals.
  if (p.patient_id !== g.value.patientId) return fail("Proposal not found.")
  if (p.status !== "pending_patient") return fail("This change has already been handled.")

  if (!accept) {
    await query(`UPDATE profile_change_proposals SET status = 'rejected', resolved_at = now() WHERE id = $1`, [proposalId])
    revalidatePath("/patient/profile")
    return ok(null)
  }

  try {
    await withTransaction(async (client) => {
      if (p.field === "allergy") {
        await client.query(`INSERT INTO patient_allergies (patient_id, substance) VALUES ($1, $2)`, [p.patient_id, p.proposed_value])
      } else if (p.field === "condition") {
        await client.query(`INSERT INTO patient_conditions (patient_id, label) VALUES ($1, $2)`, [p.patient_id, p.proposed_value])
      } else if (PATIENT_COLUMNS.has(p.field)) {
        await client.query(
          `UPDATE patients SET ${p.field} = $2, last_updated_by = 'AI-Module-15 (patient-approved)' WHERE id = $1`,
          [p.patient_id, p.proposed_value],
        )
      } else {
        throw new Error("Unsupported field.")
      }
      await client.query(`UPDATE profile_change_proposals SET status = 'accepted', resolved_at = now() WHERE id = $1`, [proposalId])
    })
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not apply the change.")
  }
  revalidatePath("/patient/profile")
  return ok(null)
}
