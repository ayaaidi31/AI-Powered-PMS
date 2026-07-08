"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { HeartPulse, LayoutDashboard, Calendar, FileText, FolderOpen, User, LogOut, Menu } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { useState } from "react"
import { FaqChat } from "@/components/faq-chat"
import { logout } from "@/lib/actions/auth"

const navItems = [
  { label: "Dashboard", href: "/patient/dashboard", icon: LayoutDashboard },
  { label: "My Appointments", href: "/patient/appointments", icon: Calendar },
  { label: "Health Records", href: "/patient/records", icon: FileText },
  { label: "Documents", href: "/patient/documents", icon: FolderOpen },
  { label: "My Profile", href: "/patient/profile", icon: User },
]

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const handleLogout = async () => {
    await logout() // clears the session cookie server-side
    router.push("/")
    router.refresh()
  }

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

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
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

            {/* User Section */}
            <div className="hidden md:flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Welcome, Max</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden">
                  <Menu className="w-5 h-5" />
                  <span className="sr-only">Toggle menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetTitle>Navigation Menu</SheetTitle>
                <SheetDescription>Access your practice management tools</SheetDescription>
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-2 mb-8">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                      <HeartPulse className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <span className="font-bold text-foreground">AI-PMS Clinic</span>
                  </div>

                  <nav className="flex flex-col gap-2">
                    {navItems.map((item) => {
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
                    <p className="text-sm text-muted-foreground mb-4">Signed in as Max Mustermann</p>
                    <Button variant="outline" className="w-full" onClick={handleLogout}>
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
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
