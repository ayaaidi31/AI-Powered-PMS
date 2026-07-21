"use client"

/**
 * Receptionist review queue for AI voice-agent bookings (Feature 11). Each row
 * can be confirmed (details correct) or flagged (needs attention). Flagged
 * bookings stay visible so staff can fix or cancel them from the schedule.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { PhoneCall, CalendarClock, User, Stethoscope, CheckCircle2, Flag, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { reviewVoiceBooking } from "@/lib/actions/appointments"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"
import type { TKey } from "@/lib/i18n/translate"

export interface VoiceBooking {
  id: string
  patientName: string
  doctorName: string
  startsAt: string
  status: string
  reason: string
  reviewStatus: "pending" | "confirmed" | "flagged"
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  scheduled: "default",
  checked_in: "secondary",
  in_progress: "secondary",
  completed: "outline",
  cancelled: "destructive",
  no_show: "destructive",
}
// Statuses that map onto the shared status.* dictionary; checked_in is reception-only.
const SHARED_STATUS = new Set(["scheduled", "in_progress", "completed", "cancelled", "no_show", "waiting"])

export function CallsClient({ bookings }: { bookings: VoiceBooking[] }) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(INTL_LOCALE[locale], {
      weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    })

  const statusLabel = (s: string) =>
    s === "checked_in" ? t("reception.statusCheckedIn") : SHARED_STATUS.has(s) ? t(`status.${s}` as TKey) : s

  const pendingCount = bookings.filter((b) => b.reviewStatus === "pending").length

  function review(id: string, status: "confirmed" | "flagged") {
    setPendingId(id)
    startTransition(async () => {
      const res = await reviewVoiceBooking(id, status)
      setPendingId(null)
      if (res.status === "ok") {
        toast.success(status === "confirmed" ? t("reception.bookingConfirmed") : t("reception.bookingFlagged"))
        router.refresh()
      } else {
        toast.error(res.message)
      }
    })
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PhoneCall className="w-6 h-6 text-primary" /> {t("reception.callAgentTitle")}
        </h1>
        <p className="text-muted-foreground">{t("reception.callAgentSubtitle")}</p>
      </div>

      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="pt-5 text-sm text-muted-foreground">
          {t("reception.callAgentInfoA")}<strong>{t("reception.confirmWord")}</strong>{t("reception.callAgentInfoB")}<strong>{t("reception.flagWord")}</strong>{t("reception.callAgentInfoC")}
          {pendingCount > 0 && (
            <span className="ml-1 font-medium text-foreground">{t("reception.awaitingReview", { count: pendingCount })}</span>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("reception.bookingsTitle")}</CardTitle>
          <CardDescription>{bookings.length === 1 ? t("reception.bookingCount", { count: bookings.length }) : t("reception.bookingsCount", { count: bookings.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <PhoneCall className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>{t("reception.noBookings")}</p>
              <p className="text-sm">{t("reception.noBookingsHint")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bookings.map((b) => {
                const variant = STATUS_VARIANT[b.status] ?? "outline"
                const busy = pendingId === b.id
                return (
                  <div key={b.id} className={`flex flex-col lg:flex-row lg:items-center gap-3 p-4 rounded-lg border transition-colors ${b.reviewStatus === "flagged" ? "border-destructive/40 bg-destructive/5" : "border-border hover:bg-accent/40"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <User className="w-4 h-4 text-muted-foreground" /> {b.patientName}
                        </span>
                        <Badge variant={variant}>{statusLabel(b.status)}</Badge>
                        <Badge variant="outline" className="gap-1 text-primary border-primary/30">
                          <PhoneCall className="w-3 h-3" /> {t("reception.aiBooked")}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5" />{fmt(b.startsAt)}</span>
                        <span className="flex items-center gap-1"><Stethoscope className="w-3.5 h-3.5" />{b.doctorName}</span>
                      </div>
                      {b.reason && <p className="mt-1 text-sm text-muted-foreground truncate">{b.reason}</p>}
                    </div>

                    {/* Review state / actions */}
                    {b.reviewStatus === "confirmed" ? (
                      <Badge variant="secondary" className="gap-1.5 self-start lg:self-center">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {t("reception.confirmedBadge")}
                      </Badge>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                        {b.reviewStatus === "flagged" && (
                          <Badge variant="destructive" className="gap-1.5"><Flag className="w-3.5 h-3.5" /> {t("reception.flaggedBadge")}</Badge>
                        )}
                        {b.reviewStatus === "pending" && (
                          <Badge variant="outline" className="gap-1.5"><Clock className="w-3.5 h-3.5" /> {t("reception.pendingBadge")}</Badge>
                        )}
                        <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => review(b.id, "confirmed")}>
                          <CheckCircle2 className="w-4 h-4" /> {t("reception.confirmAction")}
                        </Button>
                        {b.reviewStatus !== "flagged" && (
                          <Button size="sm" variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" disabled={busy} onClick={() => review(b.id, "flagged")}>
                            <Flag className="w-4 h-4" /> {t("reception.flagAction")}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
