# Implementation Summary — AI-Supported Practice Management System (V1.0)

> Complete reference of **everything built** in the web application, for writing Chapter 4 of the thesis.
> Generated from the actual codebase (not from memory). Maps to the 19 functional requirements (F1–F19) and the role model defined in Chapter 2.

---

## 0. What was actually built vs. the Chapter 3 design

**Important consistency note for the thesis.** Chapter 3 describes a *FastAPI + LangChain + self-hosted Mistral* backend. The **realised V1.0** is a unified full-stack Next.js application:

| Layer | Chapter 3 (design) | Realised V1.0 (built) |
|---|---|---|
| Frontend | Next.js | **Next.js 16 (App Router, React 19)** ✓ |
| Backend / API | FastAPI + Pydantic | **Next.js Server Actions** (`"use server"`) + **Zod** validation |
| Orchestration | LangChain + Celery/Redis | Direct calls in `lib/actions/ai.ts` (LangChain reserved for the separate RAG service) |
| Cognitive engine | self-hosted Mistral | **Mistral via API** (`lib/llm/mistral.ts`) — *temporary*, pluggable, to be replaced by the dedicated RAG service |
| Persistence | PostgreSQL + pgvector | **PostgreSQL (Neon) + pgvector** ✓ |
| Auth | JWT | **JWT in an HTTP-only cookie session** ✓ |

The implementation chapter should describe the **realised stack** and frame it as the concrete V1.0 realisation of the Chapter 3 design. The deep RAG/LLM experimental study (current Chapter 4) becomes its own chapter.

---

## 1. Technology stack (as built)

- **Framework:** Next.js 16 — App Router, **Server Components** (data fetch on the server) + **Client Components** (interactivity), **Server Actions** for all mutations.
- **Language:** TypeScript; **React 19**.
- **UI:** Tailwind CSS + **shadcn/ui**, lucide icons, `sonner` toasts. Responsive (desktop / tablet / mobile).
- **Database:** PostgreSQL on **Neon**, accessed via `pg` (`lib/db.ts`: tagged-template `sql`, `query`, `withTransaction`, advisory locks, `tstzrange` overlap checks).
- **Vector / RAG:** `pgvector` extension; BGE embeddings collections (`awmf_baseline_bge`) — **read-only** from the app.
- **LLM:** Mistral via API (`lib/llm/mistral.ts` → `isLlmConfigured`, `mistralChat`); temperature 0 for classification, JSON mode. Needs `MISTRAL_API_KEY`.
- **Validation:** Zod schemas (`lib/validation.ts`).
- **Testing:** **Vitest** (`pnpm test`, `pnpm test:watch`); 99 unit tests.
- **Package manager:** pnpm.

### Project structure / conventions
- `app/<role>/...` — route segments per role (doctor / receptionist / patient). Server+Client page pattern: server page reads from DB, passes to a client component.
- `lib/actions/*` — **Server Actions** (writes); return a typed `ActionResult` (`ok` / `fail` / `conflict`) from `lib/actions/types.ts`.
- `lib/queries.ts` — read queries (used by Server Components).
- `lib/rules.ts`, `lib/validation.ts` — **pure, dependency-free business logic** (extracted so it is unit-testable without a DB).
- Conventions: Zod-validated inputs; `withTransaction` for multi-statement writes; `revalidatePath` after mutations.

---

## 2. Data persistence and compliance layer

### Database schema (18 tables)
`users`, `doctors`, `receptionists`, `patients`, `patient_allergies`, `patient_conditions`,
`appointments`, `medical_reports`, `report_billing_codes`, `invoices`, `vitals`, `medications`, `surgeries`,
`profile_change_proposals`, **billing catalogs:** `ebm_catalog`, `goae_catalog`, `icd_*`, `medication_pzn`.
- Schema files: `db/schema.sql`, `db/auth-schema.sql`. Migration/seed: `db/migrate.ts`, `db/seed.ts`, `db/seed-users.ts`, `db/import-codes.ts`.
- Seed source of truth: `lib/seed-data.ts` (readable ids → real UUIDs at seed time). The app reads exclusively from Postgres (no in-memory mock data at runtime; `lib/mock-data.ts` is legacy/unused).

### Data-access pattern
- All mutations are **Server Actions** in `lib/actions/` returning `ActionResult<T>`.
- Reads in `lib/queries.ts` (e.g. `getCurrentDoctor/Receptionist`, `getAppointments`, `getReportsByPatient`, `getVitalsByPatient`, `getBillingWorklist`, `getPatientIdsWithAllergies`).
- Transactions + advisory locks guard concurrency (booking double-booking, invoice numbering).

### German legal / compliance constraints (modelled in the logic)
- **§630f BGB retention** — approved clinical records are **never hard-deleted**; they are *soft-retracted* (`deleted_at` + `deletion_reason`). Drafts/mistakes may be hard-deleted.
- **§14 UStG** — gap-free **sequential invoice numbering**.
- **Insurance routing** — `gkv` → EBM / Quartalsabrechnung; `pkv` / `selbstzahler` → §12 GOÄ invoice.
- **Soft-delete of patients** (`deactivatePatient` sets `deleted_at`); reads filter `deleted_at IS NULL`.

---

## 3. Module 1 — Core Practice Management (deterministic CRUD features)

### F1 — Role-Based Authentication & RBAC
- `lib/actions/auth.ts` → `login`, `logout`. JWT in an HTTP-only cookie session; `users` table; RBAC routing per role; demo accounts (password `demo123`). `getCurrent*` read the session.

### F2 / F8 — Web Scheduling & Calendar Override
- `lib/actions/appointments.ts`: `bookAppointment` (server-side **double-booking guard** via overlap check + advisory lock — REQ-SCHED-03), `rescheduleAppointment`, `reassignAppointment` (overlap-checked doctor change), `setAppointmentStatus`.
- Receptionist weekly calendar (`app/receptionist/schedule`): click-an-empty-slot to book; 30-minute slots; inline reschedule/reassign; **mobile day-agenda** view (`lg:hidden`) replacing the wide week grid on phones.

### F5 — Patient Registration & Profiles
- `lib/actions/patients.ts`: `registerPatient` (REQ-REC-09/10 mandatory fields + validation; **REQ-REC-11 duplicate detection** by name+DOB → `conflict`; REQ-REC-12 uuid; **REQ-REC-13 portal eligibility** — digital contact ⇒ `is_digital_active`), `updatePatient` (partial, audit-stamped `last_updated_by`), `deactivatePatient` (soft delete).
- Shared patient profile viewable by receptionist and doctor.

### F3 / F6 — Check-In (Mobile self + Manual)
- `checkInAppointment` (REQ-PAT-02 same-day restriction for self-service; REQ-PAT-03 scheduled→waiting; **REQ-PAT-05 idempotent** — no duplicate check-ins), `revertCheckIn` (undo while still `waiting`).
- Pure rule: `checkInDecision()` / `canRevertCheckIn()` in `lib/rules.ts`.

### F7 — Automated Invoice Generation & Billing
- `lib/actions/invoices.ts`: `generateInvoice`, `markInvoiceSent`, `markInvoicePaid`, `stornoInvoice`.
- Billing as **structured rules data, NOT vectorized**: EBM/GOÄ are a **rules engine** over curated verified catalogs (`data/codes` → `db/import-codes.ts` → `ebm_catalog`/`goae_catalog`).
- Money math (`lib/billing-values.ts`): **GOÄ Punktwert 5.82873 ¢**, **EBM Orientierungswert 11.9339 ¢**; `codePriceCents()` (GOÄ = points×Punktwert×Steigerungssatz; EBM = points×Orientierungswert).
- **Documents:** `components/invoice-document.tsx` (§12 GOÄ Rechnung for PKV/Selbstzahler; Leistungsnachweis for GKV — print/PDF ready), `components/report-document.tsx`. Report download/print/search.
- `lib/actions/codes.ts` → `searchBillingCodes` (catalog search for the workspace).

---

## 4. Module 2 & 4 — Integrated AI features (Generative Scribe & RAG Copilot)

All AI Server Actions live in `lib/actions/ai.ts` (12 functions), calling Mistral via `lib/llm/mistral.ts`. **Temporary** — pluggable, to be replaced by the dedicated RAG service.

| F | Feature | Action(s) | Notes |
|---|---|---|---|
| **F9** | AI Clinical Scribe (report generation) | `generateConsultationReport` | shorthand notes → structured German report; `createReport`/`updateReport`/`approveReport`/`deleteReport` lifecycle |
| **F10** | Automated Profile Updating | `suggestProfileUpdates`, `createProfileProposals`, `getPendingProfileProposals`, `respondToProposal` | `profile_change_proposals` table; doctor confirms which detected changes (allergies, address, conditions…) to send; patient applies |
| **F12** | Patient History Synthesis | `summarizePatientHistory` | chronological briefing before consultation |
| **F13** | Proactive Decision Support + Safety Alerts | `askDecisionSupport`, `checkPrescriptionSafety` | RAG over read-only BGE pgvector guidelines; bilingual (DE/EN); **deterministic allergy/contraindication alerts** (`lib/clinical-safety.ts` → `matchAllergyAlerts`); numbered/cited sources; German FTS fallback |
| **F14** | Billing Code Recommendation | `suggestBillingCodes` | extracts procedures → GOÄ/EBM codes, **grounded in the verified catalog** (not free-form) |
| **F15** | Patient Report Simplification | `simplifyReport` | jargon → plain-language summary in the patient portal |
| **F16** | Patient FAQ Chatbot | `askClinicFaq` | clinic FAQ facts in `lib/clinic.ts` |
| **F17** | Records Q&A (doctor) | `askPatientRecordsQA` | conversational Q&A over *this patient's own* past reports, cited |
| **F18** | AI-Assisted Schedule Conflict Resolution | `proposeRecoveryPlan`, `executeRecoveryPlan`, `classifyUrgency` | sick-leave recovery; **deterministic optimizer** `lib/recovery-plan.ts` → `buildRecoveryPlan` (same-specialty matching, capacity, time-overlap, urgency-priority, load-balancing, absence date-window); AI only for urgency triage |
| — | Extraction helpers | `extractPrescriptions`, `extractVitals` (+ `saveAppointmentVitals`) | structured extraction from notes |

### AI UX details
- **Decision Support** (`components/decision-support.tsx`), **Records Q&A** (`components/records-qa.tsx`), **FAQ chat** (`components/faq-chat.tsx`), **report rendering** (`components/report-content.tsx` + `lib/markdown.ts` Markdown tables/headings/bold).
- **Persistence across navigation:** the AI Assist conversation, Ask Records conversation, **and the AI history briefing** are all persisted in `localStorage`, keyed per appointment, and **kept until the consultation is completed** (then cleared) — so the doctor doesn't regenerate them when moving dashboard ↔ workspace. Regenerate-on-demand only.
- **Safety alerts** appear in real time in the workspace and are dismissable ("I am overriding this").

### Doctor / Receptionist support actions
- `lib/actions/doctors.ts`: `updateDoctor`, `setDoctorAvailability` (mark off-duty with `unavailable_from`/`unavailable_until`), `getDoctorNotifications`.
- `lib/actions/receptionists.ts`: `updateReceptionist`, `getReceptionistNotifications` (billing/waiting/staff kinds).
- `components/notification-bell.tsx`, settings pages per role.

---

## 5. Two-tier deletion model (German retention)

- **Reports** (`deleteReport`, doctor-only, requires reason): draft/pending → **hard delete** (codes + report in a transaction); approved → **soft-retract** (`deleted_at` + `deletion_reason`). Pure rule: `reportRemovalMode()`.
- **Appointments** (`deleteAppointment`, receptionist-only, requires reason): allowed only for `scheduled`/`cancelled`/`no_show` **with no report or invoice attached**; otherwise blocked ("cancel instead"). Pure rule: `appointmentDeletable()`.
- `cancelAppointment` enforces the **24-hour self-service window** (REQ-MOD-05) via `cancellationCheck()`.
- UI: `components/confirm-delete-dialog.tsx` — type-to-confirm phrase + mandatory reason; button disabled until both satisfied.

---

## 6. Responsive / cross-platform UI (NFR-USE)

Made the app mobile-friendly **without changing the desktop layout** (all changes gated behind `sm:`/`lg:` breakpoints):
- Global `grid-cols-1` base on responsive grids (fixed whole-page horizontal overflow caused by auto-sized single-column grids stretching to their widest child).
- Shell `<main>` `min-w-0 overflow-x-hidden` safety net.
- Dialogs: `p-4 sm:p-6` + `max-h` + `overflow-y-auto`; form grids collapse to one column on phones.
- **Invoice/Report documents:** `min-w-0 max-w-full` on the root (so they shrink inside dialogs instead of clipping) + horizontally-scrollable line-items table.
- **Receptionist schedule:** dedicated **mobile day-agenda** (chips + per-day list with the same action menu) replacing the 8-column week grid on phones.
- Doctor **dashboard** stat cards and **workspace** (tab labels, action buttons, the 5-tab consultation panel) tightened for mobile; consultation height-cap `paneH` only applies ≥1536px.

---

## 7. Verification & testing (Vitest — 99 tests, 10 files)

Strategy: extract pure business logic into dependency-free modules, test exhaustively; add **mocked-DB action tests** for CRUD orchestration (mock `@/lib/db`, `next/cache`, `@/lib/queries` — **no real database touched**).

**Pure-logic modules + tests**
- `lib/rules.ts` → `rules.test.ts` (18): `isPortalEligible` (REQ-REC-13), `isReportEditable` (BR-02-06), `reportRemovalMode` (§630f), `appointmentDeletable`, `cancellationCheck` (REQ-MOD-05), `checkInDecision` (F3/F6, REQ-PAT-02/03/05), `canRevertCheckIn`.
- `lib/validation.ts` → `validation.test.ts` (10): patient/doctor/receptionist Zod schemas, `orNull`.
- `lib/recovery-plan.ts` → `recovery-plan.test.ts` (11): specialty match, capacity, overlap, urgency priority, load-balancing, roster, empty (F18).
- `lib/clinical-safety.ts` → `clinical-safety.test.ts` (6): allergy/contraindication matching (F13).
- `lib/billing-values.ts` → `billing-values.test.ts` (5): GOÄ/EBM money math (F7/F14).
- `lib/markdown.ts` → `markdown.test.ts` (9): table/heading/bold rendering helpers.
- `lib/display.ts` → `display.test.ts` (12): labels, Euro formatting, status colors.

**Mocked-DB action (CRUD) tests**
- `patients.action.test.ts` (9): register (invalid → no DB call, duplicate → conflict, insert, allowDuplicate), update, deactivate.
- `reports.action.test.ts` (6): `deleteReport` — reason/doctor/ownership checks, draft → hard delete, approved → retract, already-retracted blocked.
- `appointments.action.test.ts` (13): cancel (24h), delete (blocked by report), check-in (idempotent/blocked/wrong-day/manual), revert.

**Run:** `pnpm test` (once) / `pnpm test:watch`. Config: `vitest.config.ts` (node env, `@/` alias, `tests/**/*.test.ts`).

**Honest coverage note (for the thesis):** unit tests cover all *deterministic decision logic* and representative CRUD branches with a mocked DB. The **SQL-level guarantees** (booking concurrency via advisory locks + `tstzrange`, gap-free invoice numbering) and the **LLM-grounded outputs** are *not* unit-tested — they need an **integration test against a disposable Postgres** (planned), which maps to the Chapter 3 INT-matrix and the UAT specification (UAT-01…05).

---

## 8. Feature ↔ requirement coverage map (V1.0)

| F | Feature | Status | Where |
|---|---|---|---|
| F1 | Role-Based Auth | ✅ | `lib/actions/auth.ts`, RBAC routing |
| F2 | Web Scheduling | ✅ | `bookAppointment`, schedule pages |
| F3 | Mobile Self Check-In | ✅ | `checkInAppointment`, `app/patient/check-in` |
| F4 | Patient Appt Modification | ✅ | cancel/reschedule (24h rule) |
| F5 | Manual Registration | ✅ | `registerPatient` |
| F6 | Manual Check-In | ✅ | `checkInAppointment` (reception) |
| F7 | Automated Invoice Generation | ✅ | `invoices.ts`, invoice document |
| F8 | Admin Calendar Override | ✅ | reassign/reschedule/delete |
| F9 | AI Clinical Scribe | ✅ | `generateConsultationReport` |
| F10 | Automated Profile Updating | ✅ | profile proposals |
| F11 | Autonomous Voice Agent | ⛔ | **not built** (deferred) |
| F12 | Patient History Synthesis | ✅ | `summarizePatientHistory` |
| F13 | Decision Support + alerts | ✅ | `askDecisionSupport`, safety alerts |
| F14 | Billing Code Recommendation | ✅ | `suggestBillingCodes` |
| F15 | Report Simplification | ✅ | `simplifyReport` |
| F16 | Patient FAQ Chatbot | ✅ | `askClinicFaq` |
| F17 | Records Q&A | ✅ | `askPatientRecordsQA` |
| F18 | Algorithmic Conflict Resolution | ✅ | `buildRecoveryPlan` |
| F19 | Internal Onboarding Agent | ⛔ | **not built** (W — V2.0) |

> Beyond the F-list, V1.0 also adds: a **two-tier deletion/retention** model (§630f), **persisted AI conversations + briefing**, **real-time prescription safety alerts**, and a **mobile-responsive** UI — all worth a paragraph each in Chapter 4.

---

## 9. Constraints / decisions to cite in the write-up
- Billing codes are **rules/structured data**, deliberately **not** vectorized; only the AWMF guidelines are vectorized for decision support.
- Decision-support RAG is **read-only** over the BGE pgvector collection; embedder is **pluggable** (`BGE_EMBED_URL`).
- Mistral is a **temporary** generation engine behind a thin interface, to be swapped for the dedicated RAG service (the subject of the RAG chapter).
- No unmasked PII is required by the deterministic features; AI calls are designed to be swappable to a local/self-hosted model for GDPR (NFR-SEC-01).
