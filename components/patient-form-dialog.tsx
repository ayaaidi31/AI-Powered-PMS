"use client"

/**
 * Shared create/edit dialog for a patient record. Used by the receptionist
 * patient list and the patient detail page so both drive the same validated
 * form. A null `patient` opens the dialog in registration mode; a row opens it
 * in edit mode.
 */
import { useState, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { registerPatient, updatePatient, type PatientInput } from "@/lib/actions/patients"
import type { PatientRow } from "@/lib/seed-data"
import { insurerSuggestions } from "@/lib/insurers"
import { useT } from "@/lib/i18n/locale-context"

const EMPTY_FORM: PatientInput = {
  first_name: "", last_name: "", birth_date: "", insurance_type: "gkv",
  email: "", phone: "", versicherten_id: "", insurer_name: "", insurer_ik: "",
  guardian_name: "", guardian_contact: "",
  street: "", city: "", postal_code: "", country: "Germany",
}

function fromRow(p: PatientRow): PatientInput {
  return {
    first_name: p.first_name, last_name: p.last_name, birth_date: String(p.birth_date).slice(0, 10),
    insurance_type: p.insurance_type, email: p.email ?? "", phone: p.phone ?? "",
    versicherten_id: p.versicherten_id ?? "", insurer_name: p.insurer_name ?? "", insurer_ik: p.insurer_ik ?? "",
    guardian_name: p.guardian_name ?? "", guardian_contact: p.guardian_contact ?? "",
    street: p.street ?? "", city: p.city ?? "", postal_code: p.postal_code ?? "",
    country: p.country ?? "Germany",
  }
}

/** Whether a YYYY-MM-DD date of birth is under 18 today. */
function isUnder18(birthDate: string): boolean {
  if (!birthDate) return false
  const dob = new Date(birthDate)
  if (Number.isNaN(dob.getTime())) return false
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const m = now.getMonth() - dob.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--
  return age < 18
}

export function PatientFormDialog({
  open, onOpenChange, patient, onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  patient: PatientRow | null
  onSaved?: () => void
}) {
  const t = useT()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<PatientInput>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Seed the form each time the dialog opens (edit → row values; create → empty).
  useEffect(() => {
    if (!open) return
    setForm(patient ? fromRow(patient) : EMPTY_FORM)
    setFieldErrors({})
  }, [open, patient])

  const set = (field: keyof PatientInput, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))
  const insurerOptions = insurerSuggestions(form.insurance_type)
  const editingMinor = isUnder18(form.birth_date ?? "")

  /** Persist the form. `allowDuplicate` re-submits past the duplicate guard. */
  function submit(allowDuplicate = false) {
    setFieldErrors({})
    startTransition(async () => {
      const result = patient
        ? await updatePatient(patient.id, form)
        : await registerPatient(form, allowDuplicate)

      if (result.status === "ok") {
        toast.success(patient ? t("receptionMgmt.patientUpdatedToast") : t("receptionMgmt.patientRegisteredToast"))
        onOpenChange(false)
        onSaved?.()
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{patient ? t("receptionMgmt.editPatient") : t("receptionMgmt.registerNewPatient")}</DialogTitle>
          <DialogDescription>
            {patient ? t("receptionMgmt.editPatientDesc") : t("receptionMgmt.registerPatientDesc")}
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
            <Field label={t("receptionMgmt.labelPhone")} error={fieldErrors.phone}>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
          </div>
          {form.insurance_type !== "selbstzahler" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("receptionMgmt.labelInsurer")} error={fieldErrors.insurer_name}>
                <Input value={form.insurer_name} onChange={(e) => set("insurer_name", e.target.value)} list="patient-form-insurer-list" />
                <datalist id="patient-form-insurer-list">
                  {insurerOptions.map((s) => <option key={s} value={s} />)}
                </datalist>
              </Field>
              {form.insurance_type === "gkv" && (
                <Field label={t("receptionMgmt.labelInsurerIk")} error={fieldErrors.insurer_ik}>
                  <Input value={form.insurer_ik} onChange={(e) => set("insurer_ik", e.target.value)} />
                </Field>
              )}
            </div>
          )}
          {form.insurance_type === "gkv" && (
            <Field label={t("receptionMgmt.labelKvnr")} error={fieldErrors.versicherten_id}>
              <Input value={form.versicherten_id} onChange={(e) => set("versicherten_id", e.target.value)} />
            </Field>
          )}
          {editingMinor && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("receptionMgmt.labelGuardianName")} error={fieldErrors.guardian_name}>
                <Input value={form.guardian_name} onChange={(e) => set("guardian_name", e.target.value)} />
              </Field>
              <Field label={t("receptionMgmt.labelGuardianContact")} error={fieldErrors.guardian_contact}>
                <Input value={form.guardian_contact} onChange={(e) => set("guardian_contact", e.target.value)} />
              </Field>
            </div>
          )}
          <Field label={t("receptionMgmt.labelStreet")}>
            <Input value={form.street} onChange={(e) => set("street", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Field label={t("receptionMgmt.labelPostalCode")} error={fieldErrors.postal_code}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>{t("common.cancel")}</Button>
          <Button onClick={() => submit()} disabled={isPending}>
            {isPending ? t("receptionMgmt.saving") : patient ? t("receptionMgmt.saveChanges") : t("receptionMgmt.registerPatient")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
