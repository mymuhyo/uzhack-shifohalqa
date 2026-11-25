-- 20261125000300_m2_clinical_extensions.sql
-- Unified M2 forward migration for multi-medication schedules & units,
-- dual-source daily step counts, DB-backed AI rate limits, supervised
-- clinical brief drafts/L4 approval, and consented full-attempt video metadata.

-- 1. public.plan_items: relax single-medication constraint for 1-3 drugs x 1-2 daily times
DO $$
DECLARE
  con_name text;
BEGIN
  FOR con_name IN
    SELECT c.conname
    FROM pg_constraint AS c
    WHERE c.conrelid = 'public.plan_items'::regclass
      AND c.contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY u.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute AS a
          ON a.attrelid = c.conrelid AND a.attnum = u.attnum
      ) = ARRAY['workspace_id', 'plan_id', 'type']
  LOOP
    EXECUTE format('ALTER TABLE public.plan_items DROP CONSTRAINT %I', con_name);
  END LOOP;
END $$;

ALTER TABLE public.plan_items
  ADD COLUMN IF NOT EXISTS strength_unit text NOT NULL DEFAULT 'mg'
    CHECK (strength_unit IN ('mg', 'mcg', 'g', 'iu')),
  ADD COLUMN IF NOT EXISTS sort_order smallint NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS plan_items_vitals_unique_idx
  ON public.plan_items (workspace_id, plan_id)
  WHERE type = 'vitals';

CREATE UNIQUE INDEX IF NOT EXISTS plan_items_med_slot_unique_idx
  ON public.plan_items (workspace_id, plan_id, lower(title), due_time)
  WHERE type = 'medication';

-- 2. public.daily_step_counts: migrate PK to (workspace_id, patient_id, activity_date, source)
DO $$
DECLARE
  pk_cols text[];
  pk_name text;
BEGIN
  SELECT c.conname,
         array_agg(a.attname::text ORDER BY u.ord)
  INTO pk_name, pk_cols
  FROM pg_constraint AS c
  CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
  JOIN pg_attribute AS a
    ON a.attrelid = c.conrelid AND a.attnum = u.attnum
  WHERE c.conrelid = 'public.daily_step_counts'::regclass
    AND c.contype = 'p'
  GROUP BY c.conname;

  IF pk_cols IS DISTINCT FROM ARRAY['workspace_id', 'patient_id', 'activity_date', 'source'] THEN
    IF pk_name IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.daily_step_counts DROP CONSTRAINT %I', pk_name);
    END IF;
    ALTER TABLE public.daily_step_counts
      ADD CONSTRAINT daily_step_counts_pkey
      PRIMARY KEY (workspace_id, patient_id, activity_date, source);
  END IF;
END $$;

-- 3. public.ai_rate_limits: DB-backed per-workspace AI rate limit table (locked down)
CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  scope text PRIMARY KEY,
  window_ends_at timestamptz NOT NULL,
  requests integer NOT NULL CHECK (requests > 0)
);

REVOKE ALL ON TABLE public.ai_rate_limits FROM anon, authenticated;
ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_rate_limits_deny_authenticated ON public.ai_rate_limits;
CREATE POLICY ai_rate_limits_deny_authenticated
  ON public.ai_rate_limits FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- 4. public.ai_clinical_briefs: cited DB record IDs, editable draft, L4 approval, cache index
ALTER TABLE public.ai_clinical_briefs
  ADD COLUMN IF NOT EXISTS cited_record_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS doctor_draft_uz text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS approved_reply_uz text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by_doctor_id uuid,
  ADD COLUMN IF NOT EXISTS level smallint NOT NULL DEFAULT 0 CHECK (level IN (0, 4));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ai_clinical_briefs'::regclass
      AND conname = 'ai_clinical_briefs_approved_by_doctor_fk'
  ) THEN
    ALTER TABLE public.ai_clinical_briefs
      ADD CONSTRAINT ai_clinical_briefs_approved_by_doctor_fk
      FOREIGN KEY (workspace_id, approved_by_doctor_id)
      REFERENCES public.doctors (workspace_id, id)
      ON DELETE SET NULL (approved_by_doctor_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_clinical_briefs_approved_doctor_idx
  ON public.ai_clinical_briefs (workspace_id, approved_by_doctor_id)
  WHERE approved_by_doctor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_clinical_briefs_cache_idx
  ON public.ai_clinical_briefs (workspace_id, patient_id, prompt_hash, created_at DESC)
  WHERE prompt_hash IS NOT NULL;

-- 5. public.exercise_attempts: consented full-attempt video metadata & immutability index
ALTER TABLE public.exercise_attempts
  ADD COLUMN IF NOT EXISTS video_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS video_duration_sec integer
    CHECK (video_duration_sec IS NULL OR video_duration_sec BETWEEN 1 AND 60),
  ADD COLUMN IF NOT EXISTS video_size_bytes bigint
    CHECK (video_size_bytes IS NULL OR video_size_bytes BETWEEN 1 AND 20971520),
  ADD COLUMN IF NOT EXISTS video_mime_type text
    CHECK (video_mime_type IS NULL OR video_mime_type IN ('video/mp4', 'video/webm')),
  ADD COLUMN IF NOT EXISTS video_consented boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS video_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS exercise_attempts_video_path_idx
  ON public.exercise_attempts (video_storage_path)
  WHERE video_storage_path IS NOT NULL;
