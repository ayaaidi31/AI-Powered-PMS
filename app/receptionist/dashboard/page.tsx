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
import { DashboardSchedule, type TodayAppointment } from "./dashboard-client"

export const dynamic = "force-dynamic"

export default async function ReceptionistDashboard() {
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
  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Reception Dashboard</h1>
          <p className="text-muted-foreground mt-1">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/receptionist/patients"><Button variant="outline" className="gap-2"><UserPlus className="w-4 h-4" />New Patient</Button></Link>
          <Link href="/receptionist/schedule"><Button className="gap-2 shadow-lg"><Plus className="w-4 h-4" />Book Appointment</Button></Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="relative overflow-hidden">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0"><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total Today</p><p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{stats.total}</p></div>
              <div className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center"><Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-primary" /></div>
            </div>
            <div className="mt-3 flex items-center gap-2"><Progress value={completionRate} className="h-1.5 flex-1" /><span className="text-xs text-muted-foreground">{completionRate}%</span></div>
          </CardContent>
        </Card>
        <DashStat label="Waiting" value={stats.waiting} sub="In waiting room" border="border-amber-200 bg-amber-50/30" text="text-amber-700" icon={<Clock className="w-6 h-6 text-amber-600" />} iconBg="bg-amber-100" />
        <DashStat label="Completed" value={stats.completed} sub="Visits completed" border="border-emerald-200 bg-emerald-50/30" text="text-emerald-700" icon={<CheckCircle2 className="w-6 h-6 text-emerald-600" />} iconBg="bg-emerald-100" />
        <DashStat label="Upcoming" value={stats.upcoming} sub="Yet to arrive" border="border-blue-200 bg-blue-50/30" text="text-blue-700" icon={<Users className="w-6 h-6 text-blue-600" />} iconBg="bg-blue-100" />
        <DashStat label="No Shows" value={stats.noShow} sub="Missed appointments" border="border-red-200 bg-red-50/30" text="text-red-700" icon={<AlertCircle className="w-6 h-6 text-red-600" />} iconBg="bg-red-100" />
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
                <CardTitle className="flex items-center gap-2 text-lg"><div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />Waiting Room</CardTitle>
                <Link href="/receptionist/waiting"><Button variant="ghost" size="sm">Manage</Button></Link>
              </div>
              <CardDescription>{stats.waiting} patients waiting</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.waiting > 0 ? (
                <div className="space-y-3">
                  {today.filter((a) => a.status === "waiting").map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50/50">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9"><AvatarFallback className="bg-amber-100 text-amber-800 text-xs font-medium">{initials(...a.patientName.split(" ") as [string, string])}</AvatarFallback></Avatar>
                        <div><p className="text-sm font-medium text-foreground">{a.patientName}</p><p className="text-xs text-muted-foreground">Since {formatTime(a.checkInAt ?? a.startsAt)}</p></div>
                      </div>
                      <Link href="/receptionist/waiting"><Button variant="outline" size="sm" className="h-8">Call</Button></Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground"><Clock className="w-10 h-10 mx-auto mb-2 opacity-30" /><p className="text-sm">No patients waiting</p></div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Stethoscope className="w-5 h-5 text-primary" />Doctor Status</CardTitle></CardHeader>
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
                      {busy ? <Badge className="bg-blue-50 text-blue-700 border-0 text-xs">Busy</Badge> : <Badge className="bg-emerald-50 text-emerald-700 border-0 text-xs">Available</Badge>}
                      {waitingCount > 0 && <p className="text-xs text-muted-foreground mt-1">{waitingCount} waiting</p>}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
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
          <div className={`w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl ${iconBg} flex items-center justify-center`}>{icon}</div>
        </div>
        <p className={`text-xs mt-3 ${text}`}>{sub}</p>
      </CardContent>
    </Card>
  )
}
