"use client"

/**
 * Editable patient profile. Contact and address fields are updated through the
 * `updatePatient` Server Action; insurance details are read-only and changed by
 * reception. Clinical alerts are shown read-only for the patient's awareness.
 */
import { useState } from "react"
import { User, Mail, Phone, MapPin, Shield, AlertTriangle, Save, Edit, Activity, Heart, Thermometer } from "lucide-react"
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

interface Alerts {
  allergies: string[]
  conditions: string[]
  medications: { name: string; dosage: string; frequency: string }[]
}

const INSURANCE_LABEL: Record<PatientRow["insurance_type"], string> = {
  gkv: "Public Insurance (GKV)",
  pkv: "Private Insurance (PKV)",
  selbstzahler: "Self-Pay",
}

export function ProfileClient({ patient, vitals, alerts }: { patient: PatientRow; vitals: VitalsRow | null; alerts: Alerts }) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
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
      toast.success("Profile updated successfully")
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
            <h1 className="text-2xl font-bold text-foreground">My Profile</h1>
            <p className="text-muted-foreground">Manage your personal information</p>
          </div>
          {!isEditing ? (
            <Button onClick={() => setIsEditing(true)} variant="outline" className="gap-2">
              <Edit className="w-4 h-4" />
              Edit Profile
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving}>Cancel</Button>
              <Button onClick={handleSave} className="gap-2" disabled={isSaving}>
                <Save className="w-4 h-4" />
                {isSaving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-6">
          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><User className="w-5 h-5 text-primary" />Personal Information</CardTitle>
              <CardDescription>Your basic profile details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <p className="text-foreground py-2">{patientName(patient)}</p>
                </div>
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <p className="text-foreground py-2">
                    {new Date(patient.birth_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  {isEditing ? (
                    <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  ) : (
                    <div className="flex items-center gap-2 py-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{patient.email ?? "Not provided"}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  {isEditing ? (
                    <Input id="phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  ) : (
                    <div className="flex items-center gap-2 py-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-foreground">{patient.phone ?? "Not provided"}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Address */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MapPin className="w-5 h-5 text-primary" />Address</CardTitle>
              <CardDescription>Your residential address</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="street">Street Address</Label>
                    <Input id="street" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="postal_code">Postal Code</Label>
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
                <p className="text-muted-foreground">No address provided</p>
              )}
            </CardContent>
          </Card>

          {/* Insurance Information (read-only) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="w-5 h-5 text-primary" />Insurance Information</CardTitle>
              <CardDescription>Your health insurance details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Insurance Type</Label>
                  <div className="py-2"><Badge variant="secondary" className="text-sm">{INSURANCE_LABEL[patient.insurance_type]}</Badge></div>
                </div>
                {patient.versicherten_id && (
                  <div className="space-y-2">
                    <Label>Insurance Number</Label>
                    <p className="text-foreground py-2">{patient.versicherten_id}</p>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                To update your insurance information, please contact the clinic reception.
              </p>
            </CardContent>
          </Card>

          {/* Latest Vitals (read-only, from the most recent consultation) */}
          {vitals && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-primary" />Latest Vitals</CardTitle>
                <CardDescription>
                  From your most recent consultation · {new Date(vitals.recorded_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <VitalStat icon={<Activity className="w-4 h-4" />} label="Blood Pressure" value={vitals.systolic != null ? `${vitals.systolic}/${vitals.diastolic}` : "—"} unit="mmHg" />
                  <VitalStat icon={<Heart className="w-4 h-4" />} label="Heart Rate" value={vitals.heart_rate != null ? `${vitals.heart_rate}` : "—"} unit="bpm" />
                  <VitalStat icon={<Thermometer className="w-4 h-4" />} label="Temperature" value={vitals.temperature_c != null ? `${vitals.temperature_c}` : "—"} unit="°C" />
                  <VitalStat icon={<User className="w-4 h-4" />} label="Weight" value={vitals.weight_kg != null ? `${vitals.weight_kg}` : "—"} unit="kg" />
                  <VitalStat icon={<User className="w-4 h-4" />} label="Height" value={vitals.height_cm != null ? `${vitals.height_cm}` : "—"} unit="cm" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Medical Alerts (read-only) */}
          {(alerts.allergies.length > 0 || alerts.conditions.length > 0 || alerts.medications.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-destructive" />Medical Alerts</CardTitle>
                <CardDescription>Important medical information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {alerts.allergies.length > 0 && (
                  <div>
                    <Label className="text-destructive">Allergies</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {alerts.allergies.map((a, i) => <Badge key={i} variant="destructive">{a}</Badge>)}
                    </div>
                  </div>
                )}
                {alerts.conditions.length > 0 && (
                  <div>
                    <Label>Chronic Conditions</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {alerts.conditions.map((c, i) => <Badge key={i} variant="secondary">{c}</Badge>)}
                    </div>
                  </div>
                )}
                {alerts.medications.length > 0 && (
                  <div>
                    <Label>Current Medications</Label>
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
