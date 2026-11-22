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

ALTER TABLE shifohalqa.plans
  ADD COLUMN IF NOT EXISTS daily_step_goal integer NOT NULL DEFAULT 3000 CHECK (daily_step_goal BETWEEN 100 AND 50000);

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

ALTER TABLE shifohalqa.exercise_attempts
  ADD COLUMN IF NOT EXISTS client_attempt_id uuid,
  ADD COLUMN IF NOT EXISTS client_request_hash text,
  ADD COLUMN IF NOT EXISTS review_decision text CHECK (review_decision IN ('reviewed', 'retake')),
  ADD COLUMN IF NOT EXISTS review_reply text CHECK (char_length(review_reply) BETWEEN 1 AND 500),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE shifohalqa.exercise_prescriptions
  ADD COLUMN IF NOT EXISTS movement text NOT NULL DEFAULT 'chair_stand'
    CHECK (movement IN ('chair_stand', 'elbow_bend', 'knee_lift', 'shoulder_raise', 'seated_knee_ext'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'shifohalqa.exercise_prescriptions'::regclass
      AND conname = 'exercise_prescriptions_supported_angle_check'
  ) THEN
    ALTER TABLE shifohalqa.exercise_prescriptions
      DROP CONSTRAINT IF EXISTS exercise_prescriptions_target_angle_check,
      ADD CONSTRAINT exercise_prescriptions_supported_angle_check CHECK (target_angle BETWEEN 60 AND 170);
  END IF;
END $$;

ALTER TABLE shifohalqa.exercise_attempts
  ADD COLUMN IF NOT EXISTS movement text NOT NULL DEFAULT 'chair_stand'
    CHECK (movement IN ('chair_stand', 'elbow_bend', 'knee_lift', 'shoulder_raise', 'seated_knee_ext')),
  ADD COLUMN IF NOT EXISTS diagnostics jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS exercise_attempt_client_idx
  ON shifohalqa.exercise_attempts (workspace_id, prescription_id, client_attempt_id)
  WHERE client_attempt_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS shifohalqa.daily_step_counts (
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
    REFERENCES shifohalqa.patients (workspace_id, id) ON DELETE CASCADE
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'shifohalqa.daily_step_counts'::regclass
      AND conname = 'daily_step_counts_source_check'
  ) THEN
    ALTER TABLE shifohalqa.daily_step_counts
      DROP CONSTRAINT daily_step_counts_source_check,
      ADD CONSTRAINT daily_step_counts_source_check CHECK (source IN ('self_report', 'device_sensor', 'demo_sim'));
  END IF;
END $$;

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

CREATE TABLE IF NOT EXISTS shifohalqa.telegram_patient_pairings (
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  code_hash text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  PRIMARY KEY (workspace_id, patient_id),
  FOREIGN KEY (workspace_id, patient_id) REFERENCES shifohalqa.patients (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shifohalqa.telegram_patient_links (
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  link_id uuid NOT NULL DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL UNIQUE CHECK (chat_id BETWEEN 1 AND 4503599627370495),
  connected_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paired_message_at bigint CHECK (paired_message_at > 0),
  paired_update_id bigint CHECK (paired_update_id > 0),
  PRIMARY KEY (workspace_id, patient_id),
  UNIQUE (workspace_id, patient_id, link_id),
  FOREIGN KEY (workspace_id, patient_id) REFERENCES shifohalqa.patients (workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shifohalqa.telegram_patient_notices (
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
    REFERENCES shifohalqa.telegram_patient_links (workspace_id, patient_id, link_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS telegram_patient_notices_queue_idx
  ON shifohalqa.telegram_patient_notices (created_at, workspace_id, id) WHERE delivery_status = 'pending';

CREATE TABLE IF NOT EXISTS shifohalqa.telegram_doctor_events (
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
    REFERENCES shifohalqa.telegram_doctor_links (workspace_id, doctor_id, link_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS telegram_doctor_events_queue_idx
  ON shifohalqa.telegram_doctor_events (created_at, workspace_id, id) WHERE delivery_status = 'pending';

CREATE OR REPLACE FUNCTION shifohalqa.queue_telegram_patient_flag_reply() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO shifohalqa.telegram_patient_notices (workspace_id, patient_id, link_id, kind, ref_id, message_text)
  SELECT plan.workspace_id, plan.patient_id, link.link_id, 'doctor_reply', NEW.id,
         'Shifokor qaydingizga javob yozdi: ' || left(NEW.patient_reply, 220)
  FROM shifohalqa.evidence_logs AS evidence
  JOIN shifohalqa.task_instances AS task ON task.workspace_id = evidence.workspace_id AND task.id = evidence.task_instance_id
  JOIN shifohalqa.plan_items AS item ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
  JOIN shifohalqa.plans AS plan ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
  JOIN shifohalqa.telegram_patient_links AS link ON link.workspace_id = plan.workspace_id AND link.patient_id = plan.patient_id
  WHERE evidence.workspace_id = NEW.workspace_id AND evidence.id = NEW.evidence_log_id
  ON CONFLICT (workspace_id, kind, ref_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER telegram_queue_on_flag_review
  AFTER UPDATE OF decision ON shifohalqa.flags
  FOR EACH ROW WHEN (OLD.decision IS NULL AND NEW.decision IS NOT NULL)
  EXECUTE FUNCTION shifohalqa.queue_telegram_patient_flag_reply();

CREATE OR REPLACE FUNCTION shifohalqa.queue_telegram_patient_exercise_reply() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO shifohalqa.telegram_patient_notices (workspace_id, patient_id, link_id, kind, ref_id, message_text)
  SELECT prescription.workspace_id, prescription.patient_id, link.link_id, 'exercise_reply', NEW.id,
         'Shifokor mashq qaydingizga javob yozdi: ' || left(NEW.review_reply, 220)
  FROM shifohalqa.exercise_prescriptions AS prescription
  JOIN shifohalqa.telegram_patient_links AS link
    ON link.workspace_id = prescription.workspace_id AND link.patient_id = prescription.patient_id
  WHERE prescription.workspace_id = NEW.workspace_id AND prescription.id = NEW.prescription_id
  ON CONFLICT (workspace_id, kind, ref_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER telegram_queue_on_exercise_review
  AFTER UPDATE OF review_decision ON shifohalqa.exercise_attempts
  FOR EACH ROW WHEN (OLD.review_decision IS NULL AND NEW.review_decision IS NOT NULL)
  EXECUTE FUNCTION shifohalqa.queue_telegram_patient_exercise_reply();

CREATE OR REPLACE FUNCTION shifohalqa.queue_telegram_doctor_exercise_pain() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO shifohalqa.telegram_doctor_events (workspace_id, doctor_id, link_id, kind, ref_key, message_text)
  SELECT prescription.workspace_id, prescription.doctor_id, link.link_id, 'exercise_pain', NEW.id::text,
         'ShifoHalqa: bemor mashq paytida og‘riq bildirdi.'
  FROM shifohalqa.exercise_prescriptions AS prescription
  JOIN shifohalqa.telegram_doctor_links AS link
    ON link.workspace_id = prescription.workspace_id AND link.doctor_id = prescription.doctor_id
  WHERE prescription.workspace_id = NEW.workspace_id AND prescription.id = NEW.prescription_id
  ON CONFLICT (workspace_id, kind, ref_key) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER telegram_queue_on_exercise_pain
  AFTER INSERT ON shifohalqa.exercise_attempts
  FOR EACH ROW WHEN (NEW.reason = 'pain' AND NEW.flag_color = 'red')
  EXECUTE FUNCTION shifohalqa.queue_telegram_doctor_exercise_pain();

CREATE OR REPLACE FUNCTION shifohalqa.queue_telegram_doctor_step_goal() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO shifohalqa.telegram_doctor_events (workspace_id, doctor_id, link_id, kind, ref_key, message_text)
  SELECT plan.workspace_id, plan.doctor_id, link.link_id, 'step_goal_achieved',
         to_char(NEW.activity_date, 'YYYY-MM-DD'),
         'ShifoHalqa: bemor bugungi kunlik qadam maqsadiga yetdi (' || NEW.step_count || ' / ' || plan.daily_step_goal || ').'
  FROM shifohalqa.plans AS plan
  JOIN shifohalqa.telegram_doctor_links AS link
    ON link.workspace_id = plan.workspace_id AND link.doctor_id = plan.doctor_id
  WHERE plan.workspace_id = NEW.workspace_id AND plan.patient_id = NEW.patient_id
    AND NEW.step_count >= plan.daily_step_goal
  ON CONFLICT (workspace_id, kind, ref_key) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER telegram_queue_on_step_goal
  AFTER INSERT OR UPDATE OF step_count ON shifohalqa.daily_step_counts
  FOR EACH ROW
  EXECUTE FUNCTION shifohalqa.queue_telegram_doctor_step_goal();

CREATE TABLE IF NOT EXISTS shifohalqa.flag_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  flag_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('supply_resolved', 'still_need_help', 'retake_vitals', 'retake_medication')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id, flag_id)
    REFERENCES shifohalqa.flags (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS flag_followups_flag_idx
  ON shifohalqa.flag_followups (workspace_id, flag_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS flag_followups_completion_idx
  ON shifohalqa.flag_followups (workspace_id, flag_id, kind)
  WHERE kind = 'supply_resolved' OR (kind = 'retake_medication' AND payload->>'status' = 'taken');

ALTER TABLE shifohalqa.flag_followups
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'shifohalqa.flag_followups'::regclass
      AND conname = 'flag_followups_ack_consistency_check'
  ) THEN
    ALTER TABLE shifohalqa.flag_followups
      ADD CONSTRAINT flag_followups_ack_consistency_check CHECK (
        (acknowledged_at IS NULL AND acknowledged_note IS NULL)
        OR (acknowledged_at IS NOT NULL AND acknowledged_note IS NOT NULL)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS shifohalqa.urgent_symptoms (
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
    REFERENCES shifohalqa.patients (workspace_id, id) ON DELETE CASCADE,
  CHECK ((review_decision IS NULL AND patient_reply IS NULL AND doctor_note IS NULL AND reviewed_at IS NULL)
      OR (review_decision IS NOT NULL AND patient_reply IS NOT NULL AND doctor_note IS NOT NULL AND reviewed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS urgent_symptoms_patient_idx
  ON shifohalqa.urgent_symptoms (workspace_id, patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS shifohalqa.caregiver_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  activity_date date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date),
  kind text NOT NULL CHECK (kind IN ('supply_on_the_way', 'checked_in')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, patient_id, activity_date),
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES shifohalqa.patients (workspace_id, id) ON DELETE CASCADE
);
