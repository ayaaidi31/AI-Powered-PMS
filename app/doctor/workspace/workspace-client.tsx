"use client"

/**
 * Interactive clinical workspace (Features 2, 10 & 12).
 *
 * Each appointment owns ONE consultation (notes, diagnosis, AI report, billing
 * codes). When the doctor opens an appointment its existing report is loaded, so
 * a saved draft reappears exactly where it was left (Feature 9 auto-save/recover
 * flow). Saving UPDATES that one report rather than creating duplicates:
 *   - "Save Draft"            → upsert report (status: draft) + save codes
 *   - "Complete Consultation" → upsert → approveReport → save codes
 *                               → setAppointmentStatus("completed")
 *
 * The fields map 1:1 to the stored report (notes → raw_notes, diagnosis →
 * diagnosis, AI report → formatted_report), so nothing is lost on reload.
 */
import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight,
  Stethoscope, Save, Pill, ClipboardList, Plus, Trash2,
  Mic, Sparkles, History, User,
  Heart, Thermometer, Activity, FileText, Eye, Pencil, AlertTriangle, X, Check, FileSearch,
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
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"
import type { TKey } from "@/lib/i18n/translate"
import { createReport, updateReport, approveReport, setReportBillingCodes } from "@/lib/actions/reports"
import { setAppointmentStatus } from "@/lib/actions/appointments"
import { searchBillingCodes, type CodeSuggestion } from "@/lib/actions/codes"
import { generateConsultationReport, suggestBillingCodes, extractPrescriptions, extractVitals, summarizePatientHistory, checkPrescriptionSafety, suggestProfileUpdates, type SafetyAlert, type ProfileUpdateSuggestion } from "@/lib/actions/ai"
import { createProfileProposals } from "@/lib/actions/profile-proposals"
import { saveAppointmentVitals } from "@/lib/actions/vitals"
import { codePriceCents as billingPriceCents } from "@/lib/billing-values"
import { ReportContent } from "@/components/report-content"
import { DecisionSupport, type DsMessage } from "@/components/decision-support"
import { RecordsQA, type RecordsQAMessage } from "@/components/records-qa"
import { useRecording } from "@/components/recording/recording-provider"
import { PatientDocuments } from "@/components/patient-documents"
import type { PatientDocumentRow } from "@/lib/seed-data"

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

// Monetary conversion lives in lib/billing-values.ts (pure + unit-tested).
const codePriceCents = (c: SelectedCode) => billingPriceCents(c)

export interface QueueEntry {
  appointmentId: string
  patientId: string
  patientName: string
  status: string
  startsAt: string
  reason: string | null
  insuranceType: InsuranceType
  birthDate: string | null
  // Contact/address on file — compared against the report for profile updates.
  email: string | null
  phone: string | null
  street: string | null
  city: string | null
  postalCode: string | null
  country: string | null
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
  // Previous appointments (most recent first) with their status and outcome.
  history: { id: string; date: string; reason: string | null; status: string; diagnosis: string | null }[]
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
  // Files already attached to the record (imaging, lab results, referrals).
  documents: PatientDocumentRow[]
}

export function WorkspaceClient({ doctorId, queue }: { doctorId: string; queue: QueueEntry[] }) {
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const [currentIndex, setCurrentIndex] = useState(0)
  const recording = useRecording()
  // The language the generated report is written in — independent of the spoken
  // (recognition) language; defaults to the interface language.
  const [reportLang, setReportLang] = useState<"de" | "en">(locale)
  const [isSaving, setIsSaving] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [recordsOpen, setRecordsOpen] = useState(false)

  // The consultation fields map 1:1 to the stored report.
  const [reportId, setReportId] = useState<string | null>(null)
  const [notes, setNotes] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [formattedReport, setFormattedReport] = useState("")
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([])
  const [extractingRx, setExtractingRx] = useState(false)
  const [vitalsForm, setVitalsForm] = useState<VitalsForm>(EMPTY_VITALS)
  const [extractingVitals, setExtractingVitals] = useState(false)

  // Billing (Feature 14). Catalog is fixed by insurance: GKV → EBM, else GOÄ.
  const [billingCodes, setBillingCodes] = useState<SelectedCode[]>([])
  const [codeQuery, setCodeQuery] = useState("")
  const [codeResults, setCodeResults] = useState<CodeSuggestion[]>([])
  const [searchingCodes, setSearchingCodes] = useState(false)

  const [generatingReport, setGeneratingReport] = useState(false)
  const [suggestingCodes, setSuggestingCodes] = useState(false)
  // AI history briefing per appointment (persisted like the AI conversations),
  // so it survives leaving/returning to the workspace until the consultation is
  // completed — the doctor only regenerates it on demand.
  const [historySummaries, setHistorySummaries] = useState<Record<string, string>>({})
  const [summarizingHistory, setSummarizingHistory] = useState(false)
  // On wide screens, cap the consultation pane to the sidebar's height so long
  // tabs scroll inside it instead of growing the card and pushing cards below.
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [paneH, setPaneH] = useState<number | undefined>(undefined)

  // Real-time safety alerts (allergies / contraindications / interactions).
  const [safetyAlerts, setSafetyAlerts] = useState<SafetyAlert[]>([])
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())

  // Decision-support conversations kept per appointment so they survive closing
  // the dialog and remain available for the whole consultation.
  const [dsConversations, setDsConversations] = useState<Record<string, DsMessage[]>>({})
  // Doctor records-Q&A conversations, kept per appointment (Feature 17).
  const [recordsConversations, setRecordsConversations] = useState<Record<string, RecordsQAMessage[]>>({})

  // Profile-update proposals scanned from the just-confirmed consultation.
  const [profileSuggestions, setProfileSuggestions] = useState<ProfileUpdateSuggestion[]>([])
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set())
  const [proposalDialogOpen, setProposalDialogOpen] = useState(false)
  const [proposalPatientId, setProposalPatientId] = useState<string | null>(null)
  const [proposalApptId, setProposalApptId] = useState<string | null>(null)
  const [reportPreview, setReportPreview] = useState(false)
  const [detailCode, setDetailCode] = useState<SelectedCode | null>(null)

  const current = queue[currentIndex]
  const billingCatalog: "EBM" | "GOAE" = current?.insuranceType === "gkv" ? "EBM" : "GOAE"

  // Patient context handed to decision support, and the alerts not yet dismissed.
  const patientContext = {
    ageYears: current?.birthDate ? ageFromDob(current.birthDate) : null,
    allergies: current?.allergies ?? [],
    conditions: current?.conditions ?? [],
    medications: (current?.medications ?? []).map((m) => `${m.name} ${m.dosage}`.trim()),
    vitals: current?.vitals ? formatVitalsSummary(current.vitals) : null,
    history: current?.history?.length
      ? current.history
          .slice(0, 6)
          .map((h) => `${new Date(h.date).toLocaleDateString("de-DE")} (${h.status}): ${h.diagnosis || h.reason || "—"}`)
          .join("; ")
      : null,
  }
  const visibleAlerts = safetyAlerts.filter((a) => !dismissedAlerts.has(a.message))

  // The current appointment's decision-support conversation (controlled state).
  const dsMessages = current ? dsConversations[current.appointmentId] ?? [] : []
  const setDsMessages = (updater: (prev: DsMessage[]) => DsMessage[]) => {
    if (!current) return
    setDsConversations((prev) => ({ ...prev, [current.appointmentId]: updater(prev[current.appointmentId] ?? []) }))
  }
  const recordsMessages = current ? recordsConversations[current.appointmentId] ?? [] : []
  const setRecordsMessages = (updater: (prev: RecordsQAMessage[]) => RecordsQAMessage[]) => {
    if (!current) return
    setRecordsConversations((prev) => ({ ...prev, [current.appointmentId]: updater(prev[current.appointmentId] ?? []) }))
  }
  // The current appointment's AI history briefing (null until generated).
  const historySummary = current ? historySummaries[current.appointmentId] ?? null : null
  const setHistorySummary = (value: string | null) => {
    if (!current) return
    setHistorySummaries((prev) => {
      const next = { ...prev }
      if (value == null) delete next[current.appointmentId]
      else next[current.appointmentId] = value
      return next
    })
  }

  // Load the displayed appointment's consultation. Loads only when the shown
  // appointment changes (patient switch / first mount) — a server refresh
  // (router.refresh) must not clobber the doctor's in-progress edits, e.g. a
  // freshly regenerated report.
  const loadedApptId = useRef<string | null>(null)
  useEffect(() => {
    const e = queue[currentIndex]
    if (!e) return
    if (loadedApptId.current === e.appointmentId) return
    loadedApptId.current = e.appointmentId
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
    setSafetyAlerts([])
    setDismissedAlerts(new Set())
  }, [queue, currentIndex])

  // Persist the AI conversations (decision support + records Q&A) per appointment
  // so they survive leaving/refreshing the workspace — until the consultation is
  // completed (which clears that appointment's threads).
  const DS_KEY = "pms.workspace.ds"
  const RECORDS_KEY = "pms.workspace.records"
  const HISTORY_KEY = "pms.workspace.history"
  const convHydrated = useRef(false)
  useEffect(() => {
    try {
      const ds = localStorage.getItem(DS_KEY)
      if (ds) setDsConversations(JSON.parse(ds))
      const rec = localStorage.getItem(RECORDS_KEY)
      if (rec) setRecordsConversations(JSON.parse(rec))
      const hist = localStorage.getItem(HISTORY_KEY)
      if (hist) setHistorySummaries(JSON.parse(hist))
    } catch { /* ignore corrupt/unavailable storage */ }
    // Enable saving only AFTER this mount's effects settle, so the save effects
    // (which run with stale empty state) can't overwrite the just-loaded data.
    const id = setTimeout(() => { convHydrated.current = true }, 0)
    return () => clearTimeout(id)
  }, [])
  useEffect(() => {
    if (!convHydrated.current) return
    try { localStorage.setItem(DS_KEY, JSON.stringify(dsConversations)) } catch { /* ignore */ }
  }, [dsConversations])
  useEffect(() => {
    if (!convHydrated.current) return
    try { localStorage.setItem(RECORDS_KEY, JSON.stringify(recordsConversations)) } catch { /* ignore */ }
  }, [recordsConversations])
  useEffect(() => {
    if (!convHydrated.current) return
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(historySummaries)) } catch { /* ignore */ }
  }, [historySummaries])

  // Real-time safety check: when the prescriptions or working diagnosis change,
  // review them against the patient's allergies/conditions/medication (debounced).
  useEffect(() => {
    const e = queue[currentIndex]
    if (!e) return
    const rx = prescriptions.filter((p) => p.medication.trim())
    if (rx.length === 0 && !diagnosis.trim()) { setSafetyAlerts([]); return }
    const t = setTimeout(async () => {
      const r = await checkPrescriptionSafety({
        allergies: e.allergies,
        conditions: e.conditions,
        currentMedications: e.medications.map((m) => `${m.name} ${m.dosage}`.trim()),
        prescriptions: rx,
        diagnosis,
      })
      if (r.status === "ok") setSafetyAlerts(r.data.alerts)
    }, 1200)
    return () => clearTimeout(t)
  }, [prescriptions, diagnosis, queue, currentIndex])

  // Measure the sidebar (Vitals + Medical History) and mirror its height onto
  // the consultation pane on ≥2xl. Re-measures on content/viewport changes.
  useEffect(() => {
    const inner = sidebarRef.current
    if (!inner) return
    const mq = window.matchMedia("(min-width: 1536px)")
    const update = () => setPaneH(mq.matches ? inner.offsetHeight : undefined)
    const ro = new ResizeObserver(update)
    ro.observe(inner)
    mq.addEventListener("change", update)
    update()
    return () => { ro.disconnect(); mq.removeEventListener("change", update) }
  }, [queue, currentIndex])

  async function handleSummarizeHistory() {
    if (!current) return
    setSummarizingHistory(true)
    const result = await summarizePatientHistory({
      conditions: current.conditions,
      allergies: current.allergies,
      medications: current.medications.map((m) => `${m.name} ${m.dosage}`.trim()),
      vitals: vitalsFormSummary(vitalsForm) ?? formatVitalsSummary(current.vitals),
      visits: current.history.map((h) => ({ date: h.date, reason: h.reason, status: h.status, diagnosis: h.diagnosis })),
      lang: locale,
    })
    setSummarizingHistory(false)
    if (result.status === "ok") setHistorySummary(result.data.summary)
    else toast.error(result.message)
  }

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
      toast.error(t("workspace.saveNotesFirst"))
      return
    }
    setIsSaving(true)
    const rid = await ensureReport("draft")
    if (!rid) { setIsSaving(false); return }
    await saveCodes(rid)
    await saveVitals()
    setIsSaving(false)
    toast.success(t("workspace.draftSaved"))
    router.refresh()
  }

  async function handleComplete() {
    if (!current) return
    if (!diagnosis.trim()) {
      toast.error(t("workspace.diagnosisRequired"))
      return
    }
    if (billingCodes.length === 0) {
      toast.error(t("workspace.billingCodeRequired"))
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
    // The consultation is confirmed — discard its AI conversations and briefing.
    const finishedId = current.appointmentId
    setDsConversations((prev) => {
      const next = { ...prev }
      delete next[finishedId]
      return next
    })
    setRecordsConversations((prev) => {
      const next = { ...prev }
      delete next[finishedId]
      return next
    })
    setHistorySummaries((prev) => {
      const next = { ...prev }
      delete next[finishedId]
      return next
    })

    // Feature 10: scan the confirmed consultation for profile data that should
    // be updated, and let the doctor confirm what to send to the patient.
    const scanText = [notes, diagnosis.trim() ? `Diagnosis: ${diagnosis.trim()}` : ""].filter(Boolean).join("\n")
    const scan = await suggestProfileUpdates({
      reportText: formattedReport || undefined,
      notes: scanText || undefined,
      current: {
        phone: current.phone, email: current.email,
        street: current.street, city: current.city, postal_code: current.postalCode, country: current.country,
        allergies: current.allergies, conditions: current.conditions,
      },
    })
    setIsSaving(false)
    // Temporary diagnostic: shows exactly what the profile scan returned.
    if (process.env.NODE_ENV !== "production") {
      const dbg = scan.status === "ok"
        ? `scan ok — ${scan.data.suggestions.length} update(s): ${scan.data.suggestions.map((s) => `${s.field}/${s.operation}`).join(", ") || "none"}`
        : `scan error — ${scan.message}`
      toast(dbg, { duration: 10000 })
    }
    toast.success(t("workspace.consultationCompleted"))
    if (scan.status === "ok" && scan.data.suggestions.length > 0) {
      // Show the review dialog first. Advancing the queue (which drops this
      // completed consultation) is deferred until the dialog closes, otherwise
      // the refresh would tear the dialog down the moment it opens.
      setProfileSuggestions(scan.data.suggestions)
      setSelectedSuggestions(new Set(scan.data.suggestions.map((_, i) => i)))
      setProposalPatientId(current.patientId)
      setProposalApptId(finishedId)
      setProposalDialogOpen(true)
    } else {
      // Give explicit feedback so "no dialog" is never ambiguous: an error on a
      // genuine failure, otherwise a note that the scan ran and found nothing.
      if (scan.status !== "ok") toast.error(scan.message)
      else toast.info(t("workspace.noProfileUpdates"))
      setCurrentIndex(0)
      router.refresh()
    }
  }

  /** Close the review dialog and advance the workspace to the next consultation. */
  function closeProposalDialog() {
    setProposalDialogOpen(false)
    setCurrentIndex(0)
    router.refresh()
  }

  async function confirmProfileProposals() {
    if (!proposalPatientId) { closeProposalDialog(); return }
    const chosen = profileSuggestions.filter((_, i) => selectedSuggestions.has(i))
    if (chosen.length === 0) { closeProposalDialog(); return }
    const r = await createProfileProposals(proposalPatientId, proposalApptId, chosen)
    if (r.status === "ok") {
      const { applied, sentToPatient } = r.data
      if (applied > 0 && sentToPatient > 0) {
        toast.success(t("workspace.changesAppliedAndSent", { applied, sent: sentToPatient }))
      } else if (applied > 0) {
        toast.success(t("workspace.clinicalApplied", { count: applied }))
      } else if (sentToPatient > 0) {
        toast.success(t("workspace.changesSent", { count: sentToPatient }))
      }
    } else {
      toast.error(r.message)
    }
    closeProposalDialog()
  }

  /** Generate a structured report from the notes (Feature 9, AI). */
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
        vitals: vitalsFormSummary(vitalsForm),
      },
      lang: reportLang,
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
    toast.success(t("workspace.reportGenerated"))
  }

  /** Ask the model for billing codes, grounded in the real catalog (Feature 14). */
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
    toast.success(toAdd.length ? t("workspace.codesSuggested", { count: toAdd.length }) : t("workspace.noNewCodes"))
  }

  // Live search: as the doctor types, fetch matching catalog codes (debounced,
  // with a guard so a slow earlier request can't overwrite a newer one).
  useEffect(() => {
    const q = codeQuery.trim()
    if (q.length < 2) { setCodeResults([]); setSearchingCodes(false); return }
    let active = true
    setSearchingCodes(true)
    const timer = setTimeout(async () => {
      const result = await searchBillingCodes(billingCatalog, q)
      if (!active) return
      setSearchingCodes(false)
      if (result.status === "ok") setCodeResults(result.data)
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [codeQuery, billingCatalog])

  /** Add a code by its exact number (manual entry), validated against the catalog. */
  async function addExactCode() {
    const code = codeQuery.trim()
    if (!code) return
    setSearchingCodes(true)
    const result = await searchBillingCodes(billingCatalog, code)
    setSearchingCodes(false)
    if (result.status !== "ok") { toast.error(result.message); return }
    const exact = result.data.find((r) => r.code.toLowerCase() === code.toLowerCase())
    if (!exact) { toast.error(t("workspace.codeNotFound", { code, catalog: billingCatalog })); return }
    addCode(exact)
    setCodeQuery("")
    setCodeResults([])
    toast.success(t("workspace.codeAdded", { code: exact.code }))
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
    toast.success(t("workspace.vitalsSaved"))
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
    toast.success(t("workspace.vitalsExtractedSaved"))
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
    toast.success(toAdd.length ? t("workspace.medicationsExtracted", { count: toAdd.length }) : t("workspace.noNewMedications"))
  }

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(INTL_LOCALE[locale], { hour: "2-digit", minute: "2-digit" })

  function calculateAge(birthDate: string | null) {
    if (!birthDate) return null
    const birth = new Date(birthDate)
    const now = new Date()
    let age = now.getFullYear() - birth.getFullYear()
    const m = now.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
    return age
  }

  // The profile-review dialog is rendered independently of `current`: completing
  // a consultation revalidates the workspace, so the finished appointment drops
  // out of the queue and `current` may become undefined. Rendering the dialog in
  // both the empty state and the main view keeps it open while the doctor reviews.
  const profileDialog = (
    <Dialog open={proposalDialogOpen} onOpenChange={(o) => { if (!o) closeProposalDialog() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> {t("workspace.suggestedProfileUpdates")}
          </DialogTitle>
          <DialogDescription>
            {t("workspace.profileUpdatesDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {profileSuggestions.map((s, i) => {
            const on = selectedSuggestions.has(i)
            const isClinical = s.field === "allergy" || s.field === "condition"
            const isRemoval = s.operation === "remove"
            return (
              <button
                key={i}
                type="button"
                onClick={() =>
                  setSelectedSuggestions((prev) => {
                    const n = new Set(prev)
                    if (n.has(i)) n.delete(i)
                    else n.add(i)
                    return n
                  })
                }
                className={`w-full text-left flex items-start gap-3 rounded-lg border p-3 transition-colors ${on ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"}`}
              >
                <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground"}`}>
                  {on && <Check className="w-3 h-3" />}
                </span>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[10px] font-medium uppercase tracking-wide rounded px-1.5 py-0.5 ${isClinical ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {isClinical ? t("workspace.appliesNow") : t("workspace.patientConfirms")}
                    </span>
                    {isRemoval && (
                      <span className="text-[10px] font-medium uppercase tracking-wide rounded px-1.5 py-0.5 bg-destructive/10 text-destructive">
                        {t("workspace.removeBadge")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium">
                    {s.label}: <span className={isRemoval ? "line-through text-muted-foreground" : "text-primary"}>{s.proposedValue}</span>
                  </p>
                  {s.currentValue && !isRemoval && <p className="text-xs text-muted-foreground">{t("workspace.currentLabel", { value: s.currentValue })}</p>}
                  {s.reason && <p className="text-xs text-muted-foreground italic">{s.reason}</p>}
                </div>
              </button>
            )
          })}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={closeProposalDialog}>{t("workspace.skip")}</Button>
          <Button onClick={confirmProfileProposals} disabled={selectedSuggestions.size === 0}>
            {t("workspace.confirmChanges")}{selectedSuggestions.size > 0 ? ` (${selectedSuggestions.size})` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )

  if (!current) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-2xl mx-auto text-center py-20">
          <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-muted flex items-center justify-center">
            <Stethoscope className="w-12 h-12 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">{t("workspace.emptyTitle")}</h1>
          <p className="text-muted-foreground mb-6">
            {t("workspace.emptyBody")}
          </p>
          <Link href="/doctor/dashboard">
            <Button className="gap-2">{t("workspace.viewDashboard")} <ArrowRight className="w-4 h-4" /></Button>
          </Link>
        </div>
        {profileDialog}
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
            {t("workspace.patientQueue")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("workspace.patientsRemaining", { count: queue.length })}</p>
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
                        {(entry.status === "waiting" || entry.status === "in_progress") && (
                          <Badge variant="secondary" className={`text-xs h-5 ${isActive ? "bg-primary-foreground/20 text-primary-foreground" : entry.status === "in_progress" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>
                            {entry.status === "in_progress" ? t("workspace.withDoctor") : t("workspace.waitingLabel")}
                          </Badge>
                        )}
                        {entry.existingReport?.status === "draft" && (
                          <Badge variant="outline" className={`text-xs h-5 ${isActive ? "border-primary-foreground/40 text-primary-foreground" : ""}`}>
                            {t("workspace.draftBadge")}
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
                    {current.status === "in_progress" ? t("workspace.withDoctor") : t("workspace.waitingLabel")}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-muted-foreground">
                  {age !== null && <><span>{t("workspace.yearsOld", { age })}</span><span>•</span></>}
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
            <div className="w-full 2xl:w-96 2xl:flex-shrink-0">
              <div ref={sidebarRef} className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="w-4 h-4 text-primary" />
                      {t("workspace.vitals")}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={handleExtractVitals} disabled={extractingVitals || isSaving}>
                        <Sparkles className="w-3.5 h-3.5" />
                        {extractingVitals ? "…" : t("workspace.extract")}
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={handleSaveVitals} disabled={isSaving || extractingVitals}>
                        <Save className="w-3.5 h-3.5" />
                        {t("common.save")}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <VitalInput icon={<Activity className="w-3.5 h-3.5" />} label={t("workspace.systolic")} unit="mmHg" value={vitalsForm.systolic} onChange={(v) => setVital("systolic", v)} />
                    <VitalInput icon={<Activity className="w-3.5 h-3.5" />} label={t("workspace.diastolic")} unit="mmHg" value={vitalsForm.diastolic} onChange={(v) => setVital("diastolic", v)} />
                    <VitalInput icon={<Heart className="w-3.5 h-3.5" />} label={t("workspace.heartRate")} unit="bpm" value={vitalsForm.heart_rate} onChange={(v) => setVital("heart_rate", v)} />
                    <VitalInput icon={<Thermometer className="w-3.5 h-3.5" />} label={t("workspace.temp")} unit="°C" value={vitalsForm.temperature_c} onChange={(v) => setVital("temperature_c", v)} />
                    <VitalInput icon={<User className="w-3.5 h-3.5" />} label={t("workspace.weight")} unit="kg" value={vitalsForm.weight_kg} onChange={(v) => setVital("weight_kg", v)} />
                    <VitalInput icon={<User className="w-3.5 h-3.5" />} label={t("workspace.height")} unit="cm" value={vitalsForm.height_cm} onChange={(v) => setVital("height_cm", v)} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    {t("workspace.vitalsNote")}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <History className="w-4 h-4 text-primary" />
                    {t("workspace.medicalHistory")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {current.conditions.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">{t("workspace.chronicConditions")}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {current.conditions.map((c, i) => <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>)}
                      </div>
                    </div>
                  )}
                  {current.medications.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5">{t("workspace.currentMedications")}</p>
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
                      <p className="text-xs text-muted-foreground mb-1.5">{t("workspace.recentReports")}</p>
                      <div className="space-y-1.5">
                        {current.recentReports.map((report) => (
                          <div key={report.id} className="flex items-center gap-2 text-sm">
                            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="truncate">{report.diagnosis ?? t("workspace.reportFallback")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {current.conditions.length === 0 && current.medications.length === 0 && current.recentReports.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("workspace.noHistoricalData")}</p>
                  )}
                </CardContent>
              </Card>

              {/* Documents — attach imaging/lab files to this visit, or open earlier ones. */}
              <PatientDocuments
                patientId={current.patientId}
                documents={current.documents}
                canUpload
                viewerRole="doctor"
                currentUserId={doctorId}
                appointmentId={current.appointmentId}
                compact
              />
              </div>
            </div>

            {/* Right - Consultation */}
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              {/* Voice transcript for the current consultation; inserted into notes. */}
              {recording.result?.appointmentId === current.appointmentId && (
                <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 p-3">
                  <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-800 dark:text-emerald-300 flex-1 min-w-0">{t("workspace.voiceTranscriptReady")}</p>
                  <Button
                    size="sm"
                    onClick={() => {
                      const transcript = recording.consumeResult()
                      if (transcript) { setNotes((prev) => (prev?.trim() ? prev.trimEnd() + "\n\n" : "") + transcript); toast.success(t("workspace.transcriptAdded")) }
                    }}
                  >
                    {t("workspace.insertIntoNotes")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => recording.discard()}>{t("workspace.dismiss")}</Button>
                </div>
              )}
              <Card className="flex flex-col flex-1 min-h-0" style={paneH ? { maxHeight: paneH } : undefined}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="flex items-center gap-2">
                      <ClipboardList className="w-5 h-5 text-primary" />
                      {t("workspace.consultation")}
                      {reportId && <Badge variant="secondary" className="text-xs">{t("workspace.draftSavedBadge")}</Badge>}
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex rounded-md border border-border overflow-hidden text-xs" title={t("workspace.recognitionLanguage")}>
                        {(["de-DE", "en-US"] as const).map((l) => (
                          <button
                            key={l} type="button"
                            onClick={() => recording.setLang(l)}
                            disabled={recording.status === "recording" || recording.status === "processing"}
                            className={`px-2 py-1 transition-colors disabled:opacity-50 ${recording.lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
                          >
                            {l === "de-DE" ? "DE" : "EN"}
                          </button>
                        ))}
                      </div>
                      <Button
                        variant="outline" size="sm"
                        onClick={() => recording.start({ appointmentId: current.appointmentId, patientName: current.patientName })}
                        disabled={recording.status === "recording" || recording.status === "processing"}
                        className="gap-2"
                      >
                        <Mic className="w-4 h-4" />
                        {recording.status === "recording" ? t("workspace.recording") : recording.status === "processing" ? t("workspace.transcribing") : t("workspace.record")}
                      </Button>
                      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2">
                            <Sparkles className="w-4 h-4" />
                            {t("workspace.aiAssist")}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-2xl">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <Sparkles className="w-5 h-5 text-primary" /> {t("workspace.decisionSupport")}
                            </DialogTitle>
                            <DialogDescription>
                              {t("workspace.decisionSupportDesc")}
                            </DialogDescription>
                          </DialogHeader>
                          <DecisionSupport
                            notes={notes}
                            diagnosis={diagnosis}
                            patient={patientContext}
                            messages={dsMessages}
                            setMessages={setDsMessages}
                            lang={locale}
                          />
                        </DialogContent>
                      </Dialog>
                      <Dialog open={recordsOpen} onOpenChange={setRecordsOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2">
                            <FileSearch className="w-4 h-4" />
                            {t("workspace.askRecords")}
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-2xl">
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <FileSearch className="w-5 h-5 text-primary" /> {t("workspace.askPatientRecords")}
                            </DialogTitle>
                            <DialogDescription>
                              {t("workspace.askRecordsDesc", { name: current.patientName })}
                            </DialogDescription>
                          </DialogHeader>
                          <RecordsQA
                            patientId={current.patientId}
                            patientName={current.patientName}
                            messages={recordsMessages}
                            setMessages={setRecordsMessages}
                            lang={locale}
                          />
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </CardHeader>
                {visibleAlerts.length > 0 && (
                  <div className="px-6 pb-2 space-y-2 shrink-0">
                    {visibleAlerts.map((a, i) => {
                      const tone =
                        a.severity === "high"
                          ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                          : a.severity === "medium"
                          ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
                          : "border-border bg-muted text-foreground"
                      return (
                        <div key={i} className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${tone}`}>
                          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium capitalize">
                              {t("workspace.alertLabel", { category: t(`safety.cat_${a.category}` as TKey) })}{a.medication ? ` · ${a.medication}` : ""}
                            </p>
                            <p className="opacity-90">{a.message}</p>
                          </div>
                          <button
                            onClick={() => setDismissedAlerts((s) => new Set(s).add(a.message))}
                            className="shrink-0 opacity-70 hover:opacity-100"
                            title={t("workspace.dismissOverride")}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <CardContent className="flex-1 min-h-0 flex flex-col">
                  <Tabs defaultValue="notes" className="flex-1 min-h-0 flex flex-col">
                    <TabsList className="grid w-full grid-cols-5 shrink-0">
                      <TabsTrigger value="notes" className="text-xs sm:text-sm px-1 sm:px-3">{t("workspace.tabNotes")}</TabsTrigger>
                      <TabsTrigger value="diagnosis" className="text-xs sm:text-sm px-1 sm:px-3">
                        <span className="sm:hidden">{t("workspace.tabDiagShort")}</span><span className="hidden sm:inline">{t("workspace.tabDiagnosis")}</span>
                      </TabsTrigger>
                      <TabsTrigger value="report" className="text-xs sm:text-sm px-1 sm:px-3">
                        <span className="sm:hidden">{t("workspace.tabReportShort")}</span><span className="hidden sm:inline">{t("workspace.tabAiReport")}</span>
                      </TabsTrigger>
                      <TabsTrigger value="prescription" className="text-xs sm:text-sm px-1 sm:px-3">
                        <span className="sm:hidden">{t("workspace.tabMedsShort")}</span><span className="hidden sm:inline">{t("workspace.tabPrescription")}</span>
                      </TabsTrigger>
                      <TabsTrigger value="billing" className="text-xs sm:text-sm px-1 sm:px-3">{t("workspace.tabBilling")}</TabsTrigger>
                    </TabsList>

                    {/* Single bounded scroll viewport: long content in any tab
                        scrolls here instead of growing the card. */}
                    <div className="flex-1 min-h-0 overflow-y-auto mt-4 pr-1">
                    <TabsContent value="notes" className="mt-0 h-full flex flex-col">
                      <Label htmlFor="notes">{t("workspace.consultationNotes")}</Label>
                      <Textarea
                        id="notes"
                        placeholder={t("workspace.notesPlaceholder")}
                        className="mt-1.5 flex-1 min-h-[200px] resize-none field-sizing-fixed"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </TabsContent>

                    <TabsContent value="diagnosis" className="mt-0 h-full flex flex-col">
                      <Label htmlFor="diagnosis">{t("workspace.diagnosisLabel")}</Label>
                      <Textarea
                        id="diagnosis"
                        placeholder={t("workspace.diagnosisPlaceholder")}
                        className="mt-1.5 flex-1 min-h-[200px] resize-none field-sizing-fixed"
                        value={diagnosis}
                        onChange={(e) => setDiagnosis(e.target.value)}
                      />
                    </TabsContent>

                    <TabsContent value="report" className="mt-0 h-full flex flex-col">
                      <div className="flex-1 min-h-0 flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <Label>{t("workspace.aiGeneratedReport")}</Label>
                          <div className="flex items-center gap-2">
                            {formattedReport && (
                              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setReportPreview(!reportPreview)}>
                                {reportPreview ? <Pencil className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                {reportPreview ? t("workspace.edit") : t("workspace.preview")}
                              </Button>
                            )}
                            {/* Language the report is written in — independent of the spoken language. */}
                            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="hidden sm:inline">{t("workspace.reportLanguage")}</span>
                              <div className="inline-flex rounded-full bg-muted/60 p-0.5">
                                {(["de", "en"] as const).map((l) => (
                                  <button
                                    key={l} type="button"
                                    onClick={() => setReportLang(l)}
                                    className={`rounded-full px-2 py-0.5 uppercase font-medium transition-colors ${reportLang === l ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"}`}
                                  >
                                    {l}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <Button variant="outline" size="sm" className="gap-2" onClick={handleGenerateReport} disabled={generatingReport}>
                              <Sparkles className="w-4 h-4" />
                              {generatingReport ? t("workspace.generating") : t("workspace.generateFromNotes")}
                            </Button>
                          </div>
                        </div>
                        {reportPreview && formattedReport ? (
                          <div className="flex-1 min-h-0 rounded-md border border-border p-4 overflow-auto bg-card">
                            <ReportContent text={formattedReport} />
                          </div>
                        ) : (
                          <Textarea
                            placeholder={t("workspace.reportPlaceholder")}
                            className="flex-1 min-h-[200px] text-sm resize-none field-sizing-fixed"
                            value={formattedReport}
                            onChange={(e) => setFormattedReport(e.target.value)}
                          />
                        )}
                        <p className="text-xs text-muted-foreground">
                          {t("workspace.reportDraftHintA")} <strong>{t("workspace.preview")}</strong> {t("workspace.reportDraftHintB")}
                        </p>
                      </div>
                    </TabsContent>

                    <TabsContent value="prescription" className="mt-0">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label>{t("workspace.prescriptions")}</Label>
                          <Button variant="outline" size="sm" className="gap-2" onClick={handleExtractPrescriptions} disabled={extractingRx}>
                            <Sparkles className="w-4 h-4" />
                            {extractingRx ? t("workspace.extracting") : t("workspace.extractFromNotes")}
                          </Button>
                        </div>

                        {prescriptions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            {t("workspace.noMedicationsYet")}
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {prescriptions.map((rx, index) => (
                              <div key={index} className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-end p-3 rounded-lg border border-border">
                                <div>
                                  <Label className="text-xs text-muted-foreground">{t("workspace.medication")}</Label>
                                  <Input className="mt-1" placeholder={t("workspace.medicationPlaceholder")} value={rx.medication}
                                    onChange={(e) => updatePrescription(index, "medication", e.target.value)} />
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">{t("workspace.dosage")}</Label>
                                  <Input className="mt-1" placeholder={t("workspace.dosagePlaceholder")} value={rx.dosage}
                                    onChange={(e) => updatePrescription(index, "dosage", e.target.value)} />
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">{t("workspace.frequency")}</Label>
                                  <Input className="mt-1" placeholder={t("workspace.frequencyPlaceholder")} value={rx.frequency}
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
                          <Plus className="w-4 h-4" /> {t("workspace.addMedication")}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          {t("workspace.prescriptionsNote")}
                        </p>
                      </div>
                    </TabsContent>

                    <TabsContent value="billing" className="mt-0">
                      <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-muted/50 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{t("workspace.insurance")}</span>
                            <Badge>{insuranceLabel(current.insuranceType)}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {billingCatalog === "EBM" ? t("workspace.ebmHint") : t("workspace.goaeHint")}
                          </span>
                        </div>

                        <Button variant="outline" className="w-full gap-2" onClick={handleSuggestCodes} disabled={suggestingCodes}>
                          <Sparkles className="w-4 h-4" />
                          {suggestingCodes ? t("workspace.suggesting") : t("workspace.suggestCodesAi")}
                        </Button>

                        {/* Add codes manually — results appear while typing;
                            click a result, or type an exact code and press Add. */}
                        <div className="flex gap-2">
                          <Input
                            placeholder={t("workspace.codeSearchPlaceholder", { catalog: billingCatalog })}
                            value={codeQuery}
                            onChange={(e) => setCodeQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExactCode() } }}
                          />
                          <Button variant="outline" className="gap-1" onClick={addExactCode} disabled={searchingCodes || codeQuery.trim().length < 2}>
                            <Plus className="w-4 h-4" /> {t("workspace.add")}
                          </Button>
                        </div>

                        {codeResults.length > 0 && (
                          <div className="border border-border rounded-lg max-h-44 overflow-auto divide-y divide-border">
                            <p className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/40">
                              {searchingCodes ? t("workspace.searching") : t("workspace.clickResultToAdd")}
                            </p>
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
                            <Label className="text-xs text-muted-foreground">{t("workspace.attachedCodes", { count: billingCodes.length })}</Label>
                            {billingCodes.length > 0 && (
                              <Button variant="ghost" size="sm" className="h-7 text-destructive gap-1" onClick={() => setBillingCodes([])}>
                                <Trash2 className="w-3.5 h-3.5" /> {t("workspace.clearAll")}
                              </Button>
                            )}
                          </div>
                          {billingCodes.length === 0 ? (
                            <p className="text-sm text-muted-foreground mt-2">{t("workspace.noCodesAdded")}</p>
                          ) : (
                            <>
                            <div className="mt-2 space-y-2">
                              {billingCodes.map((c) => (
                                <div key={c.code} className="flex items-center gap-2 p-2 rounded-lg border border-border">
                                  <button
                                    type="button"
                                    onClick={() => setDetailCode(c)}
                                    className="flex items-center gap-2 flex-1 min-w-0 text-left hover:opacity-80"
                                    title={t("workspace.clickToViewDetails")}
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
                                {billingCatalog === "GOAE" ? t("workspace.invoiceTotal") : t("workspace.kvValue")}
                              </span>
                              <span className="text-base font-bold tabular-nums">
                                {formatCents(billingCodes.reduce((sum, c) => sum + (codePriceCents(c) ?? 0), 0))}
                              </span>
                            </div>
                            </>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            {t("workspace.codesNote")}
                          </p>
                        </div>

                        {/* Full-detail view of an attached code */}
                        <Dialog open={detailCode !== null} onOpenChange={(o) => !o && setDetailCode(null)}>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle className="font-mono">{detailCode?.code}</DialogTitle>
                              <DialogDescription>
                                {detailCode?.catalog === "EBM" ? t("workspace.ebmDetail") : t("workspace.goaeDetail")}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3 text-sm">
                              <p className="whitespace-pre-wrap leading-relaxed">{detailCode?.description}</p>
                              <div className="flex flex-wrap gap-4 text-muted-foreground pt-3 border-t border-border">
                                {detailCode?.points != null && <span>{t("workspace.points")} <strong className="text-foreground">{detailCode.points}</strong></span>}
                                {detailCode?.catalog === "GOAE" && detailCode.multiplier != null && (
                                  <span>{t("workspace.multiplier")} <strong className="text-foreground">×{detailCode.multiplier}</strong></span>
                                )}
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TabsContent>
                    </div>
                  </Tabs>
                </CardContent>

                {/* Action Footer */}
                <div className="p-4 border-t border-border flex flex-col sm:flex-row gap-2 sm:justify-between">
                  <Button variant="outline" className="w-full sm:w-auto gap-2" onClick={handleSaveDraft} disabled={isSaving}>
                    <Save className="w-4 h-4" />
                    {t("workspace.saveDraft")}
                  </Button>
                  <Button className="w-full sm:w-auto gap-2" onClick={handleComplete} disabled={isSaving}>
                    <CheckCircle2 className="w-4 h-4" />
                    {isSaving ? t("workspace.saving") : t("workspace.completeConsultation")}
                  </Button>
                </div>
              </Card>
            </div>
          </div>

          {/* Previous visits & AI briefing — full width below the workspace */}
          <Card className="mt-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-sm flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-primary" />
                  {t("workspace.previousVisits")}
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={handleSummarizeHistory}
                  disabled={summarizingHistory || (current.history.length === 0 && current.conditions.length === 0 && current.medications.length === 0)}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {summarizingHistory ? t("workspace.summarizing") : historySummary ? t("workspace.regenerateBriefing") : t("workspace.aiBriefing")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 min-w-0 lg:grid-cols-2 gap-5">
                {/* Visit timeline */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t("workspace.timeline")}</p>
                  {current.history.length > 0 ? (
                    <div className="space-y-2">
                      {current.history.map((h) => (
                        <div key={h.id} className="flex items-center gap-2 sm:gap-3 rounded-lg border border-border p-2.5">
                          <span className="text-xs font-medium text-foreground w-16 sm:w-20 shrink-0">{new Date(h.date).toLocaleDateString(INTL_LOCALE[locale])}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{t(`status.${h.status}` as TKey)}</Badge>
                          <span className="text-sm text-muted-foreground truncate flex-1 min-w-0">{h.diagnosis || h.reason || "—"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("workspace.noPreviousAppointments")}</p>
                  )}
                </div>

                {/* AI briefing */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-primary" /> {t("workspace.aiBriefing")}
                  </p>
                  {historySummary ? (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-relaxed [&_p]:my-1.5 [&_ul]:my-1.5 [&_li]:my-0.5 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-2">
                      <ReportContent text={historySummary} />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border p-6 h-full min-h-[8rem] flex flex-col items-center justify-center text-center gap-2">
                      <Sparkles className="w-5 h-5 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{t("workspace.briefingEmpty")}</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Feature 10 — doctor confirms which AI-detected profile changes to send. */}
      {profileDialog}
    </div>
  )
}

function ageFromDob(dob: string): number {
  const b = new Date(dob)
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--
  return a
}

/** Compact string from the consultation's editable vitals form (for AI context). */
function vitalsFormSummary(v: VitalsForm): string | null {
  const p: string[] = []
  if (v.systolic && v.diastolic) p.push(`RR ${v.systolic}/${v.diastolic} mmHg`)
  if (v.heart_rate) p.push(`HF ${v.heart_rate}/min`)
  if (v.temperature_c) p.push(`Temp ${v.temperature_c} °C`)
  if (v.weight_kg) p.push(`${v.weight_kg} kg`)
  if (v.height_cm) p.push(`${v.height_cm} cm`)
  return p.length ? p.join(", ") : null
}

function formatVitalsSummary(v: QueueEntry["vitals"]): string | null {
  if (!v) return null
  const parts: string[] = []
  if (v.systolic != null && v.diastolic != null) parts.push(`BP ${v.systolic}/${v.diastolic} mmHg`)
  if (v.heart_rate != null) parts.push(`HR ${v.heart_rate} bpm`)
  if (v.temperature_c != null) parts.push(`${v.temperature_c} °C`)
  if (v.weight_kg != null) parts.push(`${v.weight_kg} kg`)
  return parts.length ? parts.join(", ") : null
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
