"use client"

import { useState } from "react"
import Link from "next/link"
import { 
  Search, Filter, UserPlus, MoreHorizontal, Phone, Mail,
  Calendar, FileText, ChevronRight, Shield
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { mockPatients } from "@/lib/mock-data"

export default function PatientsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [insuranceFilter, setInsuranceFilter] = useState<string>("all")

  const filteredPatients = mockPatients.filter(patient => {
    const matchesSearch = 
      patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      patient.email.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesInsurance = insuranceFilter === "all" || patient.insuranceType === insuranceFilter
    return matchesSearch && matchesInsurance
  })

  const getInsuranceLabel = (type: string) => {
    switch (type) {
      case "public": return "GKV"
      case "private": return "PKV"
      case "self-pay": return "Self-Pay"
      default: return type
    }
  }

  const getInsuranceVariant = (type: string) => {
    switch (type) {
      case "public": return "default"
      case "private": return "secondary"
      case "self-pay": return "outline"
      default: return "outline"
    }
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Patients</h1>
          <p className="text-muted-foreground">Manage patient records and information</p>
        </div>
        <Button className="gap-2">
          <UserPlus className="w-4 h-4" />
          Register New Patient
        </Button>
      </div>

      {/* Search & Filter */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={insuranceFilter} onValueChange={setInsuranceFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Insurance Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Insurance</SelectItem>
                <SelectItem value="public">Public (GKV)</SelectItem>
                <SelectItem value="private">Private (PKV)</SelectItem>
                <SelectItem value="self-pay">Self-Pay</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Patients List */}
      <Card>
        <CardHeader>
          <CardTitle>Patient Records</CardTitle>
          <CardDescription>
            {filteredPatients.length} patient{filteredPatients.length !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredPatients.length > 0 ? (
            <div className="space-y-4">
              {filteredPatients.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
                >
                  {/* Avatar */}
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {patient.name.split(" ").map(n => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>

                  {/* Patient Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground truncate">
                        {patient.name}
                      </h3>
                      <Badge variant={getInsuranceVariant(patient.insuranceType) as "default" | "secondary" | "outline"}>
                        <Shield className="w-3 h-3 mr-1" />
                        {getInsuranceLabel(patient.insuranceType)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {patient.email}
                      </span>
                      {patient.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {patient.phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        DOB: {new Date(patient.dateOfBirth).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="hidden sm:flex gap-1">
                      <FileText className="w-4 h-4" />
                      Records
                    </Button>
                    <Button variant="outline" size="sm" className="hidden sm:flex gap-1">
                      <Calendar className="w-4 h-4" />
                      Book
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <FileText className="w-4 h-4 mr-2" />
                          View Records
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Calendar className="w-4 h-4 mr-2" />
                          Book Appointment
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Phone className="w-4 h-4 mr-2" />
                          Call Patient
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Mail className="w-4 h-4 mr-2" />
                          Send Message
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No patients found matching your search</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
