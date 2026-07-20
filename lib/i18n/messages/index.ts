/**
 * Message registry. English defines the canonical shape (the Messages type);
 * the `satisfies` check makes the build fail if any locale is missing a key.
 */
import type { Locale } from "../config"
import { en } from "./en"
import { de } from "./de"

export type Messages = typeof en

export const messages = { en, de } satisfies Record<Locale, Messages>
