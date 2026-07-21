"use client"

/**
 * Editable patient profile. Contact and address fields are updated through the
 * `updatePatient` Server Action; insurance details are read-only and changed by
 * reception. Clinical alerts are shown read-only for the patient's awareness.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { User, Mail, Phone, MapPin, Shield, AlertTriangle, Save, Edit, Activity, Heart, Thermometer, Sparkles, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import type { PatientRow, VitalsRow } from "@/lib/seed-data"
import { patientName } from "@/lib/display"
import { updatePatient } from "@/lib/actions/patients"
import { respondToProposal, type ProfileProposalRow } from "@/lib/actions/profile-proposals"
import { SecurityClient } from "@/app/security/security-client"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"

interface Alerts {
  allergies: string[]
  conditions: string[]
  medications: { name: string; dosage: string; frequency: string }[]
}

export function ProfileClient({
  patient, vitals, alerts, proposals, twoFactorEnabled,
}: {
  patient: PatientRow
  vitals: VitalsRow | null
  alerts: Alerts
  proposals: ProfileProposalRow[]
  twoFactorEnabled: boolean
}) {
  const t = useT()
  const locale = useLocale()
  const insuranceLabel: Record<PatientRow["insurance_type"], string> = {
    gkv: t("patientProfile.insuranceGkv"),
    pkv: t("patientProfile.insurancePkv"),
    selbstzahler: t("patientProfile.insuranceSelbstzahler"),
  }
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [isResponding, startRespond] = useTransition()

  function respond(id: string, accept: boolean) {
    setRespondingId(id)
    startRespond(async () => {
      const r = await respondToProposal(id, accept)
      setRespondingId(null)
      if (r.status === "ok") {
        toast.success(accept ? t("patientProfile.changeApplied") : t("patientProfile.changeDeclined"))
        router.refresh()
      } else {
        toast.error(r.message)
      }
    })
  }
  const [form, setForm] = useState({
    email: patient.email ?? "",
    phone: patient.phone ?? "",
    street: patient.street ?? "",
    city: patient.city ?? "",
    postal_code: patient.postal_code ?? "",
  })

  async function handleSave() {
    setIsSaving(true)
    const result = await updatePatient(patient.id, form, "Patient (self-service)")
    setIsSaving(false)
    if (result.status === "ok") {
      toast.success(t("patientProfile.profileUpdated"))
      setIsEditing(false)
    } else {
      toast.error(result.message)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t("patientProfile.title")}</h1>
            <p className="text-muted-foreground">{t("patientProfile.subtitle")}</p>
          </div>
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} variant="outline" className="gap-2">
              <Edit className="w-4 h-4" />
              {t("patientProfile.editProfile")}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>{t("common.cancel")}</Button>
              <Button onClick={handleSave} className="gap-2" disabled={isSaving}>
                <Save className="w-4 h-4" />
                {isSaving ? t("patientProfile.saving") : t("patientProfile.saveChanges")}
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-6">
          {/* Pending profile-update proposals from a recent consultation. */}
          {proposals.length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="w-5 h-5 text-primary" />
                  {t("patientProfile.suggestedUpdates")}
                </CardTitle>
                <CardDescription>
                  {t("patientProfile.suggestedUpdatesDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {proposals.map((p) => (
                  <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border bg-background p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {p.label}: <span className="text-primary">{p.proposed_value}</span>
                      </p>
                      {p.current_value && <p className="text-xs text-muted-foreground">{t("patientProfile.currentValue", { value: p.current_value })}</p>}
                      {p.reason && <p className="text-xs text-muted-foreground italic">{p.reason}</p>}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" className="gap-1" onClick={() => respond(p.id, true)} disabled={isResponding}>
                        <Check className="w-4 h-4" />
                        {isResponding && respondingId === p.id ? "…" : t("patientProfile.accept")}
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => respond(p.id, false)} disabled={isResponding}>
                        <X className="w-4 h-4" />
                        {t("patientProfile.decline")}
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><User className="w-5 h-5 text-primary" />{t("patientProfile.personalInfo")}</CardTitle>
              <CardDescription>{t("patientProfile.personalInfoDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("patientProfile.fullName")}</Label>
                  <p className="text-foreground py-2">{patientName(patient)}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t("patientProfile.dateOfBirth")}</Label>
                  <p className="text-foreground py-2">
                    {new Date(patient.birth_date).toLocaleDateString(INTL_LOCALE[locale], { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("patientProfile.emailAddress")}</Label>
                  {isEditing ? (
                    <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  ) : (
                    <div className="flex items-center gap-2 py-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{patient.email ?? t("patientProfile.notProvided")}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("patientProfile.phoneNumber")}</Label>
                  {isEditing ? (
                    <Input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  ) : (
                    <div className="flex items-center gap-2 py-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{patient.phone ?? t("patientProfile.notProvided")}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" />{t("patientProfile.address")}</CardTitle>
              <CardDescription>{t("patientProfile.addressDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="street">{t("patientProfile.streetAddress")}</Label>
                    <Input id="street" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="city">{t("patientProfile.city")}</Label>
                      <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="postal_code">{t("patientProfile.postalCode")}</Label>
                      <Input id="postal_code" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
                    </div>
                  </div>
                </div>
              ) : patient.street || patient.city ? (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-foreground">{patient.street}</p>
                    <p className="text-foreground">{patient.postal_code} {patient.city}</p>
                    <p className="text-muted-foreground">{patient.country}</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">{t("patientProfile.noAddress")}</p>
              )}
            </CardContent>
          </Card>

          {/* Insurance Information (read-only) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-primary" />{t("patientProfile.insuranceInfo")}</CardTitle>
              <CardDescription>{t("patientProfile.insuranceInfoDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t("patientProfile.insuranceType")}</Label>
                  <div className="py-2"><Badge variant="secondary" className="text-sm">{insuranceLabel[patient.insurance_type]}</Badge></div>
                </div>
                {patient.insurer_name && (
                  <div className="space-y-2">
                    <Label>{t("patientProfile.insuranceProvider")}</Label>
                    <p className="text-foreground py-2">{patient.insurer_name}</p>
                  </div>
                )}
                {patient.versicherten_id && (
                  <div className="space-y-2">
                    <Label>{t("patientProfile.insuranceNumber")}</Label>
                    <p className="text-foreground py-2">{patient.versicherten_id}</p>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {t("patientProfile.insuranceContact")}
              </p>
            </CardContent>
          </Card>

          {/* Latest Vitals (read-only, from the most recent consultation) */}
          {vitals && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-primary" />{t("patientProfile.latestVitals")}</CardTitle>
                <CardDescription>
                  {t("patientProfile.vitalsFrom", { date: new Date(vitals.recorded_at).toLocaleDateString(INTL_LOCALE[locale], { month: "long", day: "numeric", year: "numeric" }) })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <VitalStat icon={<Activity className="w-4 h-4" />} label={t("patientProfile.bloodPressure")} value={vitals.systolic != null ? `${vitals.systolic}/${vitals.diastolic}` : "—"} unit="mmHg" />
                  <VitalStat icon={<Heart className="w-4 h-4" />} label={t("patientProfile.heartRate")} value={vitals.heart_rate != null ? `${vitals.heart_rate}` : "—"} unit="bpm" />
                  <VitalStat icon={<Thermometer className="w-4 h-4" />} label={t("patientProfile.temperature")} value={vitals.temperature_c != null ? `${vitals.temperature_c}` : "—"} unit="°C" />
                  <VitalStat icon={<User className="w-4 h-4" />} label={t("patientProfile.weight")} value={vitals.weight_kg != null ? `${vitals.weight_kg}` : "—"} unit="kg" />
                  <VitalStat icon={<User className="w-4 h-4" />} label={t("patientProfile.height")} value={vitals.height_cm != null ? `${vitals.height_cm}` : "—"} unit="cm" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Medical Alerts (read-only) */}
          {(alerts.allergies.length > 0 || alerts.conditions.length > 0 || alerts.medications.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />{t("patientProfile.medicalAlerts")}</CardTitle>
                <CardDescription>{t("patientProfile.medicalAlertsDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {alerts.allergies.length > 0 && (
                  <div>
                    <Label className="text-destructive">{t("patientProfile.allergies")}</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {alerts.allergies.map((a, i) => <Badge key={i} variant="destructive">{a}</Badge>)}
                    </div>
                  </div>
                )}
                {alerts.conditions.length > 0 && (
                  <div>
                    <Label>{t("patientProfile.chronicConditions")}</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {alerts.conditions.map((c, i) => <Badge key={i} variant="secondary">{c}</Badge>)}
                    </div>
                  </div>
                )}
                {alerts.medications.length > 0 && (
                  <div>
                    <Label>{t("patientProfile.currentMedications")}</Label>
                    <div className="mt-2 space-y-2">
                      {alerts.medications.map((med, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-medium text-foreground">{med.name}</span>
                          <span className="text-muted-foreground"> - {med.dosage}, {med.frequency}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Account security — two-factor authentication */}
          <SecurityClient embedded enabled={twoFactorEnabled} required={false} home="/patient/dashboard" />
        </div>
      </div>
    </div>
  )
}

/** A single read-only vitals stat for the patient profile. */
function VitalStat({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: string; unit: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/50">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-lg font-semibold text-foreground">
        {value} {value !== "—" && <span className="text-xs font-normal text-muted-foreground">{unit}</span>}
      </p>
    </div>
  )
}
