"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, Copy, Check, UserPlus, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { createStaffAccount, logout } from "@/lib/actions/auth"

type StaffRole = "doctor" | "receptionist"
interface Created { email: string; role: StaffRole; emailed: boolean; tempPassword?: string }

export function AdminStaffClient() {
  const router = useRouter()
  const [form, setForm] = useState({
    role: "doctor" as StaffRole, first_name: "", last_name: "", email: "",
    phone: "", department: "", specialization: "",
  })
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)
  const [copied, setCopied] = useState(false)

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setFieldErrors({})
    setLoading(true)
    const r = await createStaffAccount({
      role: form.role,
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      phone: form.phone || undefined,
      department: form.department || undefined,
      specialization: form.role === "doctor" ? form.specialization || undefined : undefined,
    })
    setLoading(false)
    if (r.status === "ok") {
      setCreated(r.data)
      setForm({ role: "doctor", first_name: "", last_name: "", email: "", phone: "", department: "", specialization: "" })
    } else {
      setError(r.message)
      if (r.status === "error" && r.fieldErrors) setFieldErrors(r.fieldErrors)
    }
  }

  async function signOut() {
    await logout()
    router.push("/")
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-muted">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Admin — Staff Accounts</span>
          </div>
          <Button variant="ghost" size="sm" className="gap-2" onClick={signOut}>
            <LogOut className="w-4 h-4" /> Sign out
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {created && (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Check className="w-5 h-5 text-primary" /> Account created for {created.email}
              </CardTitle>
              <CardDescription>
                {created.emailed
                  ? <>The temporary password has been <span className="font-medium text-foreground">emailed</span> to the new {created.role}. They'll set a new password and enable two-factor authentication on first login.</>
                  : <>Email couldn't be sent, so share this <span className="font-medium text-foreground">one-time temporary password</span> with the new {created.role} directly. They must change it on first login, then set up two-factor authentication.</>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {created.emailed ? (
                <p className="text-sm text-foreground">✉️ Sent to <span className="font-medium">{created.email}</span>.</p>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <code className="flex-1 font-mono text-lg bg-background border border-border rounded-md px-4 py-3 tracking-wider text-center">
                      {created.tempPassword}
                    </code>
                    <Button
                      variant="outline" className="gap-2"
                      onClick={() => { if (created.tempPassword) { navigator.clipboard?.writeText(created.tempPassword); setCopied(true); toast.success("Copied"); setTimeout(() => setCopied(false), 1500) } }}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This password is shown only once. If it's lost, create the account again or reset it.
                  </p>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>Create another</Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-primary" /> New staff account</CardTitle>
            <CardDescription>Provision a doctor or receptionist login.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {error && <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}

              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={form.role} onValueChange={(v) => set("role")(v)}>
                  <SelectTrigger id="role" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="doctor">Doctor</SelectItem>
                    <SelectItem value="receptionist">Receptionist</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field id="first_name" label="First name" value={form.first_name} onChange={set("first_name")} error={fieldErrors.first_name} required />
                <Field id="last_name" label="Last name" value={form.last_name} onChange={set("last_name")} error={fieldErrors.last_name} required />
              </div>

              <Field id="email" label="Email" type="email" value={form.email} onChange={set("email")} error={fieldErrors.email} required />

              <div className="grid grid-cols-2 gap-3">
                <Field id="phone" label="Phone (optional)" value={form.phone} onChange={set("phone")} error={fieldErrors.phone} />
                <Field id="department" label="Department (optional)" value={form.department} onChange={set("department")} error={fieldErrors.department} />
              </div>

              {form.role === "doctor" && (
                <Field id="specialization" label="Specialization (optional)" value={form.specialization} onChange={set("specialization")} error={fieldErrors.specialization} />
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating..." : "Create account"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Field({
  id, label, value, onChange, error, type = "text", required,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void
  error?: string; type?: string; required?: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} required={required}
        onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
