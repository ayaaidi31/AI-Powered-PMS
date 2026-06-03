"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  FileText, 
  Settings, 
  LogOut,
  Menu,
  X,
  Stethoscope,
  ClipboardList,
  Receipt,
  Bell,
  ChevronDown
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { currentUser } from "@/lib/mock-data"

const navigation = [
  { name: "Dashboard", href: "/doctor/dashboard", icon: LayoutDashboard },
  { name: "Workspace", href: "/doctor/workspace", icon: Stethoscope },
  { name: "Schedule", href: "/doctor/schedule", icon: Calendar },
  { name: "Patients", href: "/doctor/patients", icon: Users },
  { name: "Reports", href: "/doctor/reports", icon: FileText },
  { name: "Billing", href: "/doctor/billing", icon: Receipt },
]

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const doctor = currentUser.doctor

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 z-50 h-full w-72 bg-card border-r border-border transform transition-transform duration-300 ease-in-out lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-6 border-b border-border">
            <Link href="/doctor/dashboard" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg">
                <Stethoscope className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <span className="font-bold text-lg text-foreground">AI-PMS</span>
                <p className="text-xs text-muted-foreground">Doctor Portal</p>
              </div>
            </Link>
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Doctor Info Card */}
          <div className="p-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20">
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12 border-2 border-primary/30">
                  <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                    {doctor.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{doctor.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{doctor.specialization}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">On Duty</Badge>
                <Badge variant="outline" className="text-xs">5 Patients Today</Badge>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", isActive && "text-primary-foreground")} />
                  {item.name}
                  {item.name === "Workspace" && (
                    <Badge className="ml-auto bg-destructive text-destructive-foreground text-xs">3</Badge>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Bottom Actions */}
          <div className="p-4 border-t border-border space-y-2">
            <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground">
              <Settings className="w-5 h-5" />
              Settings
            </Button>
            <Link href="/">
              <Button variant="ghost" className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive">
                <LogOut className="w-5 h-5" />
                Sign Out
              </Button>
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:pl-72">
        {/* Top Navigation */}
        <header className="sticky top-0 z-30 h-16 bg-card/80 backdrop-blur-xl border-b border-border">
          <div className="flex items-center justify-between h-full px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="w-5 h-5" />
              </Button>
              <div className="hidden sm:block">
                <h2 className="text-sm font-medium text-muted-foreground">
                  Welcome back, {doctor.name.split(" ")[0]}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString("en-US", { 
                    weekday: "long", 
                    month: "long", 
                    day: "numeric" 
                  })}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 pl-2 pr-3">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {doctor.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div>
                      <p className="font-medium">{doctor.name}</p>
                      <p className="text-xs text-muted-foreground">{doctor.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <Link href="/">
                    <DropdownMenuItem className="text-destructive">
                      <LogOut className="w-4 h-4 mr-2" />
                      Sign Out
                    </DropdownMenuItem>
                  </Link>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  )
}
