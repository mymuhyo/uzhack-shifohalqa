ALTER TABLE public.telegram_patient_links
  ADD COLUMN details_enabled boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'shifohalqa_telegram_service') THEN
    GRANT SELECT (details_enabled) ON public.telegram_patient_links TO shifohalqa_telegram_service;
  END IF;
END;
$$;

ALTER TABLE public.telegram_patient_notices
  DROP CONSTRAINT telegram_patient_notices_kind_check,
  ADD CONSTRAINT telegram_patient_notices_kind_check
    CHECK (kind IN ('doctor_reply', 'exercise_reply', 'brief_reply'));

CREATE FUNCTION private.queue_telegram_patient_brief_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.telegram_patient_notices (workspace_id, patient_id, link_id, kind, ref_id, message_text)
  SELECT NEW.workspace_id, NEW.patient_id, link.link_id, 'brief_reply', NEW.id,
         'Shifokor javobi: ' || left(NEW.approved_reply_uz, 220)
  FROM public.telegram_patient_links AS link
  WHERE link.workspace_id = NEW.workspace_id AND link.patient_id = NEW.patient_id
  ON CONFLICT (workspace_id, kind, ref_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.queue_telegram_patient_brief_reply() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER telegram_queue_on_brief_approval
  AFTER UPDATE OF approved_at ON public.ai_clinical_briefs
  FOR EACH ROW WHEN (
    OLD.approved_at IS NULL AND NEW.approved_at IS NOT NULL
    AND NEW.level = 4 AND NEW.approved_reply_uz IS NOT NULL
  )
  EXECUTE FUNCTION private.queue_telegram_patient_brief_reply();
