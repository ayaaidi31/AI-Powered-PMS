/**
 * db/_connect.ts — shared connection bootstrap for standalone DB scripts.
 * Loads .env.local (scripts don't get Next.js' automatic env loading) and
 * exports a configured pg Pool.
 */
import { config } from "dotenv"
import { Pool } from "pg"

// Load .env.local first, then .env as fallback.
config({ path: ".env.local" })
config()

const rawConnectionString = process.env.DATABASE_URL
if (!rawConnectionString) {
  console.error("[FAIL] DATABASE_URL is not set in .env.local")
  process.exit(1)
}

// SSL is set explicitly below, so the sslmode query parameter is redundant.
// Dropping it avoids the pg deprecation warning about sslmode semantics changing
// in a future major release, without altering the connection behaviour.
function stripSslMode(raw: string): string {
  try {
    const url = new URL(raw)
    url.searchParams.delete("sslmode")
    return url.toString()
  } catch {
    return raw
  }
}

export const pool = new Pool({
  connectionString: stripSslMode(rawConnectionString),
  ssl: { rejectUnauthorized: false },
})
