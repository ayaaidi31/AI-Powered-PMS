/**
 * Pure translation lookup, shared by the server and client accessors. Given a
 * message dictionary and a dot-path key, it returns the string, substituting any
 * {placeholder} tokens. A missing key returns the key itself (and warns in
 * development) so a gap is visible rather than crashing the render.
 */
import type { Messages } from "./messages"

/** Dot-path keys of the message tree, e.g. "dashboard.startConsult". */
type Leaves<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`
}[keyof T & string]

export type TKey = Leaves<Messages>
export type TVars = Record<string, string | number>
export type TFunction = (key: TKey, vars?: TVars) => string

export function translate(dict: Messages, key: string, vars?: TVars): string {
  const raw = key
    .split(".")
    .reduce<unknown>((node, part) => (node == null ? node : (node as Record<string, unknown>)[part]), dict)

  if (typeof raw !== "string") {
    if (process.env.NODE_ENV !== "production") console.warn(`[i18n] missing message key: ${key}`)
    return key
  }
  if (!vars) return raw
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => (name in vars ? String(vars[name]) : `{${name}}`))
}
