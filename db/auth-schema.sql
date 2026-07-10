-- ============================================================================
-- auth-schema.sql — authentication accounts (Feature 1: Role-Based Auth).
--
-- A `users` row holds login credentials and a role, and links to exactly one
-- role-specific profile (doctor / receptionist / patient). Clinical and staff
-- data stay in their own tables; this table only governs access.
--
-- Safety: CREATE ... IF NOT EXISTS only; never references langchain_pg_* tables.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text UNIQUE NOT NULL,
  password_hash   text NOT NULL,                 -- bcrypt hash; never plaintext
  role            text NOT NULL CHECK (role IN ('doctor','receptionist','patient','admin')),
  doctor_id       uuid REFERENCES doctors(id)       ON DELETE CASCADE,
  receptionist_id uuid REFERENCES receptionists(id) ON DELETE CASCADE,
  patient_id      uuid REFERENCES patients(id)      ON DELETE CASCADE,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- The linked profile must match the declared role.
  CONSTRAINT users_role_link_chk CHECK (
    (role = 'doctor'       AND doctor_id IS NOT NULL AND receptionist_id IS NULL AND patient_id IS NULL) OR
    (role = 'receptionist' AND receptionist_id IS NOT NULL AND doctor_id IS NULL AND patient_id IS NULL) OR
    (role = 'patient'      AND patient_id IS NOT NULL AND doctor_id IS NULL AND receptionist_id IS NULL) OR
    (role = 'admin'        AND doctor_id IS NULL AND receptionist_id IS NULL AND patient_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(lower(email));

-- Two-factor authentication (TOTP). Enabled per account; mandatory for staff,
-- optional for patients (enforced in app logic, not the schema).
--   totp_secret        — base32 secret shared with the authenticator app.
--   two_factor_enabled — true once enrollment is confirmed.
--   backup_codes       — bcrypt hashes of one-time recovery codes (consumed on use).
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes text[];

-- Staff accounts created by an admin start with a temporary password the holder
-- must replace on first login (enforced in app logic / proxy).
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- The set of notification ids this user has already seen (server-side, so the
-- bell's unread badge clears consistently across all their devices).
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_seen_ids text[];

-- Email verification codes (e.g. patient sign-up). The pending signup payload is
-- held here until the emailed code is confirmed, then the account is created and
-- the row deleted. Short-lived; safe to purge expired rows at any time.
CREATE TABLE IF NOT EXISTS email_verifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  code_hash  text NOT NULL,                 -- bcrypt hash of the 6-digit code
  purpose    text NOT NULL DEFAULT 'signup',
  payload    jsonb,                          -- pending account data (password already hashed)
  attempts   int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(lower(email), purpose);
