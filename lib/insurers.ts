/**
 * Curated list of German health insurers, used to offer suggestions when a
 * Krankenkasse / private insurer is entered. The list is not exhaustive: the
 * statutory landscape changes as funds merge, and every field that consumes it
 * remains free text so an insurer that is not listed can still be typed. For a
 * complete, always-current register the GKV-Spitzenverband directory (statutory)
 * and the PKV-Verband member list (private) would be imported instead.
 *
 * GKV = gesetzliche Krankenversicherung (statutory); PKV = private
 * Krankenversicherung (private).
 */

export const GKV_INSURERS: string[] = [
  "Techniker Krankenkasse",
  "BARMER",
  "DAK-Gesundheit",
  "AOK Bayern",
  "AOK Baden-Württemberg",
  "AOK Nordost",
  "AOK Rheinland/Hamburg",
  "AOK NordWest",
  "AOK PLUS",
  "AOK Hessen",
  "AOK Niedersachsen",
  "AOK Bremen/Bremerhaven",
  "AOK Rheinland-Pfalz/Saarland",
  "AOK Sachsen-Anhalt",
  "KKH Kaufmännische Krankenkasse",
  "hkk Krankenkasse",
  "HEK - Hanseatische Krankenkasse",
  "IKK classic",
  "BIG direkt gesund",
  "Knappschaft",
  "SBK - Siemens-Betriebskrankenkasse",
  "mhplus Krankenkasse",
  "pronova BKK",
  "VIACTIV Krankenkasse",
  "Novitas BKK",
  "BKK VBU",
  "BKK firmus",
  "BKK ProVita",
  "BAHN-BKK",
  "Audi BKK",
  "BMW BKK",
  "Salus BKK",
  "energie-BKK",
  "vivida bkk",
  "BKK24",
  "Continentale Betriebskrankenkasse",
]

export const PKV_INSURERS: string[] = [
  "Debeka",
  "DKV Deutsche Krankenversicherung",
  "Allianz Private Krankenversicherung",
  "AXA Krankenversicherung",
  "SIGNAL IDUNA",
  "HUK-COBURG Krankenversicherung",
  "Barmenia Krankenversicherung",
  "Continentale Krankenversicherung",
  "Gothaer Krankenversicherung",
  "HALLESCHE Krankenversicherung",
  "Central Krankenversicherung",
  "R+V Krankenversicherung",
  "Württembergische Krankenversicherung",
  "ARAG Krankenversicherung",
  "uniVersa Krankenversicherung",
  "INTER Krankenversicherung",
  "LVM Krankenversicherung",
  "NÜRNBERGER Krankenversicherung",
  "HanseMerkur Krankenversicherung",
  "SDK - Süddeutsche Krankenversicherung",
  "Concordia Krankenversicherung",
]

/** Suggestions appropriate to the selected insurance type (empty for self-pay). */
export function insurerSuggestions(insuranceType: string): string[] {
  if (insuranceType === "gkv") return GKV_INSURERS
  if (insuranceType === "pkv") return PKV_INSURERS
  return []
}
