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
  ChevronRight, MapPin, User, Shield, Pill, AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  getCurrentPatient, getAppointmentsByPatient, getReportsByPatient,
  getPatientClinical, getDoctors,
} from "@/lib/queries"
import { patientName, doctorName, initials, insuranceLabel } from "@/lib/display"

export const dynamic = "force-dynamic"

export default async function PatientDashboard() {
  const patient = await getCurrentPatient()
  if (!patient) return <div className="p-8 text-muted-foreground">No patient account found.</div>

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
  const recentReports = reports.slice(0, 3)

  const formatDateTime = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)
    let day = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    if (d.toDateString() === today.toDateString()) day = "Today"
    else if (d.toDateString() === tomorrow.toDateString()) day = "Tomorrow"
    return { day, time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) }
  }
  const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString()

  return (
    <div className="min-h-screen bg-background">
      <section className="bg-gradient-to-br from-primary/5 via-primary/10 to-transparent border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-background shadow-xl">
                <AvatarFallback className="bg-primary text-primary-foreground text-xl sm:text-2xl font-bold">
                  {initials(patient.first_name, patient.last_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Hello, {patient.first_name}</h1>
                <p className="text-muted-foreground mt-1">Welcome back to your health portal</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="secondary" className="text-xs">
                    <Shield className="w-3 h-3 mr-1" />
                    {insuranceLabel(patient.insurance_type)}
                  </Badge>
                </div>
              </div>
            </div>
            <Link href="/patient/appointments/new">
              <Button size="lg" className="gap-2 shadow-lg w-full sm:w-auto">
                <CalendarPlus className="w-5 h-5" />
                Book Appointment
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Upcoming" value={upcoming.length} sub="appointments" icon={<Calendar className="w-6 h-6 text-primary" />} highlight />
          <StatCard label="Records" value={reports.length} sub="health reports" icon={<FileText className="w-6 h-6 text-muted-foreground" />} />
          <StatCard label="Medications" value={clinical.medications.length} sub="active prescriptions" icon={<Pill className="w-6 h-6 text-muted-foreground" />} />
          <StatCard label="Allergies" value={clinical.allergies.length} sub="on record" icon={<AlertCircle className="w-6 h-6 text-muted-foreground" />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Upcoming Appointments */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" />Upcoming Appointments</CardTitle>
                    <CardDescription>Your scheduled visits</CardDescription>
                  </div>
                  <Link href="/patient/appointments"><Button variant="ghost" size="sm" className="gap-1">View all <ArrowRight className="w-4 h-4" /></Button></Link>
                </div>
              </CardHeader>
              <CardContent>
                {upcoming.length > 0 ? (
                  <div className="space-y-4">
                    {upcoming.slice(0, 3).map((appointment) => {
                      const { day, time } = formatDateTime(appointment.starts_at)
                      const canCheckIn = isToday(appointment.starts_at)
                      const docName = doctorNames.get(appointment.doctor_id) ?? "Doctor"
                      return (
                        <div key={appointment.id} className={`group p-4 sm:p-5 rounded-xl border transition-all hover:shadow-lg ${canCheckIn ? "border-primary/30 bg-gradient-to-r from-primary/5 to-transparent" : "border-border hover:border-primary/20"}`}>
                          <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                            <div className="flex items-start gap-4 flex-1">
                              <Avatar className="w-12 h-12 sm:w-14 sm:h-14 border-2 border-background shadow-lg">
                                <AvatarFallback className="bg-primary/10 text-primary font-semibold">{docName.replace("Dr. ", "").split(" ").map((n) => n[0]).join("").slice(0, 2)}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-foreground text-lg">{docName}</h3>
                                <p className="text-muted-foreground">{appointment.reason}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-3">
                                  <Badge variant="outline" className="gap-1.5"><Calendar className="w-3 h-3" />{day}</Badge>
                                  <Badge variant="outline" className="gap-1.5"><Clock className="w-3 h-3" />{time}</Badge>
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-col gap-2">
                              {canCheckIn ? (
                                <Link href="/checkin">
                                  <Button className="w-full sm:w-auto gap-2 shadow-md"><Smartphone className="w-4 h-4" />Self Check-in</Button>
                                </Link>
                              ) : (
                                <Button variant="outline" className="w-full sm:w-auto gap-2" disabled><Clock className="w-4 h-4" />Upcoming</Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center"><Calendar className="w-8 h-8 text-muted-foreground" /></div>
                    <p className="font-medium text-foreground">No upcoming appointments</p>
                    <Link href="/patient/appointments/new"><Button className="mt-4 gap-2"><CalendarPlus className="w-4 h-4" />Book Appointment</Button></Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {clinical.allergies.length > 0 && (
              <Card className="border-amber-200/50 bg-amber-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg"><AlertCircle className="w-5 h-5 text-amber-600" />Health Reminders</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3 rounded-xl bg-amber-100/50 border border-amber-200">
                    <p className="text-sm font-medium text-amber-800">Known Allergies</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {clinical.allergies.map((a, i) => <Badge key={i} variant="destructive" className="text-xs">{a.substance}</Badge>)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Recent Records & Quick Actions */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg"><FileText className="w-5 h-5 text-primary" />Health Records</CardTitle>
                    <CardDescription>Latest medical reports</CardDescription>
                  </div>
                  <Link href="/patient/records"><Button variant="ghost" size="sm" className="gap-1">All <ArrowRight className="w-4 h-4" /></Button></Link>
                </div>
              </CardHeader>
              <CardContent>
                {recentReports.length > 0 ? (
                  <div className="space-y-3">
                    {recentReports.map((report) => (
                      <Link key={report.id} href={`/patient/records/${report.id}`} className="block">
                        <div className="group p-4 rounded-xl border border-border hover:border-primary/30 hover:shadow-md transition-all">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                              <h4 className="font-medium text-foreground mt-1 truncate">{report.diagnosis ?? "Medical Report"}</h4>
                            </div>
                            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8"><FileText className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-30" /><p className="text-sm text-muted-foreground">No health records yet</p></div>
                )}
              </CardContent>
            </Card>

            {clinical.medications.length > 0 && (
              <Card>
                <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Pill className="w-5 h-5 text-primary" />Current Medications</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {clinical.medications.map((med, i) => (
                      <div key={i} className="p-3 rounded-xl border border-border">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground">{med.name}</p>
                            <p className="text-sm text-muted-foreground">{med.dosage} • {med.frequency}</p>
                          </div>
                          <Badge variant="outline" className="text-xs">Active</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-lg">Quick Actions</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <QuickLink href="/patient/appointments/new" icon={<CalendarPlus className="w-4 h-4 text-primary" />} label="Book New Appointment" />
                <QuickLink href="/patient/records" icon={<FileText className="w-4 h-4 text-primary" />} label="View All Records" />
                <QuickLink href="/patient/profile" icon={<User className="w-4 h-4 text-primary" />} label="Update Profile" />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, sub, icon, highlight }: { label: string; value: number; sub: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/20 bg-primary/5" : ""}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-xs font-medium uppercase tracking-wide ${highlight ? "text-primary" : "text-muted-foreground"}`}>{label}</p>
            <p className="text-2xl sm:text-3xl font-bold text-foreground mt-1">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{sub}</p>
          </div>
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center ${highlight ? "bg-primary/10" : "bg-muted"}`}>{icon}</div>
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
