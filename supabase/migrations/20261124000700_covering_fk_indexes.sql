-- 20261124000700_covering_fk_indexes.sql
-- Adds covering btree indexes for the 3 composite foreign keys flagged by
-- Supabase Performance Advisor (unindexed_foreign_keys).

CREATE INDEX IF NOT EXISTS clinic_memberships_workspace_demo_idx
  ON public.clinic_memberships (workspace_id, is_demo);

CREATE INDEX IF NOT EXISTS exercise_prescriptions_patient_doctor_idx
  ON public.exercise_prescriptions (workspace_id, patient_id, doctor_id);

CREATE INDEX IF NOT EXISTS plans_patient_doctor_idx
  ON public.plans (workspace_id, patient_id, doctor_id);
