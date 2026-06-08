"use client"

/**
 * Interactive patient directory (Feature 8 — UC-REC-03).
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
import {
  Search, Filter, UserPlus, MoreHorizontal, Phone, Mail, Calendar, Shield, Pencil, Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import type { PatientRow } from "@/lib/seed-data"
import { patientName, initials, insuranceLabel, insuranceVariant } from "@/lib/display"
import { registerPatient, updatePatient, deactivatePatient, type PatientInput } from "@/lib/actions/patients"

const EMPTY_FORM: PatientInput = {
  first_name: "", last_name: "", birth_date: "", insurance_type: "gkv",
  email: "", phone: "", versicherten_id: "", guardian_contact: "",
  street: "", city: "", postal_code: "", country: "Germany",
}

export function PatientsClient({ initialPatients }: { initialPatients: PatientRow[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [searchQuery, setSearchQuery] = useState("")
  const [insuranceFilter, setInsuranceFilter] = useState<string>("all")

  // Dialog + form state. `editingId` distinguishes create from update.
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PatientInput>(EMPTY_FORM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Deactivation confirmation.
  const [deleteTarget, setDeleteTarget] = useState<PatientRow | null>(null)

  const filtered = initialPatients.filter((p) => {
    const haystack = `${p.first_name} ${p.last_name} ${p.email ?? ""}`.toLowerCase()
    const matchesSearch = haystack.includes(searchQuery.toLowerCase())
    const matchesInsurance = insuranceFilter === "all" || p.insurance_type === insuranceFilter
    return matchesSearch && matchesInsurance
  })

  const set = (field: keyof PatientInput, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFieldErrors({})
    setFormOpen(true)
  }

  function openEdit(p: PatientRow) {
    setEditingId(p.id)
    setForm({
      first_name: p.first_name, last_name: p.last_name, birth_date: p.birth_date,
      insurance_type: p.insurance_type, email: p.email ?? "", phone: p.phone ?? "",
      versicherten_id: p.versicherten_id ?? "", guardian_contact: p.guardian_contact ?? "",
      street: p.street ?? "", city: p.city ?? "", postal_code: p.postal_code ?? "",
      country: p.country ?? "Germany",
    })
    setFieldErrors({})
    setFormOpen(true)
  }

  /** Persist the form. `allowDuplicate` re-submits past the duplicate guard. */
  function submit(allowDuplicate = false) {
    setFieldErrors({})
    startTransition(async () => {
      const result = editingId
        ? await updatePatient(editingId, form)
        : await registerPatient(form, allowDuplicate)

      if (result.status === "ok") {
        toast.success(editingId ? "Patient updated." : "Patient registered.")
        setFormOpen(false)
        router.refresh()
        return
      }
      if (result.status === "conflict") {
        // Duplicate patient (REQ-REC-11) — let the receptionist decide.
        toast.warning(result.message, {
          action: { label: "Create anyway", onClick: () => submit(true) },
        })
        return
      }
      setFieldErrors(result.fieldErrors ?? {})
      toast.error(result.message)
    })
  }

  function confirmDeactivate() {
    if (!deleteTarget) return
    startTransition(async () => {
      const result = await deactivatePatient(deleteTarget.id)
      if (result.status === "ok") {
        toast.success("Patient deactivated.")
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
          <h1 className="text-2xl font-bold text-foreground">Patients</h1>
          <p className="text-muted-foreground">Manage patient records and information</p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
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
                <SelectItem value="gkv">Public (GKV)</SelectItem>
                <SelectItem value="pkv">Private (PKV)</SelectItem>
                <SelectItem value="selbstzahler">Self-Pay</SelectItem>
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
            {filtered.length} patient{filtered.length !== 1 ? "s" : ""} found
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
                        <Badge variant="outline" className="text-muted-foreground">Analog</Badge>
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
                        DOB: {new Date(patient.birth_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="hidden sm:flex gap-1" onClick={() => openEdit(patient)}>
                      <Pencil className="w-4 h-4" />
                      Edit
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
                          Edit Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteTarget(patient)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Deactivate
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
              <p>No patients found matching your search</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Patient" : "Register New Patient"}</DialogTitle>
            <DialogDescription>
              {editingId
                ? "Update the patient's profile details."
                : "Name and date of birth are required. Email/phone are optional — provide them to enable portal access."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name" error={fieldErrors.first_name}>
                <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
              </Field>
              <Field label="Last Name" error={fieldErrors.last_name}>
                <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date of Birth" error={fieldErrors.birth_date}>
                <Input type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} />
              </Field>
              <Field label="Insurance Type">
                <Select value={form.insurance_type} onValueChange={(v) => set("insurance_type", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gkv">Public (GKV)</SelectItem>
                    <SelectItem value="pkv">Private (PKV)</SelectItem>
                    <SelectItem value="selbstzahler">Self-Pay</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email (optional)" error={fieldErrors.email}>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </Field>
              <Field label="Phone (optional)">
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </Field>
            </div>
            {form.insurance_type === "gkv" && (
              <Field label="Insurance Number (KVNR)">
                <Input value={form.versicherten_id} onChange={(e) => set("versicherten_id", e.target.value)} />
              </Field>
            )}
            <Field label="Street">
              <Input value={form.street} onChange={(e) => set("street", e.target.value)} />
            </Field>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Postal Code">
                <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label="Country">
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
              </Field>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={isPending}>Cancel</Button>
            <Button onClick={() => submit()} disabled={isPending}>
              {isPending ? "Saving…" : editingId ? "Save Changes" : "Register Patient"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivation confirmation (soft delete) */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate patient?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && `${patientName(deleteTarget)} will be hidden from active lists. `}
              The record and its clinical history are retained for the statutory retention period (§630f BGB).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Keep Active</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivate}
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Small labelled field wrapper with inline validation message. */
function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
