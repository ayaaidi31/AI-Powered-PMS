# Medical code catalogs

Two storage strategies are used:

- **ICD-10-GM + GOÄ → database.** The curated `icd10gm.csv` / `goae.csv` are
  loaded into the `icd_10_gm` / `goae_catalog` tables with:
  ```bash
  pnpm db:import-codes   # idempotent upsert (run after pnpm db:seed)
  ```
- **EBM → read straight from the file (no database).** The full official KBV
  catalog `20220323_ebm_csv_datei.csv` (~3,100 current codes) is parsed in
  memory at runtime by [`lib/codes/ebm.ts`](../../lib/codes/ebm.ts) — so it
  takes zero cloud-DB space. Import it nowhere; just call `getEbmCode(code)` /
  `searchEbmCodes(query)` from server code.

The curated files are **semicolon-delimited** (German convention — descriptions
contain commas) with a header row.

---

## ⚠️ Scope & provenance (read before using in the thesis)

This is a **curated "micro-ontology" subset**, not the complete official
catalogs — matching the thesis Proof-of-Concept scope (the 5 guideline
conditions + common GP/billing codes). Every entry below was **verified this
session against public references**, not generated from memory:

| File | Rows | Status | Source | Notes |
|---|---|---|---|---|
| `icd10gm_full.csv` | 17,521 | **OFFICIAL — full set** | BfArM ClaML/XML → `scripts/icd_claml_to_csv.py` | File-based / RAG pipeline. See section below. |
| `20220323_ebm_csv_datei.csv` | ~3,100 current (4,613 incl. history) | **OFFICIAL — full KBV catalog** | KBV EBM CSV Datei (official download) | Read file-based via `lib/codes/ebm.ts`. ISO-8859-1, semicolon, quoted. Columns: EBM-Ziffer; Bezeichnung; Punktzahl; Betrag; …; gueltigab; gueltigbis. Historical snapshot → loader keeps the most recent version per code. |
| `goae.csv` | 6 | **curated subset (→ DB)** | gesetze-im-internet.de (GOÄ) | The only structured GOÄ we have — see the GOÄ note below. `base_cents` = Punktzahl × Punktwert (5.82873 ct) at factor 1.0; `default_multiplier` = Regelsatz (2.3 personal / 1.8 technical). |

> **EBM note:** there is no plain `03000` — the Versichertenpauschale is
> age-stratified into **03001–03005** (the official file corrects an earlier guess).

> **GOÄ note — why it stays a subset:** unlike ICD-10-GM and EBM, **no free,
> official machine-readable GOÄ exists.** The legal text (gesetze-im-internet.de
> `go__1982`) does *not* contain the Gebührenverzeichnis — the actual ~2,900 fee
> positions were only published as a printed *Anlageband* (BGBl. I 1996, S. 3–157).
> The only digital sources are PDFs (PVS, ergomed) or online browsers (e-bis.de).
> To complete it: download a GOÄ Ziffernliste **PDF** and parse it (a small
> Python pdf→csv step, analogous to the ICD ClaML parser), or keep this subset
> (GOÄ is the private/PKV path — secondary for the PoC).

> Removed: `icd10gm.csv` (the old ~35-code curated subset) — superseded by
> `icd10gm_full.csv`.

### ICD-10-GM — full official set (`icd10gm_full.csv`)
Generated from the official **BfArM ClaML/XML** download by
[`scripts/icd_claml_to_csv.py`](../../scripts/icd_claml_to_csv.py):

```bash
python scripts/icd_claml_to_csv.py <path-to>/icd10gm2026syst_claml_*.xml data/codes/icd10gm_full.csv
```

Columns: `code;description;kind;parent;terminal`. **17,521 rows** (22 chapters,
250 blocks, 12,334 base categories, 4,915 modifier-expanded sub-codes). The
script applies the ClaML `<ModifiedBy>` / `<ModifierClass>` mechanism so the real
endstellige codes (E11.90, I10.90, J44.99, …) are materialised. Filter
`terminal == "Y"` for the ~14,800 billable codes.
> Note: modifier expansion uses the cartesian product of declared modifiers — a
> close approximation of BfArM's official endstellige list; for exact billing
> validity, cross-check against the BfArM "Metadaten" flat file.

The small `icd10gm.csv` (~35 curated codes) is what `pnpm db:import-codes` still
loads into the DB; swap in `icd10gm_full.csv` there if you want the full set in
Postgres (or use it file-based like EBM).

### Still curated (subset)
- **GOÄ** is a curated 6-code subset; load the official Gebührenverzeichnis for
  the complete list.
- **EBM is complete and official** (file-based) — nothing more needed.

---

## How to load the FULL official datasets

Replace these CSVs with official exports (same columns) and re-run
`pnpm db:import-codes`, or adapt the column indices in
[`db/import-codes.ts`](../../db/import-codes.ts) to the official file layout.

| Catalog | Official source |
|---|---|
| **ICD-10-GM** | BfArM — free download (ClaML/XML or TXT/CSV "Systematik"): https://www.bfarm.de/DE/Kodiersysteme/Klassifikationen/ICD/ICD-10-GM/ |
| **EBM** | KBV — Online-EBM / EBM-Stammdatei: https://www.kbv.de/html/online-ebm.php |
| **GOÄ** | Bundesministerium der Justiz — official ordinance: https://www.gesetze-im-internet.de/go__1982/ |

> Diagnosis/billing codes are **authoritative reference data** — always load
> them from the official source for any real/clinical use. This curated subset
> exists only to demonstrate the architecture end-to-end.
