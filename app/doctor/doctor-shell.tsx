"use client"

/**
 * Doctor portal shell: responsive sidebar navigation and top bar. Receives the
 * doctor's display profile from the server layout; holds only UI state (sidebar
 * open/closed).
 */
import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { logout } from "@/lib/actions/auth"
import {
  LayoutDashboard, Users, Calendar, FileText, Settings, LogOut, Menu, X,
  Stethoscope, Receipt, ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { NotificationBell } from "@/components/notification-bell"
import { getDoctorNotifications, setDoctorAvailability } from "@/lib/actions/doctors"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { RecordingProvider } from "@/components/recording/recording-provider"
import { LanguageToggle } from "@/components/language-toggle"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"

export interface DoctorProfile {
  id: string
  name: string
  firstName: string
  specialization: string
  email: string
  initials: string
  isAvailable: boolean
}

const navigation = [
  { key: "nav.dashboard", href: "/doctor/dashboard", icon: LayoutDashboard },
  { key: "nav.workspace", href: "/doctor/workspace", icon: Stethoscope },
  { key: "nav.schedule", href: "/doctor/schedule", icon: Calendar },
  { key: "nav.patients", href: "/doctor/patients", icon: Users },
  { key: "nav.reports", href: "/doctor/reports", icon: FileText },
  { key: "nav.billing", href: "/doctor/billing", icon: Receipt },
] as const

export function DoctorShell({ profile, children }: { profile: DoctorProfile; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dutyPending, setDutyPending] = useState(false)

  async function toggleDuty() {
    setDutyPending(true)
    const r = await setDoctorAvailability(profile.id, !profile.isAvailable)
    setDutyPending(false)
    if (r.status === "ok") {
      toast.success(profile.isAvailable ? t("doctorShell.nowOffDuty") : t("doctorShell.nowOnDuty"))
      router.refresh()
    } else {
      toast.error(r.message)
    }
  }

  async function handleSignOut() {
    await logout()
    router.push("/")
    router.refresh()
  }

  return (
    <RecordingProvider>
    <div className="min-h-screen bg-background">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={cn(
        "fixed top-0 left-0 z-50 h-full w-72 bg-card border-r border-border transform transition-transform duration-300 ease-in-out lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between h-16 px-6 border-b border-border">
            <Link href="/doctor/dashboard" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
                <Stethoscope className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <span className="font-bold text-lg text-foreground">AI-PMS</span>
                <p className="text-xs text-muted-foreground">{t("doctorShell.portal")}</p>
              </div>
            </Link>
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="p-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20">
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12 border-2 border-primary/30">
                  <AvatarFallback className="bg-primary text-primary-foreground font-semibold">{profile.initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{profile.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile.specialization}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button onClick={toggleDuty} disabled={dutyPending} title={t("doctorShell.dutyHint")}>
                  <Badge variant={profile.isAvailable ? "secondary" : "outline"} className="text-xs cursor-pointer hover:opacity-80 gap-1.5">
                    <span className={cn("w-1.5 h-1.5 rounded-full", profile.isAvailable ? "bg-green-500" : "bg-muted-foreground")} />
                    {dutyPending ? "…" : profile.isAvailable ? t("doctorShell.onDuty") : t("doctorShell.offDuty")}
                  </Badge>
                </button>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className={cn("w-5 h-5", isActive && "text-primary-foreground")} />
                  {t(item.key)}
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 h-16 bg-card/80 backdrop-blur-xl border-b border-border">
          <div className="flex items-center justify-between h-full px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
                <Menu className="w-5 h-5" />
              </Button>
              <div className="hidden sm:block">
                <h2 className="text-sm font-medium text-muted-foreground">{t("doctorShell.welcomeBack", { name: profile.firstName })}</h2>
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString(INTL_LOCALE[locale], { weekday: "long", month: "long", day: "numeric" })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <LanguageToggle className="hidden sm:inline-flex" />
              <NotificationBell loader={getDoctorNotifications} />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 pl-2 pr-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">{profile.initials}</AvatarFallback>
                    </Avatar>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div>
                      <p className="font-medium">{profile.name}</p>
                      <p className="text-xs text-muted-foreground">{profile.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <div className="sm:hidden px-2 py-1.5">
                    <LanguageToggle />
                  </div>
                  <DropdownMenuItem onClick={() => router.push("/doctor/settings")}>
                    <Settings className="w-4 h-4 mr-2" />
                    {t("common.settings")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={handleSignOut}>
                    <LogOut className="w-4 h-4 mr-2" />
                    {t("common.signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-4rem)] min-w-0 overflow-x-clip">
          <div key={pathname} className="animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
    </RecordingProvider>
  )
}
