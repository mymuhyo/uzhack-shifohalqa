-- 20261125000100_lockdown_direct_access_and_fk_fixes.sql
-- M1.1 P0 Security, Realtime, FK & Storage Lockdown:
-- 1. Revoke all direct table and sequence privileges in public from anon and authenticated
--    so Next.js API (postgres.js) is the sole clinical data wall.
-- 2. Replace permissive public.* RLS policies with default-deny TO authenticated policies
--    (while keeping private.* storage helper execute grants for storage.objects).
-- 3. Remove all public.* clinical tables from the supabase_realtime publication.
-- 4. Fix the 4 composite FKs from 000300 using Postgres ON DELETE SET NULL (<nullable_col>).
-- 5. Remove direct patient UPDATE and DELETE policies on storage.objects so uploaded evidence is immutable.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

DO $$
DECLARE
  pol record;
  tbl record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;

  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl.tablename);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
      tbl.tablename || '_deny_authenticated',
      tbl.tablename
    );
  END LOOP;
END $$;

DO $$
DECLARE
  pub_tbl record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOR pub_tbl IN
      SELECT tablename
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
    LOOP
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', pub_tbl.tablename);
    END LOOP;
  END IF;
END $$;

ALTER TABLE public.teach_back_attempts
  DROP CONSTRAINT IF EXISTS teach_back_attempts_workspace_id_plan_id_fkey,
  ADD CONSTRAINT teach_back_attempts_workspace_id_plan_id_fkey
    FOREIGN KEY (workspace_id, plan_id)
    REFERENCES public.plans (workspace_id, id)
    ON DELETE SET NULL (plan_id);

ALTER TABLE public.vitals_ocr_scans
  DROP CONSTRAINT IF EXISTS vitals_ocr_scans_workspace_id_evidence_log_id_fkey,
  ADD CONSTRAINT vitals_ocr_scans_workspace_id_evidence_log_id_fkey
    FOREIGN KEY (workspace_id, evidence_log_id)
    REFERENCES public.evidence_logs (workspace_id, id)
    ON DELETE SET NULL (evidence_log_id);

ALTER TABLE public.evidence_logs
  DROP CONSTRAINT IF EXISTS evidence_logs_ocr_scan_fk,
  ADD CONSTRAINT evidence_logs_ocr_scan_fk
    FOREIGN KEY (workspace_id, ocr_scan_id)
    REFERENCES public.vitals_ocr_scans (workspace_id, id)
    ON DELETE SET NULL (ocr_scan_id);

ALTER TABLE public.ai_clinical_briefs
  DROP CONSTRAINT IF EXISTS ai_clinical_briefs_workspace_id_doctor_id_fkey,
  ADD CONSTRAINT ai_clinical_briefs_workspace_id_doctor_id_fkey
    FOREIGN KEY (workspace_id, doctor_id)
    REFERENCES public.doctors (workspace_id, id)
    ON DELETE SET NULL (doctor_id);

DROP POLICY IF EXISTS clinical_storage_update ON storage.objects;
DROP POLICY IF EXISTS clinical_storage_delete ON storage.objects;
