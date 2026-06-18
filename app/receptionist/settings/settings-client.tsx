"use client"

/**
 * Receptionist profile management. Edits own contact details via the
 * `updateReceptionist` Server Action.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { User, Mail, Phone, Building2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import type { ReceptionistRow } from "@/lib/seed-data"
import { updateReceptionist } from "@/lib/actions/receptionists"

export function SettingsClient({ receptionist }: { receptionist: ReceptionistRow }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    first_name: receptionist.first_name ?? "",
    last_name: receptionist.last_name ?? "",
    email: receptionist.email ?? "",
    phone: receptionist.phone ?? "",
    department: receptionist.department ?? "",
  })
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSave() {
    setSaving(true)
    const result = await updateReceptionist(receptionist.id, form)
    setSaving(false)
    if (result.status === "ok") {
      toast.success("Profile updated.")
      router.refresh()
    } else {
      toast.error(result.message)
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground">Manage your profile</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4 text-primary" />Profile</CardTitle>
          <CardDescription>Your personal and contact details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" icon={<User className="w-3.5 h-3.5" />}>
              <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </Field>
            <Field label="Last name" icon={<User className="w-3.5 h-3.5" />}>
              <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </Field>
            <Field label="Email" icon={<Mail className="w-3.5 h-3.5" />}>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="Phone" icon={<Phone className="w-3.5 h-3.5" />}>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="—" />
            </Field>
            <Field label="Department" icon={<Building2 className="w-3.5 h-3.5" />}>
              <Input value={form.department} onChange={(e) => set("department", e.target.value)} placeholder="e.g. Front Desk" />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button className="gap-2" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4" />
          {saving ? "Saving…" : "Save Changes"}
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
