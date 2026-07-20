"use client"

/**
 * Doctor notification bell. Loads live alerts (waiting patients, reports awaiting
 * approval) via `getDoctorNotifications` and shows them in a dropdown with an
 * unread count badge. Refreshes when opened.
 */
import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Bell, UserCheck, FileText, Receipt, Stethoscope, Inbox, Calendar, AlertTriangle, User, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getSeenNotificationIds, markNotificationsSeen } from "@/lib/actions/notifications-seen"
import { useT } from "@/lib/i18n/locale-context"

// How often the bell quietly re-checks for new notifications (ms).
const REFRESH_MS = 60_000

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
  appointment: { Icon: Calendar, tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  alert: { Icon: AlertTriangle, tone: "bg-red-500/10 text-red-600 dark:text-red-400" },
  profile: { Icon: User, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
}

export function NotificationBell({ loader }: { loader: () => Promise<NotificationItem[]> }) {
  const router = useRouter()
  const t = useT()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [seen, setSeen] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    loader().then(setItems).catch(() => setItems([]))
  }, [loader])

  // Initial load + the server-side "seen" set, then a quiet periodic refresh so
  // new notifications appear on their own without a page reload.
  useEffect(() => {
    load()
    getSeenNotificationIds().then((ids) => setSeen(new Set(ids))).catch(() => {})
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  // Mark everything currently shown as seen (persisted server-side → all devices).
  const markSeen = useCallback((list: NotificationItem[]) => {
    const ids = list.map((n) => n.id)
    setSeen(new Set(ids))
    markNotificationsSeen(ids).catch(() => {})
  }, [])

  const unread = items.filter((n) => !seen.has(n.id)).length

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) loader().then((list) => { setItems(list); markSeen(list) }).catch(() => {})
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("notifications.title")}>
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("notifications.title")}</span>
          {items.length > 0 && <span className="text-xs font-normal text-muted-foreground">{items.length}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
            <Inbox className="w-6 h-6" />
            <p className="text-sm">{t("notifications.emptyState")}</p>
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
