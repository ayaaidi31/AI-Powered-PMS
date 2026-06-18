"use client"

/**
 * Doctor notification bell. Loads live alerts (waiting patients, reports awaiting
 * approval) via `getDoctorNotifications` and shows them in a dropdown with an
 * unread count badge. Refreshes when opened.
 */
import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Bell, UserCheck, FileText, Receipt, Stethoscope, Inbox, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/** Shape shared by doctor and receptionist notifications. */
export interface NotificationItem {
  id: string
  kind: string
  title: string
  description: string
  href: string
}

const KIND_ICON: Record<string, { Icon: LucideIcon; tone: string }> = {
  waiting: { Icon: UserCheck, tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  report: { Icon: FileText, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  billing: { Icon: Receipt, tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  staff: { Icon: Stethoscope, tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
}

export function NotificationBell({ loader }: { loader: () => Promise<NotificationItem[]> }) {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>([])

  const load = useCallback(() => {
    loader().then(setItems).catch(() => setItems([]))
  }, [loader])

  useEffect(() => { load() }, [load])

  return (
    <DropdownMenu onOpenChange={(open) => open && load()}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="w-5 h-5" />
          {items.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold">
              {items.length > 9 ? "9+" : items.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {items.length > 0 && <span className="text-xs font-normal text-muted-foreground">{items.length} new</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
            <Inbox className="w-6 h-6" />
            <p className="text-sm">You&apos;re all caught up.</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto py-1">
            {items.map((n) => {
              const { Icon, tone } = KIND_ICON[n.kind] ?? { Icon: Bell, tone: "bg-muted text-muted-foreground" }
              return (
                <button
                  key={n.id}
                  onClick={() => router.push(n.href)}
                  className="w-full text-left flex items-start gap-3 px-2 py-2 rounded-md hover:bg-accent transition-colors"
                >
                  <span className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${tone}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-foreground truncate">{n.title}</span>
                    <span className="block text-xs text-muted-foreground truncate">{n.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
