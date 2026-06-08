"use client"

/**
 * Interactive clinical workspace (Features 2, 10 & 12).
 *
 * Each appointment owns ONE consultation (notes, diagnosis, AI report, billing
 * codes). When the doctor opens an appointment its existing report is loaded, so
 * a saved draft reappears exactly where it was left (Feature 2 auto-save/recover
 * flow). Saving UPDATES that one report rather than creating duplicates:
 *   - "Save Draft"            → upsert report (status: draft) + save codes
 *   - "Complete Consultation" → upsert → approveReport → save codes
 *                               → setAppointmentStatus("completed")
 *
 * The fields map 1:1 to the stored report (notes → raw_notes, diagnosis →
 * diagnosis, AI report → formatted_report), so nothing is lost on reload.
 */
import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight,
  Stethoscope, Save, Pill, ClipboardList, Plus, Trash2,
  Mic, MicOff, Sparkles, MessageSquare, History, User,
  Heart, Thermometer, Activity, FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { initials, insuranceLabel, formatCents, type InsuranceType } from "@/lib/display"
import { createReport, updateReport, approveReport, setReportBillingCodes } from "@/lib/actions/reports"
import { setAppointmentStatus } from "@/lib/actions/appointments"
import { searchBillingCodes, type CodeSuggestion } from "@/lib/actions/codes"
import { generateConsultationReport, suggestBillingCodes, extractPrescriptions, extractVitals } from "@/lib/actions/ai"
import { saveAppointmentVitals } from "@/lib/actions/vitals"

interface VitalsForm {
  systolic: string; diastolic: string; heart_rate: string
  temperature_c: string; weight_kg: string; height_cm: string
}
const EMPTY_VITALS: VitalsForm = { systolic: "", diastolic: "", heart_rate: "", temperature_c: "", weight_kg: "", height_cm: "" }

interface Prescription { medication: string; dosage: string; frequency: string }

/** A billing code the doctor has attached to this consultation. */
interface SelectedCode {
  catalog: "EBM" | "GOAE"
  code: string
  description: string
  points: number | null
  multiplier: number | null // GOÄ Steigerungssatz; null for EBM
}

// Point values for converting a code's points into a monetary figure.
const GOAE_PUNKTWERT_CENTS = 5.82873 // GOÄ Punktwert (fixed since 1996)
const EBM_ORIENTIERUNGSWERT_CENTS = 11.9339 // EBM 2024 Orientierungswert (KV settlement value)

/**
 * Monetary value of a code: GOÄ = base × Steigerungssatz (the patient invoice
 * amount); EBM = points × Orientierungswert (the value settled by the KV — GKV
 * patients are not invoiced, so this is informational for the doctor).
 */
function codePriceCents(c: SelectedCode): number | null {
  if (c.points == null) return null
  if (c.catalog === "GOAE") return Math.round(c.points * GOAE_PUNKTWERT_CENTS * (c.multiplier ?? 1))
  return Math.round(c.points * EBM_ORIENTIERUNGSWERT_CENTS)
}

export interface QueueEntry {
  appointmentId: string
  patientId: string
  patientName: string
  status: string
  startsAt: string
  reason: string | null
  insuranceType: InsuranceType
  birthDate: string | null
  allergies: string[]
  conditions: string[]
  medications: { name: string; dosage: string }[]
  vitals: {
    heart_rate: number | null
    systolic: number | null
    diastolic: number | null
    temperature_c: number | null
    weight_kg: number | null
  } | null
  recentReports: { id: string; diagnosis: string | null }[]
  // This appointment's own consultation (so a draft reloads when reopened).
  existingReport: {
    id: string
    diagnosis: string | null
    rawNotes: string | null
    formattedReport: string | null
    prescriptions: Prescription[]
    status: string
  } | null
  existingVitals: {
    systolic: number | null; diastolic: number | null; heart_rate: number | null
    temperature_c: number | null; weight_kg: number | null; height_cm: number | null
  } | null
  existingCodes: SelectedCode[]
}

export function WorkspaceClient({ doctorId, queue }: { doctorId: string; queue: QueueEntry[] }) {
  const router = useRouter()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isRecording, setIsRecording] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)

  // The consultation fields map 1:1 to the stored report.
  const [reportId, setReportId] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [formattedReport, setFormattedReport] = useState("")
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [extractingRx, setExtractingRx] = useState(false)
  const [vitalsForm, setVitalsForm] = useState<VitalsForm>(EMPTY_VITALS)
  const [extractingVitals, setExtractingVitals] = useState(false)

  // Billing (Feature 12). Catalog is fixed by insurance: GKV → EBM, else GOÄ.
  const [billingCodes, setBillingCodes] = useState<SelectedCode[]>([])
  const [codeQuery, setCodeQuery] = useState("")
  const [codeResults, setCodeResults] = useState<CodeSuggestion[]>([])
  const [searchingCodes, setSearchingCodes] = useState(false)

  const [generatingReport, setGeneratingReport] = useState(false)
  const [suggestingCodes, setSuggestingCodes] = useState(false)
  const [detailCode, setDetailCode] = useState<SelectedCode | null>(null)

  const current = queue[currentIndex]
  const billingCatalog: "EBM" | "GOAE" = current?.insuranceType === "gkv" ? "EBM" : "GOAE"

  // Load the displayed appointment's consultation. Re-runs on patient switch and
  // whenever the server data refreshes (so a just-saved draft reloads cleanly).
  useEffect(() => {
    const e = queue[currentIndex]
    if (!e) return
    setReportId(e.existingReport?.id ?? null)
    setNotes(e.existingReport?.rawNotes ?? "")
    setDiagnosis(e.existingReport?.diagnosis ?? "")
    setFormattedReport(e.existingReport?.formattedReport ?? "")
    setPrescriptions(e.existingReport?.prescriptions ?? [])
    const v = e.existingVitals
    setVitalsForm(v ? {
      systolic: v.systolic?.toString() ?? "",
      diastolic: v.diastolic?.toString() ?? "",
      heart_rate: v.heart_rate?.toString() ?? "",
      temperature_c: v.temperature_c?.toString() ?? "",
      weight_kg: v.weight_kg?.toString() ?? "",
      height_cm: v.height_cm?.toString() ?? "",
    } : EMPTY_VITALS)
    setBillingCodes(e.existingCodes ?? [])
    setCodeQuery("")
    setCodeResults([])
  }, [queue, currentIndex])

  /**
   * Create or update this appointment's single report; returns its id.
   * `formattedOverride` lets callers persist a value that was just produced
   * (e.g. a freshly generated report) before React state has updated.
   */
  async function ensureReport(
    status: "draft" | "pending_approval",
    formattedOverride?: string,
  ): Promise<string | null> {
    if (!current) return null
    const formatted = (formattedOverride ?? formattedReport) || undefined
    const rx = prescriptions.filter((p) => p.medication.trim())
    if (reportId) {
      const upd = await updateReport(reportId, {
        diagnosis: diagnosis.trim() || undefined,
        raw_notes: notes.trim() || undefined,
        formatted_report: formatted,
        prescriptions: rx,
        status,
      })
      if (upd.status !== "ok") { toast.error(upd.message); return null }
      return reportId
    }
    const created = await createReport({
      appointment_id: current.appointmentId,
      patient_id: current.patientId,
      doctor_id: doctorId,
      diagnosis: diagnosis.trim() || undefined,
      raw_notes: notes.trim() || undefined,
      formatted_report: formatted,
      prescriptions: rx,
      status,
    })
    if (created.status !== "ok") { toast.error(created.message); return null }
    setReportId(created.data.id)
    return created.data.id
  }

  /** Persist the attached codes for the report. */
  function saveCodes(rid: string) {
    return setReportBillingCodes(
      rid,
      billingCodes.map((c) => ({
        catalog: c.catalog,
        code: c.code,
        multiplier: c.catalog === "GOAE" ? c.multiplier : null,
      })),
    )
  }

  async function handleSaveDraft() {
    if (!current) return
    if (!notes.trim() && !diagnosis.trim()) {
      toast.error("Enter at least some notes or a diagnosis before saving.")
      return
    }
    setIsSaving(true)
    const rid = await ensureReport("draft")
    if (!rid) { setIsSaving(false); return }
    await saveCodes(rid)
    await saveVitals()
    setIsSaving(false)
    toast.success("Draft saved. It will reload when you reopen this patient.")
    router.refresh()
  }

  async function handleComplete() {
    if (!current) return
    if (!diagnosis.trim()) {
      toast.error("A diagnosis is required to complete the consultation.")
      return
    }
    setIsSaving(true)
    const rid = await ensureReport("pending_approval")
    if (!rid) { setIsSaving(false); return }
    const approved = await approveReport(rid)
    if (approved.status !== "ok") { setIsSaving(false); toast.error(approved.message); return }
    await saveCodes(rid)
    await saveVitals()
    await setAppointmentStatus(current.appointmentId, "completed")
    setIsSaving(false)
    toast.success("Consultation completed and report approved.")
    setCurrentIndex(0)
    router.refresh()
  }

  /** Generate a structured report from the notes (Feature 2, AI). */
  async function handleGenerateReport() {
    if (!current) return
    setGeneratingReport(true)
    const result = await generateConsultationReport({
      rawNotes: notes,
      diagnosis: diagnosis || undefined,
      context: {
        conditions: current.conditions,
        allergies: current.allergies,
        medications: current.medications.map((m) => `${m.name} ${m.dosage}`),
      },
    })
    if (result.status !== "ok") {
      setGeneratingReport(false)
      toast.error(result.message)
      return
    }
    const report = result.data.report
    setFormattedReport(report)
    // Persist immediately as a draft (report + codes + vitals) and refresh the
    // server data, so everything reloads consistently when the patient reopens.
    const rid = await ensureReport("draft", report)
    if (rid) await saveCodes(rid)
    await saveVitals()
    setGeneratingReport(false)
    router.refresh()
    toast.success("Report generated and saved as draft. Review and edit before completing.")
  }

  /** Ask the model for billing codes, grounded in the real catalog (Feature 12). */
  async function handleSuggestCodes() {
    if (!current) return
    const reportText = formattedReport || `${notes}${diagnosis ? `\nDiagnose: ${diagnosis}` : ""}`
    setSuggestingCodes(true)
    const result = await suggestBillingCodes(reportText, current.insuranceType)
    setSuggestingCodes(false)
    if (result.status !== "ok") { toast.error(result.message); return }
    const toAdd = result.data
      .filter((s) => !billingCodes.some((c) => c.code === s.code))
      .map((s) => ({
        catalog: s.catalog, code: s.code, description: s.description, points: s.points,
        multiplier: s.catalog === "GOAE" ? s.defaultMultiplier ?? 2.3 : null,
      }))
    setBillingCodes([...billingCodes, ...toAdd])
    toast.success(toAdd.length ? `${toAdd.length} code(s) suggested.` : "No new valid codes found.")
  }

  async function runCodeSearch() {
    setSearchingCodes(true)
    const result = await searchBillingCodes(billingCatalog, codeQuery)
    setSearchingCodes(false)
    if (result.status === "ok") setCodeResults(result.data)
    else toast.error(result.message)
  }

  /** Add a code by its exact number (manual entry), validated against the catalog. */
  async function addExactCode() {
    const code = codeQuery.trim()
    if (!code) return
    setSearchingCodes(true)
    const result = await searchBillingCodes(billingCatalog, code)
    setSearchingCodes(false)
    if (result.status !== "ok") { toast.error(result.message); return }
    const exact = result.data.find((r) => r.code.toLowerCase() === code.toLowerCase())
    if (!exact) { toast.error(`Code "${code}" not found in ${billingCatalog}.`); return }
    addCode(exact)
    setCodeQuery("")
    setCodeResults([])
    toast.success(`Added ${exact.code}.`)
  }

  function addCode(s: CodeSuggestion) {
    if (billingCodes.some((c) => c.code === s.code && c.catalog === s.catalog)) return
    setBillingCodes([...billingCodes, {
      catalog: s.catalog, code: s.code, description: s.description, points: s.points,
      multiplier: s.catalog === "GOAE" ? s.defaultMultiplier ?? 2.3 : null,
    }])
  }

  function removeCode(code: string) {
    setBillingCodes(billingCodes.filter((c) => c.code !== code))
  }

  function setCodeMultiplier(code: string, value: number) {
    setBillingCodes(billingCodes.map((c) => c.code === code ? { ...c, multiplier: value } : c))
  }

  function updatePrescription(index: number, field: keyof Prescription, value: string) {
    setPrescriptions(prescriptions.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  function removePrescription(index: number) {
    setPrescriptions(prescriptions.filter((_, i) => i !== index))
  }

  function setVital(field: keyof VitalsForm, value: string) {
    setVitalsForm((v) => ({ ...v, [field]: value }))
  }

  /** Save the vitals on their own (no notes required), so manual entry persists. */
  async function handleSaveVitals() {
    if (!current) return
    setIsSaving(true)
    // Persist any report content too, so the refresh doesn't discard it.
    if (notes.trim() || diagnosis.trim() || formattedReport.trim() || reportId) {
      const rid = await ensureReport("draft")
      if (rid) await saveCodes(rid)
    }
    await saveVitals(vitalsForm)
    setIsSaving(false)
    router.refresh()
    toast.success("Vitals saved.")
  }

  /** Persist this consultation's vitals (one row per appointment). */
  function saveVitals(form: VitalsForm = vitalsForm): Promise<unknown> {
    if (!current) return Promise.resolve()
    const num = (s: string) => {
      const n = Number(s)
      return s.trim() && isFinite(n) ? n : null
    }
    return saveAppointmentVitals({
      appointment_id: current.appointmentId,
      patient_id: current.patientId,
      systolic: num(form.systolic),
      diastolic: num(form.diastolic),
      heart_rate: num(form.heart_rate),
      temperature_c: num(form.temperature_c),
      weight_kg: num(form.weight_kg),
      height_cm: num(form.height_cm),
    })
  }

  /** Extract vital signs from the notes (AI), keeping any already-entered values. */
  async function handleExtractVitals() {
    if (!current) return
    const text = `${notes}${diagnosis ? `\n${diagnosis}` : ""}`.trim() || formattedReport
    setExtractingVitals(true)
    const result = await extractVitals(text)
    if (result.status !== "ok") { setExtractingVitals(false); toast.error(result.message); return }
    const v = result.data
    const keep = (n: number | null, cur: string) => (n != null ? n.toString() : cur)
    const newForm: VitalsForm = {
      systolic: keep(v.systolic, vitalsForm.systolic),
      diastolic: keep(v.diastolic, vitalsForm.diastolic),
      heart_rate: keep(v.heart_rate, vitalsForm.heart_rate),
      temperature_c: keep(v.temperature_c, vitalsForm.temperature_c),
      weight_kg: keep(v.weight_kg, vitalsForm.weight_kg),
      height_cm: keep(v.height_cm, vitalsForm.height_cm),
    }
    setVitalsForm(newForm)
    // Persist the draft (report + codes + the new vitals) and refresh, so the
    // vitals reload automatically when the patient is reopened — like the report.
    const rid = await ensureReport("draft")
    if (rid) await saveCodes(rid)
    await saveVitals(newForm)
    setExtractingVitals(false)
    router.refresh()
    toast.success("Vitals extracted and saved.")
  }

  /** Extract medication / dosage / frequency from the notes (AI). */
  async function handleExtractPrescriptions() {
    if (!current) return
    // Use the doctor's own notes — the generated report carries the patient's
    // existing medications as context, which would be mis-extracted as new ones.
    const text = `${notes}${diagnosis ? `\nDiagnose: ${diagnosis}` : ""}`.trim() || formattedReport
    const currentMeds = current.medications.map((m) => `${m.name} ${m.dosage}`.trim())
    setExtractingRx(true)
    const result = await extractPrescriptions(text, currentMeds)
    setExtractingRx(false)
    if (result.status !== "ok") { toast.error(result.message); return }
    const existing = new Set(prescriptions.map((p) => p.medication.trim().toLowerCase()))
    const toAdd = result.data.filter((p) => !existing.has(p.medication.toLowerCase()))
    setPrescriptions([...prescriptions.filter((p) => p.medication.trim()), ...toAdd])
    toast.success(toAdd.length ? `${toAdd.length} medication(s) extracted.` : "No new medications found.")
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })

  function calculateAge(birthDate: string | null) {
    if (!birthDate) return null
    const birth = new Date(birthDate)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const m = now.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
    return age
  }

  if (!current) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto text-center py-20">
          <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-muted flex items-center justify-center">
            <Stethoscope className="w-12 h-12 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">No Patients in Queue</h1>
          <p className="text-muted-foreground mb-6">
            There are no waiting or scheduled patients at the moment. Check back later or view your full schedule.
          </p>
          <Link href="/doctor/dashboard">
            <Button className="gap-2">View Dashboard <ArrowRight className="w-4 h-4" /></Button>
          </Link>
        </div>
      </div>
    )
  }

  const age = calculateAge(current.birthDate)

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-4rem)]">
      {/* Patient Queue Sidebar — sticky column on large screens */}
      <div className="w-full lg:w-72 xl:w-80 border-b lg:border-b-0 lg:border-r border-border bg-card flex-shrink-0 lg:sticky lg:top-16 lg:self-start lg:h-[calc(100vh-4rem)] lg:flex lg:flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            Patient Queue
          </h2>
          <p className="text-sm text-muted-foreground">{queue.length} patients remaining</p>
        </div>
        <ScrollArea className="h-48 lg:h-auto lg:flex-1">
          <div className="p-2 space-y-2">
            {queue.map((entry, index) => {
              const isActive = index === currentIndex
              return (
                <button
                  key={entry.appointmentId}
                  onClick={() => setCurrentIndex(index)}
                  className={`w-full p-3 rounded-xl text-left transition-all duration-200 ${isActive ? "bg-primary text-primary-foreground shadow-lg" : "hover:bg-accent"}`}
                >
                  <div className="flex items-center gap-3">
                    <Avatar className={`w-10 h-10 ${isActive ? "border-2 border-primary-foreground/30" : ""}`}>
                      <AvatarFallback className={isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted"}>
                        {initials(...entry.patientName.split(" ") as [string, string])}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${isActive ? "text-primary-foreground" : "text-foreground"}`}>
                        {entry.patientName}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs ${isActive ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {formatTime(entry.startsAt)}
                        </span>
                        {entry.status === "waiting" && (
                          <Badge variant="secondary" className={`text-xs h-5 ${isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-amber-100 text-amber-700"}`}>
                            Waiting
                          </Badge>
                        )}
                        {entry.existingReport?.status === "draft" && (
                          <Badge variant="outline" className={`text-xs h-5 ${isActive ? "border-primary-foreground/40 text-primary-foreground" : ""}`}>
                            Draft
                          </Badge>
                        )}
                        {entry.allergies.length > 0 && !isActive && (
                          <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Patient Header */}
        <div className="p-4 sm:p-6 border-b border-border bg-card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16 border-4 border-background shadow-xl">
                <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                  {initials(...current.patientName.split(" ") as [string, string])}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-foreground">{current.patientName}</h1>
                  <Badge variant="outline" className="text-xs">
                    {current.status === "waiting" ? "Waiting" : "Scheduled"}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                  {age !== null && <><span>{age} years old</span><span>•</span></>}
                  <span>{insuranceLabel(current.insuranceType)}</span>
                  {current.reason && <><span>•</span><span>{current.reason}</span></>}
                </div>
                {current.allergies.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {current.allergies.map((allergy, i) => (
                      <Badge key={i} variant="destructive" className="text-xs">
                        <AlertCircle className="w-3 h-3 mr-1" />
                        {allergy}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentIndex(currentIndex - 1)} disabled={currentIndex === 0}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-muted-foreground px-2">{currentIndex + 1} / {queue.length}</span>
              <Button variant="outline" size="icon" onClick={() => setCurrentIndex(currentIndex + 1)} disabled={currentIndex === queue.length - 1}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Workspace Content — patient info and consultation stack until very wide screens */}
        <div className="flex-1 p-4 sm:p-6">
          <div className="flex flex-col 2xl:flex-row gap-6">
            {/* Patient Info & History */}
            <div className="w-full 2xl:w-96 2xl:flex-shrink-0 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="w-4 h-4 text-primary" />
                      Vitals
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={handleExtractVitals} disabled={extractingVitals || isSaving}>
                        <Sparkles className="w-3.5 h-3.5" />
                        {extractingVitals ? "…" : "Extract"}
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={handleSaveVitals} disabled={isSaving || extractingVitals}>
                        <Save className="w-3.5 h-3.5" />
                        Save
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <VitalInput icon={<Activity className="w-3.5 h-3.5" />} label="Systolic" unit="mmHg" value={vitalsForm.systolic} onChange={(v) => setVital("systolic", v)} />
                    <VitalInput icon={<Activity className="w-3.5 h-3.5" />} label="Diastolic" unit="mmHg" value={vitalsForm.diastolic} onChange={(v) => setVital("diastolic", v)} />
                    <VitalInput icon={<Heart className="w-3.5 h-3.5" />} label="Heart Rate" unit="bpm" value={vitalsForm.heart_rate} onChange={(v) => setVital("heart_rate", v)} />
                    <VitalInput icon={<Thermometer className="w-3.5 h-3.5" />} label="Temp" unit="°C" value={vitalsForm.temperature_c} onChange={(v) => setVital("temperature_c", v)} />
                    <VitalInput icon={<User className="w-3.5 h-3.5" />} label="Weight" unit="kg" value={vitalsForm.weight_kg} onChange={(v) => setVital("weight_kg", v)} />
                    <VitalInput icon={<User className="w-3.5 h-3.5" />} label="Height" unit="cm" value={vitalsForm.height_cm} onChange={(v) => setVital("height_cm", v)} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Recorded for this consultation; the latest reading shows in the patient&apos;s account.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <History className="w-4 h-4 text-primary" />
                    Medical History
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {current.conditions.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Chronic Conditions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {current.conditions.map((c, i) => <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>)}
                      </div>
                    </div>
                  )}
                  {current.medications.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Current Medications</p>
                      <div className="space-y-1.5">
                        {current.medications.map((med, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <Pill className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{med.name} {med.dosage}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {current.recentReports.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">Recent Reports</p>
                      <div className="space-y-1.5">
                        {current.recentReports.map((report) => (
                          <div key={report.id} className="flex items-center gap-2 text-sm">
                            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="truncate">{report.diagnosis ?? "Report"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {current.conditions.length === 0 && current.medications.length === 0 && current.recentReports.length === 0 && (
                    <p className="text-sm text-muted-foreground">No historical data available.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right - Consultation */}
            <div className="flex-1 min-w-0">
              <Card className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-primary" />
                      Consultation
                      {reportId && <Badge variant="secondary" className="text-xs">Draft saved</Badge>}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Button variant={isRecording ? "destructive" : "outline"} size="sm" onClick={() => setIsRecording(!isRecording)} className="gap-2">
                        {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        {isRecording ? "Stop" : "Record"}
                      </Button>
                      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2">
                            <Sparkles className="w-4 h-4" />
                            AI Assist
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>AI Documentation Assistant</DialogTitle>
                            <DialogDescription>
                              The decision-support module (Feature 11) is not yet connected. This panel is a placeholder.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 pt-4">
                            <div className="p-4 rounded-lg bg-muted">
                              <p className="text-sm text-muted-foreground">
                                Use the AI Report tab to generate a structured report, and the Billing tab to suggest codes.
                              </p>
                            </div>
                            <Button className="w-full gap-2" disabled>
                              <MessageSquare className="w-4 h-4" />
                              Ask AI a Question
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <Tabs defaultValue="notes" className="h-full flex flex-col">
                    <TabsList className="grid w-full grid-cols-5">
                      <TabsTrigger value="notes">Notes</TabsTrigger>
                      <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
                      <TabsTrigger value="report">AI Report</TabsTrigger>
                      <TabsTrigger value="prescription">Prescription</TabsTrigger>
                      <TabsTrigger value="billing">Billing</TabsTrigger>
                    </TabsList>

                    <TabsContent value="notes" className="flex-1 mt-4">
                      <Label htmlFor="notes">Consultation Notes</Label>
                      <Textarea
                        id="notes"
                        placeholder="Enter the consultation notes — symptoms, examination findings, treatment plan…"
                        className="mt-1.5 min-h-[200px] lg:min-h-[300px]"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </TabsContent>

                    <TabsContent value="diagnosis" className="flex-1 mt-4">
                      <Label htmlFor="diagnosis">Diagnosis</Label>
                      <Textarea
                        id="diagnosis"
                        placeholder="Enter the diagnosis…"
                        className="mt-1.5 min-h-[200px] lg:min-h-[300px]"
                        value={diagnosis}
                        onChange={(e) => setDiagnosis(e.target.value)}
                      />
                    </TabsContent>

                    <TabsContent value="report" className="flex-1 mt-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>AI-generated report</Label>
                          <Button variant="outline" size="sm" className="gap-2" onClick={handleGenerateReport} disabled={generatingReport}>
                            <Sparkles className="w-4 h-4" />
                            {generatingReport ? "Generating…" : "Generate from notes"}
                          </Button>
                        </div>
                        <Textarea
                          placeholder="Click 'Generate from notes' to draft a structured report from your notes, then edit it here…"
                          className="min-h-[200px] lg:min-h-[280px] text-sm"
                          value={formattedReport}
                          onChange={(e) => setFormattedReport(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          AI-generated draft — review and edit before completing. It is saved as the formal report.
                        </p>
                      </div>
                    </TabsContent>

                    <TabsContent value="prescription" className="flex-1 mt-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>Prescriptions</Label>
                          <Button variant="outline" size="sm" className="gap-2" onClick={handleExtractPrescriptions} disabled={extractingRx}>
                            <Sparkles className="w-4 h-4" />
                            {extractingRx ? "Extracting…" : "Extract from notes"}
                          </Button>
                        </div>

                        {prescriptions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No medications yet. Add one, or extract them from the notes/report with AI.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {prescriptions.map((rx, index) => (
                              <div key={index} className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-end p-3 rounded-lg border border-border">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Medication</Label>
                                  <Input className="mt-1" placeholder="Drug / Wirkstoff" value={rx.medication}
                                    onChange={(e) => updatePrescription(index, "medication", e.target.value)} />
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Dosage</Label>
                                  <Input className="mt-1" placeholder="e.g. 500 mg" value={rx.dosage}
                                    onChange={(e) => updatePrescription(index, "dosage", e.target.value)} />
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Frequency</Label>
                                  <Input className="mt-1" placeholder="e.g. 2x täglich" value={rx.frequency}
                                    onChange={(e) => updatePrescription(index, "frequency", e.target.value)} />
                                </div>
                                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removePrescription(index)}>
                                  <span className="text-destructive">×</span>
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        <Button variant="outline" onClick={() => setPrescriptions([...prescriptions, { medication: "", dosage: "", frequency: "" }])} className="w-full gap-2">
                          <Plus className="w-4 h-4" /> Add Medication
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Saved with the consultation and reloaded when you reopen the patient.
                        </p>
                      </div>
                    </TabsContent>

                    <TabsContent value="billing" className="flex-1 mt-4">
                      <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-muted/50 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">Insurance:</span>
                            <Badge>{insuranceLabel(current.insuranceType)}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {billingCatalog === "EBM" ? "Statutory → EBM codes" : "Private / self-pay → GOÄ codes"}
                          </span>
                        </div>

                        <Button variant="outline" className="w-full gap-2" onClick={handleSuggestCodes} disabled={suggestingCodes}>
                          <Sparkles className="w-4 h-4" />
                          {suggestingCodes ? "Suggesting…" : "Suggest codes with AI"}
                        </Button>

                        {/* Or add codes manually — search and click a result,
                            or type an exact code and press Add. */}
                        <div className="flex gap-2">
                          <Input
                            placeholder={`Search or type a ${billingCatalog} code…`}
                            value={codeQuery}
                            onChange={(e) => setCodeQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runCodeSearch() } }}
                          />
                          <Button variant="outline" onClick={runCodeSearch} disabled={searchingCodes || codeQuery.trim().length < 2}>
                            {searchingCodes ? "…" : "Search"}
                          </Button>
                          <Button variant="outline" className="gap-1" onClick={addExactCode} disabled={searchingCodes || codeQuery.trim().length < 2}>
                            <Plus className="w-4 h-4" /> Add
                          </Button>
                        </div>

                        {codeResults.length > 0 && (
                          <div className="border border-border rounded-lg max-h-44 overflow-auto divide-y divide-border">
                            <p className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/40">Click a result to add it</p>
                            {codeResults.map((r) => (
                              <button
                                key={r.code}
                                onClick={() => addCode(r)}
                                className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-3 group"
                              >
                                <span className="font-mono text-xs text-primary shrink-0">{r.code}</span>
                                <span className="text-sm text-foreground flex-1">{r.description}</span>
                                <Plus className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                              </button>
                            ))}
                          </div>
                        )}

                        <div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground">Attached codes ({billingCodes.length})</Label>
                            {billingCodes.length > 0 && (
                              <Button variant="ghost" size="sm" className="h-7 text-destructive gap-1" onClick={() => setBillingCodes([])}>
                                <Trash2 className="w-3.5 h-3.5" /> Clear all
                              </Button>
                            )}
                          </div>
                          {billingCodes.length === 0 ? (
                            <p className="text-sm text-muted-foreground mt-2">No billing codes added yet.</p>
                          ) : (
                            <>
                            <div className="mt-2 space-y-2">
                              {billingCodes.map((c) => (
                                <div key={c.code} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                                  <button
                                    type="button"
                                    onClick={() => setDetailCode(c)}
                                    className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80"
                                    title="Click to view full details"
                                  >
                                    <span className="font-mono text-xs text-primary shrink-0">{c.code}</span>
                                    <span className="text-sm flex-1 truncate">{c.description}</span>
                                  </button>
                                  {c.catalog === "GOAE" && (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <span className="text-xs text-muted-foreground">×</span>
                                      <Input
                                        type="number" step="0.1" min="1" max="3.5"
                                        className="w-16 h-8"
                                        value={c.multiplier ?? 2.3}
                                        onChange={(e) => setCodeMultiplier(c.code, Number(e.target.value))}
                                      />
                                    </div>
                                  )}
                                  <span className="text-sm font-medium tabular-nums shrink-0 w-20 text-right">{formatCents(codePriceCents(c))}</span>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeCode(c.code)}>
                                    <span className="text-destructive">×</span>
                                  </Button>
                                </div>
                              ))}
                            </div>
                            <div className="flex items-center justify-between mt-3 pt-2 border-t border-border">
                              <span className="text-sm font-medium">
                                {billingCatalog === "GOAE" ? "Invoice total" : "Est. KV value (points × Orientierungswert)"}
                              </span>
                              <span className="text-base font-bold tabular-nums">
                                {formatCents(billingCodes.reduce((sum, c) => sum + (codePriceCents(c) ?? 0), 0))}
                              </span>
                            </div>
                            </>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            Click a code to read its full description. Codes are saved with the consultation, then appear on the receptionist&apos;s billing dashboard.
                          </p>
                        </div>

                        {/* Full-detail view of an attached code */}
                        <Dialog open={detailCode !== null} onOpenChange={(o) => !o && setDetailCode(null)}>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle className="font-mono">{detailCode?.code}</DialogTitle>
                              <DialogDescription>
                                {detailCode?.catalog === "EBM" ? "EBM — statutory (GKV)" : "GOÄ — private / self-pay"}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 text-sm">
                              <p className="whitespace-pre-wrap leading-relaxed">{detailCode?.description}</p>
                              <div className="flex flex-wrap gap-4 text-muted-foreground pt-3 border-t border-border">
                                {detailCode?.points != null && <span>Punkte: <strong className="text-foreground">{detailCode.points}</strong></span>}
                                {detailCode?.catalog === "GOAE" && detailCode.multiplier != null && (
                                  <span>Steigerungssatz: <strong className="text-foreground">×{detailCode.multiplier}</strong></span>
                                )}
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>

                {/* Action Footer */}
                <div className="p-4 border-t border-border flex flex-col sm:flex-row gap-2 sm:justify-between">
                  <Button variant="outline" className="gap-2" onClick={handleSaveDraft} disabled={isSaving}>
                    <Save className="w-4 h-4" />
                    Save Draft
                  </Button>
                  <div className="flex gap-2">
                    <Button className="gap-2" onClick={handleComplete} disabled={isSaving}>
                      <CheckCircle2 className="w-4 h-4" />
                      {isSaving ? "Saving…" : "Complete Consultation"}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Editable vitals tile. */
function VitalInput({
  icon, label, unit, value, onChange,
}: { icon: React.ReactNode; label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="p-2.5 rounded-lg bg-muted/50 min-w-0">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        <span className="shrink-0">{icon}</span>
        <span className="text-xs truncate">{label}</span>
        <span className="text-[10px] opacity-60 ml-auto shrink-0">{unit}</span>
      </div>
      <Input
        type="number"
        inputMode="decimal"
        className="h-8 w-full bg-background"
        placeholder="—"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
