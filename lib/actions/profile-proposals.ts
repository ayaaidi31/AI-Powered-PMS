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
  label: string
  current_value: string | null
  proposed_value: string
  reason: string | null
  status: "pending_patient" | "accepted" | "rejected"
  created_at: string
  resolved_at: string | null
}

// Plain patient columns that may be set directly (whitelist — never interpolate
// an un-checked field name into SQL). `allergy`/`condition` are handled separately.
const PATIENT_COLUMNS = new Set(["phone", "email", "street", "city", "postal_code", "country"])

/** Doctor confirms AI suggestions → store them as pending for the patient. */
export async function createProfileProposals(
  patientId: string,
  appointmentId: string | null,
  items: ProfileUpdateSuggestion[],
): Promise<ActionResult<{ count: number }>> {
  const g = await requireDoctor()
  if (!g.ok) return g.error
  if (!patientId) return fail("Missing patient.")
  const valid = items.filter(
    (i) => i.proposedValue?.trim() && (PATIENT_COLUMNS.has(i.field) || i.field === "allergy" || i.field === "condition"),
  )
  if (valid.length === 0) return ok({ count: 0 })
  await withTransaction(async (client) => {
    for (const i of valid) {
      await client.query(
        `INSERT INTO profile_change_proposals
           (patient_id, appointment_id, field, label, current_value, proposed_value, reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [patientId, appointmentId, i.field, i.label, i.currentValue ?? null, i.proposedValue.trim(), i.reason || null],
      )
    }
  })
  revalidatePath("/patient/profile")
  revalidatePath("/patient/dashboard")
  return ok({ count: valid.length })
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
