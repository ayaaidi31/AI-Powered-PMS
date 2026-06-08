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
