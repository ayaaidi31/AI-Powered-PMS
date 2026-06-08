/**
 * Receptionist — Billing Dashboard (Feature 3, UC-REC-01).
 *
 * Server Component: lists completed appointments awaiting billing finalisation,
 * each enriched with its attached billing items and (for private/self-pay) the
 * computed GOÄ total, plus the full invoice history. The interactive processing
 * (GKV → KV batch, PKV/Selbstzahler → invoice) happens in the client.
 */
import { getBillingWorklist, getAppointmentBillingItems, getInvoicesDetailed } from "@/lib/queries"
import { BillingClient, type BillingRow } from "./billing-client"

export const dynamic = "force-dynamic"

export default async function BillingPage() {
  const [worklist, invoices] = await Promise.all([
    getBillingWorklist(),
    getInvoicesDetailed(),
  ])

  // Attach the billing items (and a GOÄ total for non-GKV) to each entry.
  const rows: BillingRow[] = await Promise.all(
    worklist.map(async (w) => {
      const items = await getAppointmentBillingItems(w.appointment_id)
      const total =
        w.insurance_type === "gkv"
          ? null
          : items.reduce((sum, i) => sum + (i.amount_cents ?? 0), 0)
      return { ...w, items, total_cents: total }
    }),
  )

  return <BillingClient rows={rows} invoices={invoices} />
}
