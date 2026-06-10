"use client"

/**
 * Doctor's patient directory (read-only). Lists the patients the doctor has
 * treated with their key clinical flags (allergies, conditions) and last visit.
 * Search is performed client-side over the already-loaded list.
 */
import { useState } from "react"
import Link from "next/link"
import { Search, Users, AlertCircle, Calendar, Activity, ClipboardList, ChevronRight } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import type { DoctorPatientRow } from "@/lib/queries"
import { patientName, initials, insuranceLabel, insuranceVariant } from "@/lib/display"

function age(birthDate: string) {
  const b = new Date(birthDate)
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--
  return a
}

export function DoctorPatientsClient({ patients }: { patients: DoctorPatientRow[] }) {
  const [query, setQuery] = useState("")

  const filtered = patients.filter((p) =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="w-6 h-6 text-primary" /> My Patients
        </h1>
        <p className="text-muted-foreground">Patients you have treated</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search patients by name…"
              className="pl-10"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Patient Records</CardTitle>
          <CardDescription>{filtered.length} patient{filtered.length !== 1 ? "s" : ""}</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>No patients found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((p) => (
                <Link key={p.id} href={`/doctor/patients/${p.id}`} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-lg border border-border hover:bg-accent/40 transition-colors">
                  <Avatar className="w-12 h-12 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {initials(p.first_name, p.last_name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground truncate">{patientName(p)}</h3>
                      <Badge variant={insuranceVariant(p.insurance_type)}>{insuranceLabel(p.insurance_type)}</Badge>
                      {p.allergies.length > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {p.allergies.join(", ")}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span>{age(p.birth_date)} years old</span>
                      <span className="flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5" />
                        {p.condition_count} condition{p.condition_count !== 1 ? "s" : ""}
                      </span>
                      <span className="flex items-center gap-1">
                        <ClipboardList className="w-3.5 h-3.5" />
                        {p.visit_count} visit{p.visit_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground sm:text-right shrink-0">
                    <div className="flex items-center gap-1 sm:justify-end">
                      <Calendar className="w-3.5 h-3.5" />
                      Last visit
                    </div>
                    <p className="font-medium text-foreground">
                      {p.last_visit ? new Date(p.last_visit).toLocaleDateString("de-DE") : "—"}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0 hidden sm:block" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
