CREATE SCHEMA IF NOT EXISTS shifohalqa;

CREATE TABLE IF NOT EXISTS shifohalqa.demo_workspaces (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shifohalqa.doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES shifohalqa.demo_workspaces (id) ON DELETE CASCADE,
  demo_key text NOT NULL,
  name text NOT NULL,
  UNIQUE (workspace_id, demo_key),
  UNIQUE (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS shifohalqa.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  demo_key text NOT NULL,
  name text NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workspace_id, demo_key),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, doctor_id)
    REFERENCES shifohalqa.doctors (workspace_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS patients_workspace_id_doctor_idx
  ON shifohalqa.patients (workspace_id, id, doctor_id);

CREATE TABLE IF NOT EXISTS shifohalqa.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  start_date date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date),
  vitals_target jsonb NOT NULL,
  supply_follow_up boolean NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, patient_id),
  FOREIGN KEY (workspace_id, patient_id, doctor_id)
    REFERENCES shifohalqa.patients (workspace_id, id, doctor_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shifohalqa.plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('medication', 'vitals')),
  title text NOT NULL,
  due_time time NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, plan_id, type),
  FOREIGN KEY (workspace_id, plan_id)
    REFERENCES shifohalqa.plans (workspace_id, id) ON DELETE CASCADE
);

ALTER TABLE shifohalqa.plan_items
  ADD COLUMN IF NOT EXISTS box_strength_mg numeric(9, 3) CHECK (box_strength_mg > 0);

CREATE TABLE IF NOT EXISTS shifohalqa.task_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  plan_item_id uuid NOT NULL,
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'taken', 'missed', 'recorded')),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, plan_item_id, scheduled_date),
  FOREIGN KEY (workspace_id, plan_item_id)
    REFERENCES shifohalqa.plan_items (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shifohalqa.evidence_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  task_instance_id uuid NOT NULL,
  level smallint NOT NULL CHECK (level BETWEEN 0 AND 4),
  source text NOT NULL CHECK (source IN ('self_report', 'timer', 'photo_ocr', 'uploaded_video', 'live_camera')),
  ai_mode text NOT NULL CHECK (ai_mode IN ('none', 'manual', 'live', 'synthetic')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, task_instance_id)
    REFERENCES shifohalqa.task_instances (workspace_id, id) ON DELETE CASCADE
);

ALTER TABLE shifohalqa.evidence_logs
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'task' CHECK (entry_kind IN ('task', 'medication_box'));

CREATE UNIQUE INDEX IF NOT EXISTS evidence_logs_task_entry_idx
  ON shifohalqa.evidence_logs (workspace_id, task_instance_id, entry_kind);

ALTER TABLE shifohalqa.evidence_logs
  DROP CONSTRAINT IF EXISTS evidence_logs_workspace_id_task_instance_id_key;

CREATE TABLE IF NOT EXISTS shifohalqa.dorimos_scan_limits (
  scope text PRIMARY KEY,
  window_ends_at timestamptz NOT NULL,
  scans integer NOT NULL CHECK (scans > 0)
);

CREATE TABLE IF NOT EXISTS shifohalqa.flags (
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
  FOREIGN KEY (workspace_id, evidence_log_id)
    REFERENCES shifohalqa.evidence_logs (workspace_id, id) ON DELETE CASCADE,
  CHECK ((decision IS NULL AND patient_reply IS NULL AND doctor_note IS NULL AND reviewed_at IS NULL)
      OR (decision IS NOT NULL AND patient_reply IS NOT NULL AND doctor_note IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS shifohalqa.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  evidence_log_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('record_evidence', 'review_flag')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, evidence_log_id, action),
  FOREIGN KEY (workspace_id, evidence_log_id)
    REFERENCES shifohalqa.evidence_logs (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shifohalqa.exercise_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  target_angle integer NOT NULL CHECK (target_angle BETWEEN 60 AND 130),
  target_reps integer NOT NULL CHECK (target_reps BETWEEN 1 AND 40),
  max_shallow integer NOT NULL CHECK (max_shallow BETWEEN 0 AND 40),
  pain_color text NOT NULL CHECK (pain_color IN ('yellow', 'red')),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, patient_id),
  FOREIGN KEY (workspace_id, patient_id, doctor_id)
    REFERENCES shifohalqa.patients (workspace_id, id, doctor_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shifohalqa.exercise_attempts (
  id uuid PRIMARY KEY,
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
  FOREIGN KEY (workspace_id, prescription_id)
    REFERENCES shifohalqa.exercise_prescriptions (workspace_id, id) ON DELETE CASCADE,
  CHECK ((source = 'self_report' AND level = 0 AND ai_mode IN ('none', 'manual') AND file_sha256 IS NULL)
      OR (source = 'uploaded_video' AND level = 2 AND ai_mode = 'live' AND file_sha256 IS NOT NULL)
      OR (source = 'live_camera' AND level = 3 AND ai_mode = 'live' AND file_sha256 IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS exercise_attempt_primary_idx
  ON shifohalqa.exercise_attempts (workspace_id, prescription_id, scheduled_date) WHERE is_primary;
CREATE UNIQUE INDEX IF NOT EXISTS exercise_attempt_file_idx
  ON shifohalqa.exercise_attempts (workspace_id, prescription_id, file_sha256) WHERE file_sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS shifohalqa.daily_step_counts (
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  activity_date date NOT NULL,
  step_count integer NOT NULL CHECK (step_count BETWEEN 0 AND 999999),
  level smallint NOT NULL DEFAULT 0 CHECK (level = 0),
  source text NOT NULL DEFAULT 'self_report' CHECK (source = 'self_report'),
  ai_mode text NOT NULL DEFAULT 'manual' CHECK (ai_mode = 'manual'),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, patient_id, activity_date),
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES shifohalqa.patients (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shifohalqa.caregiver_links (
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (workspace_id, patient_id),
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES shifohalqa.patients (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shifohalqa.caregiver_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('share_enabled', 'share_disabled', 'summary_viewed')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES shifohalqa.patients (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS caregiver_audit_patient_idx
  ON shifohalqa.caregiver_audit_events (workspace_id, patient_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS flags_workspace_id_idx ON shifohalqa.flags (workspace_id, id);

CREATE TABLE IF NOT EXISTS shifohalqa.android_demo_access (
  workspace_id uuid PRIMARY KEY,
  patient_id uuid NOT NULL,
  pairing_hash text UNIQUE,
  pairing_expires_at timestamptz,
  session_hash text UNIQUE,
  session_expires_at timestamptz,
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES shifohalqa.patients (workspace_id, id) ON DELETE CASCADE,
  CHECK ((pairing_hash IS NULL) = (pairing_expires_at IS NULL)),
  CHECK ((session_hash IS NULL) = (session_expires_at IS NULL))
);

CREATE TABLE IF NOT EXISTS shifohalqa.telegram_pairings (
  workspace_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  PRIMARY KEY (workspace_id, doctor_id),
  FOREIGN KEY (workspace_id, doctor_id) REFERENCES shifohalqa.doctors (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shifohalqa.telegram_doctor_links (
  workspace_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  link_id uuid NOT NULL DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL UNIQUE CHECK (chat_id BETWEEN 1 AND 4503599627370495),
  connected_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, doctor_id),
  UNIQUE (workspace_id, doctor_id, link_id),
  FOREIGN KEY (workspace_id, doctor_id) REFERENCES shifohalqa.doctors (workspace_id, id) ON DELETE CASCADE
);

ALTER TABLE shifohalqa.telegram_doctor_links
  ADD COLUMN IF NOT EXISTS paired_message_at bigint CHECK (paired_message_at > 0),
  ADD COLUMN IF NOT EXISTS paired_update_id bigint CHECK (paired_update_id > 0);

CREATE TABLE IF NOT EXISTS shifohalqa.telegram_flag_notices (
  workspace_id uuid NOT NULL,
  doctor_id uuid NOT NULL,
  link_id uuid NOT NULL,
  flag_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempted_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'rejected', 'unknown')),
  PRIMARY KEY (workspace_id, flag_id),
  FOREIGN KEY (workspace_id, flag_id) REFERENCES shifohalqa.flags (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, doctor_id, link_id)
    REFERENCES shifohalqa.telegram_doctor_links (workspace_id, doctor_id, link_id) ON DELETE CASCADE
);

ALTER TABLE shifohalqa.telegram_flag_notices
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS telegram_flag_notices_delivery_queue_idx
  ON shifohalqa.telegram_flag_notices (created_at, workspace_id, flag_id) WHERE delivery_status = 'pending';

CREATE OR REPLACE FUNCTION shifohalqa.queue_telegram_red_flag() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO shifohalqa.telegram_flag_notices (workspace_id, doctor_id, link_id, flag_id)
  SELECT plan.workspace_id, plan.doctor_id, link.link_id, NEW.id
  FROM shifohalqa.evidence_logs AS evidence
  JOIN shifohalqa.task_instances AS task ON task.workspace_id = evidence.workspace_id AND task.id = evidence.task_instance_id
  JOIN shifohalqa.plan_items AS item ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
  JOIN shifohalqa.plans AS plan ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
  JOIN shifohalqa.telegram_doctor_links AS link ON link.workspace_id = plan.workspace_id AND link.doctor_id = plan.doctor_id
  WHERE evidence.workspace_id = NEW.workspace_id AND evidence.id = NEW.evidence_log_id
  FOR KEY SHARE OF link
  ON CONFLICT (workspace_id, flag_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER telegram_queue_on_red_flag
  AFTER INSERT ON shifohalqa.flags
  FOR EACH ROW WHEN (NEW.color = 'red')
  EXECUTE FUNCTION shifohalqa.queue_telegram_red_flag();
