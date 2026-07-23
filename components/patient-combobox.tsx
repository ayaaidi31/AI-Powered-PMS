"use client"

/**
 * Searchable patient picker for staff booking flows. Matches on name, date of
 * birth and insurance number (KVNR), and shows the date of birth and KVNR next
 * to each name so patients who share a name can be told apart — a plain dropdown
 * of names is ambiguous when names collide.
 */
import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import type { PatientRow } from "@/lib/seed-data"
import { patientName } from "@/lib/display"
import { useT, useLocale } from "@/lib/i18n/locale-context"
import { INTL_LOCALE } from "@/lib/i18n/config"

export function PatientCombobox({
  patients, value, onChange,
}: {
  patients: PatientRow[]
  value: string
  onChange: (patientId: string) => void
}) {
  const t = useT()
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const selected = patients.find((p) => p.id === value)
  const fmtDob = (iso: string) =>
    new Date(iso).toLocaleDateString(INTL_LOCALE[locale], { day: "2-digit", month: "2-digit", year: "numeric" })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {selected
            ? <span className="truncate">{patientName(selected)} · {fmtDob(selected.birth_date)}</span>
            : <span className="text-muted-foreground">{t("receptionMgmt.selectPatient")}</span>}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={t("receptionMgmt.searchPatient")} />
          <CommandList>
            <CommandEmpty>{t("receptionMgmt.noPatientFound")}</CommandEmpty>
            <CommandGroup>
              {patients.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${patientName(p)} ${p.birth_date} ${fmtDob(p.birth_date)} ${p.versicherten_id ?? ""}`}
                  onSelect={() => { onChange(p.id); setOpen(false) }}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="flex flex-col min-w-0">
                    <span className="truncate">{patientName(p)}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {fmtDob(p.birth_date)}{p.versicherten_id ? ` · ${p.versicherten_id}` : ""}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
