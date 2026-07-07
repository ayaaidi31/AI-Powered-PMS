/**
 * Self check-in codes (Feature 3).
 *
 * A short code the patient receives at booking and enters at the clinic QR page
 * to mark arrival. The alphabet deliberately omits ambiguous characters
 * (0/O, 1/I/L, etc.) so it is easy to read off a screen and type on a keypad.
 * Six characters over this 28-symbol alphabet give ~28^6 ≈ 480M combinations,
 * which — combined with the lookup being scoped to a single day's scheduled
 * appointments — makes guessing impractical.
 */
import { randomInt } from "node:crypto"

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789" // no O, I, L, 0, 1
const CODE_LENGTH = 6

/** Generate a random check-in code (uppercase, no ambiguous characters). */
export function generateCheckInCode(): string {
  let code = ""
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)]
  }
  return code
}

/** Normalise user input for comparison (trim, uppercase, strip spaces). */
export function normalizeCheckInCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "")
}
