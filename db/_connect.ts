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

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error("✖ DATABASE_URL is not set in .env.local")
  process.exit(1)
}

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
})
