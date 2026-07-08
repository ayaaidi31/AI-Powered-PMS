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

type Insurance = "gkv" | "pkv" | "selbstzahler"

export default function RegisterPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", password: "",
    birth_date: "", insurance_type: "" as Insurance | "", phone: "",
  })
  // Step 2: email verification.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [devCode, setDevCode] = useState<string | undefined>(undefined)
  const [code, setCode] = useState("")

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

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
      phone: form.phone || undefined,
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
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <HeartPulse className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold text-foreground">AI-PMS Clinic</span>
        </div>

        {pendingEmail ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Verify your email</CardTitle>
              <CardDescription>
                We sent a 6-digit code to <span className="font-medium text-foreground">{pendingEmail}</span>. Enter it to finish.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVerify} className="space-y-4">
                {error && <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                {devCode && (
                  <div className="p-3 text-sm rounded-md border border-amber-300/60 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/60">
                    Email isn&apos;t configured yet, so here&apos;s your code for testing:{" "}
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
                  {isLoading ? "Verifying..." : "Verify & create account"}
                </Button>
                <button
                  type="button"
                  onClick={() => { setPendingEmail(null); setError(""); setDevCode(undefined) }}
                  className="w-full text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                  Back
                </button>
              </form>
            </CardContent>
          </Card>
        ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Create your patient account</CardTitle>
            <CardDescription>Book appointments, check in, and view your records.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}

              <div className="grid grid-cols-2 gap-3">
                <Field id="first_name" label="First name" value={form.first_name} onChange={set("first_name")} error={fieldErrors.first_name} required />
                <Field id="last_name" label="Last name" value={form.last_name} onChange={set("last_name")} error={fieldErrors.last_name} required />
              </div>

              <Field id="email" label="Email" type="email" value={form.email} onChange={set("email")} error={fieldErrors.email} required autoComplete="email" />
              <Field id="password" label="Password" type="password" value={form.password} onChange={set("password")} error={fieldErrors.password} required autoComplete="new-password" hint="At least 8 characters." />

              <div className="grid grid-cols-2 gap-3">
                <Field id="birth_date" label="Date of birth" type="date" value={form.birth_date} onChange={set("birth_date")} error={fieldErrors.birth_date} required />
                <div className="space-y-2">
                  <Label htmlFor="insurance_type">Insurance</Label>
                  <Select value={form.insurance_type} onValueChange={(v) => set("insurance_type")(v)}>
                    <SelectTrigger id="insurance_type" className="w-full"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gkv">Statutory (GKV)</SelectItem>
                      <SelectItem value="pkv">Private (PKV)</SelectItem>
                      <SelectItem value="selbstzahler">Self-payer</SelectItem>
                    </SelectContent>
                  </Select>
                  {fieldErrors.insurance_type && <p className="text-xs text-destructive">{fieldErrors.insurance_type}</p>}
                </div>
              </div>

              <Field id="phone" label="Phone (optional)" value={form.phone} onChange={set("phone")} error={fieldErrors.phone} autoComplete="tel" />

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Creating account..." : "Create account"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-4">
              Already have an account?{" "}
              <Link href="/" className="text-primary underline underline-offset-4">Sign in</Link>
            </p>
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  )
}

function Field({
  id, label, value, onChange, error, type = "text", required, autoComplete, hint,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void
  error?: string; type?: string; required?: boolean; autoComplete?: string; hint?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id} type={type} value={value} required={required} autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
