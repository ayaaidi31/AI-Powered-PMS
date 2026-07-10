"use server"

/**
 * Day-before appointment reminder emails.
 *
 * This is idempotency-light on purpose: it emails scheduled appointments whose
 * start falls in the next 24–48h. Intended to be invoked once a day by a
 * scheduler (cron / Vercel Cron / a small route hit by an external trigger) —
 * the app does not run its own scheduler. No-op when email isn't configured.
 */
import { query } from "@/lib/db"
import { isEmailConfigured, sendAppointmentReminderEmail, appUrl } from "@/lib/email"

export async function remindUpcomingAppointments(): Promise<{ sent: number; skipped: number }> {
  if (!isEmailConfigured()) return { sent: 0, skipped: 0 }

  const rows = await query<{ starts_at: string; first_name: string; email: string | null }>(
    `SELECT a.starts_at, p.first_name, p.email
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.status = 'scheduled'
       AND p.email IS NOT NULL
       AND a.starts_at BETWEEN now() + interval '24 hours' AND now() + interval '48 hours'`,
  )

  const portalUrl = await appUrl("/patient/appointments")
  let sent = 0
  let skipped = 0
  for (const r of rows.rows) {
    if (!r.email) { skipped++; continue }
    const whenText = new Date(r.starts_at).toLocaleString("en-GB", {
      weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
      timeZone: "Europe/Berlin",
    })
    const res = await sendAppointmentReminderEmail({ to: r.email, firstName: r.first_name, whenText, portalUrl })
    if (res.sent) sent++
    else skipped++
  }
  return { sent, skipped }
}
