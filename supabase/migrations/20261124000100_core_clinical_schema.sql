-- 20261124000100_core_clinical_schema.sql
-- Migrates all 26 core clinical tables from schema.sql into canonical public schema,
-- adding workspaces (with is_demo/kind partitioning), nullable doctor_id for individual
-- PAR-Q+ patients, composite UNIQUE constraints for R5 foreign keys, and FK/query indexes.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_demo boolean NOT NULL DEFAULT false,
  kind text NOT NULL DEFAULT 'clinic' CHECK (kind IN ('clinic', 'individual', 'demo')),
  name text NOT NULL DEFAULT 'ShifoHalqa',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, is_demo)
);

CREATE TABLE IF NOT EXISTS public.doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  demo_key text,
  name text NOT NULL,
  UNIQUE (workspace_id, demo_key),
  UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces (id) ON DELETE CASCADE,
  doctor_id uuid,
  role_kind text NOT NULL DEFAULT 'patient' CHECK (role_kind IN ('patient', 'individual')),
  demo_key text,
  name text NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workspace_id, demo_key),
  UNIQUE (workspace_id, id),
  CHECK (role_kind = 'individual' OR doctor_id IS NOT NULL),
  FOREIGN KEY (workspace_id, doctor_id)
    REFERENCES public.doctors (workspace_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS patients_workspace_id_doctor_idx
  ON public.patients (workspace_id, id, doctor_id);

CREATE INDEX IF NOT EXISTS patients_workspace_doctor_fk_idx
  ON public.patients (workspace_id, doctor_id);

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  doctor_id uuid,
  start_date date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date),
  vitals_target jsonb NOT NULL,
  supply_follow_up boolean NOT NULL,
  daily_step_goal integer NOT NULL DEFAULT 3000 CHECK (daily_step_goal BETWEEN 100 AND 50000),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, patient_id),
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, patient_id, doctor_id)
    REFERENCES public.patients (workspace_id, id, doctor_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS plans_workspace_doctor_idx
  ON public.plans (workspace_id, doctor_id);

CREATE TABLE IF NOT EXISTS public.plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('medication', 'vitals')),
  title text NOT NULL,
  due_time time NOT NULL,
  box_strength_mg numeric(9, 3) CHECK (box_strength_mg > 0),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, plan_id, type),
  FOREIGN KEY (workspace_id, plan_id)
    REFERENCES public.plans (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.task_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  plan_item_id uuid NOT NULL,
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'taken', 'missed', 'recorded')),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, plan_item_id, scheduled_date),
  FOREIGN KEY (workspace_id, plan_item_id)
    REFERENCES public.plan_items (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS task_instances_workspace_date_idx
  ON public.task_instances (workspace_id, scheduled_date DESC);

CREATE TABLE IF NOT EXISTS public.evidence_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  task_instance_id uuid NOT NULL,
  entry_kind text NOT NULL DEFAULT 'task' CHECK (entry_kind IN ('task', 'medication_box')),
  level smallint NOT NULL CHECK (level BETWEEN 0 AND 4),
  source text NOT NULL CHECK (source IN ('self_report', 'timer', 'photo_ocr', 'uploaded_video', 'live_camera')),
  ai_mode text NOT NULL CHECK (ai_mode IN ('none', 'manual', 'live', 'synthetic')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, task_instance_id)
    REFERENCES public.task_instances (workspace_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS evidence_logs_task_entry_idx
  ON public.evidence_logs (workspace_id, task_instance_id, entry_kind);

CREATE TABLE IF NOT EXISTS public.dorimos_scan_limits (
  scope text PRIMARY KEY,
  window_ends_at timestamptz NOT NULL,
  scans integer NOT NULL CHECK (scans > 0)
);

CREATE TABLE IF NOT EXISTS public.flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  evidence_log_id uuid NOT NULL,
  color text NOT NULL CHECK (color IN ('red', 'yellow')),
  rule_key text NOT NULL,
  detail jsonb NOT NULL,
  decision text CHECK (decision IN ('approved', 'retake')),
  patient_reply text,
  doctor_note text,
  reviewed_at timestamptz,
  UNIQUE (workspace_id, evidence_log_id),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, evidence_log_id)
    REFERENCES public.evidence_logs (workspace_id, id) ON DELETE CASCADE,
  CHECK ((decision IS NULL AND patient_reply IS NULL AND doctor_note IS NULL AND reviewed_at IS NULL)
      OR (decision IS NOT NULL AND patient_reply IS NOT NULL AND doctor_note IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS flags_open_queue_idx
  ON public.flags (workspace_id, color, id)
  WHERE decision IS NULL;

CREATE TABLE IF NOT EXISTS public.flag_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  flag_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('supply_resolved', 'still_need_help', 'retake_vitals', 'retake_medication')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at timestamptz,
  acknowledged_note text,
  FOREIGN KEY (workspace_id, flag_id)
    REFERENCES public.flags (workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT flag_followups_ack_consistency_check CHECK (
    (acknowledged_at IS NULL AND acknowledged_note IS NULL)
    OR (acknowledged_at IS NOT NULL AND acknowledged_note IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS flag_followups_flag_idx
  ON public.flag_followups (workspace_id, flag_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS flag_followups_completion_idx
  ON public.flag_followups (workspace_id, flag_id, kind)
  WHERE kind = 'supply_resolved' OR (kind = 'retake_medication' AND payload->>'status' = 'taken');

CREATE TABLE IF NOT EXISTS public.urgent_symptoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  symptom text NOT NULL CHECK (symptom IN ('chest_pain', 'dizziness', 'shortness_of_breath', 'severe_headache')),
  note text NOT NULL DEFAULT '',
  level smallint NOT NULL DEFAULT 0 CHECK (level IN (0, 4)),
  review_decision text CHECK (review_decision IN ('approved', 'retake')),
  patient_reply text,
  doctor_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE,
  CHECK ((review_decision IS NULL AND patient_reply IS NULL AND doctor_note IS NULL AND reviewed_at IS NULL)
      OR (review_decision IS NOT NULL AND patient_reply IS NOT NULL AND doctor_note IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS urgent_symptoms_patient_idx
  ON public.urgent_symptoms (workspace_id, patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS urgent_symptoms_open_idx
  ON public.urgent_symptoms (workspace_id, patient_id, created_at DESC)
  WHERE review_decision IS NULL;

CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  evidence_log_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('record_evidence', 'review_flag')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, evidence_log_id, action),
  FOREIGN KEY (workspace_id, evidence_log_id)
    REFERENCES public.evidence_logs (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS audit_events_actor_idx
  ON public.audit_events (workspace_id, actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.exercise_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  doctor_id uuid,
  movement text NOT NULL DEFAULT 'chair_stand'
    CHECK (movement IN ('chair_stand', 'elbow_bend', 'knee_lift', 'shoulder_raise', 'seated_knee_ext')),
  target_angle integer NOT NULL CHECK (target_angle BETWEEN 60 AND 170),
  target_reps integer NOT NULL CHECK (target_reps BETWEEN 1 AND 40),
  max_shallow integer NOT NULL CHECK (max_shallow BETWEEN 0 AND 40),
  pain_color text NOT NULL CHECK (pain_color IN ('yellow', 'red')),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, patient_id),
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, patient_id, doctor_id)
    REFERENCES public.patients (workspace_id, id, doctor_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS exercise_prescriptions_doctor_idx
  ON public.exercise_prescriptions (workspace_id, doctor_id);

CREATE TABLE IF NOT EXISTS public.exercise_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  prescription_id uuid NOT NULL,
  scheduled_date date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_primary boolean NOT NULL,
  source text NOT NULL CHECK (source IN ('self_report', 'uploaded_video', 'live_camera')),
  ai_mode text NOT NULL CHECK (ai_mode IN ('none', 'manual', 'live')),
  level smallint NOT NULL CHECK (level IN (0, 2, 3)),
  reason text NOT NULL CHECK (reason IN ('manual', 'pain', 'measured')),
  valid_reps integer,
  shallow_reps integer,
  min_angle double precision,
  confidence double precision,
  analyzed_frames integer,
  file_sha256 text,
  motion_signature jsonb,
  similar_motion boolean NOT NULL,
  flag_color text CHECK (flag_color IN ('yellow', 'red')),
  client_attempt_id uuid,
  client_request_hash text,
  review_decision text CHECK (review_decision IN ('reviewed', 'retake')),
  review_reply text CHECK (char_length(review_reply) BETWEEN 1 AND 500),
  reviewed_at timestamptz,
  movement text NOT NULL DEFAULT 'chair_stand'
    CHECK (movement IN ('chair_stand', 'elbow_bend', 'knee_lift', 'shoulder_raise', 'seated_knee_ext')),
  diagnostics jsonb,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, prescription_id)
    REFERENCES public.exercise_prescriptions (workspace_id, id) ON DELETE CASCADE,
  CHECK ((source = 'self_report' AND level = 0 AND ai_mode IN ('none', 'manual') AND file_sha256 IS NULL)
      OR (source = 'uploaded_video' AND level = 2 AND ai_mode = 'live' AND file_sha256 IS NOT NULL)
      OR (source = 'live_camera' AND level = 3 AND ai_mode = 'live' AND file_sha256 IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS exercise_attempt_primary_idx
  ON public.exercise_attempts (workspace_id, prescription_id, scheduled_date) WHERE is_primary;
CREATE UNIQUE INDEX IF NOT EXISTS exercise_attempt_file_idx
  ON public.exercise_attempts (workspace_id, prescription_id, file_sha256) WHERE file_sha256 IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS exercise_attempt_client_idx
  ON public.exercise_attempts (workspace_id, prescription_id, client_attempt_id) WHERE client_attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS exercise_attempts_prescription_idx
  ON public.exercise_attempts (workspace_id, prescription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS exercise_attempts_open_flag_idx
  ON public.exercise_attempts (workspace_id, prescription_id, flag_color, created_at)
  WHERE flag_color IS NOT NULL AND review_decision IS NULL;

CREATE TABLE IF NOT EXISTS public.daily_step_counts (
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  activity_date date NOT NULL,
  step_count integer NOT NULL CHECK (step_count BETWEEN 0 AND 999999),
  level smallint NOT NULL DEFAULT 0 CHECK (level = 0),
  source text NOT NULL DEFAULT 'self_report' CHECK (source IN ('self_report', 'device_sensor', 'demo_sim')),
  ai_mode text NOT NULL DEFAULT 'manual' CHECK (ai_mode = 'manual'),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, patient_id, activity_date),
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.caregiver_links (
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (workspace_id, patient_id),
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.caregiver_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('share_enabled', 'share_disabled', 'summary_viewed')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS caregiver_audit_patient_idx
  ON public.caregiver_audit_events (workspace_id, patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.caregiver_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  activity_date date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date),
  kind text NOT NULL CHECK (kind IN ('supply_on_the_way', 'checked_in')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, patient_id, activity_date),
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.android_demo_access (
  workspace_id uuid PRIMARY KEY,
  patient_id uuid NOT NULL,
  pairing_hash text UNIQUE,
  pairing_expires_at timestamptz,
  session_hash text UNIQUE,
  session_expires_at timestamptz,
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE,
  CHECK ((pairing_hash IS NULL) = (pairing_expires_at IS NULL)),
  CHECK ((session_hash IS NULL) = (session_expires_at IS NULL))
);

CREATE INDEX IF NOT EXISTS android_demo_access_patient_idx
  ON public.android_demo_access (workspace_id, patient_id);

CREATE TABLE IF NOT EXISTS public.telegram_pairings (
  workspace_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  PRIMARY KEY (workspace_id, doctor_id),
  FOREIGN KEY (workspace_id, doctor_id)
    REFERENCES public.doctors (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.telegram_doctor_links (
  workspace_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  link_id uuid NOT NULL DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL UNIQUE CHECK (chat_id BETWEEN 1 AND 4503599627370495),
  connected_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paired_message_at bigint CHECK (paired_message_at > 0),
  paired_update_id bigint CHECK (paired_update_id > 0),
  PRIMARY KEY (workspace_id, doctor_id),
  UNIQUE (workspace_id, doctor_id, link_id),
  FOREIGN KEY (workspace_id, doctor_id)
    REFERENCES public.doctors (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.telegram_flag_notices (
  workspace_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  link_id uuid NOT NULL,
  flag_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempted_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'rejected', 'unknown')),
  next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, flag_id),
  FOREIGN KEY (workspace_id, flag_id)
    REFERENCES public.flags (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, doctor_id, link_id)
    REFERENCES public.telegram_doctor_links (workspace_id, doctor_id, link_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS telegram_flag_notices_delivery_queue_idx
  ON public.telegram_flag_notices (created_at, workspace_id, flag_id)
  WHERE delivery_status = 'pending';

CREATE INDEX IF NOT EXISTS telegram_flag_notices_link_idx
  ON public.telegram_flag_notices (workspace_id, doctor_id, link_id);

CREATE TABLE IF NOT EXISTS public.telegram_patient_pairings (
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  PRIMARY KEY (workspace_id, patient_id),
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.telegram_patient_links (
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  link_id uuid NOT NULL DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL UNIQUE CHECK (chat_id BETWEEN 1 AND 4503599627370495),
  connected_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paired_message_at bigint CHECK (paired_message_at > 0),
  paired_update_id bigint CHECK (paired_update_id > 0),
  PRIMARY KEY (workspace_id, patient_id),
  UNIQUE (workspace_id, patient_id, link_id),
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.telegram_patient_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  link_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('doctor_reply', 'exercise_reply')),
  ref_id uuid NOT NULL,
  message_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempted_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'rejected', 'unknown')),
  next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, kind, ref_id),
  FOREIGN KEY (workspace_id, patient_id, link_id)
    REFERENCES public.telegram_patient_links (workspace_id, patient_id, link_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS telegram_patient_notices_queue_idx
  ON public.telegram_patient_notices (created_at, workspace_id, id)
  WHERE delivery_status = 'pending';

CREATE INDEX IF NOT EXISTS telegram_patient_notices_link_idx
  ON public.telegram_patient_notices (workspace_id, patient_id, link_id);

CREATE TABLE IF NOT EXISTS public.telegram_doctor_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  link_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('exercise_pain', 'step_goal_achieved')),
  ref_key text NOT NULL,
  message_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempted_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'rejected', 'unknown')),
  next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, kind, ref_key),
  FOREIGN KEY (workspace_id, doctor_id, link_id)
    REFERENCES public.telegram_doctor_links (workspace_id, doctor_id, link_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS telegram_doctor_events_queue_idx
  ON public.telegram_doctor_events (created_at, workspace_id, id)
  WHERE delivery_status = 'pending';

CREATE INDEX IF NOT EXISTS telegram_doctor_events_link_idx
  ON public.telegram_doctor_events (workspace_id, doctor_id, link_id);
