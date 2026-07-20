"use client"

/**
 * Login page (Feature 1 — UC-AUTH-01).
 *
 * Submits credentials to the `login` Server Action, which validates them and
 * issues the session cookie. On success the user is redirected to their
 * role-specific landing page (REQ-AUTH-04); the role tabs only assist with
 * demo-credential filling — the authoritative role comes from the account.
 */
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Activity, Stethoscope, Users, HeartPulse } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { login, verifyTwoFactorLogin } from "@/lib/actions/auth"
import { LanguageToggle } from "@/components/language-toggle"
import { useT } from "@/lib/i18n/locale-context"

type UserRole = "patient" | "doctor" | "receptionist"

// Demo accounts seeded by db/seed-users.ts (all use the password "demo123").
const DEMO_CREDENTIALS: Record<UserRole, { email: string; password: string }> = {
  patient: { email: "max.mustermann@email.com", password: "demo123" },
  doctor: { email: "dr.smith@clinic.com", password: "demo123" },
  receptionist: { email: "reception@clinic.com", password: "demo123" },
}

export default function LoginPage() {
  const router = useRouter()
  const t = useT()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [activeRole, setActiveRole] = useState<UserRole>("patient")
  const [formData, setFormData] = useState({ email: "", password: "" })
  // Second-factor step: set once a password is accepted for a 2FA account.
  const [twoFactorTicket, setTwoFactorTicket] = useState<string | null>(null)
  const [twoFactorCode, setTwoFactorCode] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setIsLoading(true)
    const result = await login(formData)
    if (result.status === "ok") {
      if (result.data.step === "twofa") {
        setTwoFactorTicket(result.data.ticket)
        setTwoFactorCode("")
        setIsLoading(false)
      } else {
        router.push(result.data.redirect)
        router.refresh()
      }
    } else {
      setError(result.message)
      setIsLoading(false)
    }
  }

  async function handleVerify2fa(e: React.FormEvent) {
    e.preventDefault()
    if (!twoFactorTicket) return
    setError("")
    setIsLoading(true)
    const result = await verifyTwoFactorLogin(twoFactorTicket, twoFactorCode)
    if (result.status === "ok") {
      router.push(result.data.redirect)
      router.refresh()
    } else {
      setError(result.message)
      setIsLoading(false)
    }
  }

  const fillDemoCredentials = () => setFormData(DEMO_CREDENTIALS[activeRole])

  return (
    <div className="relative min-h-screen flex">
      <div className="absolute top-4 right-4 z-10">
        <LanguageToggle />
      </div>
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary p-12 flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-foreground/20 rounded-lg flex items-center justify-center">
            <HeartPulse className="w-6 h-6 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold text-primary-foreground">AI-PMS Clinic</span>
        </div>

        <div className="space-y-8">
          <h1 className="text-4xl font-bold text-primary-foreground leading-tight text-balance">
            {t("auth.heroTitle")}
          </h1>
          <p className="text-lg text-primary-foreground/80 leading-relaxed">
            {t("auth.heroSubtitle")}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-8">
            <Feature icon={<Stethoscope className="w-5 h-5 text-primary-foreground" />} title={t("auth.forDoctors")} text={t("auth.forDoctorsText")} />
            <Feature icon={<Users className="w-5 h-5 text-primary-foreground" />} title={t("auth.forPatients")} text={t("auth.forPatientsText")} />
            <Feature icon={<Activity className="w-5 h-5 text-primary-foreground" />} title={t("auth.forStaff")} text={t("auth.forStaffText")} />
            <Feature icon={<HeartPulse className="w-5 h-5 text-primary-foreground" />} title={t("auth.gdprCompliant")} text={t("auth.gdprCompliantText")} />
          </div>
        </div>

        <p className="text-sm text-primary-foreground/60">{t("auth.securePlatform")}</p>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <HeartPulse className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">AI-PMS Clinic</span>
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold text-foreground">
              {twoFactorTicket ? t("auth.twoStepTitle") : t("auth.welcomeBack")}
            </h2>
            <p className="text-muted-foreground mt-2">
              {twoFactorTicket ? t("auth.twoStepSubtitle") : t("auth.signInSubtitle")}
            </p>
          </div>

          {twoFactorTicket ? (
            <Card className="border-border">
              <CardContent className="pt-6">
                <form onSubmit={handleVerify2fa} className="space-y-4">
                  {error && <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>}
                  <div className="space-y-2">
                    <Label htmlFor="twofa">{t("auth.authCode")}</Label>
                    <Input
                      id="twofa"
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value.replace(/\s/g, "").slice(0, 10))}
                      placeholder="123456"
                      inputMode="numeric"
                      autoFocus
                      autoComplete="one-time-code"
                      className="text-center text-2xl font-mono tracking-[0.3em] h-14"
                    />
                    <p className="text-xs text-muted-foreground">{t("auth.lostDevice")}</p>
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? t("auth.verifying") : t("auth.verifyContinue")}
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setTwoFactorTicket(null); setError("") }}
                    className="w-full text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
                  >
                    {t("auth.backToSignIn")}
                  </button>
                </form>
              </CardContent>
            </Card>
          ) : (
          <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as UserRole)} className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="patient">{t("auth.rolePatient")}</TabsTrigger>
              <TabsTrigger value="doctor">{t("auth.roleDoctor")}</TabsTrigger>
              <TabsTrigger value="receptionist">{t("auth.roleStaff")}</TabsTrigger>
            </TabsList>

            <TabsContent value={activeRole} className="mt-6">
              <Card className="border-border">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">
                    {activeRole === "patient" && t("auth.patientPortal")}
                    {activeRole === "doctor" && t("auth.doctorWorkspace")}
                    {activeRole === "receptionist" && t("auth.staffPortal")}
                  </CardTitle>
                  <CardDescription>
                    {activeRole === "patient" && t("auth.patientPortalDesc")}
                    {activeRole === "doctor" && t("auth.doctorWorkspaceDesc")}
                    {activeRole === "receptionist" && t("auth.staffPortalDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                      <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">{error}</div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="email">{t("auth.emailLabel")}</Label>
                      <Input
                        id="email" type="email" placeholder={t("auth.emailPlaceholder")}
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required autoComplete="email"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">{t("auth.passwordLabel")}</Label>
                      <Input
                        id="password" type="password" placeholder={t("auth.passwordPlaceholder")}
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required autoComplete="current-password"
                      />
                    </div>

                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? t("auth.signingIn") : t("auth.signIn")}
                    </Button>
                  </form>

                  {activeRole === "patient" && (
                    <p className="text-sm text-muted-foreground text-center mt-4">
                      {t("auth.newPatient")}{" "}
                      <Link href="/register" className="text-primary underline underline-offset-4">{t("auth.createAccount")}</Link>
                    </p>
                  )}

                  <div className="mt-4 pt-4 border-t border-border">
                    <Button type="button" variant="outline" className="w-full" onClick={fillDemoCredentials}>
                      {t("auth.fillDemo")}
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      {t("auth.demoPasswordHint")} <span className="font-mono">demo123</span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          )}

          <p className="text-center text-sm text-muted-foreground">
            {t("auth.termsNotice")}
          </p>
        </div>
      </div>
    </div>
  )
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 bg-primary-foreground/20 rounded-lg flex items-center justify-center flex-shrink-0">{icon}</div>
      <div>
        <h3 className="font-semibold text-primary-foreground">{title}</h3>
        <p className="text-sm text-primary-foreground/70">{text}</p>
      </div>
    </div>
  )
}
