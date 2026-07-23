# AI-PMS Clinic — Medical Practice Management System

A web application for running a German medical practice. It brings the three
groups involved in day-to-day care — patients, doctors, and the front desk —
into one system, with an administrator role for account provisioning. Several
steps are supported by a language model (report drafting, billing-code
suggestions, a voice booking agent, and a guideline-grounded assistant for
doctors), but every clinical decision stays with the doctor.

The interface is bilingual (German and English) and the data model follows German
requirements: statutory and private insurance (GKV / PKV / Selbstzahler),
lifelong insurance numbers (KVNR), sequential and immutable invoices, and
retention rules for clinical records.

---

## Technology

- **Framework:** Next.js 16 (App Router) with React 19 and TypeScript
- **UI:** Tailwind CSS with shadcn/ui components
- **Database:** PostgreSQL (developed on Neon); pgvector for the retrieval assistant
- **Authentication:** signed session cookies (JOSE / JWT), bcrypt password hashing
- **Language model:** Mistral (isolated behind a single module so it can be swapped)
- **Email:** Resend (optional; the app runs without it)
- **Testing:** Vitest

---

## Prerequisites

- Node.js 20 or newer
- pnpm (the examples use pnpm; npm or yarn also work)
- A PostgreSQL database and its connection string

---

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Create a file named `.env.local` in the project root. Required values:

| Variable          | Purpose                                                        |
| ----------------- | ------------------------------------------------------------- |
| `DATABASE_URL`    | PostgreSQL connection string                                  |
| `AUTH_SECRET`     | Secret used to sign session tokens (any long random string)   |
| `MISTRAL_API_KEY` | Enables the AI features (report drafting, code suggestions, …) |

Optional values:

| Variable              | Default                  | Purpose                                                                 |
| --------------------- | ------------------------ | ----------------------------------------------------------------------- |
| `MISTRAL_MODEL`       | `mistral-small-latest`   | Overrides the model used for the AI features                            |
| `APP_URL`             | `http://localhost:3000`  | Base URL written into emails and the check-in QR poster                 |
| `RESEND_API_KEY`      | —                        | Enables outgoing email; without it, one-time codes are shown on screen  |
| `CHECK_IN_EMAIL_FROM` | Resend sandbox sender    | From-address for email (needs a verified Resend domain)                 |
| `BGE_EMBED_URL`       | —                        | Embedding endpoint for the doctor's decision-support search             |
| `RAG_COLLECTION`      | `awmf_baseline_bge`      | Which pgvector collection the decision-support assistant queries        |
| `CRON_SECRET`         | —                        | Protects the appointment-reminder endpoint                              |

The application degrades gracefully. Without `MISTRAL_API_KEY` the AI panels
show a short notice instead of failing; without `RESEND_API_KEY` verification and
check-in codes appear directly in the interface during development.

### 3. Prepare the database

Run the setup steps in order, or use the combined command:

```bash
pnpm db:reset
```

This runs, in sequence:

1. `pnpm db:migrate` — create the tables (non-destructive; safe to re-run)
2. `pnpm db:seed` — insert sample patients, doctors, appointments, and reports
3. `pnpm db:import-codes` — load the German code catalogs (ICD-10-GM, EBM, GOÄ)
4. `pnpm db:seed-users` — create the login accounts for the seeded people

The migration only creates the application tables. It never touches other tables
that may exist in the same database.

### 4. Start the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

To open the app from a phone on the same Wi-Fi, replace the LAN address in
`next.config.mjs` (`allowedDevOrigins` and `allowedOrigins`) with the host
machine's address, then visit `http://<that-address>:3000`.

---

## Demo accounts

Every seeded account uses the password **`demo123`**. On the login screen, the
role tabs and the "Fill demo credentials" button pre-fill the matching account.

| Role         | Email                       | Lands on            |
| ------------ | --------------------------- | ------------------- |
| Patient      | `max.mustermann@email.com`  | Patient dashboard   |
| Doctor       | `dr.smith@clinic.com`       | Doctor dashboard    |
| Receptionist | `reception@clinic.com`      | Reception dashboard |
| Administrator| `admin@clinic.com`          | Staff provisioning  |

The role is stored on the account; the tabs on the login page only assist with
filling the demo credentials.

---

## Using the application

### Signing in and language

The landing page ([/](http://localhost:3000)) is the login screen. It offers a
German / English toggle, and the chosen language carries through the rest of the
session, including the registration page. After a successful login the user is
redirected to the dashboard for their role. A logout confirmation guards against
an accidental sign-out.

New patients can open an account from the login page via **Create account**
([/register](http://localhost:3000/register)). Registration collects identity,
contact details, and insurance information (insurance type, KVNR, insurer name
and IK, and — for minors — a guardian name and contact). Email, phone number, and
insurance number are checked for uniqueness, and German formats (mobile number,
postal code, KVNR, IK) are validated.

### Patient portal

- **Dashboard** — upcoming appointments, recent activity, and notifications.
- **Appointments** — book, reschedule, or cancel a visit; a voice booking agent
  is available as an alternative to the form.
- **Health records** — approved consultation reports, readable and downloadable.
- **Documents** — imaging, lab results, and other files attached to the record.
- **Invoices** — private and self-pay invoices, with PDF download.
- **Profile** — personal and insurance details; changes proposed by the clinic
  after a consultation appear here for the patient to accept or decline.
- **Notifications** — a bell showing time-stamped items (upcoming visits, new
  reports, invoices due, and clinic-initiated changes), newest first.

### Doctor workspace

- **Dashboard and schedule** — the day's appointments and patient overview.
- **Consultation workspace** — the central screen for a visit: record notes and
  vitals, draft a structured report from rough notes, receive billing-code
  suggestions grounded in the real catalog, run allergy and prescription safety
  checks, and consult a guideline-grounded assistant. Completing a consultation
  finalizes the report and applies any resulting record changes.
- **Reports** — review and approve consultation reports.
- **Billing** — the doctor's completed consultations awaiting billing.
- **Patients** — patient list and detail view, including administrative and
  insurance data.

### Reception

- **Dashboard and schedule** — clinic-wide calendar and daily overview.
- **Patients** — create and edit patient records, with the same validation and
  uniqueness checks as registration.
- **Waiting room** — patients checked in and waiting.
- **Billing** — process completed consultations into invoices.
- **Calls / voice bookings** — a review queue for appointments created by the
  voice agent.
- **Staff** — doctor roster and sick-leave recovery planning.

### Administrator

The administrator account signs in at the same login screen and manages staff
accounts at [/admin/staff](http://localhost:3000/admin/staff): creating a doctor
or receptionist issues a one-time temporary password that the new member changes
on first sign-in.

### Self check-in

A printable QR poster is available at
[/checkin/qr](http://localhost:3000/checkin/qr). Patients scan it on arrival,
which opens the public check-in page; a signed-in patient confirms directly,
otherwise a short code from the booking email identifies the visit.

---

## Available scripts

| Command                     | Description                                             |
| --------------------------- | ------------------------------------------------------- |
| `pnpm dev`                  | Start the development server                             |
| `pnpm build`                | Build for production                                     |
| `pnpm start`                | Serve the production build                               |
| `pnpm lint`                 | Run ESLint                                               |
| `pnpm test`                 | Run the test suite once                                 |
| `pnpm test:watch`           | Run the tests in watch mode                             |
| `pnpm db:migrate`           | Create the database tables                               |
| `pnpm db:seed`              | Insert sample data                                       |
| `pnpm db:import-codes`      | Load the ICD-10-GM, EBM, and GOÄ catalogs                |
| `pnpm db:seed-users`        | Create login accounts for the seeded people             |
| `pnpm db:backfill-insurers` | Fill insurer details on older records that lack them     |
| `pnpm db:reset`             | Run migrate, seed, import-codes, and seed-users in order |

---

## Testing

```bash
pnpm test
```

The suite covers the domain rules, validation, authentication helpers, and the
notification logic.

---

## Project structure

```
app/          Routes and pages (App Router), grouped by role
components/    Reusable UI, including the shadcn/ui primitives
lib/          Server actions, database access, i18n, validation, and domain rules
  actions/    Server-side operations (patients, appointments, reports, billing, AI)
  i18n/       German / English messages and the locale helpers
  llm/        The single module that talks to the language model
  rag/        Retrieval for the decision-support assistant
db/            Schema, migration, seed, and catalog-import scripts
tests/        Vitest test suite
```
