-- 20261125000400_audit_brief_approval.sql
-- M2 post-review drift fix: record doctor L4 brief approvals in public.audit_events
-- with strict target consistency and indexed composite workspace FK.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.ai_clinical_briefs'::regclass
      AND contype = 'u'
      AND (
        SELECT array_agg(a.attname::text ORDER BY u.ord)
        FROM unnest(conkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute AS a
          ON a.attrelid = conrelid AND a.attnum = u.attnum
      ) = ARRAY['workspace_id', 'id']
  ) THEN
    ALTER TABLE public.ai_clinical_briefs
      ADD CONSTRAINT ai_clinical_briefs_workspace_id_id_key UNIQUE (workspace_id, id);
  END IF;
END $$;

ALTER TABLE public.audit_events
  ALTER COLUMN evidence_log_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS brief_id uuid;

DO $$
DECLARE
  con_name text;
BEGIN
  FOR con_name IN
    SELECT c.conname
    FROM pg_constraint AS c
    WHERE c.conrelid = 'public.audit_events'::regclass
      AND c.contype = 'c'
      AND (
        pg_get_constraintdef(c.oid) ~ '\maction\M'
        OR c.conname IN ('audit_events_action_check', 'audit_events_target_consistency_check')
      )
  LOOP
    EXECUTE format('ALTER TABLE public.audit_events DROP CONSTRAINT %I', con_name);
  END LOOP;
END $$;

ALTER TABLE public.audit_events
  ADD CONSTRAINT audit_events_action_check
    CHECK (action IN ('record_evidence', 'review_flag', 'approve_clinical_brief')),
  ADD CONSTRAINT audit_events_target_consistency_check
    CHECK (
      (action IN ('record_evidence', 'review_flag') AND evidence_log_id IS NOT NULL AND brief_id IS NULL)
      OR (action = 'approve_clinical_brief' AND brief_id IS NOT NULL AND evidence_log_id IS NULL)
    );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.audit_events'::regclass
      AND conname = 'audit_events_workspace_brief_fkey'
  ) THEN
    ALTER TABLE public.audit_events
      ADD CONSTRAINT audit_events_workspace_brief_fkey
      FOREIGN KEY (workspace_id, brief_id)
      REFERENCES public.ai_clinical_briefs (workspace_id, id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS audit_events_brief_idx
  ON public.audit_events (workspace_id, brief_id)
  WHERE brief_id IS NOT NULL;
