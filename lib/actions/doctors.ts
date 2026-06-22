"use server"

/**
 * Doctor profile management + notifications.
 *
 *  - updateDoctor: the doctor edits their own profile (contact, specialty,
 *    department, daily capacity, on-duty availability). LANR is regulatory and
 *    not editable here.
 *  - getDoctorNotifications: live, derived alerts for the signed-in doctor
 *    (patients waiting, reports awaiting approval) — read-only.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { query } from "@/lib/db"
import { getCurrentDoctor, getAppointmentsByDoctor, getReportsByDoctor } from "@/lib/queries"
import type { DoctorRow } from "@/lib/seed-data"
import { doctorSchema } from "@/lib/validation"
import { ok, fail, type ActionResult } from "./types"

export async function updateDoctor(
  id: string,
  input: z.input<typeof doctorSchema>,
): Promise<ActionResult<DoctorRow>> {
  const parsed = doctorSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid input.")
  }
  const d = parsed.data
  const res = await query<DoctorRow>(
    `UPDATE doctors
        SET first_name = $2, last_name = $3, email = $4, phone = $5,
            specialization = $6, department = $7, max_daily_capacity = $8, is_available = $9
      WHERE id = $1
      RETURNING *`,
    [id, d.first_name, d.last_name, d.email, d.phone || null, d.specialization || null, d.department || null, d.max_daily_capacity, d.is_available],
  )
  if (res.rowCount === 0) return fail("Doctor not found.")
  // Re-render the doctor layout (sidebar name / on-duty badge) and settings.
  revalidatePath("/doctor", "layout")
  return ok(res.rows[0])
}

/**
 * Toggle a doctor's on-duty availability (self "report sick" or reception).
 * When marking unavailable, an absence window may be given (from..until); the
 * recovery plan only acts on appointments inside it. Defaults to today onward
 * (open-ended). Marking available clears the window.
 */
export async function setDoctorAvailability(
  doctorId: string,
  isAvailable: boolean,
  range?: { from?: string | null; until?: string | null },
): Promise<ActionResult<DoctorRow>> {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const from = isAvailable ? null : (range?.from || todayStr)
  const until = isAvailable ? null : (range?.until || null)
  const res = await query<DoctorRow>(
    `UPDATE doctors SET is_available = $2, unavailable_from = $3, unavailable_until = $4
      WHERE id = $1 RETURNING *`,
    [doctorId, isAvailable, from, until],
  )
  if (res.rowCount === 0) return fail("Doctor not found.")
  revalidatePath("/doctor", "layout")
  revalidatePath("/receptionist/staff")
  return ok(res.rows[0])
}

export interface DoctorNotification {
  id: string
  kind: "waiting" | "report"
  title: string
  description: string
  href: string
}

/** Live alerts for the signed-in doctor: waiting patients + reports to approve. */
export async function getDoctorNotifications(): Promise<DoctorNotification[]> {
  const doctor = await getCurrentDoctor()
  if (!doctor) return []

  const [appointments, reports] = await Promise.all([
    getAppointmentsByDoctor(doctor.id),
    getReportsByDoctor(doctor.id),
  ])

  const todayStr = new Date().toDateString()
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })

  const notifications: DoctorNotification[] = []

  // Patients checked in and waiting today.
  for (const a of appointments) {
    if (a.status === "waiting" && new Date(a.starts_at).toDateString() === todayStr) {
      notifications.push({
        id: `wait-${a.id}`,
        kind: "waiting",
        title: `${a.patient_name} is waiting`,
        description: `Checked in · ${fmtTime(a.starts_at)} appointment`,
        href: "/doctor/workspace",
      })
    }
  }

  // Reports that still need the doctor's approval.
  for (const r of reports) {
    if (r.status === "draft" || r.status === "pending_approval") {
      notifications.push({
        id: `report-${r.id}`,
        kind: "report",
        title: "Report awaiting approval",
        description: `${r.patient_name}${r.diagnosis ? ` · ${r.diagnosis}` : ""}`,
        href: "/doctor/reports",
      })
    }
  }

  return notifications.slice(0, 15)
}
