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
import { logout } from "@/lib/actions/auth"
import { getPatientNotifications } from "@/lib/actions/patient-notifications"

// Primary sections — the day-to-day tasks.
const mainNav = [
  { label: "Dashboard", href: "/patient/dashboard", icon: LayoutDashboard },
  { label: "My Appointments", href: "/patient/appointments", icon: Calendar },
  { label: "Health Records", href: "/patient/records", icon: FileText },
  { label: "Documents", href: "/patient/documents", icon: FolderOpen },
]
// Account — tucked into the avatar menu (and the mobile sheet).
const accountNav = [
  { label: "My Profile", href: "/patient/profile", icon: User },
  { label: "Billing", href: "/patient/invoices", icon: Receipt },
]

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
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            {/* Right: notifications + account menu */}
            <div className="hidden md:flex items-center gap-2">
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
                    <p className="text-xs font-normal text-muted-foreground">Patient account</p>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {accountNav.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href} className="cursor-pointer">
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
                    <LogOut className="w-4 h-4" />
                    Log out
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
                    <span className="sr-only">Toggle menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-72">
                  <SheetTitle>Navigation Menu</SheetTitle>
                  <SheetDescription>Access your practice management tools</SheetDescription>
                  <div className="flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-6">
                      <span className="w-9 h-9 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{patientName}</p>
                        <p className="text-xs text-muted-foreground">Patient account</p>
                      </div>
                    </div>

                    <nav className="flex flex-col gap-1">
                      {[...mainNav, ...accountNav].map((item) => {
                        const isActive = pathname === item.href
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                              isActive
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-accent"
                            }`}
                          >
                            <item.icon className="w-5 h-5" />
                            {item.label}
                          </Link>
                        )
                      })}
                    </nav>

                    <div className="mt-auto pt-4 border-t border-border">
                      <Button variant="outline" className="w-full" onClick={handleLogout}>
                        <LogOut className="w-4 h-4 mr-2" />
                        Log out
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Clinic FAQ assistant (Mistral-backed) */}
      <FaqChat />
    </div>
  )
}
