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
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"
import type { TKey } from "@/lib/i18n/translate"

const URGENCY: Record<UrgencyLevel, { labelKey: TKey; cls: string }> = {
  high: { labelKey: "receptionMgmt.urgencyHigh" as TKey, cls: "text-red-600 dark:text-red-400" },
  medium: { labelKey: "receptionMgmt.urgencyMedium" as TKey, cls: "text-amber-600 dark:text-amber-400" },
  routine: { labelKey: "receptionMgmt.urgencyRoutine" as TKey, cls: "text-emerald-600 dark:text-emerald-400" },
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

const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function StaffClient({ roster }: { roster: RosterDoctor[] }) {
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const fmtDay = (s: string | null) => (s ? new Date(`${s}T00:00:00`).toLocaleDateString(INTL_LOCALE[locale]) : null)
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
    if (!markFrom) { toast.error(t("receptionMgmt.pickStartDate")); return }
    if (markUntil && markUntil < markFrom) { toast.error(t("receptionMgmt.endBeforeStart")); return }
    setBusyId(d.id)
    const r = await setDoctorAvailability(d.id, false, { from: markFrom, until: markUntil || null })
    setBusyId(null)
    if (r.status === "ok") {
      toast.success(t("receptionMgmt.markedUnavailableToast", { name: d.name }))
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
      toast.success(t("receptionMgmt.markedAvailableToast", { name: d.name }))
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
      toast.success(t("receptionMgmt.planExecutedToast", { reassigned: r.data.reassigned, cancelled: r.data.cancelled }) + (r.data.failed ? t("receptionMgmt.planExecutedFailedSuffix", { failed: r.data.failed }) : "") + ".")
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
          <ArrowLeft className="w-4 h-4" /> {t("receptionMgmt.backToStaff")}
        </button>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" /> {t("receptionMgmt.scheduleRecovery")}
            </h1>
            <p className="text-muted-foreground">
              {plan.doctorName} · {plan.doctorSpecialization ?? t("receptionMgmt.specGeneral")} · {t("receptionMgmt.absentLc")}{" "}
              {fmtDay(plan.windowFrom) ?? t("receptionMgmt.todayLc")}{plan.windowUntil ? ` – ${fmtDay(plan.windowUntil)}` : ` – ${t("receptionMgmt.ongoing")}`}
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5 border-amber-300 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5" /> {t("receptionMgmt.activeRecovery")}
          </Badge>
        </div>

        {/* Crisis overview */}
        <div className="grid grid-cols-1 min-w-0 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">{t("receptionMgmt.impactedAppointments")}</p>
              <p className="text-3xl font-bold text-foreground">{plan.items.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground mb-2">{t("receptionMgmt.availableCapacity", { spec: plan.doctorSpecialization ?? "" })}</p>
              {sameSpecialtyFree.length === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-500">{t("receptionMgmt.noSameSpecialty")}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {sameSpecialtyFree.map((c) => (
                    <Badge key={c.id} variant="secondary" className="text-xs">{c.name} — {t("receptionMgmt.slotsCount", { count: c.remainingToday })}</Badge>
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
              <CardTitle className="text-base">{t("receptionMgmt.aiRecoveryPlan")}</CardTitle>
              <CardDescription>{t("receptionMgmt.recoveryPlanDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              {plan.items.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{t("receptionMgmt.noUpcomingRecover")}</p>
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
                            {new Date(it.startsAt).toLocaleString(INTL_LOCALE[locale], { dateStyle: "medium", timeStyle: "short" })} · {it.durationMin} {t("receptionMgmt.minShort")}
                            {noCover && <span className="text-amber-600 dark:text-amber-500"> {t("receptionMgmt.noCoverSuffix")}</span>}
                          </p>
                        </div>
                        <Select value={urg} onValueChange={(v) => setUrgencyChoices((u) => ({ ...u, [it.appointmentId]: v as UrgencyLevel }))}>
                          <SelectTrigger className="w-full sm:w-28" title={t("receptionMgmt.urgencyTooltip")}>
                            <span className={URGENCY[urg].cls}>{t(URGENCY[urg].labelKey)}</span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high"><span className={URGENCY.high.cls}>{t("receptionMgmt.urgencyHigh")}</span></SelectItem>
                            <SelectItem value="medium"><span className={URGENCY.medium.cls}>{t("receptionMgmt.urgencyMedium")}</span></SelectItem>
                            <SelectItem value="routine"><span className={URGENCY.routine.cls}>{t("receptionMgmt.urgencyRoutine")}</span></SelectItem>
                          </SelectContent>
                        </Select>
                        <ArrowRight className="w-4 h-4 text-muted-foreground hidden sm:block shrink-0" />
                        <Select value={choice} onValueChange={(v) => setChoices((c) => ({ ...c, [it.appointmentId]: v }))}>
                          <SelectTrigger className="w-full sm:w-60">
                            <span className="truncate">
                              {choice === CANCEL
                                ? t("receptionMgmt.cancelAppointmentOption")
                                : `→ ${plan.candidates.find((c) => c.id === choice)?.name ?? t("receptionMgmt.reassignFallback")}`}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {plan.candidates.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}{c.sameSpecialty ? "" : ` · ${c.specialization ?? t("receptionMgmt.specOther")}`} — {t("receptionMgmt.slotsCount", { count: c.remainingToday })}
                              </SelectItem>
                            ))}
                            <SelectItem value={CANCEL}>
                              <span className="flex items-center gap-1.5 text-destructive"><Ban className="w-3.5 h-3.5" /> {t("receptionMgmt.cancelAppointmentOption")}</span>
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
              <CardTitle className="text-base">{t("receptionMgmt.planExecutionSummary")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{reassignNow}</p>
                  <p className="text-xs text-muted-foreground">{t("receptionMgmt.reassignedLabel")}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-bold text-foreground">{cancelNow}</p>
                  <p className="text-xs text-muted-foreground">{t("receptionMgmt.cancelledLabel")}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("receptionMgmt.reassignNote")}
              </p>
              <div className="space-y-2 pt-1">
                <Button className="w-full" onClick={execute} disabled={executing || plan.items.length === 0}>
                  {executing ? t("receptionMgmt.executing") : t("receptionMgmt.approveExecute")}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setPlan(null)} disabled={executing}>
                  {t("receptionMgmt.discard")}
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
        <h1 className="text-2xl font-bold text-foreground">{t("receptionMgmt.staffTitle")}</h1>
        <p className="text-muted-foreground">{t("receptionMgmt.staffSubtitle")}</p>
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
                  {d.isAvailable ? t("receptionMgmt.onDuty") : t("receptionMgmt.offDuty")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>{t("receptionMgmt.todayLabel")}: <strong className="text-foreground">{d.todayCount}/{d.capacity}</strong></span>
                <span>{t("receptionMgmt.upcomingLabel")}: <strong className="text-foreground">{d.upcomingCount}</strong></span>
              </div>

              {!d.isAvailable && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-300/50 dark:border-amber-900 p-2.5 text-xs text-amber-700 dark:text-amber-400">
                  <p className="flex items-center gap-1.5 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {t("receptionMgmt.absentCap")} {fmtDay(d.unavailableFrom) ?? t("receptionMgmt.todayLc")}{d.unavailableUntil ? ` – ${fmtDay(d.unavailableUntil)}` : ` – ${t("receptionMgmt.ongoing")}`}
                  </p>
                  <p className="mt-0.5 opacity-90">
                    {d.affectedCount === 1 ? t("receptionMgmt.affectedRecoverOne", { count: d.affectedCount }) : t("receptionMgmt.affectedRecoverMany", { count: d.affectedCount })}
                  </p>
                </div>
              )}

              {/* Inline date-range form for marking unavailable (no modal). */}
              {markingId === d.id ? (
                <div className="rounded-lg border border-border p-3 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t("receptionMgmt.labelFrom")}</Label>
                      <Input type="date" value={markFrom} onChange={(e) => setMarkFrom(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">{t("receptionMgmt.labelUntil")}</Label>
                      <Input type="date" min={markFrom} value={markUntil} onChange={(e) => setMarkUntil(e.target.value)} />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{t("receptionMgmt.untilHint")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="gap-1.5" onClick={() => markUnavailable(d)} disabled={busyId === d.id}>
                      <UserX className="w-4 h-4" /> {t("receptionMgmt.confirmAbsence")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setMarkingId(null)} disabled={busyId === d.id}>{t("common.cancel")}</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1">
                  {d.isAvailable ? (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openMark(d)} disabled={busyId === d.id}>
                      <UserX className="w-4 h-4" /> {t("receptionMgmt.markUnavailable")}
                    </Button>
                  ) : (
                    <>
                      {d.affectedCount > 0 && (
                        <Button size="sm" className="gap-1.5" onClick={() => generatePlan(d)} disabled={busyId === d.id}>
                          <Sparkles className="w-4 h-4" />
                          {busyId === d.id ? t("receptionMgmt.planning") : t("receptionMgmt.recoveryPlanBtn")}
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => openMark(d)} disabled={busyId === d.id}>
                        {t("receptionMgmt.editDates")}
                      </Button>
                      <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => markAvailable(d)} disabled={busyId === d.id}>
                        <UserCheck className="w-4 h-4" /> {t("receptionMgmt.markAvailable")}
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
