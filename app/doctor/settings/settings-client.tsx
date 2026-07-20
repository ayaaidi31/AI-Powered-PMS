"use client"

/**
 * Doctor profile management. The doctor edits their own contact details,
 * specialty, department, daily capacity and on-duty availability via the
 * `updateDoctor` Server Action. LANR is shown read-only (regulatory).
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { User, Mail, Phone, Stethoscope, Building2, Hash, Save, BadgeCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import type { DoctorRow } from "@/lib/seed-data"
import { updateDoctor } from "@/lib/actions/doctors"
import { useT } from "@/lib/i18n/locale-context"

export function SettingsClient({ doctor }: { doctor: DoctorRow }) {
  const t = useT()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    first_name: doctor.first_name ?? "",
    last_name: doctor.last_name ?? "",
    email: doctor.email ?? "",
    phone: doctor.phone ?? "",
    specialization: doctor.specialization ?? "",
    department: doctor.department ?? "",
    max_daily_capacity: String(doctor.max_daily_capacity ?? 20),
    is_available: doctor.is_available ?? true,
  })

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSave() {
    setSaving(true)
    const result = await updateDoctor(doctor.id, {
      ...form,
      max_daily_capacity: Number(form.max_daily_capacity),
    })
    setSaving(false)
    if (result.status === "ok") {
      toast.success(t("settings.profileUpdated"))
      router.refresh()
    } else {
      toast.error(result.message)
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("common.settings")}</h1>
        <p className="text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      {/* Availability */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><BadgeCheck className="w-4 h-4 text-primary" />{t("settings.availability")}</CardTitle>
          <CardDescription>{t("settings.availabilityDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">{t("settings.onDuty")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.onDutyHint")}</p>
            </div>
            <Switch checked={form.is_available} onCheckedChange={(v) => set("is_available", v)} />
          </div>
        </CardContent>
      </Card>

      {/* Profile */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4 text-primary" />{t("settings.profile")}</CardTitle>
          <CardDescription>{t("settings.profileDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("settings.firstName")} icon={<User className="w-3.5 h-3.5" />}>
              <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </Field>
            <Field label={t("settings.lastName")} icon={<User className="w-3.5 h-3.5" />}>
              <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </Field>
            <Field label={t("settings.email")} icon={<Mail className="w-3.5 h-3.5" />}>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label={t("settings.phone")} icon={<Phone className="w-3.5 h-3.5" />}>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="—" />
            </Field>
            <Field label={t("settings.specialization")} icon={<Stethoscope className="w-3.5 h-3.5" />}>
              <Input value={form.specialization} onChange={(e) => set("specialization", e.target.value)} placeholder={t("settings.specializationPlaceholder")} />
            </Field>
            <Field label={t("settings.department")} icon={<Building2 className="w-3.5 h-3.5" />}>
              <Input value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="—" />
            </Field>
            <Field label={t("settings.maxDailyCapacity")} icon={<Hash className="w-3.5 h-3.5" />}>
              <Input type="number" min={1} max={200} value={form.max_daily_capacity} onChange={(e) => set("max_daily_capacity", e.target.value)} />
            </Field>
            <Field label={t("settings.lanrReadOnly")} icon={<Hash className="w-3.5 h-3.5" />}>
              <Input value={doctor.lanr ?? "—"} disabled />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button className="gap-2" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4" />
          {saving ? t("settings.saving") : t("settings.saveChanges")}
        </Button>
      </div>
    </div>
  )
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</Label>
      {children}
    </div>
  )
}
