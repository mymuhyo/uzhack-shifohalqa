-- 20261124000300_r4_auth_and_r5_extensions.sql
-- Adds R4 real-user authentication tables (profiles, clinic_memberships, on_auth_user_created trigger)
-- and R5 clinical/OCR/CV tables & column extensions (parq_screenings, teach_back_attempts,
-- vitals_ocr_scans, exercise_segments, ai_clinical_briefs, plus evidence_logs/exercise_attempts extensions).

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 1 AND 120),
  phone text,
  preferred_locale text NOT NULL DEFAULT 'uz-Latn' CHECK (preferred_locale IN ('uz-Latn', 'uz-Cyrl', 'ru', 'en')),
  default_role text CHECK (default_role IS NULL OR default_role IN ('doctor', 'patient', 'caregiver', 'individual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  resolved_name text;
  resolved_role text;
BEGIN
  resolved_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'ShifoHalqa foydalanuvchisi'
  );
  resolved_name := left(resolved_name, 120);

  resolved_role := NEW.raw_user_meta_data->>'default_role';
  IF resolved_role NOT IN ('doctor', 'patient', 'caregiver', 'individual') THEN
    resolved_role := NULL;
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, default_role)
  VALUES (NEW.id, resolved_name, NEW.phone, resolved_role)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_new_user();

CREATE TABLE IF NOT EXISTS public.clinic_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  is_demo boolean NOT NULL DEFAULT false CHECK (is_demo = false),
  role text NOT NULL CHECK (role IN ('doctor', 'patient', 'caregiver', 'individual')),
  actor_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, role, actor_id),
  FOREIGN KEY (workspace_id, is_demo)
    REFERENCES public.workspaces (id, is_demo) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS clinic_memberships_user_status_idx
  ON public.clinic_memberships (user_id, status);

CREATE INDEX IF NOT EXISTS clinic_memberships_workspace_actor_idx
  ON public.clinic_memberships (workspace_id, actor_id, role);

CREATE TABLE IF NOT EXISTS public.parq_screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  responses jsonb NOT NULL,
  yes_count smallint NOT NULL CHECK (yes_count BETWEEN 0 AND 7),
  risk_tier text NOT NULL CHECK (risk_tier IN ('cleared', 'caution', 'medical_clearance_required')),
  recommended_movement text CHECK (
    recommended_movement IS NULL
    OR recommended_movement IN ('chair_stand', 'elbow_bend', 'knee_lift', 'shoulder_raise', 'seated_knee_ext')
  ),
  recommended_daily_step_goal integer CHECK (
    recommended_daily_step_goal IS NULL
    OR recommended_daily_step_goal BETWEEN 100 AND 50000
  ),
  guidance_uz text NOT NULL DEFAULT '',
  completed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS parq_screenings_patient_idx
  ON public.parq_screenings (workspace_id, patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.teach_back_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  plan_id uuid,
  activity_date date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date),
  answers jsonb NOT NULL,
  score smallint NOT NULL CHECK (score >= 0),
  total_questions smallint NOT NULL CHECK (total_questions > 0),
  passed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (score <= total_questions),
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, plan_id)
    REFERENCES public.plans (workspace_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS teach_back_attempts_patient_idx
  ON public.teach_back_attempts (workspace_id, patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS teach_back_attempts_plan_idx
  ON public.teach_back_attempts (workspace_id, plan_id);

CREATE TABLE IF NOT EXISTS public.vitals_ocr_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  task_instance_id uuid NOT NULL,
  evidence_log_id uuid,
  storage_path text,
  image_sha256 text CHECK (image_sha256 IS NULL OR image_sha256 ~ '^[0-9a-f]{64}$'),
  quality_status text NOT NULL CHECK (quality_status IN ('ok', 'retake', 'unavailable')),
  provider text NOT NULL,
  model text,
  systolic integer CHECK (systolic IS NULL OR systolic BETWEEN 40 AND 300),
  diastolic integer CHECK (diastolic IS NULL OR diastolic BETWEEN 20 AND 200),
  pulse integer CHECK (pulse IS NULL OR pulse BETWEEN 20 AND 260),
  confidence double precision CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  raw_extraction jsonb NOT NULL DEFAULT '{}'::jsonb,
  patient_confirmed boolean NOT NULL DEFAULT false,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, task_instance_id)
    REFERENCES public.task_instances (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, evidence_log_id)
    REFERENCES public.evidence_logs (workspace_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS vitals_ocr_scans_patient_idx
  ON public.vitals_ocr_scans (workspace_id, patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS vitals_ocr_scans_task_idx
  ON public.vitals_ocr_scans (workspace_id, task_instance_id);

CREATE INDEX IF NOT EXISTS vitals_ocr_scans_evidence_idx
  ON public.vitals_ocr_scans (workspace_id, evidence_log_id)
  WHERE evidence_log_id IS NOT NULL;

ALTER TABLE public.evidence_logs
  ADD COLUMN IF NOT EXISTS ocr_scan_id uuid,
  ADD COLUMN IF NOT EXISTS ocr_storage_path text,
  ADD COLUMN IF NOT EXISTS ocr_confidence double precision CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1)),
  ADD COLUMN IF NOT EXISTS patient_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS file_sha256 text CHECK (file_sha256 IS NULL OR file_sha256 ~ '^[0-9a-f]{64}$');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.evidence_logs'::regclass
      AND conname = 'evidence_logs_ocr_scan_fk'
  ) THEN
    ALTER TABLE public.evidence_logs
      ADD CONSTRAINT evidence_logs_ocr_scan_fk
      FOREIGN KEY (workspace_id, ocr_scan_id)
      REFERENCES public.vitals_ocr_scans (workspace_id, id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS evidence_logs_ocr_scan_idx
  ON public.evidence_logs (workspace_id, ocr_scan_id)
  WHERE ocr_scan_id IS NOT NULL;

ALTER TABLE public.exercise_attempts
  ADD COLUMN IF NOT EXISTS suspicious_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_video_analysis jsonb,
  ADD COLUMN IF NOT EXISTS video_storage_path text;

CREATE TABLE IF NOT EXISTS public.exercise_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  cycle_index integer NOT NULL CHECK (cycle_index >= 0),
  from_ms integer NOT NULL CHECK (from_ms >= 0),
  to_ms integer NOT NULL CHECK (to_ms >= from_ms),
  severity text NOT NULL CHECK (severity IN ('ok', 'yellow', 'red')),
  error_codes text[] NOT NULL DEFAULT '{}'::text[],
  peak_angle_deg double precision,
  summary_uz text NOT NULL DEFAULT '',
  keyframe_storage_path text,
  clip_storage_path text,
  ai_review jsonb,
  doctor_flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id, attempt_id)
    REFERENCES public.exercise_attempts (workspace_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS exercise_segments_attempt_idx
  ON public.exercise_segments (workspace_id, attempt_id, cycle_index);

CREATE INDEX IF NOT EXISTS exercise_segments_flagged_idx
  ON public.exercise_segments (workspace_id, attempt_id)
  WHERE severity IN ('yellow', 'red');

CREATE TABLE IF NOT EXISTS public.ai_clinical_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  doctor_id uuid,
  brief_date date NOT NULL DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date),
  source_mode text NOT NULL CHECK (source_mode IN ('ai', 'deterministic_fallback')),
  provider text,
  model text,
  deterministic_metrics jsonb NOT NULL,
  narrative_uz text NOT NULL,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_hash text,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id, patient_id)
    REFERENCES public.patients (workspace_id, id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, doctor_id)
    REFERENCES public.doctors (workspace_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ai_clinical_briefs_patient_idx
  ON public.ai_clinical_briefs (workspace_id, patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_clinical_briefs_doctor_idx
  ON public.ai_clinical_briefs (workspace_id, doctor_id);
