import { z } from 'zod';
import type {
  ClinicalActor,
  ClinicalView,
  EvidenceView,
  EvidenceWrite,
  MutationResult,
  PlanInput,
  ReviewInput,
  TaskContext,
} from './clinical-types';
import { getDatabase } from './db';
import { medicationBoxEvidenceSchema } from './dorimos-contract';

const planFields = z.object({
  medicationName: z.string(),
  medicationStrengthMg: z.number().positive().nullable(),
  medicationTime: z.string(),
  vitalsTime: z.string(),
  targets: z.object({
    maxSystolic: z.number(), maxDiastolic: z.number(),
    warnSystolic: z.number(), warnDiastolic: z.number(),
  }),
  supplyFollowUp: z.boolean(),
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
  taskId: z.uuid(), type: taskType, title: z.string(),
  date: z.iso.date(), dueTime: z.string(), status: taskStatus,
  recent: z.boolean(), evidenceId: z.uuid().nullable(), flagId: z.uuid().nullable(),
  decision: decision.nullable(),
});

const contextFields = planFields.extend({
  type: taskType, date: z.iso.date(), previousDate: z.iso.date().nullable(),
  previousStatus: z.enum(['taken', 'missed', 'unanswered']),
});

const mutationRow = z.object({ result: z.enum(['saved', 'already_saved', 'not_found']) });
const flagPriority = { red: 0, yellow: 1 };

function requireDatabase() {
  const database = getDatabase();
  if (!database) throw new Error('Clinical database is unavailable');
  return database;
}

export async function assignPlan(actor: ClinicalActor, input: PlanInput): Promise<MutationResult> {
  if (actor.role !== 'doctor') return 'not_found';
  const sql = requireDatabase();
  const [row] = await sql`
    WITH scoped AS (
      SELECT workspace_id, id, doctor_id
      FROM shifohalqa.patients
      WHERE workspace_id = ${actor.workspaceId} AND id = ${actor.patientId} AND doctor_id = ${actor.doctorId}
    ), added AS (
      INSERT INTO shifohalqa.plans (workspace_id, patient_id, doctor_id, vitals_target, supply_follow_up)
      SELECT workspace_id, id, doctor_id, ${JSON.stringify(input.targets)}::jsonb, ${input.supplyFollowUp}
      FROM scoped
      ON CONFLICT (workspace_id, patient_id) DO NOTHING
      RETURNING workspace_id, id
    ), items AS (
      INSERT INTO shifohalqa.plan_items (workspace_id, plan_id, type, title, due_time, box_strength_mg)
      SELECT added.workspace_id, added.id, item.type, item.title, item.due_time, item.box_strength_mg
      FROM added CROSS JOIN (VALUES
        ('medication', ${input.medicationName}::text, ${input.medicationTime}::time, ${input.medicationStrengthMg}::numeric),
        ('vitals', 'Qon bosimi', ${input.vitalsTime}::time, NULL)
      ) AS item(type, title, due_time, box_strength_mg)
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
  const sql = requireDatabase();
  const [plans, , taskRows] = await sql.transaction((tx) => [
    tx`
      SELECT medicine.title AS "medicationName", medicine.box_strength_mg::float8 AS "medicationStrengthMg",
             left(medicine.due_time::text, 5) AS "medicationTime",
             left(vitals.due_time::text, 5) AS "vitalsTime", plan.vitals_target AS targets,
             plan.supply_follow_up AS "supplyFollowUp"
      FROM shifohalqa.plans AS plan
      JOIN shifohalqa.plan_items AS medicine
        ON medicine.workspace_id = plan.workspace_id AND medicine.plan_id = plan.id AND medicine.type = 'medication'
      JOIN shifohalqa.plan_items AS vitals
        ON vitals.workspace_id = plan.workspace_id AND vitals.plan_id = plan.id AND vitals.type = 'vitals'
      WHERE plan.workspace_id = ${actor.workspaceId} AND plan.patient_id = ${actor.patientId}
        AND plan.doctor_id = ${actor.doctorId}
    `,
    tx`
      INSERT INTO shifohalqa.task_instances (workspace_id, plan_item_id, scheduled_date)
      SELECT item.workspace_id, item.id, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date
      FROM shifohalqa.plans AS plan
      JOIN shifohalqa.plan_items AS item ON item.workspace_id = plan.workspace_id AND item.plan_id = plan.id
      WHERE plan.workspace_id = ${actor.workspaceId} AND plan.patient_id = ${actor.patientId}
        AND plan.doctor_id = ${actor.doctorId}
        AND plan.start_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date
      ON CONFLICT (workspace_id, plan_item_id, scheduled_date) DO NOTHING
    `,
    tx`
      WITH local_date AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date AS today)
      SELECT task.id AS "taskId", item.type, item.title, to_char(task.scheduled_date, 'YYYY-MM-DD') AS date,
             left(item.due_time::text, 5) AS "dueTime", task.status,
             task.scheduled_date >= local_date.today - 6 AS recent,
             evidence.id AS "evidenceId", evidence.level, evidence.source, evidence.ai_mode AS "aiMode",
             evidence.payload, to_char(evidence.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
             flag.id AS "flagId", flag.color, flag.rule_key AS "ruleKey", flag.detail, flag.decision,
             flag.patient_reply AS reply,
             to_char(flag.reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "reviewedAt"
      FROM shifohalqa.plans AS plan
      JOIN shifohalqa.plan_items AS item ON item.workspace_id = plan.workspace_id AND item.plan_id = plan.id
      JOIN shifohalqa.task_instances AS task ON task.workspace_id = item.workspace_id AND task.plan_item_id = item.id
      LEFT JOIN shifohalqa.evidence_logs AS evidence ON evidence.workspace_id = task.workspace_id AND evidence.task_instance_id = task.id
      LEFT JOIN shifohalqa.flags AS flag ON flag.workspace_id = evidence.workspace_id AND flag.evidence_log_id = evidence.id
      CROSS JOIN local_date
      WHERE plan.workspace_id = ${actor.workspaceId} AND plan.patient_id = ${actor.patientId}
        AND plan.doctor_id = ${actor.doctorId}
        AND (task.scheduled_date = local_date.today
          OR (task.scheduled_date < local_date.today AND evidence.id IS NOT NULL
            AND (task.scheduled_date >= local_date.today - 6
              OR (flag.reviewed_at AT TIME ZONE 'Asia/Tashkent')::date BETWEEN local_date.today - 6 AND local_date.today
              OR (${actor.role === 'doctor'} AND flag.id IS NOT NULL AND flag.decision IS NULL))))
      ORDER BY task.scheduled_date DESC, item.due_time, item.type
    `,
  ], { isolationLevel: 'ReadCommitted' });

  if (!plans[0]) return { plan: null, tasks: [], flags: [] };
  const view: ClinicalView = { plan: planFields.parse(plans[0]), tasks: [], flags: [] };
  const visibleTasks = new Map<string, ClinicalView['tasks'][number]>();
  for (const row of taskRows) {
    const task = taskFields.parse(row);
    let evidence: EvidenceView | null = null;
    if (task.evidenceId) {
      const { evidenceId, ...fields } = evidenceFields.parse(row);
      evidence = {
        ...fields, id: evidenceId, taskId: task.taskId,
        review: task.decision ? resolvedFields.parse(row) : null,
      };
    }
    if (task.recent || (actor.role === 'patient' && evidence?.review)) {
      let item = visibleTasks.get(task.taskId);
      if (!item) {
        item = { id: task.taskId, type: task.type, title: task.title, date: task.date,
          dueTime: task.dueTime, status: task.status, evidence: null, boxEvidence: null };
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
  if (actor.role !== 'patient') return null;
  const sql = requireDatabase();
  const [row] = await sql`
    SELECT item.type, to_char(task.scheduled_date, 'YYYY-MM-DD') AS date,
           medicine.title AS "medicationName", medicine.box_strength_mg::float8 AS "medicationStrengthMg",
           left(medicine.due_time::text, 5) AS "medicationTime",
           left(vitals.due_time::text, 5) AS "vitalsTime", plan.vitals_target AS targets,
           plan.supply_follow_up AS "supplyFollowUp",
           CASE WHEN item.type = 'medication' AND plan.start_date < task.scheduled_date
                THEN to_char(task.scheduled_date - 1, 'YYYY-MM-DD') END AS "previousDate",
           CASE WHEN previous_evidence.id IS NULL THEN 'unanswered' ELSE prior.status END AS "previousStatus"
    FROM shifohalqa.task_instances AS task
    JOIN shifohalqa.plan_items AS item ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
    JOIN shifohalqa.plans AS plan ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
    JOIN shifohalqa.plan_items AS medicine
      ON medicine.workspace_id = plan.workspace_id AND medicine.plan_id = plan.id AND medicine.type = 'medication'
    JOIN shifohalqa.plan_items AS vitals
      ON vitals.workspace_id = plan.workspace_id AND vitals.plan_id = plan.id AND vitals.type = 'vitals'
    LEFT JOIN shifohalqa.task_instances AS prior
      ON item.type = 'medication' AND prior.workspace_id = task.workspace_id AND prior.plan_item_id = item.id
        AND prior.scheduled_date = task.scheduled_date - 1
    LEFT JOIN shifohalqa.evidence_logs AS previous_evidence
      ON previous_evidence.workspace_id = prior.workspace_id AND previous_evidence.task_instance_id = prior.id
        AND previous_evidence.entry_kind = 'task'
    WHERE task.workspace_id = ${actor.workspaceId} AND task.id = ${taskId}
      AND plan.patient_id = ${actor.patientId} AND plan.doctor_id = ${actor.doctorId}
      AND (task.scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date OR task.status <> 'pending')
  `;
  if (!row) return null;
  const { type, date, previousDate, previousStatus, ...plan } = contextFields.parse(row);
  return {
    type,
    date,
    plan,
    previousMedication: previousDate ? { date: previousDate, status: previousStatus } : null,
  };
}

export async function saveEvidence(actor: ClinicalActor, input: EvidenceWrite): Promise<MutationResult> {
  if (actor.role !== 'patient') return 'not_found';
  const sql = requireDatabase();
  const status = input.payload.kind === 'medication' ? input.payload.status : 'recorded';
  const { color = null, ruleKey = null, ...detail } = input.flag ?? {};
  const [row] = await sql`
    WITH scoped AS (
      SELECT task.id, task.workspace_id, task.scheduled_date, task.status
      FROM shifohalqa.task_instances AS task
      JOIN shifohalqa.plan_items AS item ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
      JOIN shifohalqa.plans AS plan ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
      WHERE task.workspace_id = ${actor.workspaceId} AND task.id = ${input.taskId}
        AND plan.patient_id = ${actor.patientId} AND plan.doctor_id = ${actor.doctorId}
        AND item.type = ${input.payload.kind}
    ), added AS (
      INSERT INTO shifohalqa.evidence_logs (workspace_id, task_instance_id, level, source, ai_mode, payload)
      SELECT workspace_id, id, 0, 'self_report', ${input.aiMode}, ${JSON.stringify(input.payload)}::jsonb
      FROM scoped
      WHERE scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date
      ON CONFLICT (workspace_id, task_instance_id, entry_kind) DO NOTHING
      RETURNING workspace_id, id, task_instance_id
    ), updated AS (
      UPDATE shifohalqa.task_instances AS task SET status = ${status}
      FROM added
      WHERE task.workspace_id = added.workspace_id AND task.id = added.task_instance_id
    ), flagged AS (
      INSERT INTO shifohalqa.flags (workspace_id, evidence_log_id, color, rule_key, detail)
      SELECT workspace_id, id, ${color}::text, ${ruleKey}::text, ${JSON.stringify(detail)}::jsonb
      FROM added WHERE ${color}::text IS NOT NULL
    ), audited AS (
      INSERT INTO shifohalqa.audit_events (workspace_id, evidence_log_id, actor_id, action)
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
  if (actor.role !== 'doctor') return 'not_found';
  const sql = requireDatabase();
  const [row] = await sql`
    WITH scoped AS (
      SELECT flag.workspace_id, flag.id
      FROM shifohalqa.flags AS flag
      JOIN shifohalqa.evidence_logs AS evidence ON evidence.workspace_id = flag.workspace_id AND evidence.id = flag.evidence_log_id
      JOIN shifohalqa.task_instances AS task ON task.workspace_id = evidence.workspace_id AND task.id = evidence.task_instance_id
      JOIN shifohalqa.plan_items AS item ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
      JOIN shifohalqa.plans AS plan ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
      WHERE flag.workspace_id = ${actor.workspaceId} AND flag.id = ${input.flagId}
        AND plan.patient_id = ${actor.patientId} AND plan.doctor_id = ${actor.doctorId}
    ), reviewed AS (
      UPDATE shifohalqa.flags AS flag
      SET decision = ${input.decision}, patient_reply = ${input.reply},
          doctor_note = ${input.note}, reviewed_at = CURRENT_TIMESTAMP
      FROM scoped
      WHERE flag.workspace_id = scoped.workspace_id AND flag.id = scoped.id AND flag.decision IS NULL
      RETURNING flag.workspace_id, flag.evidence_log_id, flag.decision
    ), promoted AS (
      UPDATE shifohalqa.evidence_logs AS evidence SET level = 4
      FROM reviewed
      WHERE evidence.workspace_id = reviewed.workspace_id AND evidence.id = reviewed.evidence_log_id
        AND reviewed.decision = 'approved'
    ), audited AS (
      INSERT INTO shifohalqa.audit_events (workspace_id, evidence_log_id, actor_id, action, metadata)
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
