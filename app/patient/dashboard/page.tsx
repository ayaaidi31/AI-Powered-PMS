/**
 * Patient — Dashboard.
 *
 * Server Component: loads the current patient, their upcoming appointments,
 * recent reports and clinical alerts from the database, then renders the
 * overview (all interactions are navigation links).
 */
import Link from "next/link"
import {
  Calendar, FileText, Clock, ArrowRight, Smartphone, CalendarPlus,
  ChevronRight, MapPin, User, Shield, Pill, AlertCircle, Sparkles, type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  getCurrentPatient, getAppointmentsByPatient, getReportsByPatient,
  getPatientClinical, getDoctors,
} from "@/lib/queries"
import { patientName, doctorName, initials, insuranceLabel } from "@/lib/display"
import { getT } from "@/lib/i18n/server"
import { INTL_LOCALE } from "@/lib/i18n/config"

export const dynamic = "force-dynamic"

export default async function PatientDashboard() {
  const { t, locale } = await getT()
  const patient = await getCurrentPatient()
  if (!patient) return <div className="p-8 text-muted-foreground">{t("patient.noPatientAccount")}</div>

  const [appointments, reports, clinical, doctors] = await Promise.all([
    getAppointmentsByPatient(patient.id),
    getReportsByPatient(patient.id),
    getPatientClinical(patient.id),
    getDoctors(),
  ])
  const doctorNames = new Map(doctors.map((d) => [d.id, doctorName(d)]))

  const now = new Date()
  const upcoming = appointments
    .filter((a) => a.status === "scheduled" && new Date(a.starts_at) >= new Date(now.toDateString()))
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at))
  const recentReports = reports.slice(0, 6)

  const formatDateTime = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    let day = d.toLocaleDateString(INTL_LOCALE[locale], { weekday: "long", month: "short", day: "numeric" })
    if (d.toDateString() === today.toDateString()) day = t("patient.today")
    else if (d.toDateString() === tomorrow.toDateString()) day = t("patient.tomorrow")
    return { day, time: d.toLocaleTimeString(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit" }) }
  }
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()

  const hour = now.getHours()
  const greeting = hour < 12 ? t("patient.greetingMorning") : hour < 18 ? t("patient.greetingAfternoon") : t("patient.greetingEvening")
  const nextAppt = upcoming[0] ?? null
  const restUpcoming = upcoming.slice(1)
  const countdownLabel = (iso: string) => {
    if (isToday(iso)) return t("patient.today")
    const days = Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000)
    return days === 1 ? t("patient.tomorrow") : t("patient.inDays", { count: days })
  }
  const docInitials = (id: string) =>
    (doctorNames.get(id) ?? "Dr").replace("Dr. ", "").split(" ").map((n) => n[0]).join("").slice(0, 2)

  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <div className="pointer-events-none absolute -top-28 -right-16 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/4 w-80 h-80 rounded-full bg-info/10 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 animate-fade-up">
            <div className="flex items-center gap-4 sm:gap-5">
              <Avatar className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-background shadow-xl ring-2 ring-primary/20">
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-xl sm:text-2xl font-bold">
                  {initials(patient.first_name, patient.last_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-primary">{greeting},</p>
                <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">{patient.first_name} {patient.last_name}</h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5">
                  <Badge variant="secondary" className="text-xs gap-1"><Shield className="w-3 h-3" />{insuranceLabel(patient.insurance_type)}</Badge>
                  {upcoming.length > 0 && (
                    <span className="text-sm text-muted-foreground">
                      {upcoming.length === 1 ? t("patient.upcomingCountOne", { count: upcoming.length }) : t("patient.upcomingCountOther", { count: upcoming.length })}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <Link href="/patient/appointments/new">
                <Button size="lg" className="gap-2 shadow-lg shadow-primary/20 w-full sm:w-auto"><CalendarPlus className="w-5 h-5" />{t("patient.bookAppointment")}</Button>
              </Link>
              <Link href="/patient/book-voice">
                <Button size="lg" variant="outline" className="gap-2 w-full sm:w-auto bg-card/60 backdrop-blur"><Sparkles className="w-5 h-5" />{t("patient.bookByVoice")}</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        {/* Next appointment — the single most useful thing, up front */}
        {nextAppt ? (
          <Card className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent hover-lift animate-fade-up">
            <div className="pointer-events-none absolute -top-10 -right-10 w-44 h-44 rounded-full bg-primary/10 blur-2xl" />
            <CardContent className="relative p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 text-primary text-xs font-semibold px-3 py-1"><Calendar className="w-3.5 h-3.5" />{t("patient.nextAppointment")}</span>
                <span className="text-xs font-semibold text-primary">{countdownLabel(nextAppt.starts_at)}</span>
              </div>
              <div className="flex flex-col md:flex-row md:items-center gap-5">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <Avatar className="w-14 h-14 border-2 border-background shadow-md">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">{docInitials(nextAppt.doctor_id)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold text-foreground truncate">{doctorNames.get(nextAppt.doctor_id) ?? t("patient.doctorFallback")}</h3>
                    {nextAppt.reason && <p className="text-muted-foreground truncate">{nextAppt.reason}</p>}
                    <div className="flex flex-wrap items-center gap-2 mt-2.5">
                      <Badge variant="outline" className="gap-1.5"><Calendar className="w-3 h-3" />{formatDateTime(nextAppt.starts_at).day}</Badge>
                      <Badge variant="outline" className="gap-1.5"><Clock className="w-3 h-3" />{formatDateTime(nextAppt.starts_at).time}</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex flex-row md:flex-col gap-2 md:w-44 shrink-0">
                  {isToday(nextAppt.starts_at) ? (
                    <Link href="/checkin" className="flex-1"><Button className="w-full gap-2 shadow-md"><Smartphone className="w-4 h-4" />{t("patient.checkIn")}</Button></Link>
                  ) : (
                    <Link href={`/patient/appointments/new?reschedule=${nextAppt.id}`} className="flex-1"><Button variant="outline" className="w-full gap-2"><Calendar className="w-4 h-4" />{t("patient.reschedule")}</Button></Link>
                  )}
                  <Link href="/patient/appointments" className="flex-1"><Button variant="ghost" className="w-full gap-1">{t("patient.details")}<ChevronRight className="w-4 h-4" /></Button></Link>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed animate-fade-up">
            <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center"><Calendar className="w-6 h-6 text-primary" /></div>
                <div>
                  <p className="font-semibold text-foreground">{t("patient.noUpcomingTitle")}</p>
                  <p className="text-sm text-muted-foreground">{t("patient.noUpcomingDesc")}</p>
                </div>
              </div>
              <Link href="/patient/appointments/new"><Button className="gap-2"><CalendarPlus className="w-4 h-4" />{t("patient.bookAppointment")}</Button></Link>
            </CardContent>
          </Card>
        )}

        {/* Quick stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label={t("patient.statUpcoming")} value={upcoming.length} sub={t("patient.statUpcomingSub")} Icon={Calendar} tone="primary" highlight className="animate-fade-up" />
          <StatCard label={t("patient.statRecords")} value={reports.length} sub={t("patient.statRecordsSub")} Icon={FileText} tone="info" className="animate-fade-up stagger-1" />
          <StatCard label={t("patient.statMedications")} value={clinical.medications.length} sub={t("patient.statMedicationsSub")} Icon={Pill} tone="success" className="animate-fade-up stagger-2" />
          <StatCard label={t("patient.statAllergies")} value={clinical.allergies.length} sub={t("patient.statAllergiesSub")} Icon={AlertCircle} tone="warning" className="animate-fade-up stagger-3" />
        </div>

        {/* Organized two-column: main content + sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-start">
          {/* Main — upcoming appointments + reminders */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg"><Calendar className="w-5 h-5 text-primary" />{t("patient.upcomingAppointmentsTitle")}</CardTitle>
                    <CardDescription>{t("patient.upcomingAppointmentsDesc")}</CardDescription>
                  </div>
                  <Link href="/patient/appointments"><Button variant="ghost" size="sm" className="gap-1">{t("patient.viewAll")} <ArrowRight className="w-4 h-4" /></Button></Link>
                </div>
              </CardHeader>
              <CardContent>
                {restUpcoming.length > 0 ? (
                  <div className="space-y-4">
                    {restUpcoming.slice(0, 4).map((appointment) => {
                      const { day, time } = formatDateTime(appointment.starts_at)
                      const canCheckIn = isToday(appointment.starts_at)
                      const docName = doctorNames.get(appointment.doctor_id) ?? t("patient.doctorFallback")
                      return (
                        <div key={appointment.id} className={`group p-4 sm:p-5 rounded-xl border transition-all hover:shadow-lg ${canCheckIn ? "border-primary/30 bg-gradient-to-r from-primary/5 to-transparent" : "border-border hover:border-primary/20"}`}>
                          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                            <div className="flex items-start gap-4 flex-1 min-w-0">
                              <Avatar className="w-12 h-12 sm:w-14 sm:h-14 border-2 border-background shadow-lg">
                                <AvatarFallback className="bg-primary/10 text-primary font-semibold">{docName.replace("Dr. ", "").split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-foreground text-lg truncate">{docName}</h3>
                                {appointment.reason && <p className="text-muted-foreground truncate">{appointment.reason}</p>}
                                <div className="flex flex-wrap items-center gap-2 mt-3">
                                  <Badge variant="outline" className="gap-1.5"><Calendar className="w-3 h-3" />{day}</Badge>
                                  <Badge variant="outline" className="gap-1.5"><Clock className="w-3 h-3" />{time}</Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                              {canCheckIn ? (
                                <Link href="/checkin"><Button className="w-full sm:w-auto gap-2 shadow-md"><Smartphone className="w-4 h-4" />{t("patient.selfCheckIn")}</Button></Link>
                              ) : (
                                <Button variant="outline" className="w-full sm:w-auto gap-2" disabled><Clock className="w-4 h-4" />{t("patient.upcomingBadge")}</Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-10">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-muted flex items-center justify-center"><Calendar className="w-7 h-7 text-muted-foreground" /></div>
                    <p className="font-medium text-foreground">{nextAppt ? t("patient.noOtherUpcoming") : t("patient.noUpcomingTitle")}</p>
                    <Link href="/patient/appointments/new"><Button className="mt-4 gap-2"><CalendarPlus className="w-4 h-4" />{t("patient.bookAppointment")}</Button></Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {clinical.allergies.length > 0 && (
              <Card className="border-warning/40 bg-warning/5">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg"><AlertCircle className="w-5 h-5 text-warning" />{t("patient.healthRemindersTitle")}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-3 rounded-xl bg-warning/10 border border-warning/30">
                    <p className="text-sm font-medium text-foreground">{t("patient.knownAllergies")}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {clinical.allergies.map((a, i) => <Badge key={i} variant="destructive" className="text-xs">{a.substance}</Badge>)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar — records, meds, actions */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg"><FileText className="w-5 h-5 text-primary" />{t("patient.healthRecordsTitle")}</CardTitle>
                    <CardDescription>{t("patient.healthRecordsDesc")}</CardDescription>
                  </div>
                  <Link href="/patient/records"><Button variant="ghost" size="sm" className="gap-1">{t("patient.all")} <ArrowRight className="w-4 h-4" /></Button></Link>
                </div>
              </CardHeader>
              <CardContent>
                {recentReports.length > 0 ? (
                  <div className="space-y-3">
                    {recentReports.slice(0, 5).map((report) => (
                      <Link key={report.id} href={`/patient/records/${report.id}`} className="block min-w-0">
                        <div className="group p-4 rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleDateString(INTL_LOCALE[locale], { month: "short", day: "numeric", year: "numeric" })}</p>
                              <h4 className="font-medium text-foreground mt-1 truncate">{report.diagnosis ?? t("patient.medicalReportFallback")}</h4>
                            </div>
                            <ChevronRight className="w-5 h-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8"><FileText className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-30" /><p className="text-sm text-muted-foreground">{t("patient.noHealthRecords")}</p></div>
                )}
              </CardContent>
            </Card>

            {clinical.medications.length > 0 && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Pill className="w-5 h-5 text-primary" />{t("patient.currentMedicationsTitle")}</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {clinical.medications.map((med, i) => (
                      <div key={i} className="p-3 rounded-xl border border-border">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">{med.name}</p>
                            <p className="text-sm text-muted-foreground">{med.dosage} • {med.frequency}</p>
                          </div>
                          <Badge variant="outline" className="text-xs">{t("patient.active")}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-lg">{t("patient.quickActionsTitle")}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <QuickLink href="/patient/appointments/new" icon={<CalendarPlus className="w-4 h-4 text-primary" />} label={t("patient.bookNewAppointment")} />
                <QuickLink href="/patient/records" icon={<FileText className="w-4 h-4 text-primary" />} label={t("patient.viewAllRecords")} />
                <QuickLink href="/patient/profile" icon={<User className="w-4 h-4 text-primary" />} label={t("patient.updateProfile")} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

const STAT_TONES = {
  primary: "from-primary/20 to-primary/5 text-primary",
  info: "from-info/20 to-info/5 text-info",
  success: "from-success/20 to-success/5 text-success",
  warning: "from-warning/25 to-warning/5 text-warning",
  muted: "from-muted to-muted text-muted-foreground",
} as const

function StatCard({ label, value, sub, Icon, tone = "muted", highlight, className }: {
  label: string; value: number; sub: string; Icon: LucideIcon
  tone?: keyof typeof STAT_TONES; highlight?: boolean; className?: string
}) {
  return (
    <Card className={cn("hover-lift", highlight && "border-primary/20 bg-gradient-to-br from-primary/8 to-transparent", className)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className={cn("text-xs font-medium uppercase tracking-wide", highlight ? "text-primary" : "text-muted-foreground")}>{label}</p>
            <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <div className={cn("w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br", STAT_TONES[tone])}>
            <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href}>
      <Button variant="outline" className="w-full justify-start gap-3 h-12">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">{icon}</div>
        {label}
      </Button>
    </Link>
  )
}
