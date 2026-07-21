"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, Copy, Check, UserPlus, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { createStaffAccount, logout } from "@/lib/actions/auth"
import { useT } from "@/lib/i18n/locale-context"

type StaffRole = "doctor" | "receptionist"
interface Created { email: string; role: StaffRole; emailed: boolean; tempPassword?: string }

export function AdminStaffClient() {
  const router = useRouter()
  const t = useT()
  const roleLabel = (r: StaffRole) => t(r === "doctor" ? "admin.roleDoctor" : "admin.roleReceptionist")
  const [form, setForm] = useState({
    role: "doctor" as StaffRole, first_name: "", last_name: "", email: "",
    phone: "", department: "", specialization: "",
  })
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)
  const [copied, setCopied] = useState(false)
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)

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
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
            <span className="font-semibold text-foreground">{t("admin.pageTitle")}</span>
          </div>
          <Button variant="ghost" size="sm" className="gap-2 text-destructive hover:text-destructive shrink-0" onClick={() => setLogoutConfirmOpen(true)}>
            <LogOut className="w-4 h-4" /> {t("common.signOut")}
          </Button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {created && (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Check className="w-5 h-5 text-primary" /> {t("admin.accountCreatedFor", { email: created.email })}
              </CardTitle>
              <CardDescription>
                {created.emailed
                  ? <>{t("admin.emailedIntro")}<span className="font-medium text-foreground">{t("admin.emailedEmphasis")}</span>{t("admin.emailedRest", { role: roleLabel(created.role) })}</>
                  : <>{t("admin.notEmailedIntro")}<span className="font-medium text-foreground">{t("admin.notEmailedEmphasis")}</span>{t("admin.notEmailedRest", { role: roleLabel(created.role) })}</>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {created.emailed ? (
                <p className="text-sm text-foreground">{t("admin.passwordSentTo")} <span className="font-medium">{created.email}</span></p>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <code className="flex-1 font-mono text-lg bg-background border border-border rounded-md px-4 py-3 tracking-wider text-center break-all">
                      {created.tempPassword}
                    </code>
                    <Button
                      variant="outline" className="gap-2"
                      onClick={() => { if (created.tempPassword) { navigator.clipboard?.writeText(created.tempPassword); setCopied(true); toast.success(t("admin.copied")); setTimeout(() => setCopied(false), 1500) } }}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {t("admin.copy")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("admin.shownOnce")}
                  </p>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={() => setCreated(null)}>{t("admin.createAnother")}</Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserPlus className="w-5 h-5 text-primary" /> {t("admin.newAccountTitle")}</CardTitle>
            <CardDescription>{t("admin.provisionDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              {error && <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}

              <div className="space-y-2">
                <Label htmlFor="role">{t("admin.role")}</Label>
                <Select value={form.role} onValueChange={(v) => set("role")(v)}>
                  <SelectTrigger id="role" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="doctor">{t("admin.roleDoctor")}</SelectItem>
                    <SelectItem value="receptionist">{t("admin.roleReceptionist")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field id="first_name" label={t("admin.firstName")} value={form.first_name} onChange={set("first_name")} error={fieldErrors.first_name} required />
                <Field id="last_name" label={t("admin.lastName")} value={form.last_name} onChange={set("last_name")} error={fieldErrors.last_name} required />
              </div>

              <Field id="email" label={t("admin.email")} type="email" value={form.email} onChange={set("email")} error={fieldErrors.email} required />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field id="phone" label={t("admin.phoneOptional")} value={form.phone} onChange={set("phone")} error={fieldErrors.phone} />
                <Field id="department" label={t("admin.departmentOptional")} value={form.department} onChange={set("department")} error={fieldErrors.department} />
              </div>

              {form.role === "doctor" && (
                <Field id="specialization" label={t("admin.specializationOptional")} value={form.specialization} onChange={set("specialization")} error={fieldErrors.specialization} />
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("admin.creating") : t("admin.createAccount")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Log-out confirmation — guards against an accidental tap. */}
      <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.logoutConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("common.logoutConfirmDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={signOut}>{t("common.signOut")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
