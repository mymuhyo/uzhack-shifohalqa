-- 20261124000400_rls_helpers_and_policies.sql
-- Enables Row Level Security on all 33 public.* tables, creates SECURITY DEFINER
-- membership/ownership helpers in unexposed private schema (SET search_path = ''),
-- grants minimal privileges to authenticated (revoking anon from clinical tables),
-- and creates single cohesive initPlan-safe policies per (table, command, authenticated).

GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_workspace_member(ws_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinic_memberships AS cm
    JOIN public.workspaces AS w
      ON w.id = cm.workspace_id AND w.is_demo = false
    WHERE cm.user_id = (SELECT auth.uid())
      AND cm.workspace_id = ws_id
      AND cm.is_demo = false
      AND cm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.is_workspace_doctor(ws_id uuid, doc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinic_memberships AS cm
    JOIN public.workspaces AS w
      ON w.id = cm.workspace_id AND w.is_demo = false
    WHERE cm.user_id = (SELECT auth.uid())
      AND cm.workspace_id = ws_id
      AND cm.is_demo = false
      AND cm.status = 'active'
      AND cm.role = 'doctor'
      AND cm.actor_id = doc_id
  );
$$;

CREATE OR REPLACE FUNCTION private.is_patient_owner(ws_id uuid, pat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinic_memberships AS cm
    JOIN public.workspaces AS w
      ON w.id = cm.workspace_id AND w.is_demo = false
    WHERE cm.user_id = (SELECT auth.uid())
      AND cm.workspace_id = ws_id
      AND cm.is_demo = false
      AND cm.status = 'active'
      AND cm.role IN ('patient', 'individual')
      AND cm.actor_id = pat_id
  );
$$;

CREATE OR REPLACE FUNCTION private.is_assigned_doctor(ws_id uuid, pat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patients AS p
    JOIN public.clinic_memberships AS cm
      ON cm.workspace_id = p.workspace_id
     AND cm.actor_id = p.doctor_id
    JOIN public.workspaces AS w
      ON w.id = cm.workspace_id AND w.is_demo = false
    WHERE p.workspace_id = ws_id
      AND p.id = pat_id
      AND p.doctor_id IS NOT NULL
      AND cm.user_id = (SELECT auth.uid())
      AND cm.is_demo = false
      AND cm.status = 'active'
      AND cm.role = 'doctor'
  );
$$;

CREATE OR REPLACE FUNCTION private.is_patient_self_or_doctor(ws_id uuid, pat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_patient_owner(ws_id, pat_id)
      OR private.is_assigned_doctor(ws_id, pat_id);
$$;

CREATE OR REPLACE FUNCTION private.can_caregiver_read_patient(ws_id uuid, pat_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clinic_memberships AS cm
    JOIN public.workspaces AS w
      ON w.id = cm.workspace_id AND w.is_demo = false
    WHERE cm.user_id = (SELECT auth.uid())
      AND cm.workspace_id = ws_id
      AND cm.is_demo = false
      AND cm.status = 'active'
      AND cm.role = 'caregiver'
      AND cm.actor_id = pat_id
  );
$$;

CREATE OR REPLACE FUNCTION private.can_read_plan(ws_id uuid, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.plans AS p
    WHERE p.workspace_id = ws_id
      AND p.id = p_id
      AND (
        private.is_patient_self_or_doctor(p.workspace_id, p.patient_id)
        OR private.can_caregiver_read_patient(p.workspace_id, p.patient_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_plan(ws_id uuid, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.plans AS p
    JOIN public.patients AS pat
      ON pat.workspace_id = p.workspace_id AND pat.id = p.patient_id
    WHERE p.workspace_id = ws_id
      AND p.id = p_id
      AND (
        (p.doctor_id IS NOT NULL AND private.is_workspace_doctor(p.workspace_id, p.doctor_id))
        OR (pat.role_kind = 'individual' AND p.doctor_id IS NULL AND private.is_patient_owner(p.workspace_id, p.patient_id))
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_read_task_instance(ws_id uuid, ti_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.task_instances AS ti
    JOIN public.plan_items AS pi
      ON pi.workspace_id = ti.workspace_id AND pi.id = ti.plan_item_id
    JOIN public.plans AS p
      ON p.workspace_id = pi.workspace_id AND p.id = pi.plan_id
    WHERE ti.workspace_id = ws_id
      AND ti.id = ti_id
      AND (
        private.is_patient_self_or_doctor(p.workspace_id, p.patient_id)
        OR private.can_caregiver_read_patient(p.workspace_id, p.patient_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_write_task_instance(ws_id uuid, ti_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.task_instances AS ti
    JOIN public.plan_items AS pi
      ON pi.workspace_id = ti.workspace_id AND pi.id = ti.plan_item_id
    JOIN public.plans AS p
      ON p.workspace_id = pi.workspace_id AND p.id = pi.plan_id
    WHERE ti.workspace_id = ws_id
      AND ti.id = ti_id
      AND private.is_patient_self_or_doctor(p.workspace_id, p.patient_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_read_evidence(ws_id uuid, ev_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.evidence_logs AS ev
    JOIN public.task_instances AS ti
      ON ti.workspace_id = ev.workspace_id AND ti.id = ev.task_instance_id
    JOIN public.plan_items AS pi
      ON pi.workspace_id = ti.workspace_id AND pi.id = ti.plan_item_id
    JOIN public.plans AS p
      ON p.workspace_id = pi.workspace_id AND p.id = pi.plan_id
    WHERE ev.workspace_id = ws_id
      AND ev.id = ev_id
      AND private.is_patient_self_or_doctor(p.workspace_id, p.patient_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_evidence_patient(ws_id uuid, ev_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.evidence_logs AS ev
    JOIN public.task_instances AS ti
      ON ti.workspace_id = ev.workspace_id AND ti.id = ev.task_instance_id
    JOIN public.plan_items AS pi
      ON pi.workspace_id = ti.workspace_id AND pi.id = ti.plan_item_id
    JOIN public.plans AS p
      ON p.workspace_id = pi.workspace_id AND p.id = pi.plan_id
    WHERE ev.workspace_id = ws_id
      AND ev.id = ev_id
      AND private.is_patient_owner(p.workspace_id, p.patient_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_evidence_doctor(ws_id uuid, ev_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.evidence_logs AS ev
    JOIN public.task_instances AS ti
      ON ti.workspace_id = ev.workspace_id AND ti.id = ev.task_instance_id
    JOIN public.plan_items AS pi
      ON pi.workspace_id = ti.workspace_id AND pi.id = ti.plan_item_id
    JOIN public.plans AS p
      ON p.workspace_id = pi.workspace_id AND p.id = pi.plan_id
    WHERE ev.workspace_id = ws_id
      AND ev.id = ev_id
      AND private.is_assigned_doctor(p.workspace_id, p.patient_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_read_flag(ws_id uuid, f_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.flags AS f
    WHERE f.workspace_id = ws_id
      AND f.id = f_id
      AND private.can_read_evidence(f.workspace_id, f.evidence_log_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_flag_patient(ws_id uuid, f_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.flags AS f
    WHERE f.workspace_id = ws_id
      AND f.id = f_id
      AND private.is_evidence_patient(f.workspace_id, f.evidence_log_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_flag_doctor(ws_id uuid, f_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.flags AS f
    WHERE f.workspace_id = ws_id
      AND f.id = f_id
      AND private.is_evidence_doctor(f.workspace_id, f.evidence_log_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_read_prescription(ws_id uuid, pres_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exercise_prescriptions AS ep
    WHERE ep.workspace_id = ws_id
      AND ep.id = pres_id
      AND private.is_patient_self_or_doctor(ep.workspace_id, ep.patient_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_prescription_patient(ws_id uuid, pres_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exercise_prescriptions AS ep
    WHERE ep.workspace_id = ws_id
      AND ep.id = pres_id
      AND private.is_patient_owner(ep.workspace_id, ep.patient_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_prescription_doctor(ws_id uuid, pres_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exercise_prescriptions AS ep
    WHERE ep.workspace_id = ws_id
      AND ep.id = pres_id
      AND private.is_assigned_doctor(ep.workspace_id, ep.patient_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.can_read_attempt(ws_id uuid, att_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exercise_attempts AS ea
    WHERE ea.workspace_id = ws_id
      AND ea.id = att_id
      AND private.can_read_prescription(ea.workspace_id, ea.prescription_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_attempt_patient(ws_id uuid, att_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exercise_attempts AS ea
    WHERE ea.workspace_id = ws_id
      AND ea.id = att_id
      AND private.is_prescription_patient(ea.workspace_id, ea.prescription_id)
  );
$$;

CREATE OR REPLACE FUNCTION private.is_attempt_doctor(ws_id uuid, att_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.exercise_attempts AS ea
    WHERE ea.workspace_id = ws_id
      AND ea.id = att_id
      AND private.is_prescription_doctor(ea.workspace_id, ea.prescription_id)
  );
$$;

REVOKE ALL ON FUNCTION
  private.is_workspace_member(uuid),
  private.is_workspace_doctor(uuid, uuid),
  private.is_patient_owner(uuid, uuid),
  private.is_assigned_doctor(uuid, uuid),
  private.is_patient_self_or_doctor(uuid, uuid),
  private.can_caregiver_read_patient(uuid, uuid),
  private.can_read_plan(uuid, uuid),
  private.can_manage_plan(uuid, uuid),
  private.can_read_task_instance(uuid, uuid),
  private.can_write_task_instance(uuid, uuid),
  private.can_read_evidence(uuid, uuid),
  private.is_evidence_patient(uuid, uuid),
  private.is_evidence_doctor(uuid, uuid),
  private.can_read_flag(uuid, uuid),
  private.is_flag_patient(uuid, uuid),
  private.is_flag_doctor(uuid, uuid),
  private.can_read_prescription(uuid, uuid),
  private.is_prescription_patient(uuid, uuid),
  private.is_prescription_doctor(uuid, uuid),
  private.can_read_attempt(uuid, uuid),
  private.is_attempt_patient(uuid, uuid),
  private.is_attempt_doctor(uuid, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  private.is_workspace_member(uuid),
  private.is_workspace_doctor(uuid, uuid),
  private.is_patient_owner(uuid, uuid),
  private.is_assigned_doctor(uuid, uuid),
  private.is_patient_self_or_doctor(uuid, uuid),
  private.can_caregiver_read_patient(uuid, uuid),
  private.can_read_plan(uuid, uuid),
  private.can_manage_plan(uuid, uuid),
  private.can_read_task_instance(uuid, uuid),
  private.can_write_task_instance(uuid, uuid),
  private.can_read_evidence(uuid, uuid),
  private.is_evidence_patient(uuid, uuid),
  private.is_evidence_doctor(uuid, uuid),
  private.can_read_flag(uuid, uuid),
  private.is_flag_patient(uuid, uuid),
  private.is_flag_doctor(uuid, uuid),
  private.can_read_prescription(uuid, uuid),
  private.is_prescription_patient(uuid, uuid),
  private.is_prescription_doctor(uuid, uuid),
  private.can_read_attempt(uuid, uuid),
  private.is_attempt_patient(uuid, uuid),
  private.is_attempt_doctor(uuid, uuid)
TO authenticated;

-- Revoke anon privileges on all clinical & auth tables in public
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Enable RLS on all 33 public tables
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dorimos_scan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flag_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.urgent_symptoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_step_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parq_screenings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teach_back_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vitals_ocr_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_clinical_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregiver_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregiver_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregiver_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.android_demo_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_doctor_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_flag_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_patient_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_patient_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_patient_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_doctor_events ENABLE ROW LEVEL SECURITY;

-- 1. workspaces
CREATE POLICY workspaces_select_authenticated
  ON public.workspaces FOR SELECT TO authenticated
  USING (is_demo = false AND (SELECT private.is_workspace_member(id)));

-- 2. profiles
CREATE POLICY profiles_select_authenticated
  ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY profiles_insert_authenticated
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY profiles_update_authenticated
  ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- 3. clinic_memberships
CREATE POLICY clinic_memberships_select_authenticated
  ON public.clinic_memberships FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id AND is_demo = false);

-- 4. doctors
CREATE POLICY doctors_select_authenticated
  ON public.doctors FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_member(workspace_id)));

CREATE POLICY doctors_update_authenticated
  ON public.doctors FOR UPDATE TO authenticated
  USING ((SELECT private.is_workspace_doctor(workspace_id, id)))
  WITH CHECK ((SELECT private.is_workspace_doctor(workspace_id, id)));

-- 5. patients
CREATE POLICY patients_select_authenticated
  ON public.patients FOR SELECT TO authenticated
  USING (
    (SELECT private.is_patient_self_or_doctor(workspace_id, id))
    OR (SELECT private.can_caregiver_read_patient(workspace_id, id))
  );

CREATE POLICY patients_insert_authenticated
  ON public.patients FOR INSERT TO authenticated
  WITH CHECK (
    doctor_id IS NOT NULL
    AND (SELECT private.is_workspace_doctor(workspace_id, doctor_id))
  );

CREATE POLICY patients_update_authenticated
  ON public.patients FOR UPDATE TO authenticated
  USING (
    doctor_id IS NOT NULL
    AND (SELECT private.is_workspace_doctor(workspace_id, doctor_id))
  )
  WITH CHECK (
    doctor_id IS NOT NULL
    AND (SELECT private.is_workspace_doctor(workspace_id, doctor_id))
  );

-- 6. plans
CREATE POLICY plans_select_authenticated
  ON public.plans FOR SELECT TO authenticated
  USING (
    (SELECT private.is_patient_self_or_doctor(workspace_id, patient_id))
    OR (SELECT private.can_caregiver_read_patient(workspace_id, patient_id))
  );

CREATE POLICY plans_insert_authenticated
  ON public.plans FOR INSERT TO authenticated
  WITH CHECK (
    (doctor_id IS NOT NULL AND (SELECT private.is_workspace_doctor(workspace_id, doctor_id)))
    OR (doctor_id IS NULL AND (SELECT private.is_patient_owner(workspace_id, patient_id)))
  );

CREATE POLICY plans_update_authenticated
  ON public.plans FOR UPDATE TO authenticated
  USING (
    (doctor_id IS NOT NULL AND (SELECT private.is_workspace_doctor(workspace_id, doctor_id)))
    OR (doctor_id IS NULL AND (SELECT private.is_patient_owner(workspace_id, patient_id)))
  )
  WITH CHECK (
    (doctor_id IS NOT NULL AND (SELECT private.is_workspace_doctor(workspace_id, doctor_id)))
    OR (doctor_id IS NULL AND (SELECT private.is_patient_owner(workspace_id, patient_id)))
  );

-- 7. plan_items
CREATE POLICY plan_items_select_authenticated
  ON public.plan_items FOR SELECT TO authenticated
  USING ((SELECT private.can_read_plan(workspace_id, plan_id)));

CREATE POLICY plan_items_insert_authenticated
  ON public.plan_items FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_manage_plan(workspace_id, plan_id)));

CREATE POLICY plan_items_update_authenticated
  ON public.plan_items FOR UPDATE TO authenticated
  USING ((SELECT private.can_manage_plan(workspace_id, plan_id)))
  WITH CHECK ((SELECT private.can_manage_plan(workspace_id, plan_id)));

-- 8. task_instances
CREATE POLICY task_instances_select_authenticated
  ON public.task_instances FOR SELECT TO authenticated
  USING ((SELECT private.can_read_task_instance(workspace_id, id)));

CREATE POLICY task_instances_insert_authenticated
  ON public.task_instances FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.plan_items AS pi
      WHERE pi.workspace_id = task_instances.workspace_id
        AND pi.id = task_instances.plan_item_id
        AND private.can_read_plan(pi.workspace_id, pi.plan_id)
    )
  );

CREATE POLICY task_instances_update_authenticated
  ON public.task_instances FOR UPDATE TO authenticated
  USING ((SELECT private.can_write_task_instance(workspace_id, id)))
  WITH CHECK ((SELECT private.can_write_task_instance(workspace_id, id)));

-- 9. evidence_logs
CREATE POLICY evidence_logs_select_authenticated
  ON public.evidence_logs FOR SELECT TO authenticated
  USING ((SELECT private.can_read_evidence(workspace_id, id)));

CREATE POLICY evidence_logs_insert_authenticated
  ON public.evidence_logs FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.task_instances AS ti
      JOIN public.plan_items AS pi ON pi.workspace_id = ti.workspace_id AND pi.id = ti.plan_item_id
      JOIN public.plans AS p ON p.workspace_id = pi.workspace_id AND p.id = pi.plan_id
      WHERE ti.workspace_id = evidence_logs.workspace_id
        AND ti.id = evidence_logs.task_instance_id
        AND private.is_patient_owner(p.workspace_id, p.patient_id)
    )
  );

CREATE POLICY evidence_logs_update_authenticated
  ON public.evidence_logs FOR UPDATE TO authenticated
  USING ((SELECT private.is_evidence_doctor(workspace_id, id)))
  WITH CHECK ((SELECT private.is_evidence_doctor(workspace_id, id)));

-- 10. flags (note: doctor_note must still be omitted in patient/caregiver DTOs & selects)
CREATE POLICY flags_select_authenticated
  ON public.flags FOR SELECT TO authenticated
  USING ((SELECT private.can_read_flag(workspace_id, id)));

CREATE POLICY flags_insert_authenticated
  ON public.flags FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_evidence_patient(workspace_id, evidence_log_id)));

CREATE POLICY flags_update_authenticated
  ON public.flags FOR UPDATE TO authenticated
  USING ((SELECT private.is_flag_doctor(workspace_id, id)))
  WITH CHECK ((SELECT private.is_flag_doctor(workspace_id, id)));

-- 11. flag_followups (note: acknowledged_note must still be omitted in patient DTOs & selects)
CREATE POLICY flag_followups_select_authenticated
  ON public.flag_followups FOR SELECT TO authenticated
  USING ((SELECT private.can_read_flag(workspace_id, flag_id)));

CREATE POLICY flag_followups_insert_authenticated
  ON public.flag_followups FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_flag_patient(workspace_id, flag_id)));

CREATE POLICY flag_followups_update_authenticated
  ON public.flag_followups FOR UPDATE TO authenticated
  USING ((SELECT private.is_flag_doctor(workspace_id, flag_id)))
  WITH CHECK ((SELECT private.is_flag_doctor(workspace_id, flag_id)));

-- 12. urgent_symptoms (note: doctor_note must still be omitted in patient/caregiver DTOs & selects)
CREATE POLICY urgent_symptoms_select_authenticated
  ON public.urgent_symptoms FOR SELECT TO authenticated
  USING (
    (SELECT private.is_patient_self_or_doctor(workspace_id, patient_id))
    OR (SELECT private.can_caregiver_read_patient(workspace_id, patient_id))
  );

CREATE POLICY urgent_symptoms_insert_authenticated
  ON public.urgent_symptoms FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_patient_owner(workspace_id, patient_id)));

CREATE POLICY urgent_symptoms_update_authenticated
  ON public.urgent_symptoms FOR UPDATE TO authenticated
  USING ((SELECT private.is_assigned_doctor(workspace_id, patient_id)))
  WITH CHECK ((SELECT private.is_assigned_doctor(workspace_id, patient_id)));

-- 13. audit_events
CREATE POLICY audit_events_select_authenticated
  ON public.audit_events FOR SELECT TO authenticated
  USING ((SELECT private.is_evidence_doctor(workspace_id, evidence_log_id)));

CREATE POLICY audit_events_insert_authenticated
  ON public.audit_events FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_read_evidence(workspace_id, evidence_log_id)));

-- 14. exercise_prescriptions
CREATE POLICY exercise_prescriptions_select_authenticated
  ON public.exercise_prescriptions FOR SELECT TO authenticated
  USING ((SELECT private.is_patient_self_or_doctor(workspace_id, patient_id)));

CREATE POLICY exercise_prescriptions_insert_authenticated
  ON public.exercise_prescriptions FOR INSERT TO authenticated
  WITH CHECK (
    (doctor_id IS NOT NULL AND (SELECT private.is_workspace_doctor(workspace_id, doctor_id)))
    OR (doctor_id IS NULL AND (SELECT private.is_patient_owner(workspace_id, patient_id)))
  );

CREATE POLICY exercise_prescriptions_update_authenticated
  ON public.exercise_prescriptions FOR UPDATE TO authenticated
  USING (
    (doctor_id IS NOT NULL AND (SELECT private.is_workspace_doctor(workspace_id, doctor_id)))
    OR (doctor_id IS NULL AND (SELECT private.is_patient_owner(workspace_id, patient_id)))
  )
  WITH CHECK (
    (doctor_id IS NOT NULL AND (SELECT private.is_workspace_doctor(workspace_id, doctor_id)))
    OR (doctor_id IS NULL AND (SELECT private.is_patient_owner(workspace_id, patient_id)))
  );

-- 15. exercise_attempts
CREATE POLICY exercise_attempts_select_authenticated
  ON public.exercise_attempts FOR SELECT TO authenticated
  USING ((SELECT private.can_read_prescription(workspace_id, prescription_id)));

CREATE POLICY exercise_attempts_insert_authenticated
  ON public.exercise_attempts FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_prescription_patient(workspace_id, prescription_id)));

CREATE POLICY exercise_attempts_update_authenticated
  ON public.exercise_attempts FOR UPDATE TO authenticated
  USING ((SELECT private.is_prescription_doctor(workspace_id, prescription_id)))
  WITH CHECK ((SELECT private.is_prescription_doctor(workspace_id, prescription_id)));

-- 16. exercise_segments
CREATE POLICY exercise_segments_select_authenticated
  ON public.exercise_segments FOR SELECT TO authenticated
  USING ((SELECT private.can_read_attempt(workspace_id, attempt_id)));

CREATE POLICY exercise_segments_insert_authenticated
  ON public.exercise_segments FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_attempt_patient(workspace_id, attempt_id)));

CREATE POLICY exercise_segments_update_authenticated
  ON public.exercise_segments FOR UPDATE TO authenticated
  USING ((SELECT private.is_attempt_doctor(workspace_id, attempt_id)))
  WITH CHECK ((SELECT private.is_attempt_doctor(workspace_id, attempt_id)));

-- 17. daily_step_counts
CREATE POLICY daily_step_counts_select_authenticated
  ON public.daily_step_counts FOR SELECT TO authenticated
  USING (
    (SELECT private.is_patient_self_or_doctor(workspace_id, patient_id))
    OR (SELECT private.can_caregiver_read_patient(workspace_id, patient_id))
  );

CREATE POLICY daily_step_counts_insert_authenticated
  ON public.daily_step_counts FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_patient_owner(workspace_id, patient_id)));

CREATE POLICY daily_step_counts_update_authenticated
  ON public.daily_step_counts FOR UPDATE TO authenticated
  USING ((SELECT private.is_patient_owner(workspace_id, patient_id)))
  WITH CHECK ((SELECT private.is_patient_owner(workspace_id, patient_id)));

-- 18. parq_screenings
CREATE POLICY parq_screenings_select_authenticated
  ON public.parq_screenings FOR SELECT TO authenticated
  USING ((SELECT private.is_patient_self_or_doctor(workspace_id, patient_id)));

CREATE POLICY parq_screenings_insert_authenticated
  ON public.parq_screenings FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_patient_owner(workspace_id, patient_id)));

-- 19. teach_back_attempts
CREATE POLICY teach_back_attempts_select_authenticated
  ON public.teach_back_attempts FOR SELECT TO authenticated
  USING ((SELECT private.is_patient_self_or_doctor(workspace_id, patient_id)));

CREATE POLICY teach_back_attempts_insert_authenticated
  ON public.teach_back_attempts FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_patient_owner(workspace_id, patient_id)));

-- 20. vitals_ocr_scans
CREATE POLICY vitals_ocr_scans_select_authenticated
  ON public.vitals_ocr_scans FOR SELECT TO authenticated
  USING ((SELECT private.is_patient_self_or_doctor(workspace_id, patient_id)));

CREATE POLICY vitals_ocr_scans_insert_authenticated
  ON public.vitals_ocr_scans FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_patient_owner(workspace_id, patient_id)));

CREATE POLICY vitals_ocr_scans_update_authenticated
  ON public.vitals_ocr_scans FOR UPDATE TO authenticated
  USING ((SELECT private.is_patient_owner(workspace_id, patient_id)))
  WITH CHECK ((SELECT private.is_patient_owner(workspace_id, patient_id)));

-- 21. ai_clinical_briefs
CREATE POLICY ai_clinical_briefs_select_authenticated
  ON public.ai_clinical_briefs FOR SELECT TO authenticated
  USING ((SELECT private.is_patient_self_or_doctor(workspace_id, patient_id)));

CREATE POLICY ai_clinical_briefs_insert_authenticated
  ON public.ai_clinical_briefs FOR INSERT TO authenticated
  WITH CHECK (
    (doctor_id IS NOT NULL AND (SELECT private.is_workspace_doctor(workspace_id, doctor_id)))
    OR (doctor_id IS NULL AND (SELECT private.is_patient_owner(workspace_id, patient_id)))
  );

-- 22. caregiver_links
CREATE POLICY caregiver_links_select_authenticated
  ON public.caregiver_links FOR SELECT TO authenticated
  USING ((SELECT private.is_patient_owner(workspace_id, patient_id)));

CREATE POLICY caregiver_links_insert_authenticated
  ON public.caregiver_links FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_patient_owner(workspace_id, patient_id)));

CREATE POLICY caregiver_links_update_authenticated
  ON public.caregiver_links FOR UPDATE TO authenticated
  USING ((SELECT private.is_patient_owner(workspace_id, patient_id)))
  WITH CHECK ((SELECT private.is_patient_owner(workspace_id, patient_id)));

-- 23. caregiver_audit_events
CREATE POLICY caregiver_audit_events_select_authenticated
  ON public.caregiver_audit_events FOR SELECT TO authenticated
  USING ((SELECT private.is_patient_owner(workspace_id, patient_id)));

CREATE POLICY caregiver_audit_events_insert_authenticated
  ON public.caregiver_audit_events FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_patient_owner(workspace_id, patient_id)));

-- 24. caregiver_acks
CREATE POLICY caregiver_acks_select_authenticated
  ON public.caregiver_acks FOR SELECT TO authenticated
  USING (
    (SELECT private.is_patient_self_or_doctor(workspace_id, patient_id))
    OR (SELECT private.can_caregiver_read_patient(workspace_id, patient_id))
  );

CREATE POLICY caregiver_acks_insert_authenticated
  ON public.caregiver_acks FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_caregiver_read_patient(workspace_id, patient_id)));

CREATE POLICY caregiver_acks_update_authenticated
  ON public.caregiver_acks FOR UPDATE TO authenticated
  USING ((SELECT private.can_caregiver_read_patient(workspace_id, patient_id)))
  WITH CHECK ((SELECT private.can_caregiver_read_patient(workspace_id, patient_id)));

-- 25. telegram_pairings
CREATE POLICY telegram_pairings_select_authenticated
  ON public.telegram_pairings FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_doctor(workspace_id, doctor_id)));

CREATE POLICY telegram_pairings_insert_authenticated
  ON public.telegram_pairings FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_workspace_doctor(workspace_id, doctor_id)));

CREATE POLICY telegram_pairings_update_authenticated
  ON public.telegram_pairings FOR UPDATE TO authenticated
  USING ((SELECT private.is_workspace_doctor(workspace_id, doctor_id)))
  WITH CHECK ((SELECT private.is_workspace_doctor(workspace_id, doctor_id)));

CREATE POLICY telegram_pairings_delete_authenticated
  ON public.telegram_pairings FOR DELETE TO authenticated
  USING ((SELECT private.is_workspace_doctor(workspace_id, doctor_id)));

-- 26. telegram_doctor_links
CREATE POLICY telegram_doctor_links_select_authenticated
  ON public.telegram_doctor_links FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_doctor(workspace_id, doctor_id)));

CREATE POLICY telegram_doctor_links_delete_authenticated
  ON public.telegram_doctor_links FOR DELETE TO authenticated
  USING ((SELECT private.is_workspace_doctor(workspace_id, doctor_id)));

-- 27. telegram_patient_pairings
CREATE POLICY telegram_patient_pairings_select_authenticated
  ON public.telegram_patient_pairings FOR SELECT TO authenticated
  USING ((SELECT private.is_patient_owner(workspace_id, patient_id)));

CREATE POLICY telegram_patient_pairings_insert_authenticated
  ON public.telegram_patient_pairings FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.is_patient_owner(workspace_id, patient_id)));

CREATE POLICY telegram_patient_pairings_update_authenticated
  ON public.telegram_patient_pairings FOR UPDATE TO authenticated
  USING ((SELECT private.is_patient_owner(workspace_id, patient_id)))
  WITH CHECK ((SELECT private.is_patient_owner(workspace_id, patient_id)));

CREATE POLICY telegram_patient_pairings_delete_authenticated
  ON public.telegram_patient_pairings FOR DELETE TO authenticated
  USING ((SELECT private.is_patient_owner(workspace_id, patient_id)));

-- 28. telegram_patient_links
CREATE POLICY telegram_patient_links_select_authenticated
  ON public.telegram_patient_links FOR SELECT TO authenticated
  USING ((SELECT private.is_patient_owner(workspace_id, patient_id)));

CREATE POLICY telegram_patient_links_delete_authenticated
  ON public.telegram_patient_links FOR DELETE TO authenticated
  USING ((SELECT private.is_patient_owner(workspace_id, patient_id)));

-- 29. telegram_flag_notices
CREATE POLICY telegram_flag_notices_select_authenticated
  ON public.telegram_flag_notices FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_doctor(workspace_id, doctor_id)));

-- 30. telegram_patient_notices
CREATE POLICY telegram_patient_notices_select_authenticated
  ON public.telegram_patient_notices FOR SELECT TO authenticated
  USING ((SELECT private.is_patient_owner(workspace_id, patient_id)));

-- 31. telegram_doctor_events
CREATE POLICY telegram_doctor_events_select_authenticated
  ON public.telegram_doctor_events FOR SELECT TO authenticated
  USING ((SELECT private.is_workspace_doctor(workspace_id, doctor_id)));

-- 32. dorimos_scan_limits (server-only via service_role / DATABASE_URL)
REVOKE ALL ON TABLE public.dorimos_scan_limits FROM authenticated;
CREATE POLICY dorimos_scan_limits_deny_authenticated
  ON public.dorimos_scan_limits FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- 33. android_demo_access (server-only via service_role / DATABASE_URL)
REVOKE ALL ON TABLE public.android_demo_access FROM authenticated;
CREATE POLICY android_demo_access_deny_authenticated
  ON public.android_demo_access FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);
