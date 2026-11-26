-- M5 Telegram patient privacy opt-in & L4 7-day brief reply notice trigger
-- Idempotent forward migration synced with remote shifohalqa-final (byswnhfcqxjvnallggxj).

ALTER TABLE public.telegram_patient_links
  ADD COLUMN IF NOT EXISTS details_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.telegram_patient_notices
  DROP CONSTRAINT IF EXISTS telegram_patient_notices_kind_check;

ALTER TABLE public.telegram_patient_notices
  ADD CONSTRAINT telegram_patient_notices_kind_check
  CHECK (kind = ANY (ARRAY['doctor_reply'::text, 'exercise_reply'::text, 'brief_reply'::text]));

CREATE OR REPLACE FUNCTION private.queue_telegram_patient_brief_reply()
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

DROP TRIGGER IF EXISTS telegram_queue_on_brief_approval ON public.ai_clinical_briefs;

CREATE TRIGGER telegram_queue_on_brief_approval
  AFTER UPDATE OF approved_at ON public.ai_clinical_briefs
  FOR EACH ROW
  WHEN (
    old.approved_at IS NULL
    AND new.approved_at IS NOT NULL
    AND new.level = 4
    AND new.approved_reply_uz IS NOT NULL
  )
  EXECUTE FUNCTION private.queue_telegram_patient_brief_reply();
