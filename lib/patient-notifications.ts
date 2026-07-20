/**
 * Patient notification builder (pure). Derives the "here's what needs your
 * attention" list from the patient's current data — no stored notifications
 * table, no read/unread state. Info events are time-windowed to the last
 * {@link WINDOW_DAYS} days so they don't pile up forever.
 *
 * Kept pure (data in → items out) so the derivation logic is unit-tested
 * independently of the database.
 */
import type { NotificationItem } from "@/components/notification-bell"
import type { TFunction } from "@/lib/i18n/translate"

export const WINDOW_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000
/** Check-in / "tomorrow" reminder horizon. */
const SOON_MS = 36 * 60 * 60 * 1000

export interface PatientNotifInput {
  nowMs: number
  appointments: {
    id: string
    starts_at: string
    status: string
    staff_modified_at: string | null
  }[]
  reports: {
    id: string
    status: string
    created_at: string
    approved_at: string | null
  }[]
  invoices: {
    id: string
    status: string
    insurance_type: string
  }[]
  pendingProposals: number
}

/**
 * Build the ordered notification list (most important first). The translator is
 * injected so the derivation stays pure and unit-testable; the caller supplies
 * one bound to the request locale.
 */
export function buildPatientNotifications(input: PatientNotifInput, t: TFunction): NotificationItem[] {
  const { nowMs } = input
  const withinWindow = (iso: string | null): boolean => {
    if (!iso) return false
    const ms = new Date(iso).getTime()
    return ms <= nowMs && nowMs - ms <= WINDOW_DAYS * DAY_MS
  }
  const isSameDay = (ms: number): boolean =>
    new Date(ms).toDateString() === new Date(nowMs).toDateString()

  const items: NotificationItem[] = []

  // 1. Clinic-initiated changes to the patient's appointment (most important).
  for (const a of input.appointments) {
    if (!withinWindow(a.staff_modified_at)) continue
    if (a.status === "cancelled") {
      items.push({
        id: `appt-cancelled-${a.id}`,
        kind: "alert",
        title: t("notify.apptCancelledTitle"),
        description: t("notify.apptCancelledDesc"),
        href: "/patient/appointments",
      })
    } else if (a.status === "scheduled") {
      items.push({
        id: `appt-updated-${a.id}`,
        kind: "alert",
        title: t("notify.apptUpdatedTitle"),
        description: t("notify.apptUpdatedDesc"),
        href: "/patient/appointments",
      })
    }
  }

  // 2. Same-day check-in and next-day reminders (upcoming, scheduled only).
  for (const a of input.appointments) {
    if (a.status !== "scheduled") continue
    const startMs = new Date(a.starts_at).getTime()
    if (startMs < nowMs) continue
    if (isSameDay(startMs)) {
      items.push({
        id: `checkin-${a.id}`,
        kind: "appointment",
        title: t("notify.checkinTodayTitle"),
        description: t("notify.checkinTodayDesc"),
        href: "/checkin",
      })
    } else if (startMs - nowMs <= SOON_MS) {
      items.push({
        id: `soon-${a.id}`,
        kind: "appointment",
        title: t("notify.apptTomorrowTitle"),
        description: t("notify.apptTomorrowDesc"),
        href: "/patient/appointments",
      })
    }
  }

  // 3. A new report is available (approved + recent). No clinical detail in the
  //    text — a notification can be glanced at by others.
  for (const r of input.reports) {
    if (r.status === "approved" && withinWindow(r.approved_at ?? r.created_at)) {
      items.push({
        id: `report-${r.id}`,
        kind: "report",
        title: t("notify.newReportTitle"),
        description: t("notify.newReportDesc"),
        href: `/patient/records/${r.id}`,
      })
    }
  }

  // 4. An invoice needs payment (private / self-pay only — GKV is settled with
  //    the insurer, the patient is never billed).
  for (const inv of input.invoices) {
    if (inv.insurance_type === "gkv") continue
    if (inv.status === "pending_payment" || inv.status === "sent") {
      items.push({
        id: `invoice-${inv.id}`,
        kind: "billing",
        title: t("notify.invoiceDueTitle"),
        description: t("notify.invoiceDueDesc"),
        href: "/patient/invoices",
      })
    }
  }

  // 5. A profile update from a consultation is awaiting the patient's confirmation.
  if (input.pendingProposals > 0) {
    items.push({
      id: "profile-proposals",
      kind: "profile",
      title: t("notify.profileConfirmTitle"),
      description:
        input.pendingProposals > 1
          ? t("notify.profileConfirmDescMany", { count: input.pendingProposals })
          : t("notify.profileConfirmDescOne", { count: input.pendingProposals }),
      href: "/patient/profile",
    })
  }

  return items.slice(0, 20)
}
