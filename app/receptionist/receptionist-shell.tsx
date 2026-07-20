"use client"

/**
 * Receptionist portal shell: sidebar nav, top notification bell, profile/settings.
 * Receives the signed-in receptionist's display profile from the server layout.
 */
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { HeartPulse, LayoutDashboard, Calendar, Users, LogOut, Menu, Clock, Search, Receipt, Settings, Stethoscope, PhoneCall, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { logout } from "@/lib/actions/auth"
import { NotificationBell } from "@/components/notification-bell"
import { getReceptionistNotifications } from "@/lib/actions/receptionists"
import { LanguageToggle } from "@/components/language-toggle"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"

export interface ReceptionistProfile {
  name: string
  department: string
  email: string
  initials: string
}

const navItems = [
  { labelKey: "reception.navDashboard", href: "/receptionist/dashboard", icon: LayoutDashboard },
  { labelKey: "reception.navSchedule", href: "/receptionist/schedule", icon: Calendar },
  { labelKey: "reception.navPatients", href: "/receptionist/patients", icon: Users },
  { labelKey: "reception.navWaiting", href: "/receptionist/waiting", icon: Clock },
  { labelKey: "reception.navCalls", href: "/receptionist/calls", icon: PhoneCall },
  { labelKey: "reception.navStaff", href: "/receptionist/staff", icon: Stethoscope },
  { labelKey: "reception.navBilling", href: "/receptionist/billing", icon: Receipt },
] as const

export function ReceptionistShell({ profile, children }: { profile: ReceptionistProfile; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    router.push("/")
    router.refresh()
  }

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
          >
            <item.icon className="w-5 h-5" />
            {t(item.labelKey)}
          </Link>
        )
      })}
    </>
  )

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Link href="/receptionist/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <HeartPulse className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">AI-PMS Clinic</span>
          </Link>
        </div>

        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={t("reception.searchPatients")} className="pl-9" />
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1"><NavLinks /></nav>

        {/* Identity — account actions live in the top-bar avatar menu. */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <Avatar className="w-9 h-9">
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">{profile.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{profile.name}</p>
              <p className="text-xs text-muted-foreground truncate">{profile.department}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (desktop): notifications. Mobile: logo + bell + menu. */}
        <header className="sticky top-0 z-40 h-16 border-b border-border bg-card/80 backdrop-blur-xl flex items-center justify-between px-4 lg:px-6">
          <Link href="/receptionist/dashboard" className="flex items-center gap-2 lg:hidden">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <HeartPulse className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">AI-PMS Clinic</span>
          </Link>
          <div className="hidden lg:block text-sm text-muted-foreground">
            {new Date().toLocaleDateString(INTL_LOCALE[locale], { weekday: "long", month: "long", day: "numeric" })}
          </div>

          <div className="flex items-center gap-2">
            <LanguageToggle className="hidden sm:inline-flex" />
            <NotificationBell loader={getReceptionistNotifications} />

            {/* Account menu — mirrors the doctor and patient shells. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 pl-1.5 pr-2 h-10">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">{profile.initials}</AvatarFallback>
                  </Avatar>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="font-medium text-foreground truncate">{profile.name}</p>
                  <p className="text-xs font-normal text-muted-foreground truncate">{profile.department}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="sm:hidden px-2 py-1.5">
                  <LanguageToggle />
                </div>
                <DropdownMenuItem asChild>
                  <Link href="/receptionist/settings" className="cursor-pointer">
                    <Settings className="w-4 h-4" />
                    {t("common.settings")}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="w-4 h-4" />
                  {t("common.signOut")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="w-5 h-5" />
                  <span className="sr-only">{t("reception.toggleMenu")}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">{t("reception.navigation")}</SheetTitle>
                <div className="flex flex-col h-full">
                  <div className="h-16 flex items-center px-6 border-b border-border">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                        <HeartPulse className="w-5 h-5 text-primary-foreground" />
                      </div>
                      <span className="font-bold text-foreground">AI-PMS Clinic</span>
                    </div>
                  </div>
                  <nav className="flex-1 p-4 space-y-1"><NavLinks onNavigate={() => setIsMobileMenuOpen(false)} /></nav>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          <div key={pathname} className="animate-fade-in">{children}</div>
        </main>
      </div>
    </div>
  )
}
