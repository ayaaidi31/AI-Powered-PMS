"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { changeOwnPassword } from "@/lib/actions/auth"

export function ChangePasswordClient({ forced }: { forced: boolean }) {
  const router = useRouter()
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" })
  const [error, setError] = useState("")
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setFieldErrors({})
    if (form.newPassword !== form.confirm) {
      setFieldErrors({ confirm: "Passwords do not match." })
      return
    }
    setLoading(true)
    const r = await changeOwnPassword({ currentPassword: form.currentPassword, newPassword: form.newPassword })
    if (r.status === "ok") {
      router.push(r.data.redirect)
      router.refresh()
    } else {
      setError(r.message)
      if (r.status === "error" && r.fieldErrors) setFieldErrors(r.fieldErrors)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" /> {forced ? "Set a new password" : "Change your password"}
          </CardTitle>
          <CardDescription>
            {forced
              ? "You're signing in with a temporary password. Choose a new one to continue."
              : "Update the password for your account."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            {error && <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}

            <div className="space-y-2">
              <Label htmlFor="current">{forced ? "Temporary password" : "Current password"}</Label>
              <Input id="current" type="password" value={form.currentPassword} required autoComplete="current-password"
                onChange={(e) => set("currentPassword")(e.target.value)} aria-invalid={!!fieldErrors.currentPassword} />
              {fieldErrors.currentPassword && <p className="text-xs text-destructive">{fieldErrors.currentPassword}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" value={form.newPassword} required autoComplete="new-password"
                onChange={(e) => set("newPassword")(e.target.value)} aria-invalid={!!fieldErrors.newPassword} />
              {fieldErrors.newPassword ? <p className="text-xs text-destructive">{fieldErrors.newPassword}</p>
                : <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" type="password" value={form.confirm} required autoComplete="new-password"
                onChange={(e) => set("confirm")(e.target.value)} aria-invalid={!!fieldErrors.confirm} />
              {fieldErrors.confirm && <p className="text-xs text-destructive">{fieldErrors.confirm}</p>}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving..." : "Save new password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
