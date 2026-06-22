"use client"

/**
 * Receptionist portal shell: sidebar nav, top notification bell, profile/settings.
 * Receives the signed-in receptionist's display profile from the server layout.
 */
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { HeartPulse, LayoutDashboard, Calendar, Users, LogOut, Menu, Clock, Search, Receipt, Settings, Stethoscope } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { logout } from "@/lib/actions/auth"
import { NotificationBell } from "@/components/notification-bell"
import { getReceptionistNotifications } from "@/lib/actions/receptionists"

export interface ReceptionistProfile {
  name: string
  department: string
  email: string
  initials: string
}

const navItems = [
  { label: "Dashboard", href: "/receptionist/dashboard", icon: LayoutDashboard },
  { label: "Schedule", href: "/receptionist/schedule", icon: Calendar },
  { label: "Patients", href: "/receptionist/patients", icon: Users },
  { label: "Waiting Room", href: "/receptionist/waiting", icon: Clock },
  { label: "Staff", href: "/receptionist/staff", icon: Stethoscope },
  { label: "Billing", href: "/receptionist/billing", icon: Receipt },
]

export function ReceptionistShell({ profile, children }: { profile: ReceptionistProfile; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
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
            {item.label}
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
            <Input placeholder="Search patients..." className="pl-9" />
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1"><NavLinks /></nav>

        {/* User Section */}
        <div className="p-4 border-t border-border space-y-3">
          <div className="flex items-center gap-3">
            <Avatar className="w-9 h-9">
              <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">{profile.initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{profile.name}</p>
              <p className="text-xs text-muted-foreground truncate">{profile.department}</p>
            </div>
          </div>
          <Button asChild variant="ghost" className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground">
            <Link href="/receptionist/settings"><Settings className="w-4 h-4" /> Settings</Link>
          </Button>
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
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
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>

          <div className="flex items-center gap-2">
            <NotificationBell loader={getReceptionistNotifications} />
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="w-5 h-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
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
                  <div className="p-4 border-t border-border space-y-2">
                    <Button asChild variant="ghost" className="w-full justify-start gap-2 text-muted-foreground">
                      <Link href="/receptionist/settings" onClick={() => setIsMobileMenuOpen(false)}><Settings className="w-4 h-4" /> Settings</Link>
                    </Button>
                    <Button variant="outline" className="w-full" onClick={handleLogout}>
                      <LogOut className="w-4 h-4 mr-2" /> Logout
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}
