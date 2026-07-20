"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { HeartPulse, LayoutDashboard, Calendar, FileText, FolderOpen, User, Receipt, LogOut, Menu, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useState } from "react"
import { FaqChat } from "@/components/faq-chat"
import { NotificationBell } from "@/components/notification-bell"
import { LanguageToggle } from "@/components/language-toggle"
import { logout } from "@/lib/actions/auth"
import { getPatientNotifications } from "@/lib/actions/patient-notifications"
import { useT } from "@/lib/i18n/locale-context"
import type { TKey } from "@/lib/i18n/translate"

// Primary sections — the day-to-day tasks.
const mainNav = [
  { key: "patient.nav.dashboard", href: "/patient/dashboard", icon: LayoutDashboard },
  { key: "patient.nav.appointments", href: "/patient/appointments", icon: Calendar },
  { key: "patient.nav.records", href: "/patient/records", icon: FileText },
  { key: "patient.nav.documents", href: "/patient/documents", icon: FolderOpen },
] as const
// Account — tucked into the avatar menu (and the mobile sheet).
const accountNav = [
  { key: "patient.nav.profile", href: "/patient/profile", icon: User },
  { key: "patient.nav.billing", href: "/patient/invoices", icon: Receipt },
] as const

export function PatientShell({
  patientName,
  firstName,
  children,
}: {
  patientName: string
  firstName: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useT()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleLogout = async () => {
    await logout() // clears the session cookie server-side
    router.push("/")
    router.refresh()
  }

  const initials = patientName.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "P"

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/patient/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <HeartPulse className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-bold text-foreground text-lg hidden sm:inline">AI-PMS Clinic</span>
            </Link>

            {/* Desktop Navigation — core sections only */}
            <nav className="hidden md:flex items-center gap-1">
              {mainNav.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {t(item.key as TKey)}
                  </Link>
                )
              })}
            </nav>

            {/* Right: language + notifications + account menu */}
            <div className="hidden md:flex items-center gap-2">
              <LanguageToggle />
              <NotificationBell loader={getPatientNotifications} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 pl-1.5 pr-2 h-10">
                    <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
                      {initials}
                    </span>
                    <span className="text-sm font-medium text-foreground hidden lg:inline">{firstName}</span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <p className="font-medium text-foreground truncate">{patientName}</p>
                    <p className="text-xs font-normal text-muted-foreground">{t("patient.shell.patientAccount")}</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {accountNav.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href} className="cursor-pointer">
                        <item.icon className="w-4 h-4" />
                        {t(item.key as TKey)}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
                    <LogOut className="w-4 h-4" />
                    {t("common.signOut")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Mobile: notifications + menu */}
            <div className="flex items-center gap-1 md:hidden">
              <NotificationBell loader={getPatientNotifications} />
              <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="w-5 h-5" />
                    <span className="sr-only">{t("patient.shell.toggleMenu")}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-80 p-0 flex flex-col gap-0">
                  <SheetTitle className="sr-only">{t("patient.shell.navigation")}</SheetTitle>
                  <SheetDescription className="sr-only">{t("patient.shell.navigationDesc")}</SheetDescription>

                  {/* Brand */}
                  <div className="flex items-center gap-2 px-5 h-16 border-b border-border shrink-0">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                      <HeartPulse className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <span className="font-bold text-foreground text-lg">AI-PMS Clinic</span>
                  </div>

                  {/* Profile */}
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
                    <span className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground text-sm font-semibold flex items-center justify-center">
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{patientName}</p>
                      <p className="text-xs text-muted-foreground">{t("patient.shell.patientAccount")}</p>
                    </div>
                  </div>

                  {/* Nav */}
                  <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                    {[...mainNav, ...accountNav].map((item) => {
                      const isActive = pathname === item.href
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                            isActive
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent"
                          }`}
                        >
                          <item.icon className="w-5 h-5" />
                          {t(item.key as TKey)}
                        </Link>
                      )
                    })}
                  </nav>

                  {/* Language + log out */}
                  <div className="p-4 border-t border-border shrink-0 space-y-3">
                    <LanguageToggle className="w-full justify-center" />
                    <Button variant="outline" className="w-full gap-2" onClick={handleLogout}>
                      <LogOut className="w-4 h-4" />
                      {t("common.signOut")}
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content — subtle fade on each route change (keyed by path) */}
      <main className="flex-1">
        <div key={pathname} className="animate-fade-in">{children}</div>
      </main>

      {/* Clinic FAQ assistant (Mistral-backed) */}
      <FaqChat />
    </div>
  )
}
