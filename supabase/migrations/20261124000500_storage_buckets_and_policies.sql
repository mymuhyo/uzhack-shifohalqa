-- 20261124000500_storage_buckets_and_policies.sql
-- Creates private Supabase Storage buckets for OCR scans (6 MiB) and exercise
-- suspicious segments/keyframes (20 MiB), plus SELECT/INSERT/UPDATE/DELETE
-- policies on storage.objects scoped to <workspace_id>/<patient_id>/... paths.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'ocr-scans',
    'ocr-scans',
    false,
    6291456,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'exercise-segments',
    'exercise-segments',
    false,
    20971520,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION private.can_access_patient_storage(folder_ws text, folder_pat text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF folder_ws IS NULL OR folder_pat IS NULL THEN
    RETURN false;
  END IF;
  IF folder_ws !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR folder_pat !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN false;
  END IF;
  RETURN private.is_patient_self_or_doctor(folder_ws::uuid, folder_pat::uuid);
END;
$$;

CREATE OR REPLACE FUNCTION private.is_patient_storage_owner(folder_ws text, folder_pat text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF folder_ws IS NULL OR folder_pat IS NULL THEN
    RETURN false;
  END IF;
  IF folder_ws !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR folder_pat !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
    RETURN false;
  END IF;
  RETURN private.is_patient_owner(folder_ws::uuid, folder_pat::uuid);
END;
$$;

REVOKE ALL ON FUNCTION private.can_access_patient_storage(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_patient_storage(text, text) TO authenticated;

REVOKE ALL ON FUNCTION private.is_patient_storage_owner(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_patient_storage_owner(text, text) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'clinical_storage_select'
  ) THEN
    CREATE POLICY clinical_storage_select
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id IN ('ocr-scans', 'exercise-segments')
        AND (SELECT private.can_access_patient_storage(
          (storage.foldername(name))[1],
          (storage.foldername(name))[2]
        ))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'clinical_storage_insert'
  ) THEN
    CREATE POLICY clinical_storage_insert
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id IN ('ocr-scans', 'exercise-segments')
        AND (SELECT private.is_patient_storage_owner(
          (storage.foldername(name))[1],
          (storage.foldername(name))[2]
        ))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'clinical_storage_update'
  ) THEN
    CREATE POLICY clinical_storage_update
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id IN ('ocr-scans', 'exercise-segments')
        AND (SELECT private.is_patient_storage_owner(
          (storage.foldername(name))[1],
          (storage.foldername(name))[2]
        ))
      )
      WITH CHECK (
        bucket_id IN ('ocr-scans', 'exercise-segments')
        AND (SELECT private.is_patient_storage_owner(
          (storage.foldername(name))[1],
          (storage.foldername(name))[2]
        ))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'clinical_storage_delete'
  ) THEN
    CREATE POLICY clinical_storage_delete
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id IN ('ocr-scans', 'exercise-segments')
        AND (SELECT private.is_patient_storage_owner(
          (storage.foldername(name))[1],
          (storage.foldername(name))[2]
        ))
      );
  END IF;
END $$;
