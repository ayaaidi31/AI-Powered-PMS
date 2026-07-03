"use client"

/**
 * Documents attached to a patient record — a shared panel used on both sides of
 * the clinic. The treating doctor mounts it on the patient record and in the
 * consultation workspace to attach imaging, lab results, and referrals; the
 * patient mounts it in the portal to read those files and add their own.
 *
 * Uploading and removing go through the Server Actions in lib/actions/documents;
 * the file bytes are opened through the /api/documents/[id] route. Permission to
 * remove a row is decided here for the UI, and re-checked on the server: staff
 * may remove anything on the record, a patient only what they uploaded.
 */
import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  FileText, FileImage, FlaskConical, Pill, Upload, Download, Eye, Trash2, Plus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import type { PatientDocumentRow, DocumentCategory } from "@/lib/seed-data"
import { uploadPatientDocument, deletePatientDocument } from "@/lib/actions/documents"

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: "xray", label: "X-Ray" },
  { value: "mri", label: "MRI" },
  { value: "ct", label: "CT Scan" },
  { value: "ultrasound", label: "Ultrasound" },
  { value: "lab", label: "Lab Result" },
  { value: "prescription", label: "Prescription" },
  { value: "referral", label: "Referral" },
  { value: "discharge", label: "Discharge Letter" },
  { value: "other", label: "Other" },
]
const categoryLabel = (c: string) => CATEGORIES.find((x) => x.value === c)?.label ?? "Document"

function categoryIcon(category: string, mime: string) {
  if (["xray", "mri", "ct", "ultrasound"].includes(category) || mime.startsWith("image/")) {
    return <FileImage className="w-5 h-5 text-primary" />
  }
  if (category === "lab") return <FlaskConical className="w-5 h-5 text-primary" />
  if (category === "prescription") return <Pill className="w-5 h-5 text-primary" />
  return <FileText className="w-5 h-5 text-primary" />
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

export interface PatientDocumentsProps {
  patientId: string
  documents: PatientDocumentRow[]
  /** Whether the current viewer may add documents to this record. */
  canUpload: boolean
  /** The viewer's role — decides who is allowed to remove which document. */
  viewerRole: "doctor" | "patient" | "receptionist"
  /** The viewer's own id (patient/doctor/receptionist), for ownership checks. */
  currentUserId?: string | null
  /** When mounted inside a consultation, links new uploads to that appointment. */
  appointmentId?: string | null
  /** Compact heading/spacing for embedding inside a denser panel. */
  compact?: boolean
}

export function PatientDocuments({
  patientId, documents, canUpload, viewerRole, currentUserId, appointmentId, compact,
}: PatientDocumentsProps) {
  const router = useRouter()
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState<DocumentCategory>("xray")
  const fileRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  // Reception administers the record; a doctor or patient may remove only the
  // documents they uploaded themselves (mirrors the Server Action's rule).
  const canDelete = (d: PatientDocumentRow) =>
    viewerRole === "receptionist" ||
    (d.uploaded_by_role === viewerRole && d.uploaded_by_id === currentUserId)

  function resetForm() {
    setTitle(""); setDescription(""); setCategory("xray")
    if (fileRef.current) fileRef.current.value = ""
  }

  function submitUpload() {
    const file = fileRef.current?.files?.[0]
    if (!title.trim()) { toast.error("Please enter a title."); return }
    if (!file) { toast.error("Please choose a file."); return }

    const form = new FormData()
    form.set("patient_id", patientId)
    form.set("title", title.trim())
    form.set("description", description.trim())
    form.set("category", category)
    if (appointmentId) form.set("appointment_id", appointmentId)
    form.set("file", file)

    startTransition(async () => {
      const result = await uploadPatientDocument(form)
      if (result.status === "ok") {
        toast.success("Document uploaded.")
        setUploadOpen(false)
        resetForm()
        router.refresh()
      } else {
        toast.error(result.message)
      }
    })
  }

  function confirmDelete() {
    if (!deleteId) return
    startTransition(async () => {
      const result = await deletePatientDocument(deleteId)
      if (result.status === "ok") {
        toast.success("Document removed.")
        router.refresh()
      } else {
        toast.error(result.message)
      }
      setDeleteId(null)
    })
  }

  return (
    <Card>
      <CardHeader className={compact ? "pb-2" : "pb-3"}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className={compact ? "text-sm flex items-center gap-2" : "text-base flex items-center gap-2"}>
              <FileImage className="w-4 h-4 text-primary" />
              Documents
            </CardTitle>
            <CardDescription>
              {documents.length} file{documents.length !== 1 ? "s" : ""} · imaging, lab results, referrals
            </CardDescription>
          </div>
          {canUpload && (
            <Button size="sm" className="gap-2" onClick={() => setUploadOpen(true)}>
              <Plus className="w-4 h-4" /> Upload
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <div className="text-center py-6">
            <FileImage className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No documents yet.{canUpload ? " Use “Upload” to attach one." : ""}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((d) => (
              <div
                key={d.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {categoryIcon(d.category, d.mime_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground truncate">{d.title}</span>
                    <Badge variant="secondary" className="text-xs">{categoryLabel(d.category)}</Badge>
                  </div>
                  {d.description && <p className="text-sm text-muted-foreground truncate">{d.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    {d.uploaded_by_name} · {fmtDate(d.created_at)} · {formatSize(d.file_size)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button asChild variant="ghost" size="icon" title="View">
                    <a href={`/api/documents/${d.id}`} target="_blank" rel="noopener noreferrer">
                      <Eye className="w-4 h-4" />
                    </a>
                  </Button>
                  <Button asChild variant="ghost" size="icon" title="Download">
                    <a href={`/api/documents/${d.id}?download=1`}>
                      <Download className="w-4 h-4" />
                    </a>
                  </Button>
                  {canDelete(d) && (
                    <Button
                      variant="ghost" size="icon" title="Remove"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(d.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!o) resetForm(); setUploadOpen(o) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" /> Upload document
            </DialogTitle>
            <DialogDescription>
              Attach an image, PDF, or DICOM file (up to 15 MB) to the record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title" placeholder="e.g. Chest X-Ray, left lateral"
                value={title} onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-category">Type</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
                <SelectTrigger id="doc-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-description">Description</Label>
              <Textarea
                id="doc-description" rows={3} placeholder="Add any notes about this document (optional)."
                value={description} onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-file">File</Label>
              <Input id="doc-file" type="file" ref={fileRef}
                accept="image/*,application/pdf,.dcm,application/dicom" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setUploadOpen(false) }} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submitUpload} disabled={isPending} className="gap-2">
              <Upload className="w-4 h-4" /> {isPending ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove document</AlertDialogTitle>
            <AlertDialogDescription>
              This document will be removed from the record. This action cannot be undone from the interface.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Keep</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete} disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
