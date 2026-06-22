"use client"

/**
 * Staff scheduling dashboard (Feature 18). The roster shows each doctor's
 * on-duty status and load. When a doctor is off duty, the receptionist opens an
 * inline "Schedule Recovery" view (not a modal): crisis overview + AI-proposed,
 * urgency-prioritized plan (reassign within the same specialty / cancel), with a
 * live execution summary. Reception verifies urgency + actions, then executes.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Stethoscope, UserCheck, UserX, Sparkles, ArrowRight, ArrowLeft, Ban, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { setDoctorAvailability } from "@/lib/actions/doctors"
import { proposeRecoveryPlan, executeRecoveryPlan, type RecoveryPlan } from "@/lib/actions/staffing"
import type { UrgencyLevel } from "@/lib/actions/ai"

const URGENCY: Record<UrgencyLevel, { label: string; cls: string }> = {
  high: { label: "High", cls: "text-red-600 dark:text-red-400" },
  medium: { label: "Medium", cls: "text-amber-600 dark:text-amber-400" },
  routine: { label: "Routine", cls: "text-emerald-600 dark:text-emerald-400" },
}
const CANCEL = "__cancel__"

export interface RosterDoctor {
  id: string
  name: string
  specialization: string | null
  isAvailable: boolean
  capacity: number
  todayCount: number
  upcomingCount: number
  unavailableFrom: string | null
  unavailableUntil: string | null
  affectedCount: number
}

const fmtDay = (s: string | null) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString("de-DE") : null)
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function StaffClient({ roster }: { roster: RosterDoctor[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [plan, setPlan] = useState<RecoveryPlan | null>(null)
  const [choices, setChoices] = useState<Record<string, string>>({}) // appointmentId -> doctorId | CANCEL
  const [urgencyChoices, setUrgencyChoices] = useState<Record<string, UrgencyLevel>>({})
  const [executing, setExecuting] = useState(false)
  // Inline "mark unavailable" date-range form (no modal).
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [markFrom, setMarkFrom] = useState("")
  const [markUntil, setMarkUntil] = useState("")

  function openMark(d: RosterDoctor) {
    setMarkFrom(d.unavailableFrom ?? todayISO())
    setMarkUntil(d.unavailableUntil ?? "")
    setMarkingId(d.id)
  }

  async function markUnavailable(d: RosterDoctor) {
    if (!markFrom) { toast.error("Pick a start date."); return }
    if (markUntil && markUntil < markFrom) { toast.error("End date can't be before start date."); return }
    setBusyId(d.id)
    const r = await setDoctorAvailability(d.id, false, { from: markFrom, until: markUntil || null })
    setBusyId(null)
    if (r.status === "ok") {
      toast.success(`${d.name} marked unavailable.`)
      setMarkingId(null)
      router.refresh()
    } else {
      toast.error(r.message)
    }
  }

  async function markAvailable(d: RosterDoctor) {
    setBusyId(d.id)
    const r = await setDoctorAvailability(d.id, true)
    setBusyId(null)
    if (r.status === "ok") {
      toast.success(`${d.name} marked available.`)
      router.refresh()
    } else {
      toast.error(r.message)
    }
  }

  async function generatePlan(d: RosterDoctor) {
    setBusyId(d.id)
    const r = await proposeRecoveryPlan(d.id)
    setBusyId(null)
    if (r.status !== "ok") { toast.error(r.message); return }
    setPlan(r.data)
    setChoices(Object.fromEntries(r.data.items.map((i) => [i.appointmentId, i.targetDoctorId ?? CANCEL])))
    setUrgencyChoices(Object.fromEntries(r.data.items.map((i) => [i.appointmentId, i.urgency])))
  }

  async function execute() {
    if (!plan) return
    setExecuting(true)
    const items = plan.items.map((i) => {
      const choice = choices[i.appointmentId]
      return choice === CANCEL || !choice
        ? { appointmentId: i.appointmentId, action: "cancel" as const, targetDoctorId: null }
        : { appointmentId: i.appointmentId, action: "reassign" as const, targetDoctorId: choice }
    })
    const r = await executeRecoveryPlan(items)
    setExecuting(false)
    if (r.status === "ok") {
      toast.success(`Plan executed: ${r.data.reassigned} reassigned, ${r.data.cancelled} cancelled${r.data.failed ? `, ${r.data.failed} failed` : ""}.`)
      setPlan(null)
      router.refresh()
    } else {
      toast.error(r.message)
    }
  }

  // ── Inline recovery view ──────────────────────────────────────────────────
  if (plan) {
    const reassignNow = Object.values(choices).filter((c) => c !== CANCEL).length
    const cancelNow = plan.items.length - reassignNow
    const sameSpecialtyFree = plan.candidates.filter((c) => c.sameSpecialty && c.remainingToday > 0)

    return (
      <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <button onClick={() => setPlan(null)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to staff
        </button>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" /> Schedule Recovery
            </h1>
            <p className="text-muted-foreground">
              {plan.doctorName} · {plan.doctorSpecialization ?? "General"} · absent{" "}
              {fmtDay(plan.windowFrom) ?? "today"}{plan.windowUntil ? ` – ${fmtDay(plan.windowUntil)}` : " – ongoing"}
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5 border-amber-300 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" /> Active recovery
          </Badge>
        </div>

        {/* Crisis overview */}
        <div className="grid grid-cols-1 min-w-0 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Impacted appointments</p>
              <p className="text-3xl font-bold text-foreground">{plan.items.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground mb-2">Available {plan.doctorSpecialization ?? ""} capacity</p>
              {sameSpecialtyFree.length === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-500">No same-specialty colleague available</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {sameSpecialtyFree.map((c) => (
                    <Badge key={c.id} variant="secondary" className="text-xs">{c.name} — {c.remainingToday} slots</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 min-w-0 lg:grid-cols-3 gap-6 items-start">
          {/* Plan table */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">AI Proposed Recovery Plan</CardTitle>
              <CardDescription>Urgency-prioritized; reassignment kept within the same specialty. Adjust any row.</CardDescription>
            </CardHeader>
            <CardContent>
              {plan.items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No upcoming appointments to recover.</p>
              ) : (
                <div className="space-y-2">
                  {plan.items.map((it) => {
                    const choice = choices[it.appointmentId] ?? CANCEL
                    const urg = urgencyChoices[it.appointmentId] ?? it.urgency
                    const noCover = it.action === "cancel"
                    return (
                      <div key={it.appointmentId} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{it.patientName}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(it.startsAt).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })} · {it.durationMin} min
                            {noCover && <span className="text-amber-600 dark:text-amber-500"> · no same-specialty cover</span>}
                          </p>
                        </div>
                        <Select value={urg} onValueChange={(v) => setUrgencyChoices((u) => ({ ...u, [it.appointmentId]: v as UrgencyLevel }))}>
                          <SelectTrigger className="w-full sm:w-28" title="Urgency (AI-triaged)">
                            <span className={URGENCY[urg].cls}>{URGENCY[urg].label}</span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high"><span className={URGENCY.high.cls}>High</span></SelectItem>
                            <SelectItem value="medium"><span className={URGENCY.medium.cls}>Medium</span></SelectItem>
                            <SelectItem value="routine"><span className={URGENCY.routine.cls}>Routine</span></SelectItem>
                          </SelectContent>
                        </Select>
                        <ArrowRight className="w-4 h-4 text-muted-foreground hidden sm:block shrink-0" />
                        <Select value={choice} onValueChange={(v) => setChoices((c) => ({ ...c, [it.appointmentId]: v }))}>
                          <SelectTrigger className="w-full sm:w-60">
                            <span className="truncate">
                              {choice === CANCEL
                                ? "Cancel appointment"
                                : `→ ${plan.candidates.find((c) => c.id === choice)?.name ?? "Reassign"}`}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {plan.candidates.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}{c.sameSpecialty ? "" : ` · ${c.specialization ?? "other"}`} — {c.remainingToday} slots
                              </SelectItem>
                            ))}
                            <SelectItem value={CANCEL}>
                              <span className="flex items-center gap-1.5 text-destructive"><Ban className="w-3.5 h-3.5" /> Cancel appointment</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Execution summary */}
          <Card className="lg:sticky lg:top-20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Plan Execution Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{reassignNow}</p>
                  <p className="text-xs text-muted-foreground">Reassigned</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{cancelNow}</p>
                  <p className="text-xs text-muted-foreground">Cancelled</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Reassignments stay within the doctor&apos;s specialty and re-check for time conflicts. The decision is yours.
              </p>
              <div className="space-y-2 pt-1">
                <Button className="w-full" onClick={execute} disabled={executing || plan.items.length === 0}>
                  {executing ? "Executing…" : "Approve & Execute Plan"}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setPlan(null)} disabled={executing}>
                  Discard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // ── Roster ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Staff Scheduling</h1>
        <p className="text-muted-foreground">Manage doctor availability and recover from sick leave</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {roster.map((d) => (
          <Card key={d.id} className={d.isAvailable ? "" : "border-amber-300 dark:border-amber-900"}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Stethoscope className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{d.name}</CardTitle>
                    <CardDescription className="truncate">{d.specialization ?? "—"}</CardDescription>
                  </div>
                </div>
                <Badge variant={d.isAvailable ? "secondary" : "outline"} className="gap-1.5 shrink-0">
                  <span className={`w-1.5 h-1.5 rounded-full ${d.isAvailable ? "bg-green-500" : "bg-amber-500"}`} />
                  {d.isAvailable ? "On Duty" : "Off Duty"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Today: <strong className="text-foreground">{d.todayCount}/{d.capacity}</strong></span>
                <span>Upcoming: <strong className="text-foreground">{d.upcomingCount}</strong></span>
              </div>

              {!d.isAvailable && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-300/50 dark:border-amber-900 p-2.5 text-xs text-amber-700 dark:text-amber-400">
                  <p className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Absent {fmtDay(d.unavailableFrom) ?? "today"}{d.unavailableUntil ? ` – ${fmtDay(d.unavailableUntil)}` : " – ongoing"}
                  </p>
                  <p className="mt-0.5 opacity-90">
                    {d.affectedCount} appointment{d.affectedCount !== 1 ? "s" : ""} in this period need recovery.
                  </p>
                </div>
              )}

              {/* Inline date-range form for marking unavailable (no modal). */}
              {markingId === d.id ? (
                <div className="rounded-lg border border-border p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">From</Label>
                      <Input type="date" value={markFrom} onChange={(e) => setMarkFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Until (optional)</Label>
                      <Input type="date" min={markFrom} value={markUntil} onChange={(e) => setMarkUntil(e.target.value)} />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Leave “Until” empty for an open-ended absence.</p>
                  <div className="flex gap-2">
                    <Button size="sm" className="gap-1.5" onClick={() => markUnavailable(d)} disabled={busyId === d.id}>
                      <UserX className="w-4 h-4" /> Confirm absence
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setMarkingId(null)} disabled={busyId === d.id}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {d.isAvailable ? (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openMark(d)} disabled={busyId === d.id}>
                      <UserX className="w-4 h-4" /> Mark unavailable
                    </Button>
                  ) : (
                    <>
                      {d.affectedCount > 0 && (
                        <Button size="sm" className="gap-1.5" onClick={() => generatePlan(d)} disabled={busyId === d.id}>
                          <Sparkles className="w-4 h-4" />
                          {busyId === d.id ? "Planning…" : "Recovery plan"}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => openMark(d)} disabled={busyId === d.id}>
                        Edit dates
                      </Button>
                      <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => markAvailable(d)} disabled={busyId === d.id}>
                        <UserCheck className="w-4 h-4" /> Mark available
                      </Button>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
