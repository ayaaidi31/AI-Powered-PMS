"use client"

/**
 * Two-factor setup flow: enrol (scan QR → confirm code → save backup codes),
 * and — for patients — turn it off again. Staff cannot disable it.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ShieldCheck, ShieldAlert, Copy, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "sonner"
import { startTotpEnrollment, confirmTotpEnrollment, disableTwoFactor } from "@/lib/actions/auth"

type View = "status" | "enroll" | "backup"

export function SecurityClient({
  enabled,
  required,
  home,
  embedded = false,
}: {
  enabled: boolean
  required: boolean
  home: string
  /** Render inline (e.g. inside the profile page) instead of as a full-screen page. */
  embedded?: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<View>("status")
  const [isOn, setIsOn] = useState(enabled)
  const [busy, setBusy] = useState(false)
  const [qr, setQr] = useState("")
  const [secret, setSecret] = useState("")
  const [code, setCode] = useState("")
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [redirectTo, setRedirectTo] = useState(home)

  async function beginEnroll() {
    setBusy(true)
    const res = await startTotpEnrollment()
    setBusy(false)
    if (res.status === "ok") {
      setQr(res.data.qr)
      setSecret(res.data.secret)
      setCode("")
      setView("enroll")
    } else {
      toast.error(res.message)
    }
  }

  async function confirmEnroll() {
    if (code.replace(/\s/g, "").length !== 6) {
      toast.error("Enter the 6-digit code from your app.")
      return
    }
    setBusy(true)
    const res = await confirmTotpEnrollment(code)
    setBusy(false)
    if (res.status === "ok") {
      setBackupCodes(res.data.backupCodes)
      setRedirectTo(res.data.redirect)
      setIsOn(true)
      setView("backup")
    } else {
      toast.error(res.message)
    }
  }

  async function turnOff() {
    if (code.replace(/\s/g, "").length < 6) {
      toast.error("Enter a current code to turn it off.")
      return
    }
    setBusy(true)
    const res = await disableTwoFactor(code)
    setBusy(false)
    if (res.status === "ok") {
      toast.success("Two-factor turned off.")
      setIsOn(false)
      setCode("")
      router.refresh()
    } else {
      toast.error(res.message)
    }
  }

  function finish() {
    if (embedded) {
      setView("status")
      router.refresh()
    } else {
      router.push(redirectTo)
      router.refresh()
    }
  }

  const content = (
    <>
        {/* Backup codes (post-enrolment) */}
        {view === "backup" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Two-factor is on
              </CardTitle>
              <CardDescription>
                Save these backup codes somewhere safe. Each works once if you lose access to your
                authenticator app.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((c) => (
                  <code key={c} className="font-mono text-sm bg-muted rounded px-3 py-2 text-center tracking-wider">{c}</code>
                ))}
              </div>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => { navigator.clipboard?.writeText(backupCodes.join("\n")); toast.success("Copied") }}
              >
                <Copy className="w-4 h-4" /> Copy codes
              </Button>
              <Button className="w-full" onClick={finish}>I&apos;ve saved these — continue</Button>
            </CardContent>
          </Card>
        ) : view === "enroll" ? (
          /* Enrolment: scan + confirm */
          <Card>
            <CardHeader>
              <CardTitle>Set up two-factor</CardTitle>
              <CardDescription>
                Scan this with an authenticator app (Google Authenticator, Authy…), then enter the
                6-digit code it shows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="2FA QR code" width={200} height={200} className="mx-auto rounded-lg border border-border" />
              )}
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Can&apos;t scan? Enter this key manually:</p>
                <code className="font-mono text-sm break-all">{secret}</code>
              </div>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                className="text-center text-2xl font-mono tracking-[0.4em] h-14"
                onKeyDown={(e) => e.key === "Enter" && confirmEnroll()}
              />
              <Button className="w-full" onClick={confirmEnroll} disabled={busy}>
                {busy ? "Verifying…" : "Verify & turn on"}
              </Button>
              <button onClick={() => setView("status")} className="w-full text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
                Cancel
              </button>
            </CardContent>
          </Card>
        ) : (
          /* Status */
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isOn ? <ShieldCheck className="w-5 h-5 text-primary" /> : <ShieldAlert className="w-5 h-5 text-amber-500" />}
                Two-factor authentication
              </CardTitle>
              <CardDescription>
                {isOn
                  ? "Your account is protected with an authenticator app."
                  : required
                    ? "Staff accounts must enable two-factor to continue."
                    : "Add a second step at sign-in for stronger security."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {required && !isOn && (
                <Alert>
                  <ShieldAlert className="w-4 h-4" />
                  <AlertDescription>
                    This is required for staff. You&apos;ll be brought back here until it&apos;s set up.
                  </AlertDescription>
                </Alert>
              )}

              {!isOn ? (
                <Button className="w-full" onClick={beginEnroll} disabled={busy}>
                  {busy ? "Preparing…" : "Set up two-factor"}
                </Button>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <Check className="w-4 h-4" /> Enabled
                  </div>
                  {!required && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <p className="text-sm text-muted-foreground">Turn it off (enter a current code):</p>
                      <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\s/g, "").slice(0, 10))}
                        placeholder="Code or backup code"
                        className="font-mono"
                      />
                      <Button variant="outline" className="w-full" onClick={turnOff} disabled={busy}>
                        Turn off two-factor
                      </Button>
                    </div>
                  )}
                  {!embedded && (
                    <Button variant="ghost" className="w-full" onClick={() => { router.push(home); router.refresh() }}>
                      Back to my portal
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
    </>
  )

  if (embedded) return content
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">{content}</div>
    </div>
  )
}
