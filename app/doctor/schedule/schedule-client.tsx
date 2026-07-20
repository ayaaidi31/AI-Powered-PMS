"use client"

/**
 * Doctor's schedule — a day-navigable view of the doctor's own appointments.
 * Booking and rescheduling are handled by reception; this view is read-oriented,
 * with a quick link into the workspace to start a consultation.
 */
import { useState } from "react"
import Link from "next/link"
import {
  Calendar, ChevronLeft, ChevronRight, Clock, AlertCircle, UserCheck, Stethoscope,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { AppointmentWithNames } from "@/lib/queries"
import { initials } from "@/lib/display"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"
import type { TKey } from "@/lib/i18n/translate"

const STATUS_STYLE: Record<string, { color: string; text: string; bg: string }> = {
  waiting: { color: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" },
  in_progress: { color: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-50" },
  completed: { color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  scheduled: { color: "bg-slate-400", text: "text-slate-600", bg: "bg-slate-50" },
  cancelled: { color: "bg-red-400", text: "text-red-600", bg: "bg-red-50" },
  no_show: { color: "bg-red-500", text: "text-red-700", bg: "bg-red-50" },
}
const styleFor = (s: string) => STATUS_STYLE[s] ?? STATUS_STYLE.scheduled

export function DoctorScheduleClient({
  appointments, allergyPatientIds,
}: { appointments: AppointmentWithNames[]; allergyPatientIds: string[] }) {
  const t = useT()
  const locale = useLocale()
  const [selected, setSelected] = useState(() => new Date())
  const allergyIds = new Set(allergyPatientIds)

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit" })

  const isToday = selected.toDateString() === new Date().toDateString()
  const dayAppointments = appointments
    .filter((a) => new Date(a.starts_at).toDateString() === selected.toDateString())
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))

  const shift = (days: number) => {
    const d = new Date(selected)
    d.setDate(d.getDate() + days)
    setSelected(d)
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-6 h-6 text-primary" /> {t("schedule.title")}
          </h1>
          <p className="text-muted-foreground">{t("schedule.subtitle")}</p>
        </div>
        <Link href="/doctor/workspace">
          <Button className="gap-2"><Stethoscope className="w-4 h-4" />{t("schedule.openWorkspace")}</Button>
        </Link>
      </div>

      {/* Day navigator */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <Button variant="outline" size="icon" onClick={() => shift(-1)}><ChevronLeft className="w-4 h-4" /></Button>
            <div className="text-center">
              <p className="font-semibold text-foreground">
                {selected.toLocaleDateString(INTL_LOCALE[locale], { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <p className="text-xs text-muted-foreground">
                {dayAppointments.length === 1
                  ? t("schedule.appointmentCountOne", { count: dayAppointments.length })
                  : t("schedule.appointmentCountOther", { count: dayAppointments.length })}
                {!isToday && <> · <button className="underline" onClick={() => setSelected(new Date())}>{t("schedule.backToToday")}</button></>}
              </p>
            </div>
            <Button variant="outline" size="icon" onClick={() => shift(1)}><ChevronRight className="w-4 h-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{isToday ? t("schedule.todaysAppointments") : t("schedule.daysAppointments")}</CardTitle>
          <CardDescription>{t("schedule.timesShown")}</CardDescription>
        </CardHeader>
        <CardContent>
          {dayAppointments.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="font-medium">{t("schedule.noAppointments")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayAppointments.map((a) => {
                const st = styleFor(a.status)
                return (
                  <div
                    key={a.id}
                    className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${a.status === "in_progress" ? "border-blue-200 bg-blue-50/50" : a.status === "waiting" ? "border-amber-200 bg-amber-50/50" : "border-border"}`}
                  >
                    <div className="text-center min-w-[70px]">
                      <p className="font-bold text-foreground">{fmtTime(a.starts_at)}</p>
                      <p className="text-xs text-muted-foreground">{t("schedule.minutesShort", { count: a.duration_min })}</p>
                    </div>
                    <div className={`w-1.5 h-14 rounded-full ${st.color}`} />
                    <Avatar className="w-10 h-10 border-2 border-background shadow">
                      <AvatarFallback className={`${st.bg} ${st.text} font-semibold text-sm`}>
                        {initials(...a.patient_name.split(" ") as [string, string])}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">{a.patient_name}</p>
                      <p className="text-sm text-muted-foreground truncate">{a.reason}</p>
                    </div>
                    {a.check_in_at && (
                      <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
                        <UserCheck className="w-3.5 h-3.5" />{fmtTime(a.check_in_at)}
                      </span>
                    )}
                    {allergyIds.has(a.patient_id) && (
                      <Badge variant="destructive" className="hidden sm:flex text-xs"><AlertCircle className="w-3 h-3 mr-1" />{t("schedule.allergies")}</Badge>
                    )}
                    <Badge className={`${st.bg} ${st.text} border-0 whitespace-nowrap`}>{t(`status.${a.status}` as TKey)}</Badge>
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
