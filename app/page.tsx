"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Activity, Stethoscope, Users, HeartPulse } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type UserRole = "patient" | "doctor" | "receptionist"

// Demo credentials for testing
const DEMO_CREDENTIALS = {
  patient: { email: "max.mustermann@email.com", password: "demo123" },
  doctor: { email: "dr.smith@clinic.com", password: "demo123" },
  receptionist: { email: "reception@clinic.com", password: "demo123" },
}

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [activeRole, setActiveRole] = useState<UserRole>("patient")
  const [formData, setFormData] = useState({ email: "", password: "" })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Allow demo credentials or any non-empty values for testing
    if (formData.email && formData.password) {
      // Store role in sessionStorage for demo purposes
      sessionStorage.setItem("userRole", activeRole)
      sessionStorage.setItem("isAuthenticated", "true")
      
      // Redirect based on role
      switch (activeRole) {
        case "patient":
          router.push("/patient/dashboard")
          break
        case "doctor":
          router.push("/doctor/dashboard")
          break
        case "receptionist":
          router.push("/receptionist/dashboard")
          break
      }
    } else {
      setError("Please enter your email and password")
      setIsLoading(false)
    }
  }

  const fillDemoCredentials = () => {
    const credentials = DEMO_CREDENTIALS[activeRole]
    setFormData({ email: credentials.email, password: credentials.password })
  }

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-foreground/20 rounded-lg flex items-center justify-center">
              <HeartPulse className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-primary-foreground">AI-PMS Clinic</span>
          </div>
        </div>
        
        <div className="space-y-8">
          <h1 className="text-4xl font-bold text-primary-foreground leading-tight text-balance">
            AI-Powered Practice Management System
          </h1>
          <p className="text-lg text-primary-foreground/80 leading-relaxed">
            Streamline your medical practice with intelligent appointment scheduling, 
            AI-assisted documentation, and seamless patient communication.
          </p>
          
          <div className="grid grid-cols-2 gap-6 pt-8">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary-foreground/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Stethoscope className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-foreground">For Doctors</h3>
                <p className="text-sm text-primary-foreground/70">AI-assisted report generation and billing</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary-foreground/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-foreground">For Patients</h3>
                <p className="text-sm text-primary-foreground/70">Easy scheduling and mobile check-in</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary-foreground/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Activity className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-foreground">For Staff</h3>
                <p className="text-sm text-primary-foreground/70">Efficient front desk management</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary-foreground/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <HeartPulse className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-foreground">GDPR Compliant</h3>
                <p className="text-sm text-primary-foreground/70">Secure and privacy-focused</p>
              </div>
            </div>
          </div>
        </div>
        
        <p className="text-sm text-primary-foreground/60">
          Secure, GDPR-compliant healthcare platform
        </p>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <HeartPulse className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">AI-PMS Clinic</span>
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
            <p className="text-muted-foreground mt-2">
              Sign in to access your portal
            </p>
          </div>

          <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as UserRole)} className="w-full">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="patient">Patient</TabsTrigger>
              <TabsTrigger value="doctor">Doctor</TabsTrigger>
              <TabsTrigger value="receptionist">Staff</TabsTrigger>
            </TabsList>

            <TabsContent value={activeRole} className="mt-6">
              <Card className="border-border">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">
                    {activeRole === "patient" && "Patient Portal"}
                    {activeRole === "doctor" && "Doctor Workspace"}
                    {activeRole === "receptionist" && "Staff Portal"}
                  </CardTitle>
                  <CardDescription>
                    {activeRole === "patient" && "Book appointments and view your health records"}
                    {activeRole === "doctor" && "Manage consultations and patient care"}
                    {activeRole === "receptionist" && "Manage schedules and front desk operations"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {error && (
                      <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                        {error}
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="Enter your email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        required
                        autoComplete="email"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter your password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                        autoComplete="current-password"
                      />
                    </div>

                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? "Signing in..." : "Sign In"}
                    </Button>
                  </form>

                  <div className="mt-4 pt-4 border-t border-border">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={fillDemoCredentials}
                    >
                      Fill Demo Credentials
                    </Button>
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Use demo credentials to explore the system
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <p className="text-center text-sm text-muted-foreground">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  )
}
