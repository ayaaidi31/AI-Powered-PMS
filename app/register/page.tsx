"use client"

/**
 * Patient self-registration page (public). Two steps: submit details
 * (`startSignup` emails a code) → enter the code (`verifySignup` creates the
 * account and signs in).
 *
 * Patient-only by design — staff accounts are provisioned internally.
 */
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { HeartPulse } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { startSignup, verifySignup } from "@/lib/actions/auth"
import { insurerSuggestions } from "@/lib/insurers"
import { useT } from "@/lib/i18n/locale-context"

type Insurance = "gkv" | "pkv" | "selbstzahler"

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

export default function RegisterPage() {
  const t = useT()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "",
    birth_date: "", insurance_type: "" as Insurance | "", insurer_name: "", insurer_ik: "",
    versicherten_id: "", guardian_name: "", guardian_contact: "", phone: "",
  })
  // Step 2: email verification.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | undefined>(undefined)
  const [code, setCode] = useState("")

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))
  const isMinor = isUnder18(form.birth_date)
  const insurerOptions = insurerSuggestions(form.insurance_type)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setFieldErrors({})
    setIsLoading(true)
    const result = await startSignup({
      first_name: form.first_name,
      last_name: form.last_name,
      email: form.email,
      password: form.password,
      birth_date: form.birth_date,
      insurance_type: form.insurance_type as Insurance,
      insurer_name: form.insurer_name || undefined,
      insurer_ik: form.insurer_ik || undefined,
      versicherten_id: form.versicherten_id || undefined,
      guardian_name: isMinor ? form.guardian_name || undefined : undefined,
      guardian_contact: isMinor ? form.guardian_contact || undefined : undefined,
      phone: form.phone,
    })
    setIsLoading(false)
    if (result.status === "ok") {
      setPendingEmail(result.data.email)
      setDevCode(result.data.devCode)
      setCode("")
    } else {
      setError(result.message)
      if (result.status === "error" && result.fieldErrors) setFieldErrors(result.fieldErrors)
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingEmail) return
    setError("")
    setIsLoading(true)
    const result = await verifySignup(pendingEmail, code)
    if (result.status === "ok") {
      router.push(result.data.redirect)
      router.refresh()
    } else {
      setError(result.message)
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <HeartPulse className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold text-foreground">AI-PMS Clinic</span>
        </div>

        {pendingEmail ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("register.verifyTitle")}</CardTitle>
              <CardDescription>
                {t("register.verifyDescLead")}<span className="font-medium text-foreground">{pendingEmail}</span>{t("register.verifyDescTail")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerify} className="space-y-4">
                {error && <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                {devCode && (
                  <div className="p-3 text-sm rounded-md border border-amber-300/60 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/60">
                    {t("register.devCodeNotice")}{" "}
                    <span className="font-mono font-semibold tracking-widest">{devCode}</span>
                  </div>
                )}
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  inputMode="numeric"
                  autoFocus
                  autoComplete="one-time-code"
                  className="text-center text-2xl font-mono tracking-[0.4em] h-14"
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? t("register.verifying") : t("register.verifyCta")}
                </Button>
                <button
                  type="button"
                  onClick={() => { setPendingEmail(null); setError(""); setDevCode(undefined) }}
                  className="w-full text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  {t("register.back")}
                </button>
              </form>
            </CardContent>
          </Card>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("register.title")}</CardTitle>
            <CardDescription>{t("register.subtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}

              <div className="grid grid-cols-2 gap-3">
                <Field id="first_name" label={t("register.firstName")} value={form.first_name} onChange={set("first_name")} error={fieldErrors.first_name} required />
                <Field id="last_name" label={t("register.lastName")} value={form.last_name} onChange={set("last_name")} error={fieldErrors.last_name} required />
              </div>

              <Field id="email" label={t("register.email")} type="email" value={form.email} onChange={set("email")} error={fieldErrors.email} required autoComplete="email" />
              <Field id="password" label={t("register.password")} type="password" value={form.password} onChange={set("password")} error={fieldErrors.password} required autoComplete="new-password" hint={t("register.passwordHint")} />

              <div className="grid grid-cols-2 gap-3">
                <Field id="birth_date" label={t("register.birthDate")} type="date" value={form.birth_date} onChange={set("birth_date")} error={fieldErrors.birth_date} required />
                <div className="space-y-2">
                  <Label htmlFor="insurance_type">{t("register.insurance")}</Label>
                  <Select value={form.insurance_type} onValueChange={(v) => set("insurance_type")(v)}>
                    <SelectTrigger id="insurance_type" className="w-full"><SelectValue placeholder={t("register.selectPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gkv">{t("register.insGkv")}</SelectItem>
                      <SelectItem value="pkv">{t("register.insPkv")}</SelectItem>
                      <SelectItem value="selbstzahler">{t("register.insSelf")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {fieldErrors.insurance_type && <p className="text-xs text-destructive">{fieldErrors.insurance_type}</p>}
                </div>
              </div>

              {form.insurance_type && form.insurance_type !== "selbstzahler" && (
                <Field
                  id="insurer_name"
                  label={t("register.insurer")}
                  value={form.insurer_name}
                  onChange={set("insurer_name")}
                  error={fieldErrors.insurer_name}
                  hint={t("register.insurerHint")}
                  suggestions={insurerOptions}
                />
              )}

              {form.insurance_type === "gkv" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field id="versicherten_id" label={t("register.kvnr")} value={form.versicherten_id} onChange={set("versicherten_id")} error={fieldErrors.versicherten_id} hint={t("register.kvnrHint")} />
                  <Field id="insurer_ik" label={t("register.ik")} value={form.insurer_ik} onChange={set("insurer_ik")} error={fieldErrors.insurer_ik} />
                </div>
              )}

              <Field id="phone" label={t("register.phone")} value={form.phone} onChange={set("phone")} error={fieldErrors.phone} required autoComplete="tel" hint={t("register.phoneHint")} />

              {isMinor && (
                <div className="rounded-md border border-border p-3 space-y-3">
                  <div>
                    <p className="text-sm font-medium">{t("register.guardian")}</p>
                    <p className="text-xs text-muted-foreground">{t("register.guardianDesc")}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field id="guardian_name" label={t("register.guardianName")} value={form.guardian_name} onChange={set("guardian_name")} error={fieldErrors.guardian_name} required />
                    <Field id="guardian_contact" label={t("register.guardianPhone")} value={form.guardian_contact} onChange={set("guardian_contact")} error={fieldErrors.guardian_contact} required />
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? t("register.creating") : t("register.createCta")}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-4">
              {t("register.haveAccount")}{" "}
              <Link href="/" className="text-primary underline underline-offset-4">{t("register.signIn")}</Link>
            </p>
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  )
}

function Field({
  id, label, value, onChange, error, type = "text", required, autoComplete, hint, suggestions,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void
  error?: string; type?: string; required?: boolean; autoComplete?: string; hint?: string
  suggestions?: string[]
}) {
  const listId = suggestions && suggestions.length > 0 ? `${id}-list` : undefined
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id} type={type} value={value} required={required} autoComplete={autoComplete}
        list={listId}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
      />
      {listId && (
        <datalist id={listId}>
          {suggestions!.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
