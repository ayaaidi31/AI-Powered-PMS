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
import { useT } from "@/lib/i18n/locale-context"

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
  const t = useT()
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
      toast.error(t("auth.enter6DigitFromApp"))
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
      toast.error(t("auth.enterCurrentToTurnOff"))
      return
    }
    setBusy(true)
    const res = await disableTwoFactor(code)
    setBusy(false)
    if (res.status === "ok") {
      toast.success(t("auth.twoFactorTurnedOff"))
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
                <ShieldCheck className="w-5 h-5 text-primary" /> {t("auth.twoFactorIsOn")}
              </CardTitle>
              <CardDescription>
                {t("auth.backupCodesDesc")}
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
                onClick={() => { navigator.clipboard?.writeText(backupCodes.join("\n")); toast.success(t("auth.copied")) }}
              >
                <Copy className="w-4 h-4" /> {t("auth.copyCodes")}
              </Button>
              <Button className="w-full" onClick={finish}>{t("auth.savedContinue")}</Button>
            </CardContent>
          </Card>
        ) : view === "enroll" ? (
          /* Enrolment: scan + confirm */
          <Card>
            <CardHeader>
              <CardTitle>{t("auth.setupTwoFactor")}</CardTitle>
              <CardDescription>
                {t("auth.scanDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={t("auth.qrAlt")} width={200} height={200} className="mx-auto rounded-lg border border-border" />
              )}
              <div className="text-center">
                <p className="text-xs text-muted-foreground">{t("auth.cantScan")}</p>
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
                {busy ? t("auth.verifying") : t("auth.verifyTurnOn")}
              </Button>
              <button onClick={() => setView("status")} className="w-full text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
                {t("common.cancel")}
              </button>
            </CardContent>
          </Card>
        ) : (
          /* Status */
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isOn ? <ShieldCheck className="w-5 h-5 text-primary" /> : <ShieldAlert className="w-5 h-5 text-amber-500" />}
                {t("auth.twoFactorAuth")}
              </CardTitle>
              <CardDescription>
                {isOn
                  ? t("auth.statusProtected")
                  : required
                    ? t("auth.statusRequired")
                    : t("auth.statusDefault")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {required && !isOn && (
                <Alert>
                  <ShieldAlert className="w-4 h-4" />
                  <AlertDescription>
                    {t("auth.requiredAlert")}
                  </AlertDescription>
                </Alert>
              )}

              {!isOn ? (
                <Button className="w-full" onClick={beginEnroll} disabled={busy}>
                  {busy ? t("auth.preparing") : t("auth.setupTwoFactor")}
                </Button>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-sm text-primary">
                    <Check className="w-4 h-4" /> {t("auth.enabled")}
                  </div>
                  {!required && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <p className="text-sm text-muted-foreground">{t("auth.turnOffPrompt")}</p>
                      <Input
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\s/g, "").slice(0, 10))}
                        placeholder={t("auth.codeOrBackupPlaceholder")}
                        className="font-mono"
                      />
                      <Button variant="outline" className="w-full" onClick={turnOff} disabled={busy}>
                        {t("auth.turnOffTwoFactor")}
                      </Button>
                    </div>
                  )}
                  {!embedded && (
                    <Button variant="ghost" className="w-full" onClick={() => { router.push(home); router.refresh() }}>
                      {t("auth.backToPortal")}
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
