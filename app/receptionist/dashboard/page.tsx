/**
 * Receptionist — Dashboard.
 *
 * Server Component: loads today's appointments (with names), the doctor roster
 * and allergy flags, derives the day's statistics, and renders the overview.
 * The searchable schedule list with inline check-in is delegated to a client
 * island.
 */
import Link from "next/link"
import {
  Calendar, Clock, Users, UserPlus, AlertCircle, CheckCircle2, Plus, Stethoscope,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { getAppointments, getDoctors, getPatientIdsWithAllergies } from "@/lib/queries"
import { doctorName, initials } from "@/lib/display"
import { getT } from "@/lib/i18n/server"
import { INTL_LOCALE } from "@/lib/i18n/config"
import { DashboardSchedule, type TodayAppointment } from "./dashboard-client"

export const dynamic = "force-dynamic"

export default async function ReceptionistDashboard() {
  const { t, locale } = await getT()
  const [appointments, doctors, allergyIds] = await Promise.all([
    getAppointments(),
    getDoctors(),
    getPatientIdsWithAllergies(),
  ])

  const todayStr = new Date().toDateString()
  const today: TodayAppointment[] = appointments
    .filter((a) => new Date(a.starts_at).toDateString() === todayStr)
    .map((a) => ({
      id: a.id, patientName: a.patient_name, doctorId: a.doctor_id, doctorName: a.doctor_name,
      startsAt: a.starts_at, checkInAt: a.check_in_at, status: a.status, reason: a.reason,
      durationMin: a.duration_min, hasAllergy: allergyIds.has(a.patient_id),
    }))

  const stats = {
    total: today.length,
    waiting: today.filter((a) => a.status === "waiting").length,
    completed: today.filter((a) => a.status === "completed").length,
    upcoming: today.filter((a) => a.status === "scheduled").length,
    noShow: today.filter((a) => a.status === "no_show").length,
  }
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit" })

  const greetHour = new Date().getHours()
  const greeting = greetHour < 12 ? t("reception.greetingMorning") : greetHour < 18 ? t("reception.greetingAfternoon") : t("reception.greetingEvening")

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <div className="pointer-events-none absolute -top-28 -right-16 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/4 w-80 h-80 rounded-full bg-info/10 blur-3xl" />
        <div className="relative px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 animate-fade-up">
            <div>
              <p className="text-sm font-medium text-primary">{greeting},</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">{t("reception.receptionDesk")}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5">
                <Badge variant="secondary" className="text-xs gap-1"><Calendar className="w-3 h-3" />{new Date().toLocaleDateString(INTL_LOCALE[locale], { weekday: "long", month: "long", day: "numeric" })}</Badge>
                <span className="text-sm text-muted-foreground">{stats.total === 1 ? t("reception.appointmentToday", { count: stats.total }) : t("reception.appointmentsToday", { count: stats.total })}</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <Link href="/receptionist/patients"><Button size="lg" variant="outline" className="gap-2 w-full sm:w-auto bg-card/60 backdrop-blur"><UserPlus className="w-5 h-5" />{t("reception.newPatient")}</Button></Link>
              <Link href="/receptionist/schedule"><Button size="lg" className="gap-2 shadow-lg shadow-primary/20 w-full sm:w-auto"><Plus className="w-5 h-5" />{t("reception.bookAppointment")}</Button></Link>
            </div>
          </div>
        </div>
      </section>

      <div className="px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="relative overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t("reception.totalToday")}</p><p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{stats.total}</p></div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center"><Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /></div>
            </div>
            <div className="mt-3 flex items-center gap-2"><Progress value={completionRate} className="h-1.5 flex-1" /><span className="text-xs text-muted-foreground">{completionRate}%</span></div>
          </CardContent>
        </Card>
        <DashStat label={t("reception.waiting")} value={stats.waiting} sub={t("reception.inWaitingRoom")} border="border-amber-200 bg-amber-50/30" text="text-amber-700" icon={<Clock className="w-6 h-6 text-amber-600" />} iconBg="from-amber-200/60 to-amber-100/30" />
        <DashStat label={t("reception.completed")} value={stats.completed} sub={t("reception.visitsCompleted")} border="border-emerald-200 bg-emerald-50/30" text="text-emerald-700" icon={<CheckCircle2 className="w-6 h-6 text-emerald-600" />} iconBg="from-emerald-200/60 to-emerald-100/30" />
        <DashStat label={t("reception.upcoming")} value={stats.upcoming} sub={t("reception.yetToArrive")} border="border-blue-200 bg-blue-50/30" text="text-blue-700" icon={<Users className="w-6 h-6 text-blue-600" />} iconBg="from-blue-200/60 to-blue-100/30" />
        <DashStat label={t("reception.noShows")} value={stats.noShow} sub={t("reception.missedAppointments")} border="border-red-200 bg-red-50/30" text="text-red-700" icon={<AlertCircle className="w-6 h-6 text-red-600" />} iconBg="from-red-200/60 to-red-100/30" />
      </div>

      <div className="grid grid-cols-1 min-w-0 lg:grid-cols-3 gap-6">
        {/* Searchable schedule (client island) */}
        <div className="lg:col-span-2">
          <DashboardSchedule appointments={today} />
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <Card className="border-amber-200/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg"><div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />{t("reception.waitingRoom")}</CardTitle>
                <Link href="/receptionist/waiting"><Button variant="ghost" size="sm">{t("reception.manage")}</Button></Link>
              </div>
              <CardDescription>{t("reception.patientsWaiting", { count: stats.waiting })}</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.waiting > 0 ? (
                <div className="space-y-3">
                  {today.filter((a) => a.status === "waiting").map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50/50">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9"><AvatarFallback className="bg-amber-100 text-amber-800 text-xs font-medium">{initials(...a.patientName.split(" ") as [string, string])}</AvatarFallback></Avatar>
                        <div><p className="text-sm font-medium text-foreground">{a.patientName}</p><p className="text-xs text-muted-foreground">{t("reception.since", { time: formatTime(a.checkInAt ?? a.startsAt) })}</p></div>
                      </div>
                      <Link href="/receptionist/waiting"><Button variant="outline" size="sm" className="h-8">{t("reception.call")}</Button></Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground"><Clock className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">{t("reception.noPatientsWaiting")}</p></div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Stethoscope className="w-5 h-5 text-primary" />{t("reception.doctorStatus")}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {doctors.slice(0, 3).map((d) => {
                const docAppointments = today.filter((a) => a.doctorId === d.id)
                const busy = docAppointments.some((a) => a.status === "in_progress")
                const waitingCount = docAppointments.filter((a) => a.status === "waiting").length
                return (
                  <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
                    <Avatar className="w-10 h-10"><AvatarFallback className="bg-primary/10 text-primary font-medium text-sm">{initials(d.first_name, d.last_name)}</AvatarFallback></Avatar>
                    <div className="flex-1 min-w-0"><p className="font-medium text-foreground text-sm truncate">{doctorName(d)}</p><p className="text-xs text-muted-foreground truncate">{d.specialization}</p></div>
                    <div className="text-right">
                      {busy ? <Badge className="bg-blue-50 text-blue-700 border-0 text-xs">{t("reception.busy")}</Badge> : <Badge className="bg-emerald-50 text-emerald-700 border-0 text-xs">{t("reception.available")}</Badge>}
                      {waitingCount > 0 && <p className="text-xs text-muted-foreground mt-1">{t("reception.nWaiting", { count: waitingCount })}</p>}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>
      </div>
    </div>
  )
}

function DashStat({ label, value, sub, border, text, icon, iconBg }: { label: string; value: number; sub: string; border: string; text: string; icon: React.ReactNode; iconBg: string }) {
  return (
    <Card className={border}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0"><p className={`text-xs font-medium uppercase tracking-wide ${text}`}>{label}</p><p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{value}</p></div>
          <div className={`w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-gradient-to-br ${iconBg} flex items-center justify-center`}>{icon}</div>
        </div>
        <p className={`text-xs mt-3 ${text}`}>{sub}</p>
      </CardContent>
    </Card>
  )
}
