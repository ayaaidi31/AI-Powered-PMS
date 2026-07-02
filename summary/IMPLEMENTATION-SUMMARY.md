# Implementation Summary — AI-Supported Practice Management System (V1.0)

> Complete reference of everything built in the web application, for writing Chapter 4 of the thesis.
> Compiled directly from the codebase. Feature numbers (F1–F19) follow the **thesis report** (Chapter 2, §2.4 —
> the four functional modules) and the role model from Chapter 2.

---

## 0. What was built vs. the Chapter 3 design

Chapter 3 describes a *FastAPI + LangChain + self-hosted Mistral* backend. The realised V1.0 is a unified full-stack Next.js application:

| Layer | Chapter 3 (design) | Realised V1.0 (built) |
|---|---|---|
| Frontend | Next.js | **Next.js 16 (App Router, React 19)** ✓ |
| Backend / API | FastAPI + Pydantic | **Next.js Server Actions** (`"use server"`) + **Zod** validation |
| Orchestration | LangChain + Celery/Redis | Direct calls in `lib/actions/ai.ts` (LangChain reserved for the separate RAG service) |
| Cognitive engine | self-hosted Mistral | **Mistral via API** (`lib/llm/mistral.ts`) — temporary, pluggable, to be replaced by the dedicated RAG service |
| Persistence | PostgreSQL + pgvector | **PostgreSQL (Neon) + pgvector** ✓ |
| Auth | JWT | **JWT in an HTTP-only cookie session** ✓ |

The implementation chapter should describe the realised stack and frame it as the concrete V1.0 realisation of the Chapter 3 design. The deep RAG/LLM experimental study (Chapter 4) becomes its own chapter.

---

## 1. Technology stack (as built)

- **Framework:** Next.js 16 — App Router, **Server Components** (server-side data fetch) + **Client Components** (interactivity), **Server Actions** for all mutations.
- **Language:** TypeScript; **React 19**.
- **UI:** Tailwind CSS + **shadcn/ui**, lucide icons, `sonner` toasts. Responsive across desktop / tablet / mobile.
- **Database:** PostgreSQL on **Neon**, accessed via `pg` (`lib/db.ts`: tagged-template `sql`, `query`, `withTransaction`, advisory locks, `tstzrange` overlap checks).
- **Vector / RAG:** `pgvector` extension; BGE embedding collection (`awmf_baseline_bge`) — read-only from the app.
- **LLM:** Mistral via API (`lib/llm/mistral.ts` → `isLlmConfigured`, `mistralChat`); temperature 0 for classification, JSON mode. Requires `MISTRAL_API_KEY`.
- **Validation:** Zod schemas (`lib/validation.ts`).
- **Testing:** **Vitest** (`pnpm test`, `pnpm test:watch`); **110 unit tests** across 12 files.
- **Package manager:** pnpm.

### Project structure / conventions
- `app/<role>/...` — route segments per role (doctor / receptionist / patient). Server page reads from the DB and passes data to a client component.
- `lib/actions/*` — **Server Actions** (writes); each returns a typed `ActionResult` (`ok` / `fail` / `conflict`) from `lib/actions/types.ts`.
- `lib/queries.ts` — read queries (used by Server Components).
- `lib/rules.ts`, `lib/validation.ts` — **pure, dependency-free business logic**, extracted so it is unit-testable without a database.
- Conventions: Zod-validated inputs; `withTransaction` for multi-statement writes; `revalidatePath` after mutations.

---

## 2. Data persistence and compliance layer

### Database schema (18 tables)
`users`, `doctors`, `receptionists`, `patients`, `patient_allergies`, `patient_conditions`, `medications`, `surgeries`,
`appointments`, `vitals`, `medical_reports`, `report_billing_codes`, `invoices`, `profile_change_proposals`,
plus billing catalogs `icd_10_gm`, `ebm_catalog`, `goae_catalog`, `medication_pzn`.
- Schema files: `db/schema.sql`, `db/auth-schema.sql`. Migration/seed: `db/migrate.ts`, `db/seed.ts`, `db/seed-users.ts`, `db/import-codes.ts`.
- `appointments` also carries booking provenance: `source` (`manual` / `online` / `ai_voice`) and `ai_review_status` (`pending` / `confirmed` / `flagged`) for the voice-agent review queue.
- Seed source of truth: `lib/seed-data.ts` (readable ids → real UUIDs at seed time). The app reads exclusively from Postgres at runtime.

### German legal / compliance constraints (modelled in the logic)
- **§630f BGB retention** — approved clinical records are never hard-deleted; they are soft-retracted (`deleted_at` + `deletion_reason`). Drafts/mistakes may be hard-deleted.
- **§14 UStG** — gap-free sequential invoice numbering.
- **Insurance routing** — `gkv` → EBM / Quartalsabrechnung; `pkv` / `selbstzahler` → §12 GOÄ invoice.
- **Soft-delete of patients** (`deactivatePatient` sets `deleted_at`); reads filter `deleted_at IS NULL`.

---

## 3. Module 1 — Core Practice Management and Scheduling (F1–F8, deterministic CRUD)

### F1 — Role-Based Authentication & RBAC
`lib/actions/auth.ts` → `login`, `logout`. JWT in an HTTP-only cookie session; `users` table; per-role RBAC routing; demo accounts (password `demo123`). `getCurrent*` resolve the session.

### F2 — Real-Time Web Scheduling *(Patient)*
`bookAppointment` — server-side **double-booking guard** via `tstzrange` overlap + per-doctor advisory lock (REQ-SCHED-03), plus a **doctor-availability guard**: a slot inside a doctor's absence window is rejected. Three-step booking wizard (`app/patient/appointments/new`). The wizard shows doctors on a fixed-term absence and greys out the days inside the window, so patients can book them again once the absence ends.

### F3 — Patient Mobile Self Check-In
`checkInAppointment` (same-day restriction for self-service, REQ-PAT-02; `scheduled` → `waiting`, REQ-PAT-03; idempotent, REQ-PAT-05). Pure rule `checkInDecision()`.

### F4 — Patient Appointment Modification
`cancelAppointment` enforces the **24-hour self-service window** (REQ-MOD-05) via `cancellationCheck()`; `rescheduleAppointment` (overlap-checked). Cancelling frees the slot immediately.

### F5 — Manual Registration *(Receptionist)*
`lib/actions/patients.ts` `registerPatient` (mandatory fields + validation; **duplicate detection** by name+DOB → `conflict`, REQ-REC-11; **portal eligibility** — digital contact ⇒ `is_digital_active`, REQ-REC-13), `updatePatient` (partial, audit-stamped `last_updated_by`), `deactivatePatient` (soft delete). Shared profile viewable by receptionist and doctor.

### F6 — Manual Check-In *(Receptionist)*
`checkInAppointment` (staff path, no same-day restriction), `revertCheckIn` (undo while still `waiting`). Waiting-room board.

### F7 — Automated Invoice Generation
`lib/actions/invoices.ts` (`generateInvoice`, `markInvoiceSent`, `markInvoicePaid`, `stornoInvoice`). Billing is **structured rules data, not vectorized**: EBM/GOÄ codes are a rules engine over curated catalogs (`data/codes` → `db/import-codes.ts` → `ebm_catalog` / `goae_catalog`). Money math (`lib/billing-values.ts`): GOÄ Punktwert 5.82873 ¢, EBM Orientierungswert 11.9339 ¢. Documents: `components/invoice-document.tsx` (§12 GOÄ Rechnung for PKV/Selbstzahler; Leistungsnachweis for GKV — print/PDF ready). Missing-codes guard blocks finalisation (REQ-REC-05).

### F8 — Administrative Calendar Override *(Receptionist)*
`reassignAppointment` (overlap-checked doctor change), plus staff cancel/reschedule/delete and `setAppointmentStatus`. Weekly calendar (`app/receptionist/schedule`): click-an-empty-slot booking, inline reschedule/reassign, a mobile day-agenda view, and a booking-type chip (Front desk / Online / AI assistant) per appointment. Two-tier deletion: only `scheduled`/`cancelled`/`no_show` with no report or invoice can be hard-deleted (`appointmentDeletable`).

---

## 4. Modules 2–4 — Integrated AI features (F9–F19)

AI Server Actions live in `lib/actions/ai.ts`, calling Mistral via `lib/llm/mistral.ts` — temporary, pluggable, to be replaced by the dedicated RAG service.

### Module 2 — EHR & Generative Scribe

| F | Feature | Action(s) | Notes |
|---|---|---|---|
| **F9** | AI-Assisted Clinical Scribe | `generateConsultationReport` | shorthand notes → structured German report; `createReport`/`updateReport`/`approveReport`/`deleteReport` lifecycle (draft → pending → approved; immutable on approval, BR-02-06) |
| **F10** | Automated Profile Updating | `suggestProfileUpdates`, `createProfileProposals`, `getPendingProfileProposals`, `respondToProposal` | `profile_change_proposals` table; doctor confirms detected changes (allergies, address, conditions…), patient applies administrative ones |

### Module 3 — Autonomous Telephony Center (Voice AI)

| F | Feature | Action(s) | Notes |
|---|---|---|---|
| **F11** | Autonomous Voice Agent | `voiceAgentReply`, `executeVoiceAction` | see §4.1 below — now built |

### Module 4 — RAG-Driven Copilot and Patient Services

| F | Feature | Action(s) | Notes |
|---|---|---|---|
| **F12** | Patient History Synthesis | `summarizePatientHistory` | chronological briefing before consultation; persisted per appointment until completion |
| **F13** | Proactive Clinical Decision Support | `askDecisionSupport`, `checkPrescriptionSafety` | RAG over read-only BGE pgvector guidelines; bilingual (DE/EN); numbered/cited sources; **deterministic allergy/contraindication alerts** (`lib/clinical-safety.ts` → `matchAllergyAlerts`) shown in real time, dismissable |
| **F14** | Automated Billing Code Recommendation | `suggestBillingCodes`, `searchBillingCodes` | extracts procedures → GOÄ/EBM codes, grounded in the verified catalog (not free-form); doctor reviews before invoicing |
| **F15** | Patient Report Simplification | `simplifyReport` | jargon → plain-language summary in the patient portal, with liability disclaimer |
| **F16** | Patient Semantic Q&A Chatbot | `askClinicFaq` | patient-facing conversational chatbot; clinic facts in `lib/clinic.ts`; medical-intent safety filter |
| **F17** | Clinical Knowledge Search Agent | `askPatientRecordsQA` | practitioner conversational Q&A over *this patient's own* past reports, cited, patient-scoped |
| **F18** | Algorithmic Conflict Resolution | `proposeRecoveryPlan`, `executeRecoveryPlan`, `classifyUrgency` | sick-leave recovery; **deterministic optimizer** `lib/recovery-plan.ts` → `buildRecoveryPlan` (same-specialty matching, capacity, time-overlap, urgency-priority, load-balancing, absence date-window); LLM only for urgency triage |
| — | Extraction helpers | `extractPrescriptions`, `extractVitals` (+ `saveAppointmentVitals`) | structured extraction from notes |

### 4.1 F11 — Autonomous Voice Agent (realised as patient self-service)
The requirement describes a telephone agent. The realised V1.0 delivers the same pipeline (STT → intent → availability → TTS → commit) as an in-app **patient self-service voice booking** (`app/patient/book-voice`), where the browser mic and speaker stand in for the phone line; a telephony gateway would replace them in production with no change to the logic.
- `lib/actions/voice.ts`: `voiceAgentReply` (Mistral drives the dialogue, greets the signed-in patient, gathers details, returns a structured action) and `executeVoiceAction` (commits book / reschedule / cancel for the session patient through the existing appointment actions, with the double-booking and office-hours guards). Identity comes from the session (`getCurrentPatient`), so the agent never asks for name or date of birth.
- Web Speech STT + SpeechSynthesis TTS, DE/EN toggle, natural-voice selection, and a typed-input fallback.
- Voice bookings are tagged `source = 'ai_voice'` and queued for reception. Receptionist **review queue** (`app/receptionist/calls`) lists them with Confirm / Flag actions (`reviewVoiceBooking`).
- Emergencies and non-scheduling requests are handed off to staff (no medical advice).

### AI UX details
- **Persistence across navigation:** the decision-support conversation, records Q&A conversation, and the history briefing are persisted in `localStorage`, keyed per appointment, and kept until the consultation is completed (then cleared) — so nothing regenerates when moving dashboard ↔ workspace. Regenerate on demand only.

### Doctor / receptionist support actions
- `lib/actions/doctors.ts`: `updateDoctor`, `setDoctorAvailability` (off-duty with `unavailable_from` / `unavailable_until`), `getDoctorNotifications`.
- `lib/actions/receptionists.ts`: `updateReceptionist`, `getReceptionistNotifications`.

---

## 5. Two-tier deletion model (German retention)

- **Reports** (`deleteReport`, doctor-only, reason required): draft/pending → hard delete (codes + report in a transaction); approved → soft-retract (`deleted_at` + `deletion_reason`). Pure rule `reportRemovalMode()`.
- **Appointments** (`deleteAppointment`, receptionist-only, reason required): allowed only for `scheduled` / `cancelled` / `no_show` with no report or invoice attached; otherwise blocked. Pure rule `appointmentDeletable()`.
- UI: `components/confirm-delete-dialog.tsx` — type-to-confirm phrase + mandatory reason.

---

## 6. Responsive / cross-platform UI (NFR-USE)

Mobile support was added without changing the desktop layout (changes gated behind `sm:` / `lg:` breakpoints): responsive grids with a `grid-cols-1` base, `overflow-x-clip` shell (preserves sticky columns), scrollable invoice/report documents, a dedicated receptionist mobile day-agenda, and tightened doctor dashboard/workspace panels.

---

## 7. Verification & testing (Vitest — 110 tests, 12 files)

Strategy: extract pure business logic into dependency-free modules and test it exhaustively; add mocked-DB action tests for CRUD orchestration (mock `@/lib/db`, `next/cache`, `@/lib/queries` — no real database touched).

**Pure-logic modules + tests**
- `lib/rules.ts` → `rules.test.ts` (18): portal eligibility (F5), report editability/removal (F9, §630f), appointment deletable (F8), cancellation window (F4), check-in decision (F3/F6), revert check-in.
- `lib/rules.ts` → `availability.test.ts` (6): doctor absence-window logic (F2/F8) — blocked inside the window, bookable after it ends, open-ended leave.
- `lib/rules.ts` → `office-hours.test.ts` (5): voice-agent office-hours guard (F11) — future weekday within 08:00–16:30.
- `lib/validation.ts` → `validation.test.ts` (10): patient/doctor/receptionist Zod schemas (F5).
- `lib/recovery-plan.ts` → `recovery-plan.test.ts` (11): specialty match, capacity, overlap, urgency, load-balancing, roster, empty (F18).
- `lib/clinical-safety.ts` → `clinical-safety.test.ts` (6): allergy/contraindication matching (F13).
- `lib/billing-values.ts` → `billing-values.test.ts` (5): GOÄ/EBM money math (F7/F14).
- `lib/markdown.ts` → `markdown.test.ts` (9): report rendering helpers.
- `lib/display.ts` → `display.test.ts` (12): labels, Euro formatting, status colours.

**Mocked-DB action (CRUD) tests**
- `patients.action.test.ts` (9): register (invalid → no DB call, duplicate → conflict, insert, allowDuplicate), update, deactivate (F5).
- `reports.action.test.ts` (6): `deleteReport` — reason/doctor/ownership, draft → hard delete, approved → retract, already-retracted blocked (F9).
- `appointments.action.test.ts` (13): cancel (24h), delete (blocked by report), check-in (idempotent/blocked/wrong-day/manual), revert (F2/F3/F4/F6/F8).

### Feature ↔ test coverage
Every feature with deterministic decision logic is unit-tested. The generative half of the AI features (turning notes into a report, simplifying text, answering questions, driving the voice dialogue) calls an external model and is validated by design and manual testing rather than unit tests.

| Feature | Deterministic logic under test |
|---|---|
| F1 Auth | RBAC/session — integration/manual (thin) |
| F2 Web scheduling | availability rule + cancel/delete/check-in; concurrency = SQL/integration |
| F3 / F6 Check-in | check-in decision + action branches |
| F4 Modify/cancel | 24-hour cancellation rule |
| F5 Registration | validation + duplicate/portal rules |
| F7 Invoicing | money math + missing-codes guard |
| F8 Calendar override | deletable rule + action branches |
| F9 Clinical scribe | report lifecycle + editability/removal rules; generation = LLM |
| F11 Voice agent | office-hours + doctor-availability guards; dialogue = LLM |
| F13 Decision support | allergy/contraindication matching; RAG answer = LLM |
| F14 Billing recommendation | catalog money math; extraction = LLM |
| F18 Conflict resolution | full recovery-plan optimizer |
| F10, F12, F15, F16, F17 | LLM-driven — validated by design/manual |

**Run:** `pnpm test` / `pnpm test:watch`. Config: `vitest.config.ts` (node env, `@/` alias, `tests/**/*.test.ts`).

**Coverage note (for the thesis):** unit tests cover all deterministic decision logic and representative CRUD branches with a mocked DB. The SQL-level guarantees (booking concurrency via advisory locks + `tstzrange`, gap-free invoice numbering) and the LLM-grounded outputs are validated by integration/manual testing against a disposable Postgres — mapping to the Chapter 3 integration matrix (INT-01…04) and the UAT specification (UAT-01…05).

---

## 8. Feature ↔ requirement coverage map (V1.0)

MoSCoW (thesis Table 2.1): Must = F1, F2, F3, F4, F5, F6, F7, F9 · Should = F11, F12, F13, F14, F15 · Could = F8, F10, F16, F17, F18 · Won't = F19.

| F | Feature | Module | Status | Where |
|---|---|---|---|---|
| F1 | Role-Based Authentication | 1 | ✅ | `lib/actions/auth.ts`, RBAC routing |
| F2 | Real-Time Web Scheduling | 1 | ✅ | `bookAppointment` (double-booking + availability guards) |
| F3 | Patient Mobile Self Check-In | 1 | ✅ | `checkInAppointment`, `app/patient/check-in` |
| F4 | Patient Appointment Modification | 1 | ✅ | cancel/reschedule (24-hour rule) |
| F5 | Manual Registration | 1 | ✅ | `registerPatient` |
| F6 | Manual Check-In | 1 | ✅ | `checkInAppointment` (staff) |
| F7 | Automated Invoice Generation | 1 | ✅ | `invoices.ts`, invoice document |
| F8 | Administrative Calendar Override | 1 | ✅ | reassign/reschedule/cancel/delete |
| F9 | AI-Assisted Clinical Scribe | 2 | ✅ | `generateConsultationReport`, reports lifecycle |
| F10 | Automated Profile Updating | 2 | ✅ | profile proposals |
| F11 | Autonomous Voice Agent | 3 | ✅ | `voice.ts`, `/patient/book-voice`, receptionist review |
| F12 | Patient History Synthesis | 4 | ✅ | `summarizePatientHistory` |
| F13 | Proactive Clinical Decision Support | 4 | ✅ | `askDecisionSupport`, safety alerts |
| F14 | Automated Billing Code Recommendation | 4 | ✅ | `suggestBillingCodes` |
| F15 | Patient Report Simplification | 4 | ✅ | `simplifyReport` |
| F16 | Patient Semantic Q&A Chatbot | 4 | ✅ | `askClinicFaq` |
| F17 | Clinical Knowledge Search Agent | 4 | ✅ | `askPatientRecordsQA` |
| F18 | Algorithmic Conflict Resolution | 4 | ✅ | `buildRecoveryPlan` |
| F19 | Internal Onboarding Agent | 4 | ⛔ | deferred to V2.0 (MoSCoW "Won't Have") |

**F1–F18 are all built; only F19 is deferred, exactly as the thesis MoSCoW table specifies.**

Beyond the F-list, V1.0 also adds a two-tier deletion/retention model (§630f), persisted AI conversations and briefing, real-time prescription safety alerts, booking provenance with a receptionist review queue, and a mobile-responsive UI.

---

## 9. Constraints / decisions to cite in the write-up
- Billing codes are rules/structured data, deliberately not vectorized; only the AWMF guidelines are vectorized for decision support.
- Decision-support RAG is read-only over the BGE pgvector collection; the embedder is pluggable (`BGE_EMBED_URL`).
- Mistral is a temporary generation engine behind a thin interface, to be swapped for the dedicated RAG service (the subject of the RAG chapter).
- The deterministic features need no unmasked PII; AI calls are designed to be swappable to a local/self-hosted model for GDPR (NFR-SEC-01).
