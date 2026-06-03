"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { HeartPulse, LayoutDashboard, Calendar, FileText, User, LogOut, Menu, X, MessageCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetTrigger, SheetTitle } from "@/components/ui/sheet"
import { useState } from "react"

const navItems = [
  { label: "Dashboard", href: "/patient/dashboard", icon: LayoutDashboard },
  { label: "My Appointments", href: "/patient/appointments", icon: Calendar },
  { label: "Health Records", href: "/patient/records", icon: FileText },
  { label: "My Profile", href: "/patient/profile", icon: User },
]

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)

  const handleLogout = () => {
    sessionStorage.removeItem("userRole")
    sessionStorage.removeItem("isAuthenticated")
    router.push("/")
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

      {/* Floating Chat Widget */}
      <div className="fixed bottom-6 right-6 z-50">
        {isChatOpen && (
          <div className="mb-4 bg-card border border-border rounded-lg shadow-lg w-80 overflow-hidden">
            <div className="p-4 border-b border-border bg-muted">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Clinic FAQ Bot
                </h3>
                <Button variant="ghost" size="icon" onClick={() => setIsChatOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Ask about parking, hours, directions, etc.
              </p>
            </div>
            <div className="p-4 h-48 bg-background flex items-center justify-center">
              <p className="text-muted-foreground text-sm text-center">
                Chat interface placeholder - Ready for AI integration
              </p>
            </div>
            <div className="p-3 bg-card border-t border-border">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type your question..."
                  className="flex-1 px-3 py-2 text-sm border border-input rounded-md bg-background"
                />
                <Button size="sm">Send</Button>
              </div>
            </div>
          </div>
        )}
        <Button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="rounded-full w-14 h-14 shadow-lg"
        >
          <MessageCircle className="w-6 h-6" />
          <span className="sr-only">Open FAQ Chatbot</span>
        </Button>
      </div>
    </div>
  )
}
