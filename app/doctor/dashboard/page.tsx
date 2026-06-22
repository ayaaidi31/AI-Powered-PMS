/**
 * Doctor — Dashboard.
 *
 * Server Component: loads the doctor's appointments for today and the set of
 * patients with allergies, derives the day's statistics, and renders the
 * overview. All actions are navigation links into the workspace/schedule.
 */
import Link from "next/link"
import {
  Calendar, Clock, Users, FileText, ArrowRight, AlertCircle, CheckCircle2,
  Play, UserCheck, Activity, Stethoscope, ChevronRight, Target,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { getCurrentDoctor, getAppointmentsByDoctor, getPatientIdsWithAllergies } from "@/lib/queries"
import { initials, statusLabel, type AppointmentStatusDb } from "@/lib/display"

export const dynamic = "force-dynamic"

const STATUS_STYLE: Record<string, { color: string; text: string; bg: string }> = {
  waiting: { color: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" },
  in_progress: { color: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-50" },
  completed: { color: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  scheduled: { color: "bg-slate-400", text: "text-slate-600", bg: "bg-slate-50" },
  no_show: { color: "bg-red-500", text: "text-red-700", bg: "bg-red-50" },
}
const styleFor = (s: string) => STATUS_STYLE[s] ?? STATUS_STYLE.scheduled

export default async function DoctorDashboard() {
  const doctor = await getCurrentDoctor()
  if (!doctor) return <div className="p-8 text-muted-foreground">No doctor account found.</div>

  const [allAppointments, allergyIds] = await Promise.all([
    getAppointmentsByDoctor(doctor.id),
    getPatientIdsWithAllergies(),
  ])

  const todayStr = new Date().toDateString()
  const today = allAppointments
    .filter((a) => new Date(a.starts_at).toDateString() === todayStr)
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))

  const stats = {
    total: today.length,
    completed: today.filter((a) => a.status === "completed").length,
    waiting: today.filter((a) => a.status === "waiting").length,
    inProgress: today.filter((a) => a.status === "in_progress").length,
    upcoming: today.filter((a) => a.status === "scheduled").length,
  }
  const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
  const current = today.find((a) => a.status === "in_progress") ?? today.find((a) => a.status === "waiting")

  const formatTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Good day, Dr. {doctor.last_name}</h1>
          <p className="text-muted-foreground mt-1">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
        </div>
        <Link href="/doctor/workspace"><Button className="gap-2 shadow-lg"><Play className="w-4 h-4" />Start Consultations</Button></Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground">Today&apos;s Patients</p>
                <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{stats.total}</p>
                <p className="text-xs text-muted-foreground mt-1">{stats.completed} completed</p>
              </div>
              <div className="w-11 h-11 sm:w-14 sm:h-14 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center"><Users className="w-6 h-6 sm:w-7 sm:h-7 text-primary" /></div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/20"><div className="h-full bg-primary transition-all" style={{ width: `${completionRate}%` }} /></div>
          </CardContent>
        </Card>
        <MiniStat label="Waiting" value={stats.waiting} sub="patients in queue" border="border-amber-200 bg-amber-50/30" text="text-amber-700" icon={<Clock className="w-7 h-7 text-amber-600" />} iconBg="bg-amber-100" />
        <MiniStat label="In Progress" value={stats.inProgress} sub="active consultation" border="border-blue-200 bg-blue-50/30" text="text-blue-700" icon={<Activity className="w-7 h-7 text-blue-600" />} iconBg="bg-blue-100" />
        <MiniStat label="Completed" value={stats.completed} sub={`${completionRate}% completion`} border="border-emerald-200 bg-emerald-50/30" text="text-emerald-700" icon={<CheckCircle2 className="w-7 h-7 text-emerald-600" />} iconBg="bg-emerald-100" />
      </div>

      <div className="grid grid-cols-1 min-w-0 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {current && (
            <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    {current.status === "in_progress" ? "Current Patient" : "Next Patient"}
                  </CardTitle>
                  <Badge className={`${styleFor(current.status).bg} ${styleFor(current.status).text} border-0`}>{statusLabel(current.status as AppointmentStatusDb)}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                  <Avatar className="w-20 h-20 border-4 border-background shadow-lg">
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-bold">{initials(...current.patient_name.split(" ") as [string, string])}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="text-xl font-bold text-foreground">{current.patient_name}</h3>
                      <p className="text-muted-foreground">{current.reason}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="w-4 h-4" /><span>Scheduled: {formatTime(current.starts_at)}</span></div>
                      {current.check_in_at && <div className="flex items-center gap-1.5 text-muted-foreground"><UserCheck className="w-4 h-4" /><span>Checked in: {formatTime(current.check_in_at)}</span></div>}
                    </div>
                    {allergyIds.has(current.patient_id) && <Badge variant="destructive" className="text-xs"><AlertCircle className="w-3 h-3 mr-1" />Has allergies</Badge>}
                  </div>
                  <Link href="/doctor/workspace"><Button className="gap-2"><Stethoscope className="w-4 h-4" />Start Consult</Button></Link>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" />Today&apos;s Schedule</CardTitle>
                <CardDescription>{stats.upcoming} upcoming appointments</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {today.length > 0 ? (
                <div className="space-y-3">
                  {today.map((a) => {
                    const st = styleFor(a.status)
                    return (
                      <div key={a.id} className={`group flex items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-md ${a.status === "in_progress" ? "border-blue-200 bg-blue-50/50" : a.status === "waiting" ? "border-amber-200 bg-amber-50/50" : "border-border hover:border-primary/30"}`}>
                        <div className="text-center min-w-[70px]"><p className="font-bold text-foreground">{formatTime(a.starts_at)}</p><p className="text-xs text-muted-foreground">{a.duration_min} min</p></div>
                        <div className={`w-1.5 h-14 rounded-full ${st.color}`} />
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="w-10 h-10 border-2 border-background shadow"><AvatarFallback className={`${st.bg} ${st.text} font-semibold text-sm`}>{initials(...a.patient_name.split(" ") as [string, string])}</AvatarFallback></Avatar>
                          <div className="min-w-0 flex-1"><p className="font-semibold text-foreground truncate">{a.patient_name}</p><p className="text-sm text-muted-foreground truncate">{a.reason}</p></div>
                        </div>
                        {allergyIds.has(a.patient_id) && <Badge variant="destructive" className="hidden md:flex text-xs"><AlertCircle className="w-3 h-3 mr-1" />Allergies</Badge>}
                        <Badge className={`${st.bg} ${st.text} border-0 whitespace-nowrap`}>{statusLabel(a.status as AppointmentStatusDb)}</Badge>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground"><Calendar className="w-16 h-16 mx-auto mb-4 opacity-30" /><p className="font-medium">No appointments scheduled for today</p></div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-lg flex items-center gap-2"><Target className="w-5 h-5 text-primary" />Today&apos;s Progress</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2"><span className="text-sm text-muted-foreground">Consultations</span><span className="text-sm font-semibold">{stats.completed}/{stats.total}</span></div>
                <Progress value={completionRate} className="h-2" />
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="text-center p-3 rounded-xl bg-muted/50"><p className="text-2xl font-bold text-foreground">{stats.upcoming}</p><p className="text-xs text-muted-foreground">Remaining</p></div>
                <div className="text-center p-3 rounded-xl bg-muted/50"><p className="text-2xl font-bold text-foreground">~{stats.upcoming * 30}</p><p className="text-xs text-muted-foreground">Minutes Left</p></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-lg">Quick Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Link href="/doctor/workspace"><Button variant="outline" className="w-full justify-start gap-3 h-12"><div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><Stethoscope className="w-4 h-4 text-primary" /></div>Open Workspace</Button></Link>
              <Link href="/doctor/reports"><Button variant="outline" className="w-full justify-start gap-3 h-12"><div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><FileText className="w-4 h-4 text-primary" /></div>Medical Reports</Button></Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function MiniStat({ label, value, sub, border, text, icon, iconBg }: { label: string; value: number; sub: string; border: string; text: string; icon: React.ReactNode; iconBg: string }) {
  return (
    <Card className={`relative overflow-hidden ${border}`}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-sm font-medium ${text}`}>{label}</p>
            <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <div className={`w-11 h-11 sm:w-14 sm:h-14 shrink-0 rounded-2xl ${iconBg} flex items-center justify-center`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}
