/**
 * Daily appointment-reminder cron endpoint.
 *
 * Triggered by Vercel Cron (see vercel.json). When `CRON_SECRET` is set, the
 * request must carry `Authorization: Bearer <CRON_SECRET>` (Vercel Cron adds
 * this automatically) so the endpoint can't be hit by anyone. No-op when email
 * isn't configured.
 */
import { NextResponse } from "next/server"
import { remindUpcomingAppointments } from "@/lib/actions/reminders"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }
  const result = await remindUpcomingAppointments()
  return NextResponse.json({ ok: true, ...result })
}
