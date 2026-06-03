"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { HeartPulse, LayoutDashboard, Calendar, Users, LogOut, Menu, Clock, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useState } from "react"
import { Input } from "@/components/ui/input"

const navItems = [
  { label: "Dashboard", href: "/receptionist/dashboard", icon: LayoutDashboard },
  { label: "Schedule", href: "/receptionist/schedule", icon: Calendar },
  { label: "Patients", href: "/receptionist/patients", icon: Users },
  { label: "Waiting Room", href: "/receptionist/waiting", icon: Clock },
]

export default function ReceptionistLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleLogout = () => {
    sessionStorage.removeItem("userRole")
    sessionStorage.removeItem("isAuthenticated")
    router.push("/")
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Link href="/receptionist/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <HeartPulse className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">AI-PMS Clinic</span>
          </Link>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search patients..." className="pl-9" />
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
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

        {/* User Section */}
        <div className="p-4 border-t border-border">
          <div className="mb-3">
            <p className="text-sm font-medium text-foreground">Reception Staff</p>
            <p className="text-xs text-muted-foreground">Front Desk</p>
          </div>
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-50 h-16 border-b border-border bg-card flex items-center justify-between px-4">
          <Link href="/receptionist/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <HeartPulse className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">AI-PMS Clinic</span>
          </Link>

          <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="w-5 h-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="flex flex-col h-full">
                <div className="h-16 flex items-center px-6 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                      <HeartPulse className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <span className="font-bold text-foreground">AI-PMS Clinic</span>
                  </div>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                  {navItems.map((item) => {
                    const isActive = pathname.startsWith(item.href)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
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

                <div className="p-4 border-t border-border">
                  <Button variant="outline" className="w-full" onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
