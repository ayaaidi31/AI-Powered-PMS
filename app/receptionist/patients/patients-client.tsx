"use client"

/**
 * Interactive patient directory (Feature 5 — UC-REC-03).
 *
 * Renders the live patient list and drives the create/update/deactivate
 * operations through the Server Actions in lib/actions/patients. Search and
 * insurance filtering are performed client-side over the already-loaded list.
 *
 * After every successful mutation the component calls `router.refresh()` so the
 * parent Server Component re-queries the database and the list reflects the new
 * state without a full page reload.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Search, Filter, UserPlus, MoreHorizontal, Phone, Mail, Calendar, Shield, Pencil, Trash2, Building2, CreditCard,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import type { PatientRow } from "@/lib/seed-data"
import { patientName, initials, insuranceLabel, insuranceVariant } from "@/lib/display"
import { deactivatePatient } from "@/lib/actions/patients"
import { PatientFormDialog } from "@/components/patient-form-dialog"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"

export function PatientsClient({ initialPatients }: { initialPatients: PatientRow[] }) {
  const router = useRouter()
  const t = useT()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()

  const [searchQuery, setSearchQuery] = useState("")
  const [insuranceFilter, setInsuranceFilter] = useState<string>("all")

  // Create/edit dialog. `editingPatient` is null for a new registration.
  const [formOpen, setFormOpen] = useState(false)
  const [editingPatient, setEditingPatient] = useState<PatientRow | null>(null)

  // Deactivation confirmation.
  const [deleteTarget, setDeleteTarget] = useState<PatientRow | null>(null)

  const filtered = initialPatients.filter((p) => {
    const haystack = `${p.first_name} ${p.last_name} ${p.email ?? ""}`.toLowerCase()
    const matchesSearch = haystack.includes(searchQuery.toLowerCase())
    const matchesInsurance = insuranceFilter === "all" || p.insurance_type === insuranceFilter
    return matchesSearch && matchesInsurance
  })

  function openCreate() {
    setEditingPatient(null)
    setFormOpen(true)
  }

  function openEdit(p: PatientRow) {
    setEditingPatient(p)
    setFormOpen(true)
  }

  function confirmDeactivate() {
    if (!deleteTarget) return
    startTransition(async () => {
      const result = await deactivatePatient(deleteTarget.id)
      if (result.status === "ok") {
        toast.success(t("receptionMgmt.patientDeactivatedToast"))
        router.refresh()
      } else {
        toast.error(result.message)
      }
      setDeleteTarget(null)
    })
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("receptionMgmt.patientsTitle")}</h1>
          <p className="text-muted-foreground">{t("receptionMgmt.patientsSubtitle")}</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <UserPlus className="w-4 h-4" />
          {t("receptionMgmt.registerNewPatient")}
        </Button>
      </div>

      {/* Search & Filter */}
      <Card className="mb-6">
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t("receptionMgmt.searchPlaceholder")}
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={insuranceFilter} onValueChange={setInsuranceFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder={t("receptionMgmt.insuranceTypePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("receptionMgmt.allInsurance")}</SelectItem>
                <SelectItem value="gkv">{t("receptionMgmt.insuranceGkv")}</SelectItem>
                <SelectItem value="pkv">{t("receptionMgmt.insurancePkv")}</SelectItem>
                <SelectItem value="selbstzahler">{t("receptionMgmt.insuranceSelfPay")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Patients List */}
      <Card>
        <CardHeader>
          <CardTitle>{t("receptionMgmt.patientRecords")}</CardTitle>
          <CardDescription>
            {filtered.length === 1
              ? t("receptionMgmt.patientFound", { count: filtered.length })
              : t("receptionMgmt.patientsFound", { count: filtered.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length > 0 ? (
            <div className="space-y-4">
              {filtered.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
                >
                  <Link href={`/receptionist/patients/${patient.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <Avatar className="w-12 h-12">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {initials(patient.first_name, patient.last_name)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-foreground truncate">
                        {patientName(patient)}
                      </h3>
                      <Badge variant={insuranceVariant(patient.insurance_type)}>
                        <Shield className="w-3 h-3 mr-1" />
                        {insuranceLabel(patient.insurance_type)}
                      </Badge>
                      {!patient.is_digital_active && (
                        <Badge variant="outline" className="text-muted-foreground">{t("receptionMgmt.analog")}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {patient.email && (
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {patient.email}
                        </span>
                      )}
                      {patient.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {patient.phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {t("receptionMgmt.dob")}: {new Date(patient.birth_date).toLocaleDateString(INTL_LOCALE[locale])}
                      </span>
                      {patient.insurer_name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {patient.insurer_name}
                        </span>
                      )}
                      {patient.versicherten_id && (
                        <span className="flex items-center gap-1 font-mono text-xs">
                          <CreditCard className="w-3 h-3" />
                          {patient.versicherten_id}
                        </span>
                      )}
                    </div>
                  </div>
                  </Link>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="hidden sm:flex gap-1" onClick={() => openEdit(patient)}>
                      <Pencil className="w-4 h-4" />
                      {t("receptionMgmt.edit")}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(patient)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          {t("receptionMgmt.editProfile")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteTarget(patient)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          {t("receptionMgmt.deactivate")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>{t("receptionMgmt.noPatientsFound")}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / edit dialog (shared with the patient detail page) */}
      <PatientFormDialog open={formOpen} onOpenChange={setFormOpen} patient={editingPatient} />

      {/* Deactivation confirmation (soft delete) */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("receptionMgmt.deactivateDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && `${t("receptionMgmt.deactivateDescLead", { name: patientName(deleteTarget) })} `}
              {t("receptionMgmt.deactivateDescTail")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>{t("receptionMgmt.keepActive")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivate}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("receptionMgmt.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
