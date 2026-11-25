import { z } from 'zod';
import {
  isPatientSideRole,
  type ClinicalActor,
  type ClinicalView,
  type EvidenceView,
  type EvidenceWrite,
  type FlagFollowup,
  type MedicationScheduleItem,
  type MutationResult,
  type PlanInput,
  type ReviewInput,
  type StrengthUnit,
  type TaskContext,
} from './clinical-types';
import type { FollowupAckInput, FollowupInput, SymptomReviewInput, UrgentSymptomInput } from './clinical-inputs';
import { getDatabase } from './db';
import { medicationBoxEvidenceSchema } from './dorimos-contract';

const strengthUnitSchema = z.enum(['mg', 'mcg', 'g', 'iu']);

const medicationItemRow = z.object({
  id: z.uuid().optional(),
  title: z.string(),
  strength: z.number().positive().nullable(),
  strengthUnit: strengthUnitSchema.default('mg'),
  dueTime: z.string(),
  sortOrder: z.number().int().optional(),
});

const targetsRow = z.object({
  maxSystolic: z.number(),
  maxDiastolic: z.number(),
  warnSystolic: z.number(),
  warnDiastolic: z.number(),
  minSystolic: z.number().optional(),
  minDiastolic: z.number().optional(),
});

const planFields = z.object({
  medicationName: z.string(),
  medicationStrengthMg: z.number().positive().nullable(),
  medicationStrengthUnit: strengthUnitSchema.optional(),
  medicationTime: z.string(),
  medicationItems: z.array(medicationItemRow).optional(),
  vitalsTime: z.string(),
  targets: targetsRow,
  supplyFollowUp: z.boolean(),
  dailyStepGoal: z.number().int().min(100).max(50000).default(3000),
});

const taskStatus = z.enum(['pending', 'taken', 'missed', 'recorded']);
const taskType = z.enum(['medication', 'vitals']);
const decision = z.enum(['approved', 'retake']);

const evidenceFields = z.object({
  evidenceId: z.uuid(),
  level: z.union([z.literal(0), z.literal(2), z.literal(4)]),
  source: z.enum(['self_report', 'photo_ocr']),
  aiMode: z.enum(['none', 'manual', 'live']),
  payload: z.union([
    z.object({ kind: z.literal('medication'), status: z.literal('taken') }),
    z.object({
      kind: z.literal('medication'), status: z.literal('missed'),
      reason: z.enum(['out_of_supply', 'side_effects', 'forgot', 'other']),
    }),
    z.object({
      kind: z.literal('vitals'), chestPain: z.boolean(),
      systolic: z.number().nullable(), diastolic: z.number().nullable(),
      repeatOfEvidenceId: z.uuid().optional(),
    }),
    medicationBoxEvidenceSchema,
  ]),
  createdAt: z.iso.datetime(),
});

const resolvedFields = z.object({ decision, reply: z.string(), reviewedAt: z.iso.datetime() });

const flagFields = z.object({
  color: z.enum(['red', 'yellow']), ruleKey: z.string(),
  detail: z.object({
    metric: z.enum(['systolic', 'diastolic']).optional(),
    observed: z.number().optional(), threshold: z.number().optional(),
  }),
});

const taskFields = z.object({
  taskId: z.uuid(),
  planItemId: z.uuid().optional(),
  type: taskType,
  title: z.string(),
  date: z.iso.date(),
  dueTime: z.string(),
  strength: z.number().positive().nullable().optional(),
  strengthUnit: strengthUnitSchema.optional(),
  sortOrder: z.number().int().optional(),
  status: taskStatus,
  recent: z.boolean(),
  evidenceId: z.uuid().nullable(),
  flagId: z.uuid().nullable(),
  decision: decision.nullable(),
});

const contextFields = planFields.extend({
  planItemId: z.uuid().optional(),
  type: taskType,
  title: z.string().optional(),
  date: z.iso.date(),
  strength: z.number().positive().nullable().optional(),
  strengthUnit: strengthUnitSchema.optional(),
  previousDate: z.iso.date().nullable(),
  previousStatus: z.enum(['taken', 'missed', 'unanswered']),
});

const mutationRow = z.object({ result: z.enum(['saved', 'already_saved', 'not_found']) });
const followupRow = z.object({
  id: z.uuid(),
  flagId: z.uuid(),
  kind: z.enum(['supply_resolved', 'still_need_help', 'retake_vitals', 'retake_medication']),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
  acknowledgedAt: z.iso.datetime().nullable(),
});
const symptomRow = z.object({
  id: z.uuid(),
  symptom: z.enum(['chest_pain', 'dizziness', 'shortness_of_breath', 'severe_headache']),
  note: z.string(),
  level: z.union([z.literal(0), z.literal(4)]),
  createdAt: z.iso.datetime(),
  decision: decision.nullable(),
  reply: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
});
const ackRow = z.object({
  kind: z.enum(['supply_on_the_way', 'checked_in']),
  createdAt: z.iso.datetime(),
});
const flagPriority = { red: 0, yellow: 1 };

function requireDatabase() {
  const database = getDatabase();
  if (!database) throw new Error('Clinical database is unavailable');
  return database;
}

function groupMedicationItems(
  items: readonly z.infer<typeof medicationItemRow>[] | undefined,
  fallback: {
    medicationName: string;
    medicationStrengthMg: number | null;
    medicationStrengthUnit?: StrengthUnit;
    medicationTime: string;
  },
): MedicationScheduleItem[] {
  if (!items || items.length === 0) {
    return [{
      name: fallback.medicationName,
      strength: fallback.medicationStrengthMg,
      strengthUnit: fallback.medicationStrengthUnit ?? 'mg',
      times: [fallback.medicationTime],
    }];
  }

  const grouped = new Map<string, MedicationScheduleItem>();
  for (const item of items) {
    const key = item.title.trim().toLowerCase();
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.times.includes(item.dueTime)) {
        existing.times.push(item.dueTime);
      }
    } else {
      grouped.set(key, {
        name: item.title,
        strength: item.strength,
        strengthUnit: item.strengthUnit,
        times: [item.dueTime],
      });
    }
  }
  return [...grouped.values()];
}

function hydratePlan(raw: z.infer<typeof planFields>): PlanInput {
  const medications = groupMedicationItems(raw.medicationItems, raw);
  const primary = medications[0]!;
  return {
    medicationName: raw.medicationName,
    medicationStrengthMg: raw.medicationStrengthMg,
    medicationStrengthUnit: raw.medicationStrengthUnit ?? primary.strengthUnit,
    medicationTime: raw.medicationTime,
    medications,
    vitalsTime: raw.vitalsTime,
    targets: raw.targets,
    supplyFollowUp: raw.supplyFollowUp,
    dailyStepGoal: raw.dailyStepGoal,
  };
}

type PlanItemSeed = {
  type: 'medication' | 'vitals';
  title: string;
  due_time: string;
  box_strength_mg: number | null;
  strength_unit: StrengthUnit;
  sort_order: number;
};

function buildPlanItemSeeds(input: PlanInput): PlanItemSeed[] {
  const medications: MedicationScheduleItem[] =
    input.medications && input.medications.length > 0
      ? input.medications
      : [{
          name: input.medicationName,
          strength: input.medicationStrengthMg,
          strengthUnit: input.medicationStrengthUnit ?? 'mg',
          times: [input.medicationTime],
        }];

  const rows: PlanItemSeed[] = [];
  let sortOrder = 0;
  for (const med of medications) {
    for (const slotTime of med.times) {
      rows.push({
        type: 'medication',
        title: med.name,
        due_time: slotTime,
        box_strength_mg: med.strength,
        strength_unit: med.strengthUnit,
        sort_order: sortOrder,
      });
      sortOrder += 1;
    }
  }
  rows.push({
    type: 'vitals',
    title: 'Qon bosimi',
    due_time: input.vitalsTime,
    box_strength_mg: null,
    strength_unit: 'mg',
    sort_order: sortOrder,
  });
  return rows;
}

export async function assignPlan(actor: ClinicalActor, input: PlanInput): Promise<MutationResult> {
  if (actor.role !== 'doctor' || !actor.doctorId || !actor.patientId) return 'not_found';
  const sql = requireDatabase();
  const planItems = buildPlanItemSeeds(input);
  const [row] = await sql`
    WITH scoped AS (
      SELECT workspace_id, id, doctor_id
      FROM public.patients
      WHERE workspace_id = ${actor.workspaceId} AND id = ${actor.patientId} AND doctor_id = ${actor.doctorId}
    ), added AS (
      INSERT INTO public.plans (workspace_id, patient_id, doctor_id, vitals_target, supply_follow_up, daily_step_goal)
      SELECT workspace_id, id, doctor_id, ${sql.json(input.targets)}::jsonb, ${input.supplyFollowUp}, ${input.dailyStepGoal ?? 3000}
      FROM scoped
      ON CONFLICT (workspace_id, patient_id) DO NOTHING
      RETURNING workspace_id, id
    ), items AS (
      INSERT INTO public.plan_items (workspace_id, plan_id, type, title, due_time, box_strength_mg, strength_unit, sort_order)
      SELECT added.workspace_id, added.id, item.type, item.title, item.due_time::time,
             item.box_strength_mg, item.strength_unit, item.sort_order
      FROM added
      CROSS JOIN jsonb_to_recordset(${sql.json(planItems)}::jsonb) AS item(
        type text,
        title text,
        due_time text,
        box_strength_mg numeric,
        strength_unit text,
        sort_order smallint
      )
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM added) THEN 'saved'
      WHEN EXISTS (SELECT 1 FROM scoped) THEN 'already_saved'
      ELSE 'not_found'
    END AS result
  `;
  return mutationRow.parse(row).result;
}

export async function getClinicalView(actor: ClinicalActor): Promise<ClinicalView> {
  if (actor.role === 'caregiver' || (actor.role === 'doctor' && !actor.doctorId) || !actor.patientId) {
    return { plan: null, tasks: [], flags: [], urgentSymptoms: [], caregiverAck: null };
  }
  const sql = requireDatabase();
  const [plans, , taskRows, followupRows, symptomRows, ackRows] = await sql.transaction((tx) => [
    tx`
      SELECT primary_med.title AS "medicationName",
             primary_med.box_strength_mg::float8 AS "medicationStrengthMg",
             primary_med.strength_unit AS "medicationStrengthUnit",
             left(primary_med.due_time::text, 5) AS "medicationTime",
             left(vitals.due_time::text, 5) AS "vitalsTime",
             plan.vitals_target AS targets,
             plan.supply_follow_up AS "supplyFollowUp",
             plan.daily_step_goal AS "dailyStepGoal",
             COALESCE((
               SELECT jsonb_agg(
                 jsonb_build_object(
                   'id', med.id,
                   'title', med.title,
                   'strength', med.box_strength_mg::float8,
                   'strengthUnit', med.strength_unit,
                   'dueTime', left(med.due_time::text, 5),
                   'sortOrder', med.sort_order
                 )
                 ORDER BY med.sort_order ASC, med.due_time ASC, med.title ASC
               )
               FROM public.plan_items AS med
               WHERE med.workspace_id = plan.workspace_id
                 AND med.plan_id = plan.id
                 AND med.type = 'medication'
             ), '[]'::jsonb) AS "medicationItems"
      FROM public.plans AS plan
      JOIN LATERAL (
        SELECT med.title, med.box_strength_mg, med.strength_unit, med.due_time
        FROM public.plan_items AS med
        WHERE med.workspace_id = plan.workspace_id
          AND med.plan_id = plan.id
          AND med.type = 'medication'
        ORDER BY med.sort_order ASC, med.due_time ASC, med.title ASC
        LIMIT 1
      ) AS primary_med ON true
      JOIN public.plan_items AS vitals
        ON vitals.workspace_id = plan.workspace_id AND vitals.plan_id = plan.id AND vitals.type = 'vitals'
      WHERE plan.workspace_id = ${actor.workspaceId} AND plan.patient_id = ${actor.patientId}
        AND plan.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
    `,
    tx`
      INSERT INTO public.task_instances (workspace_id, plan_item_id, scheduled_date)
      SELECT item.workspace_id, item.id, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date
      FROM public.plans AS plan
      JOIN public.plan_items AS item ON item.workspace_id = plan.workspace_id AND item.plan_id = plan.id
      WHERE plan.workspace_id = ${actor.workspaceId} AND plan.patient_id = ${actor.patientId}
        AND plan.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
        AND plan.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date
      ON CONFLICT (workspace_id, plan_item_id, scheduled_date) DO NOTHING
    `,
    tx`
      WITH local_date AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date AS today)
      SELECT task.id AS "taskId", item.id AS "planItemId", item.type, item.title,
             to_char(task.scheduled_date, 'YYYY-MM-DD') AS date,
             left(item.due_time::text, 5) AS "dueTime",
             item.box_strength_mg::float8 AS strength,
             item.strength_unit AS "strengthUnit",
             item.sort_order AS "sortOrder",
             task.status,
             task.scheduled_date >= local_date.today - 6 AS recent,
             evidence.id AS "evidenceId", evidence.level, evidence.source, evidence.ai_mode AS "aiMode",
             evidence.payload, to_char(evidence.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
             flag.id AS "flagId", flag.color, flag.rule_key AS "ruleKey", flag.detail, flag.decision,
             flag.patient_reply AS reply,
             to_char(flag.reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "reviewedAt"
      FROM public.plans AS plan
      JOIN public.plan_items AS item ON item.workspace_id = plan.workspace_id AND item.plan_id = plan.id
      JOIN public.task_instances AS task ON task.workspace_id = item.workspace_id AND task.plan_item_id = item.id
      LEFT JOIN public.evidence_logs AS evidence ON evidence.workspace_id = task.workspace_id AND evidence.task_instance_id = task.id
      LEFT JOIN public.flags AS flag ON flag.workspace_id = evidence.workspace_id AND flag.evidence_log_id = evidence.id
      CROSS JOIN local_date
      WHERE plan.workspace_id = ${actor.workspaceId} AND plan.patient_id = ${actor.patientId}
        AND plan.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
        AND (task.scheduled_date = local_date.today
          OR (task.scheduled_date < local_date.today AND evidence.id IS NOT NULL
            AND (task.scheduled_date >= local_date.today - 6
              OR (flag.reviewed_at AT TIME ZONE 'Asia/Tashkent')::date BETWEEN local_date.today - 6 AND local_date.today
              OR (${actor.role === 'doctor'} AND flag.id IS NOT NULL AND flag.decision IS NULL)
              OR (${actor.role === 'doctor'} AND flag.id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.flag_followups AS open_fu
                WHERE open_fu.workspace_id = flag.workspace_id
                  AND open_fu.flag_id = flag.id
                  AND open_fu.acknowledged_at IS NULL
                  AND (
                    (open_fu.kind = 'still_need_help' AND NOT EXISTS (
                      SELECT 1 FROM public.flag_followups AS newer_fu
                      WHERE newer_fu.workspace_id = open_fu.workspace_id
                        AND newer_fu.flag_id = open_fu.flag_id
                        AND newer_fu.kind IN ('still_need_help', 'supply_resolved')
                        AND (newer_fu.created_at > open_fu.created_at
                          OR (newer_fu.created_at = open_fu.created_at AND newer_fu.id > open_fu.id))
                    ))
                    OR (open_fu.kind = 'retake_medication' AND open_fu.payload->>'status' = 'missed' AND NOT EXISTS (
                      SELECT 1 FROM public.flag_followups AS newer_fu
                      WHERE newer_fu.workspace_id = open_fu.workspace_id
                        AND newer_fu.flag_id = open_fu.flag_id
                        AND newer_fu.kind = 'retake_medication'
                        AND (newer_fu.created_at > open_fu.created_at
                          OR (newer_fu.created_at = open_fu.created_at AND newer_fu.id > open_fu.id))
                    ))
                    OR (open_fu.kind = 'retake_vitals' AND (
                        open_fu.payload->'chestPain' = 'true'::jsonb
                        OR (CASE WHEN (open_fu.payload->>'systolic') ~ '^[0-9]{1,3}$'
                            THEN (open_fu.payload->>'systolic')::int ELSE 0 END) >= (plan.vitals_target->>'warnSystolic')::int
                        OR (CASE WHEN (open_fu.payload->>'diastolic') ~ '^[0-9]{1,3}$'
                            THEN (open_fu.payload->>'diastolic')::int ELSE 0 END) >= (plan.vitals_target->>'warnDiastolic')::int
                        OR (plan.vitals_target ? 'minSystolic'
                            AND (open_fu.payload->>'systolic') ~ '^[0-9]{1,3}$'
                            AND (open_fu.payload->>'systolic')::int < (plan.vitals_target->>'minSystolic')::int)
                        OR (plan.vitals_target ? 'minDiastolic'
                            AND (open_fu.payload->>'diastolic') ~ '^[0-9]{1,3}$'
                            AND (open_fu.payload->>'diastolic')::int < (plan.vitals_target->>'minDiastolic')::int)
                      ) AND NOT EXISTS (
                      SELECT 1 FROM public.flag_followups AS newer_fu
                      WHERE newer_fu.workspace_id = open_fu.workspace_id
                        AND newer_fu.flag_id = open_fu.flag_id
                        AND newer_fu.kind = 'retake_vitals'
                        AND (newer_fu.created_at > open_fu.created_at
                          OR (newer_fu.created_at = open_fu.created_at AND newer_fu.id > open_fu.id))
                    ))
                  )
              ))
              OR (${actor.role === 'doctor'} AND flag.id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.flag_followups AS recent_ack
                WHERE recent_ack.workspace_id = flag.workspace_id
                  AND recent_ack.flag_id = flag.id
                  AND (recent_ack.acknowledged_at AT TIME ZONE 'Asia/Tashkent')::date BETWEEN local_date.today - 6 AND local_date.today
              )))))
      ORDER BY task.scheduled_date DESC, item.due_time ASC, item.sort_order ASC, item.type ASC, item.title ASC
    `,
    tx`
      SELECT followup.id, followup.flag_id AS "flagId", followup.kind, followup.payload,
             to_char(followup.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
             to_char(followup.acknowledged_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "acknowledgedAt"
      FROM public.flag_followups AS followup
      JOIN public.flags AS flag ON flag.workspace_id = followup.workspace_id AND flag.id = followup.flag_id
      JOIN public.evidence_logs AS evidence ON evidence.workspace_id = flag.workspace_id AND evidence.id = flag.evidence_log_id
      JOIN public.task_instances AS task ON task.workspace_id = evidence.workspace_id AND task.id = evidence.task_instance_id
      JOIN public.plan_items AS item ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
      JOIN public.plans AS plan ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
      WHERE followup.workspace_id = ${actor.workspaceId}
        AND plan.patient_id = ${actor.patientId} AND plan.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
      ORDER BY followup.created_at ASC, followup.id ASC
    `,
    tx`
      SELECT symptom.id, symptom.symptom, symptom.note, symptom.level,
             to_char(symptom.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
             symptom.review_decision AS decision, symptom.patient_reply AS reply,
             to_char(symptom.reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "reviewedAt"
      FROM public.urgent_symptoms AS symptom
      JOIN public.patients AS patient ON patient.workspace_id = symptom.workspace_id AND patient.id = symptom.patient_id
      WHERE symptom.workspace_id = ${actor.workspaceId}
        AND patient.id = ${actor.patientId} AND patient.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
        AND ((symptom.created_at AT TIME ZONE 'Asia/Tashkent')::date >= ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date - 6)
          OR (symptom.reviewed_at IS NOT NULL AND (symptom.reviewed_at AT TIME ZONE 'Asia/Tashkent')::date >= ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date - 6))
          OR (${actor.role === 'doctor'} AND symptom.review_decision IS NULL))
      ORDER BY symptom.created_at DESC
    `,
    tx`
      SELECT ack.kind,
             to_char(ack.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM public.caregiver_acks AS ack
      JOIN public.patients AS patient ON patient.workspace_id = ack.workspace_id AND patient.id = ack.patient_id
      WHERE ack.workspace_id = ${actor.workspaceId}
        AND patient.id = ${actor.patientId} AND patient.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
        AND ack.activity_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date
    `,
  ], { isolationLevel: 'ReadCommitted' });

  const urgentSymptoms = z.array(symptomRow).parse(symptomRows).map((row) => ({
    id: row.id,
    symptom: row.symptom,
    note: row.note,
    level: row.level,
    createdAt: row.createdAt,
    review: row.decision && row.reply && row.reviewedAt
      ? { decision: row.decision, reply: row.reply, reviewedAt: row.reviewedAt }
      : null,
  }));
  const caregiverAck = ackRows[0] ? ackRow.parse(ackRows[0]) : null;

  if (!plans[0]) return { plan: null, tasks: [], flags: [], urgentSymptoms, caregiverAck };

  const followupsByFlag = new Map<string, FlagFollowup[]>();
  for (const rawFollowup of followupRows) {
    const parsed = followupRow.parse(rawFollowup);
    const list = followupsByFlag.get(parsed.flagId) ?? [];
    list.push(parsed);
    followupsByFlag.set(parsed.flagId, list);
  }

  const parsedPlan = hydratePlan(planFields.parse(plans[0]));
  const view: ClinicalView = { plan: parsedPlan, tasks: [], flags: [], urgentSymptoms, caregiverAck };
  const visibleTasks = new Map<string, ClinicalView['tasks'][number]>();
  for (const row of taskRows) {
    const task = taskFields.parse(row);
    let evidence: EvidenceView | null = null;
    if (task.evidenceId) {
      const { evidenceId, ...fields } = evidenceFields.parse(row);
      evidence = {
        ...fields, id: evidenceId, taskId: task.taskId,
        ...(task.flagId ? { flagId: task.flagId, followups: followupsByFlag.get(task.flagId) ?? [] } : {}),
        review: task.decision ? resolvedFields.parse(row) : null,
      };
    }
    if (task.recent || (isPatientSideRole(actor.role) && evidence?.review)) {
      let item = visibleTasks.get(task.taskId);
      if (!item) {
        item = {
          id: task.taskId,
          ...(task.planItemId ? { planItemId: task.planItemId } : {}),
          type: task.type,
          title: task.title,
          date: task.date,
          dueTime: task.dueTime,
          ...(task.strength !== undefined ? { strength: task.strength } : {}),
          ...(task.strengthUnit !== undefined ? { strengthUnit: task.strengthUnit } : {}),
          status: task.status,
          evidence: null,
          boxEvidence: null,
        };
        if (!task.recent) item.lateReview = true;
        visibleTasks.set(task.taskId, item);
      }
      if (evidence?.payload.kind === 'medication_box') item.boxEvidence = evidence;
      else if (evidence) item.evidence = evidence;
    }
    if (actor.role === 'doctor' && evidence && task.flagId) {
      const { detail, ...flag } = flagFields.parse(row);
      view.flags.push({ ...flag, ...detail, id: task.flagId, evidence });
    }
  }
  view.tasks = [...visibleTasks.values()];
  view.flags.sort((first, second) => (
    flagPriority[first.color] - flagPriority[second.color]
    || first.evidence.createdAt.localeCompare(second.evidence.createdAt)
    || first.id.localeCompare(second.id)
  ));
  return view;
}

export async function getTaskContext(actor: ClinicalActor, taskId: string): Promise<TaskContext | null> {
  if (!isPatientSideRole(actor.role) || !actor.patientId) return null;
  const sql = requireDatabase();
  const [row] = await sql`
    SELECT item.id AS "planItemId",
           item.type,
           item.title,
           item.box_strength_mg::float8 AS strength,
           item.strength_unit AS "strengthUnit",
           to_char(task.scheduled_date, 'YYYY-MM-DD') AS date,
           primary_med.title AS "medicationName",
           primary_med.box_strength_mg::float8 AS "medicationStrengthMg",
           primary_med.strength_unit AS "medicationStrengthUnit",
           left(primary_med.due_time::text, 5) AS "medicationTime",
           left(vitals.due_time::text, 5) AS "vitalsTime",
           plan.vitals_target AS targets,
           plan.supply_follow_up AS "supplyFollowUp",
           plan.daily_step_goal AS "dailyStepGoal",
           COALESCE((
             SELECT jsonb_agg(
               jsonb_build_object(
                 'id', med.id,
                 'title', med.title,
                 'strength', med.box_strength_mg::float8,
                 'strengthUnit', med.strength_unit,
                 'dueTime', left(med.due_time::text, 5),
                 'sortOrder', med.sort_order
               )
               ORDER BY med.sort_order ASC, med.due_time ASC, med.title ASC
             )
             FROM public.plan_items AS med
             WHERE med.workspace_id = plan.workspace_id
               AND med.plan_id = plan.id
               AND med.type = 'medication'
           ), '[]'::jsonb) AS "medicationItems",
           CASE WHEN item.type = 'medication' AND plan.start_date < task.scheduled_date
                THEN to_char(task.scheduled_date - 1, 'YYYY-MM-DD') END AS "previousDate",
           CASE WHEN previous_evidence.id IS NULL THEN 'unanswered' ELSE prior.status END AS "previousStatus"
    FROM public.task_instances AS task
    JOIN public.plan_items AS item ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
    JOIN public.plans AS plan ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
    JOIN LATERAL (
      SELECT med.title, med.box_strength_mg, med.strength_unit, med.due_time
      FROM public.plan_items AS med
      WHERE med.workspace_id = plan.workspace_id
        AND med.plan_id = plan.id
        AND med.type = 'medication'
      ORDER BY med.sort_order ASC, med.due_time ASC, med.title ASC
      LIMIT 1
    ) AS primary_med ON true
    JOIN public.plan_items AS vitals
      ON vitals.workspace_id = plan.workspace_id AND vitals.plan_id = plan.id AND vitals.type = 'vitals'
    LEFT JOIN public.task_instances AS prior
      ON item.type = 'medication' AND prior.workspace_id = task.workspace_id AND prior.plan_item_id = item.id
        AND prior.scheduled_date = task.scheduled_date - 1
    LEFT JOIN public.evidence_logs AS previous_evidence
      ON previous_evidence.workspace_id = prior.workspace_id AND previous_evidence.task_instance_id = prior.id
        AND previous_evidence.entry_kind = 'task'
    WHERE task.workspace_id = ${actor.workspaceId} AND task.id = ${taskId}
      AND plan.patient_id = ${actor.patientId} AND plan.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
      AND (task.scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date OR task.status <> 'pending')
  `;
  if (!row) return null;
  const parsed = contextFields.parse(row);
  const { planItemId, type, title, date, strength, strengthUnit, previousDate, previousStatus, ...rawPlan } = parsed;
  const plan = hydratePlan(rawPlan);
  return {
    ...(planItemId ? { planItemId } : {}),
    type,
    ...(title !== undefined ? { title } : {}),
    date,
    ...(strength !== undefined ? { strength } : {}),
    ...(strengthUnit !== undefined ? { strengthUnit } : {}),
    plan,
    previousMedication: previousDate ? { date: previousDate, status: previousStatus } : null,
  };
}

export async function saveEvidence(actor: ClinicalActor, input: EvidenceWrite): Promise<MutationResult> {
  if (!isPatientSideRole(actor.role) || !actor.patientId) return 'not_found';
  const sql = requireDatabase();
  const status = input.payload.kind === 'medication' ? input.payload.status : 'recorded';
  const { color = null, ruleKey = null, ...detail } = input.flag ?? {};
  const repeatOfEvidenceId =
    input.payload.kind === 'vitals' ? (input.payload.repeatOfEvidenceId ?? null) : null;
  const [row] = await sql`
    WITH scoped AS (
      SELECT task.id, task.workspace_id, task.scheduled_date, task.status
      FROM public.task_instances AS task
      JOIN public.plan_items AS item ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
      JOIN public.plans AS plan ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
      WHERE task.workspace_id = ${actor.workspaceId} AND task.id = ${input.taskId}
        AND plan.patient_id = ${actor.patientId} AND plan.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
        AND item.type = ${input.payload.kind}
        AND (${repeatOfEvidenceId}::uuid IS NULL OR EXISTS (
          SELECT 1
          FROM public.evidence_logs AS prev_ev
          JOIN public.task_instances AS prev_task
            ON prev_task.workspace_id = prev_ev.workspace_id AND prev_task.id = prev_ev.task_instance_id
          JOIN public.plan_items AS prev_item
            ON prev_item.workspace_id = prev_task.workspace_id AND prev_item.id = prev_task.plan_item_id
          JOIN public.plans AS prev_plan
            ON prev_plan.workspace_id = prev_item.workspace_id AND prev_plan.id = prev_item.plan_id
          WHERE prev_ev.workspace_id = plan.workspace_id
            AND prev_ev.id = ${repeatOfEvidenceId}::uuid
            AND prev_plan.patient_id = plan.patient_id
            AND prev_item.type = 'vitals'
        ))
    ), added AS (
      INSERT INTO public.evidence_logs (workspace_id, task_instance_id, level, source, ai_mode, payload)
      SELECT workspace_id, id, 0, 'self_report', ${input.aiMode}, ${sql.json(input.payload)}::jsonb
      FROM scoped
      WHERE scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date
      ON CONFLICT (workspace_id, task_instance_id, entry_kind) DO NOTHING
      RETURNING workspace_id, id, task_instance_id
    ), updated AS (
      UPDATE public.task_instances AS task SET status = ${status}
      FROM added
      WHERE task.workspace_id = added.workspace_id AND task.id = added.task_instance_id
    ), flagged AS (
      INSERT INTO public.flags (workspace_id, evidence_log_id, color, rule_key, detail)
      SELECT workspace_id, id, ${color}::text, ${ruleKey}::text, ${sql.json(detail)}::jsonb
      FROM added WHERE ${color}::text IS NOT NULL
    ), audited AS (
      INSERT INTO public.audit_events (workspace_id, evidence_log_id, actor_id, action)
      SELECT workspace_id, id, ${actor.patientId}::uuid, 'record_evidence'
      FROM added
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM added) THEN 'saved'
      WHEN EXISTS (SELECT 1 FROM scoped WHERE status <> 'pending'
        OR scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date) THEN 'already_saved'
      ELSE 'not_found'
    END AS result
  `;
  return mutationRow.parse(row).result;
}

export async function reviewFlag(actor: ClinicalActor, input: ReviewInput): Promise<MutationResult> {
  if (actor.role !== 'doctor' || !actor.doctorId || !actor.patientId) return 'not_found';
  const sql = requireDatabase();
  const [row] = await sql`
    WITH scoped AS (
      SELECT flag.workspace_id, flag.id
      FROM public.flags AS flag
      JOIN public.evidence_logs AS evidence ON evidence.workspace_id = flag.workspace_id AND evidence.id = flag.evidence_log_id
      JOIN public.task_instances AS task ON task.workspace_id = evidence.workspace_id AND task.id = evidence.task_instance_id
      JOIN public.plan_items AS item ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
      JOIN public.plans AS plan ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
      WHERE flag.workspace_id = ${actor.workspaceId} AND flag.id = ${input.flagId}
        AND plan.patient_id = ${actor.patientId} AND plan.doctor_id = ${actor.doctorId}
    ), reviewed AS (
      UPDATE public.flags AS flag
      SET decision = ${input.decision}, patient_reply = ${input.reply},
          doctor_note = ${input.note}, reviewed_at = CURRENT_TIMESTAMP
      FROM scoped
      WHERE flag.workspace_id = scoped.workspace_id AND flag.id = scoped.id AND flag.decision IS NULL
      RETURNING flag.workspace_id, flag.evidence_log_id, flag.decision
    ), promoted AS (
      UPDATE public.evidence_logs AS evidence SET level = 4
      FROM reviewed
      WHERE evidence.workspace_id = reviewed.workspace_id AND evidence.id = reviewed.evidence_log_id
        AND reviewed.decision = 'approved'
    ), audited AS (
      INSERT INTO public.audit_events (workspace_id, evidence_log_id, actor_id, action, metadata)
      SELECT workspace_id, evidence_log_id, ${actor.doctorId}::uuid, 'review_flag', jsonb_build_object('decision', decision)
      FROM reviewed
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM reviewed) THEN 'saved'
      WHEN EXISTS (SELECT 1 FROM scoped) THEN 'already_saved'
      ELSE 'not_found'
    END AS result
  `;
  return mutationRow.parse(row).result;
}

export async function saveFlagFollowup(actor: ClinicalActor, input: FollowupInput): Promise<MutationResult> {
  if (!isPatientSideRole(actor.role) || !actor.patientId) return 'not_found';
  const sql = requireDatabase();
  const [row] = await sql`
    WITH scoped AS (
      SELECT flag.workspace_id, flag.id, flag.decision
      FROM public.flags AS flag
      JOIN public.evidence_logs AS evidence ON evidence.workspace_id = flag.workspace_id AND evidence.id = flag.evidence_log_id
      JOIN public.task_instances AS task ON task.workspace_id = evidence.workspace_id AND task.id = evidence.task_instance_id
      JOIN public.plan_items AS item ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
      JOIN public.plans AS plan ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
      WHERE flag.workspace_id = ${actor.workspaceId} AND flag.id = ${input.flagId}
        AND plan.patient_id = ${actor.patientId} AND plan.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
        AND flag.decision IS NOT NULL
        AND (
          (${input.kind}::text IN ('supply_resolved', 'still_need_help')
            AND flag.decision = 'approved'
            AND evidence.entry_kind = 'task'
            AND evidence.payload->>'kind' = 'medication'
            AND evidence.payload->>'status' = 'missed'
            AND evidence.payload->>'reason' = 'out_of_supply')
          OR (${input.kind}::text = 'retake_vitals'
            AND flag.decision = 'retake'
            AND evidence.entry_kind = 'task'
            AND evidence.payload->>'kind' = 'vitals')
          OR (${input.kind}::text = 'retake_medication'
            AND flag.decision = 'retake'
            AND evidence.entry_kind = 'task'
            AND item.type = 'medication')
        )
    ), inserted AS (
      INSERT INTO public.flag_followups (workspace_id, flag_id, kind, payload)
      SELECT workspace_id, id, ${input.kind}::text, ${sql.json(input.payload)}::jsonb
      FROM scoped
      WHERE NOT (${input.kind}::text IN ('supply_resolved', 'still_need_help') AND EXISTS (
        SELECT 1 FROM public.flag_followups AS existing
        WHERE existing.workspace_id = scoped.workspace_id AND existing.flag_id = scoped.id
          AND existing.kind = 'supply_resolved'
      ))
        AND NOT (${input.kind}::text = 'retake_medication' AND EXISTS (
          SELECT 1 FROM public.flag_followups AS existing
          WHERE existing.workspace_id = scoped.workspace_id AND existing.flag_id = scoped.id
            AND existing.kind = 'retake_medication'
            AND existing.payload->>'status' = 'taken'
        ))
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM inserted) THEN 'saved'
      WHEN EXISTS (SELECT 1 FROM scoped) THEN 'already_saved'
      ELSE 'not_found'
    END AS result
  `;
  return mutationRow.parse(row).result;
}

export async function acknowledgeFlagFollowup(
  actor: ClinicalActor,
  input: FollowupAckInput,
): Promise<MutationResult> {
  if (actor.role !== 'doctor' || !actor.doctorId || !actor.patientId) return 'not_found';
  const sql = requireDatabase();
  const [row] = await sql`
    WITH scoped AS (
      SELECT followup.workspace_id, followup.id, followup.flag_id, followup.kind, followup.created_at
      FROM public.flag_followups AS followup
      JOIN public.flags AS flag
        ON flag.workspace_id = followup.workspace_id AND flag.id = followup.flag_id
      JOIN public.evidence_logs AS evidence
        ON evidence.workspace_id = flag.workspace_id AND evidence.id = flag.evidence_log_id
      JOIN public.task_instances AS task
        ON task.workspace_id = evidence.workspace_id AND task.id = evidence.task_instance_id
      JOIN public.plan_items AS item
        ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
      JOIN public.plans AS plan
        ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
      WHERE followup.workspace_id = ${actor.workspaceId} AND followup.id = ${input.followupId}
        AND plan.patient_id = ${actor.patientId} AND plan.doctor_id = ${actor.doctorId}
        AND (
          followup.kind = 'still_need_help'
          OR (followup.kind = 'retake_medication' AND followup.payload->>'status' = 'missed')
          OR (followup.kind = 'retake_vitals' AND (
            followup.payload->'chestPain' = 'true'::jsonb
            OR (CASE WHEN (followup.payload->>'systolic') ~ '^[0-9]{1,3}$'
                THEN (followup.payload->>'systolic')::int ELSE 0 END) >= (plan.vitals_target->>'warnSystolic')::int
            OR (CASE WHEN (followup.payload->>'diastolic') ~ '^[0-9]{1,3}$'
                THEN (followup.payload->>'diastolic')::int ELSE 0 END) >= (plan.vitals_target->>'warnDiastolic')::int
            OR (plan.vitals_target ? 'minSystolic'
                AND (followup.payload->>'systolic') ~ '^[0-9]{1,3}$'
                AND (followup.payload->>'systolic')::int < (plan.vitals_target->>'minSystolic')::int)
            OR (plan.vitals_target ? 'minDiastolic'
                AND (followup.payload->>'diastolic') ~ '^[0-9]{1,3}$'
                AND (followup.payload->>'diastolic')::int < (plan.vitals_target->>'minDiastolic')::int)
          ))
        )
    ), updated AS (
      UPDATE public.flag_followups AS followup
      SET acknowledged_at = CURRENT_TIMESTAMP,
          acknowledged_note = ${input.note}
      FROM scoped
      WHERE followup.workspace_id = scoped.workspace_id
        AND followup.flag_id = scoped.flag_id
        AND followup.kind = scoped.kind
        AND (followup.created_at < scoped.created_at
          OR (followup.created_at = scoped.created_at AND followup.id <= scoped.id))
        AND (scoped.kind <> 'retake_medication' OR followup.payload->>'status' = 'missed')
        AND followup.acknowledged_at IS NULL
      RETURNING 1
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM updated) THEN 'saved'
      WHEN EXISTS (SELECT 1 FROM scoped) THEN 'already_saved'
      ELSE 'not_found'
    END AS result
  `;
  return mutationRow.parse(row).result;
}

export async function saveUrgentSymptom(actor: ClinicalActor, input: UrgentSymptomInput): Promise<MutationResult> {
  if (!isPatientSideRole(actor.role) || !actor.patientId) return 'not_found';
  const sql = requireDatabase();
  const [row] = await sql`
    WITH scoped AS (
      SELECT workspace_id, id
      FROM public.patients
      WHERE workspace_id = ${actor.workspaceId} AND id = ${actor.patientId}
        AND doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
    ), inserted AS (
      INSERT INTO public.urgent_symptoms (workspace_id, patient_id, symptom, note)
      SELECT workspace_id, id, ${input.symptom}, ${input.note}
      FROM scoped
      WHERE NOT EXISTS (
        SELECT 1 FROM public.urgent_symptoms AS existing
        WHERE existing.workspace_id = scoped.workspace_id
          AND existing.patient_id = scoped.id
          AND existing.symptom = ${input.symptom}
          AND existing.note = ${input.note}
          AND existing.review_decision IS NULL
      )
      RETURNING 1
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM inserted) THEN 'saved'
      WHEN EXISTS (SELECT 1 FROM scoped) THEN 'already_saved'
      ELSE 'not_found'
    END AS result
  `;
  return mutationRow.parse(row).result;
}

export async function reviewUrgentSymptom(actor: ClinicalActor, input: SymptomReviewInput): Promise<MutationResult> {
  if (actor.role !== 'doctor' || !actor.doctorId || !actor.patientId) return 'not_found';
  const sql = requireDatabase();
  const [row] = await sql`
    WITH scoped AS (
      SELECT symptom.workspace_id, symptom.id
      FROM public.urgent_symptoms AS symptom
      JOIN public.patients AS patient ON patient.workspace_id = symptom.workspace_id AND patient.id = symptom.patient_id
      WHERE symptom.workspace_id = ${actor.workspaceId} AND symptom.id = ${input.symptomId}
        AND patient.id = ${actor.patientId} AND patient.doctor_id = ${actor.doctorId}
    ), reviewed AS (
      UPDATE public.urgent_symptoms AS symptom
      SET review_decision = ${input.decision},
          patient_reply = ${input.reply},
          doctor_note = ${input.note},
          reviewed_at = CURRENT_TIMESTAMP,
          level = CASE WHEN ${input.decision} = 'approved' THEN 4 ELSE symptom.level END
      FROM scoped
      WHERE symptom.workspace_id = scoped.workspace_id AND symptom.id = scoped.id AND symptom.review_decision IS NULL
      RETURNING 1
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM reviewed) THEN 'saved'
      WHEN EXISTS (SELECT 1 FROM scoped) THEN 'already_saved'
      ELSE 'not_found'
    END AS result
  `;
  return mutationRow.parse(row).result;
}
