-- 20261124000200_telegram_triggers_and_grants.sql
-- Creates unexposed private schema, 5 SECURITY DEFINER Telegram enqueue trigger functions
-- (with SET search_path = '' and fully qualified public.* table references), attaches triggers
-- to public.* tables, and applies conditional shifohalqa_telegram_service grants.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.queue_telegram_red_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.telegram_flag_notices (workspace_id, doctor_id, link_id, flag_id)
  SELECT plan.workspace_id, plan.doctor_id, link.link_id, NEW.id
  FROM public.evidence_logs AS evidence
  JOIN public.task_instances AS task
    ON task.workspace_id = evidence.workspace_id AND task.id = evidence.task_instance_id
  JOIN public.plan_items AS item
    ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
  JOIN public.plans AS plan
    ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
  JOIN public.telegram_doctor_links AS link
    ON link.workspace_id = plan.workspace_id AND link.doctor_id = plan.doctor_id
  WHERE evidence.workspace_id = NEW.workspace_id AND evidence.id = NEW.evidence_log_id
  FOR KEY SHARE OF link
  ON CONFLICT (workspace_id, flag_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.queue_telegram_red_flag() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER telegram_queue_on_red_flag
  AFTER INSERT ON public.flags
  FOR EACH ROW WHEN (NEW.color = 'red')
  EXECUTE FUNCTION private.queue_telegram_red_flag();

CREATE OR REPLACE FUNCTION private.queue_telegram_patient_flag_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.telegram_patient_notices (workspace_id, patient_id, link_id, kind, ref_id, message_text)
  SELECT plan.workspace_id, plan.patient_id, link.link_id, 'doctor_reply', NEW.id,
         'Shifokor qaydingizga javob yozdi: ' || left(NEW.patient_reply, 220)
  FROM public.evidence_logs AS evidence
  JOIN public.task_instances AS task
    ON task.workspace_id = evidence.workspace_id AND task.id = evidence.task_instance_id
  JOIN public.plan_items AS item
    ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
  JOIN public.plans AS plan
    ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
  JOIN public.telegram_patient_links AS link
    ON link.workspace_id = plan.workspace_id AND link.patient_id = plan.patient_id
  WHERE evidence.workspace_id = NEW.workspace_id AND evidence.id = NEW.evidence_log_id
  ON CONFLICT (workspace_id, kind, ref_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.queue_telegram_patient_flag_reply() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER telegram_queue_on_flag_review
  AFTER UPDATE OF decision ON public.flags
  FOR EACH ROW WHEN (OLD.decision IS NULL AND NEW.decision IS NOT NULL)
  EXECUTE FUNCTION private.queue_telegram_patient_flag_reply();

CREATE OR REPLACE FUNCTION private.queue_telegram_patient_exercise_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.telegram_patient_notices (workspace_id, patient_id, link_id, kind, ref_id, message_text)
  SELECT prescription.workspace_id, prescription.patient_id, link.link_id, 'exercise_reply', NEW.id,
         'Shifokor mashq qaydingizga javob yozdi: ' || left(NEW.review_reply, 220)
  FROM public.exercise_prescriptions AS prescription
  JOIN public.telegram_patient_links AS link
    ON link.workspace_id = prescription.workspace_id AND link.patient_id = prescription.patient_id
  WHERE prescription.workspace_id = NEW.workspace_id AND prescription.id = NEW.prescription_id
  ON CONFLICT (workspace_id, kind, ref_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.queue_telegram_patient_exercise_reply() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER telegram_queue_on_exercise_review
  AFTER UPDATE OF review_decision ON public.exercise_attempts
  FOR EACH ROW WHEN (OLD.review_decision IS NULL AND NEW.review_decision IS NOT NULL)
  EXECUTE FUNCTION private.queue_telegram_patient_exercise_reply();

CREATE OR REPLACE FUNCTION private.queue_telegram_doctor_exercise_pain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.telegram_doctor_events (workspace_id, doctor_id, link_id, kind, ref_key, message_text)
  SELECT prescription.workspace_id, prescription.doctor_id, link.link_id, 'exercise_pain', NEW.id::text,
         'ShifoHalqa: bemor mashq paytida og‘riq bildirdi.'
  FROM public.exercise_prescriptions AS prescription
  JOIN public.telegram_doctor_links AS link
    ON link.workspace_id = prescription.workspace_id AND link.doctor_id = prescription.doctor_id
  WHERE prescription.workspace_id = NEW.workspace_id AND prescription.id = NEW.prescription_id
  ON CONFLICT (workspace_id, kind, ref_key) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.queue_telegram_doctor_exercise_pain() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER telegram_queue_on_exercise_pain
  AFTER INSERT ON public.exercise_attempts
  FOR EACH ROW WHEN (NEW.reason = 'pain' AND NEW.flag_color = 'red')
  EXECUTE FUNCTION private.queue_telegram_doctor_exercise_pain();

CREATE OR REPLACE FUNCTION private.queue_telegram_doctor_step_goal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.telegram_doctor_events (workspace_id, doctor_id, link_id, kind, ref_key, message_text)
  SELECT plan.workspace_id, plan.doctor_id, link.link_id, 'step_goal_achieved',
         to_char(NEW.activity_date, 'YYYY-MM-DD'),
         'ShifoHalqa: bemor bugungi kunlik qadam maqsadiga yetdi (' || NEW.step_count || ' / ' || plan.daily_step_goal || ').'
  FROM public.plans AS plan
  JOIN public.telegram_doctor_links AS link
    ON link.workspace_id = plan.workspace_id AND link.doctor_id = plan.doctor_id
  WHERE plan.workspace_id = NEW.workspace_id AND plan.patient_id = NEW.patient_id
    AND NEW.step_count >= plan.daily_step_goal
  ON CONFLICT (workspace_id, kind, ref_key) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.queue_telegram_doctor_step_goal() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER telegram_queue_on_step_goal
  AFTER INSERT OR UPDATE OF step_count ON public.daily_step_counts
  FOR EACH ROW
  EXECUTE FUNCTION private.queue_telegram_doctor_step_goal();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shifohalqa_telegram_service') THEN
    GRANT USAGE ON SCHEMA public TO shifohalqa_telegram_service;
    GRANT SELECT (workspace_id, patient_id, code_hash, expires_at, redeemed_at), UPDATE (redeemed_at), DELETE ON public.telegram_patient_pairings TO shifohalqa_telegram_service;
    GRANT SELECT (workspace_id, patient_id, link_id, chat_id, connected_at, paired_message_at, paired_update_id), INSERT (workspace_id, patient_id, chat_id, paired_message_at, paired_update_id), DELETE ON public.telegram_patient_links TO shifohalqa_telegram_service;
    GRANT SELECT, UPDATE (attempted_at, delivery_status, next_attempt_at) ON public.telegram_patient_notices TO shifohalqa_telegram_service;
    GRANT SELECT, UPDATE (attempted_at, delivery_status, next_attempt_at) ON public.telegram_doctor_events TO shifohalqa_telegram_service;
    GRANT SELECT (workspace_id, id, doctor_id, name) ON public.patients TO shifohalqa_telegram_service;
    GRANT SELECT (workspace_id, id, name) ON public.doctors TO shifohalqa_telegram_service;
    GRANT SELECT (workspace_id, id, patient_id, doctor_id, daily_step_goal, supply_follow_up) ON public.plans TO shifohalqa_telegram_service;
    GRANT SELECT (workspace_id, id, plan_id, type, title) ON public.plan_items TO shifohalqa_telegram_service;
    GRANT SELECT (workspace_id, id, plan_item_id, scheduled_date, status), UPDATE (status) ON public.task_instances TO shifohalqa_telegram_service;
    GRANT SELECT (workspace_id, patient_id, activity_date, step_count) ON public.daily_step_counts TO shifohalqa_telegram_service;
    GRANT SELECT (workspace_id, id, patient_id, movement, target_reps) ON public.exercise_prescriptions TO shifohalqa_telegram_service;
    GRANT SELECT (evidence_log_id, patient_reply, reviewed_at), INSERT (workspace_id, evidence_log_id, color, rule_key, detail) ON public.flags TO shifohalqa_telegram_service;
    GRANT SELECT (id, workspace_id, task_instance_id), INSERT (workspace_id, task_instance_id, level, source, ai_mode, payload) ON public.evidence_logs TO shifohalqa_telegram_service;
    GRANT INSERT (workspace_id, evidence_log_id, actor_id, action) ON public.audit_events TO shifohalqa_telegram_service;
  END IF;
END $$;
