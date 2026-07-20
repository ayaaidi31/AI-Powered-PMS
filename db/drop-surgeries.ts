/**
 * db/drop-surgeries.ts — removes the unused `surgeries` table.
 *
 * The surgical-history concept was modelled and seeded but never surfaced in the
 * UI and had no create/update/delete path, so it was removed from the
 * application. This script drops the now-orphaned table from the database.
 *
 * SAFETY:
 *  1. Backs up every row + column definition to db/_backup-surgeries.json BEFORE
 *     dropping. If the backup write fails, it aborts without dropping.
 *  2. `surgeries` is a leaf table (nothing references it), so the drop needs no
 *     CASCADE. Uses IF EXISTS.
 *  3. Never references the langchain_pg_* RAG tables.
 *
 * Run with:  pnpm exec tsx db/drop-surgeries.ts
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { pool } from "./_connect"

async function main() {
  const backup: Record<string, unknown> = { takenAt: new Date().toISOString() }

  const exists = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='surgeries'`,
  )
  if (exists.rowCount === 0) {
    console.log("[OK] Table 'surgeries' does not exist — nothing to drop.")
    return
  }

  const cols = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='surgeries' ORDER BY ordinal_position`,
  )
  const rows = await pool.query(`SELECT * FROM surgeries`)
  backup.columns = cols.rows
  backup.rowCount = rows.rowCount
  backup.rows = rows.rows

  const backupPath = join(process.cwd(), "db", "_backup-surgeries.json")
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf8")
  console.log(`[OK] Backed up ${rows.rowCount} row(s) to ${backupPath}`)

  await pool.query(`DROP TABLE IF EXISTS surgeries`)
  console.log("[OK] Table 'surgeries' dropped.")
}

main()
  .catch((e) => { console.error("[FAIL] Failed:", e); process.exitCode = 1 })
  .finally(() => pool.end())
