"use client"

/**
 * Interactive patient directory (Feature 5 — UC-REC-03).
 *
 * Renders the live patient list and drives the create/update/deactivate
 * operations through the Server Actions in lib/actions/patients. Search and
 * insurance filtering are performed client-side over the already-loaded list.
 *
 * After every successful mutation the component calls `router.refresh()` so the
 * parent Server Component re-queries the database and the list reflects the new
 * state without a full page reload.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Search, Filter, UserPlus, MoreHorizontal, Phone, Mail, Calendar, Shield, Pencil, Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import type { PatientRow } from "@/lib/seed-data"
import { patientName, initials, insuranceLabel, insuranceVariant } from "@/lib/display"
import { registerPatient, updatePatient, deactivatePatient, type PatientInput } from "@/lib/actions/patients"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"

const EMPTY_FORM: PatientInput = {
  first_name: "", last_name: "", birth_date: "", insurance_type: "gkv",
  email: "", phone: "", versicherten_id: "", guardian_contact: "",
  street: "", city: "", postal_code: "", country: "Germany",
}

export function PatientsClient({ initialPatients }: { initialPatients: PatientRow[] }) {
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()

  const [searchQuery, setSearchQuery] = useState("")
  const [insuranceFilter, setInsuranceFilter] = useState<string>("all")

  // Dialog + form state. `editingId` distinguishes create from update.
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PatientInput>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Deactivation confirmation.
  const [deleteTarget, setDeleteTarget] = useState<PatientRow | null>(null)

  const filtered = initialPatients.filter((p) => {
    const haystack = `${p.first_name} ${p.last_name} ${p.email ?? ""}`.toLowerCase()
    const matchesSearch = haystack.includes(searchQuery.toLowerCase())
    const matchesInsurance = insuranceFilter === "all" || p.insurance_type === insuranceFilter
    return matchesSearch && matchesInsurance
  })

  const set = (field: keyof PatientInput, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setFormOpen(true)
  }

  function openEdit(p: PatientRow) {
    setEditingId(p.id)
    setForm({
      first_name: p.first_name, last_name: p.last_name, birth_date: String(p.birth_date).slice(0, 10),
      insurance_type: p.insurance_type, email: p.email ?? "", phone: p.phone ?? "",
      versicherten_id: p.versicherten_id ?? "", guardian_contact: p.guardian_contact ?? "",
      street: p.street ?? "", city: p.city ?? "", postal_code: p.postal_code ?? "",
      country: p.country ?? "Germany",
    })
    setFieldErrors({})
    setFormOpen(true)
  }

  /** Persist the form. `allowDuplicate` re-submits past the duplicate guard. */
  function submit(allowDuplicate = false) {
    setFieldErrors({})
    startTransition(async () => {
      const result = editingId
        ? await updatePatient(editingId, form)
        : await registerPatient(form, allowDuplicate)

      if (result.status === "ok") {
        toast.success(editingId ? t("receptionMgmt.patientUpdatedToast") : t("receptionMgmt.patientRegisteredToast"))
        setFormOpen(false)
        router.refresh()
        return
      }
      if (result.status === "conflict") {
        // Duplicate patient (REQ-REC-11) — let the receptionist decide.
        toast.warning(result.message, {
          action: { label: t("receptionMgmt.createAnyway"), onClick: () => submit(true) },
        })
        return
      }
      setFieldErrors(result.fieldErrors ?? {})
      toast.error(result.message)
    })
  }

  function confirmDeactivate() {
    if (!deleteTarget) return
    startTransition(async () => {
      const result = await deactivatePatient(deleteTarget.id)
      if (result.status === "ok") {
        toast.success(t("receptionMgmt.patientDeactivatedToast"))
        router.refresh()
      } else {
        toast.error(result.message)
      }
      setDeleteTarget(null)
    })
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("receptionMgmt.patientsTitle")}</h1>
          <p className="text-muted-foreground">{t("receptionMgmt.patientsSubtitle")}</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <UserPlus className="w-4 h-4" />
          {t("receptionMgmt.registerNewPatient")}
        </Button>
      </div>

      {/* Search & Filter */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("receptionMgmt.searchPlaceholder")}
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={insuranceFilter} onValueChange={setInsuranceFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder={t("receptionMgmt.insuranceTypePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("receptionMgmt.allInsurance")}</SelectItem>
                <SelectItem value="gkv">{t("receptionMgmt.insuranceGkv")}</SelectItem>
                <SelectItem value="pkv">{t("receptionMgmt.insurancePkv")}</SelectItem>
                <SelectItem value="selbstzahler">{t("receptionMgmt.insuranceSelfPay")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Patients List */}
      <Card>
        <CardHeader>
          <CardTitle>{t("receptionMgmt.patientRecords")}</CardTitle>
          <CardDescription>
            {filtered.length === 1
              ? t("receptionMgmt.patientFound", { count: filtered.length })
              : t("receptionMgmt.patientsFound", { count: filtered.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length > 0 ? (
            <div className="space-y-4">
              {filtered.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
                >
                  <Link href={`/receptionist/patients/${patient.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {initials(patient.first_name, patient.last_name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground truncate">
                        {patientName(patient)}
                      </h3>
                      <Badge variant={insuranceVariant(patient.insurance_type)}>
                        <Shield className="w-3 h-3 mr-1" />
                        {insuranceLabel(patient.insurance_type)}
                      </Badge>
                      {!patient.is_digital_active && (
                        <Badge variant="outline" className="text-muted-foreground">{t("receptionMgmt.analog")}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {patient.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {patient.email}
                        </span>
                      )}
                      {patient.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {patient.phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {t("receptionMgmt.dob")}: {new Date(patient.birth_date).toLocaleDateString(INTL_LOCALE[locale])}
                      </span>
                    </div>
                  </div>
                  </Link>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="hidden sm:flex gap-1" onClick={() => openEdit(patient)}>
                      <Pencil className="w-4 h-4" />
                      {t("receptionMgmt.edit")}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(patient)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          {t("receptionMgmt.editProfile")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteTarget(patient)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t("receptionMgmt.deactivate")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t("receptionMgmt.noPatientsFound")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? t("receptionMgmt.editPatient") : t("receptionMgmt.registerNewPatient")}</DialogTitle>
            <DialogDescription>
              {editingId
                ? t("receptionMgmt.editPatientDesc")
                : t("receptionMgmt.registerPatientDesc")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("receptionMgmt.labelFirstName")} error={fieldErrors.first_name}>
                <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
              </Field>
              <Field label={t("receptionMgmt.labelLastName")} error={fieldErrors.last_name}>
                <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("receptionMgmt.labelBirthDate")} error={fieldErrors.birth_date}>
                <Input type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} />
              </Field>
              <Field label={t("receptionMgmt.labelInsuranceType")}>
                <Select value={form.insurance_type} onValueChange={(v) => set("insurance_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gkv">{t("receptionMgmt.insuranceGkv")}</SelectItem>
                    <SelectItem value="pkv">{t("receptionMgmt.insurancePkv")}</SelectItem>
                    <SelectItem value="selbstzahler">{t("receptionMgmt.insuranceSelfPay")}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("receptionMgmt.labelEmail")} error={fieldErrors.email}>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label={t("receptionMgmt.labelPhone")}>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
            </div>
            {form.insurance_type === "gkv" && (
              <Field label={t("receptionMgmt.labelKvnr")}>
                <Input value={form.versicherten_id} onChange={(e) => set("versicherten_id", e.target.value)} />
              </Field>
            )}
            <Field label={t("receptionMgmt.labelStreet")}>
              <Input value={form.street} onChange={(e) => set("street", e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field label={t("receptionMgmt.labelPostalCode")}>
                <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
              </Field>
              <Field label={t("receptionMgmt.labelCity")}>
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label={t("receptionMgmt.labelCountry")}>
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
              </Field>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={isPending}>{t("common.cancel")}</Button>
            <Button onClick={() => submit()} disabled={isPending}>
              {isPending ? t("receptionMgmt.saving") : editingId ? t("receptionMgmt.saveChanges") : t("receptionMgmt.registerPatient")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivation confirmation (soft delete) */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("receptionMgmt.deactivateDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && `${t("receptionMgmt.deactivateDescLead", { name: patientName(deleteTarget) })} `}
              {t("receptionMgmt.deactivateDescTail")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("receptionMgmt.keepActive")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivate}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("receptionMgmt.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Small labelled field wrapper with inline validation message. */
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
