"use server"

/**
 * Vitals write actions (Feature 10).
 *
 * Vitals are a per-visit measurement: each consultation records its own row,
 * keyed by `appointment_id`. The patient's "current vitals" is simply the row
 * with the latest `recorded_at`, so saving here surfaces in the patient account
 * automatically. We keep one row per appointment (upsert in place).
 */
import { z } from "zod"
import { revalidatePath } from "next/cache"
import { query } from "@/lib/db"
import type { VitalsRow } from "@/lib/seed-data"
import { ok, fail, type ActionResult } from "./types"

const vitalsSchema = z.object({
  appointment_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  systolic: z.number().int().positive().nullable().optional(),
  diastolic: z.number().int().positive().nullable().optional(),
  heart_rate: z.number().int().positive().nullable().optional(),
  temperature_c: z.number().positive().nullable().optional(),
  weight_kg: z.number().positive().nullable().optional(),
  height_cm: z.number().int().positive().nullable().optional(),
})

export type VitalsInput = z.infer<typeof vitalsSchema>

/** Record (or update) the vitals measured during an appointment. */
export async function saveAppointmentVitals(
  input: VitalsInput,
): Promise<ActionResult<VitalsRow | null>> {
  const parsed = vitalsSchema.safeParse(input)
  if (!parsed.success) return fail("Invalid vitals payload.")
  const d = parsed.data
  const values = [
    d.systolic ?? null, d.diastolic ?? null, d.heart_rate ?? null,
    d.temperature_c ?? null, d.weight_kg ?? null, d.height_cm ?? null,
  ]
  const allEmpty = values.every((v) => v == null)

  // Update the appointment's existing row in place if there is one.
  const upd = await query<VitalsRow>(
    `UPDATE vitals
        SET systolic = $2, diastolic = $3, heart_rate = $4,
            temperature_c = $5, weight_kg = $6, height_cm = $7, recorded_at = now()
      WHERE appointment_id = $1
      RETURNING *`,
    [d.appointment_id, ...values],
  )
  if (upd.rows[0]) {
    revalidatePath("/doctor")
    revalidatePath("/patient")
    return ok(upd.rows[0])
  }

  // Nothing to record yet — don't create an empty row.
  if (allEmpty) return ok(null)

  const ins = await query<VitalsRow>(
    `INSERT INTO vitals
       (patient_id, appointment_id, systolic, diastolic, heart_rate, temperature_c, weight_kg, height_cm)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [d.patient_id, d.appointment_id, ...values],
  )
  revalidatePath("/doctor")
  revalidatePath("/patient")
  return ok(ins.rows[0])
}
