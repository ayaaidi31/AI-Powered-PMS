"use server"

/**
 * Receptionist profile management + notifications.
 *  - updateReceptionist: the receptionist edits their own contact details.
 *  - getReceptionistNotifications: live front-desk alerts (billing to process,
 *    patients currently waiting) — read-only.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { query } from "@/lib/db"
import { getAppointments, getBillingWorklist, getDoctors } from "@/lib/queries"
import { doctorName } from "@/lib/display"
import { receptionistSchema } from "@/lib/validation"
import { getT } from "@/lib/i18n/server"
import { INTL_LOCALE } from "@/lib/i18n/config"
import type { ReceptionistRow } from "@/lib/seed-data"
import { ok, fail, type ActionResult } from "./types"

export async function updateReceptionist(
  id: string,
  input: z.input<typeof receptionistSchema>,
): Promise<ActionResult<ReceptionistRow>> {
  const parsed = receptionistSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.")
  const d = parsed.data
  // Email identifies the login and must not collide with another receptionist.
  const dup = await query(`SELECT 1 FROM receptionists WHERE lower(email) = lower($1) AND id <> $2 LIMIT 1`, [d.email, id])
  if (dup.rowCount && dup.rowCount > 0) return fail("This email is already used by another receptionist.")
  const res = await query<ReceptionistRow>(
    `UPDATE receptionists
        SET first_name = $2, last_name = $3, email = $4, phone = $5, department = $6
      WHERE id = $1
      RETURNING *`,
    [id, d.first_name, d.last_name, d.email, d.phone || null, d.department || null],
  )
  if (res.rowCount === 0) return fail("Receptionist not found.")
  revalidatePath("/receptionist", "layout")
  return ok(res.rows[0])
}

export interface ReceptionistNotification {
  id: string
  kind: "billing" | "waiting" | "staff"
  title: string
  description: string
  href: string
}

/** Live front-desk alerts: off-duty doctors needing recovery, billing, waiting. */
export async function getReceptionistNotifications(): Promise<ReceptionistNotification[]> {
  const [appointments, worklist, doctors] = await Promise.all([getAppointments(), getBillingWorklist(), getDoctors()])
  const { t, locale } = await getT()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayStr = startOfToday.toDateString()
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit" })

  const out: ReceptionistNotification[] = []

  // Off-duty doctors with upcoming appointments that need a recovery plan.
  for (const d of doctors) {
    if (d.is_available) continue
    const orphaned = appointments.filter(
      (a) => a.doctor_id === d.id && a.status === "scheduled" && Date.parse(a.starts_at) >= startOfToday.getTime(),
    ).length
    if (orphaned > 0) {
      out.push({
        id: `staff-${d.id}`,
        kind: "staff",
        title: t("notify.doctorOffDuty", { name: doctorName(d) }),
        description: orphaned !== 1
          ? t("notify.recoveryNeededMany", { count: orphaned })
          : t("notify.recoveryNeededOne", { count: orphaned }),
        href: "/receptionist/staff",
      })
    }
  }

  // Completed consultations awaiting billing finalisation (no invoice yet).
  for (const w of worklist) {
    if (w.invoice_id == null) {
      out.push({
        id: `bill-${w.appointment_id}`,
        kind: "billing",
        title: t("notify.billingToProcess"),
        description: w.code_count !== 1
          ? t("notify.billingDescMany", { name: w.patient_name, count: w.code_count })
          : t("notify.billingDescOne", { name: w.patient_name, count: w.code_count }),
        href: "/receptionist/billing",
      })
    }
  }

  // Patients checked in and waiting today.
  for (const a of appointments) {
    if (a.status === "waiting" && new Date(a.starts_at).toDateString() === todayStr) {
      out.push({
        id: `wait-${a.id}`,
        kind: "waiting",
        title: t("notify.patientWaiting", { name: a.patient_name }),
        // Doctor name and time are data, shown as-is.
        description: `${a.doctor_name} · ${fmtTime(a.starts_at)}`,
        href: "/receptionist/waiting",
      })
    }
  }

  return out.slice(0, 15)
}
