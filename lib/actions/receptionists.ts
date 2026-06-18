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
import type { ReceptionistRow } from "@/lib/seed-data"
import { ok, fail, type ActionResult } from "./types"

const receptionistSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required."),
  last_name: z.string().trim().min(1, "Last name is required."),
  email: z.string().trim().email("Invalid email address."),
  phone: z.string().trim().optional().or(z.literal("")),
  department: z.string().trim().optional().or(z.literal("")),
})

export async function updateReceptionist(
  id: string,
  input: z.input<typeof receptionistSchema>,
): Promise<ActionResult<ReceptionistRow>> {
  const parsed = receptionistSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.")
  const d = parsed.data
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
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const todayStr = startOfToday.toDateString()
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })

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
        title: `${doctorName(d)} is off duty`,
        description: `${orphaned} appointment${orphaned !== 1 ? "s" : ""} need recovery`,
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
        title: "Billing to process",
        description: `${w.patient_name} · ${w.code_count} code${w.code_count !== 1 ? "s" : ""}`,
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
        title: `${a.patient_name} is waiting`,
        description: `${a.doctor_name} · ${fmtTime(a.starts_at)}`,
        href: "/receptionist/waiting",
      })
    }
  }

  return out.slice(0, 15)
}
