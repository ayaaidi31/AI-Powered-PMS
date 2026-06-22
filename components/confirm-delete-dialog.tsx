"use client"

/**
 * Deep-confirmation dialog for destructive actions (delete / retract). Requires
 * the user to (1) type a confirm phrase exactly and (2) give a reason, before the
 * action button enables — so removals are always deliberate and audited.
 */
import { useState, useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

export function ConfirmDeleteDialog({
  open, onOpenChange, title, description, consequence, confirmPhrase,
  confirmLabel = "Delete", destructive = true, pending = false, onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** Highlighted consequence line (e.g. "This cannot be undone"). */
  consequence: string
  /** The exact text the user must type to enable the action. */
  confirmPhrase: string
  confirmLabel?: string
  destructive?: boolean
  pending?: boolean
  onConfirm: (reason: string) => void
}) {
  const [typed, setTyped] = useState("")
  const [reason, setReason] = useState("")

  useEffect(() => {
    if (open) { setTyped(""); setReason("") }
  }, [open])

  const matches = typed.trim().toLowerCase() === confirmPhrase.trim().toLowerCase()
  const ready = matches && reason.trim().length > 0 && !pending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className={`w-5 h-5 ${destructive ? "text-destructive" : "text-amber-500"}`} />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className={`rounded-lg border p-3 text-sm ${destructive ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-amber-300/50 bg-amber-500/5 text-amber-700 dark:text-amber-400"}`}>
            {consequence}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Reason (required, recorded in the audit trail)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being removed?" className="min-h-[64px] field-sizing-fixed" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Type <span className="font-semibold text-foreground">{confirmPhrase}</span> to confirm
            </Label>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={confirmPhrase} autoComplete="off" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!ready}
            onClick={() => onConfirm(reason.trim())}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
