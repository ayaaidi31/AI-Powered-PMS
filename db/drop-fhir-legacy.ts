/**
 * db/drop-fhir-legacy.ts — removes the obsolete FHIR-style tables that
 * seed-data.ts replaced: condition, encounter, patient (singular),
 * awmf_guideline_chunks.
 *
 * SAFETY:
 *  1. Backs up every row + column definition of those tables to
 *     db/_backup-fhir-legacy.json BEFORE dropping anything. If the backup
 *     write fails, it aborts without dropping.
 *  2. Drops in FK-dependency order, no CASCADE, IF EXISTS.
 *  3. Never references the langchain_pg_* RAG tables.
 *
 * Run with:  pnpm exec tsx db/drop-fhir-legacy.ts
 */
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { pool } from "./_connect"

// FK-safe drop order: children first.
const LEGACY_TABLES = ["condition", "encounter", "patient", "awmf_guideline_chunks"]

async function main() {
  // ── 1. Back up structure + data ──
  const backup: Record<string, unknown> = { takenAt: new Date().toISOString(), tables: {} }
  const tables = backup.tables as Record<string, unknown>

  for (const t of LEGACY_TABLES) {
    const exists = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
      [t],
    )
    if (exists.rowCount === 0) {
      tables[t] = { exists: false }
      continue
    }
    const cols = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [t],
    )
    const rows = await pool.query(`SELECT * FROM "${t}"`)
    tables[t] = { exists: true, columns: cols.rows, rowCount: rows.rowCount, rows: rows.rows }
    console.log(`  backed up ${t}: ${rows.rowCount} rows`)
  }

  const backupPath = join(process.cwd(), "db", "_backup-fhir-legacy.json")
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf8")
  console.log(`[OK] Backup written to ${backupPath}`)

  // ── 2. Drop in dependency order ──
  for (const t of LEGACY_TABLES) {
    await pool.query(`DROP TABLE IF EXISTS "${t}"`)
    console.log(`  dropped ${t}`)
  }
  console.log("[OK] Legacy FHIR tables removed.")
}

main()
  .catch((e) => { console.error("[FAIL] Failed:", e); process.exitCode = 1 })
  .finally(() => pool.end())
