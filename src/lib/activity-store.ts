import { z } from 'zod';
import {
  buildSevenDayStepTrend,
  calculateAdherence,
  calculateMedicationAdherence,
  defaultDailyStepGoal,
  dueAdherenceUnitSchema,
  pickPreferredStepReading,
  stepCountSchema,
  stepEntrySchema,
  stepSourceSchema,
  type DailyStepReading,
  type DailyStepsBySource,
  type DailyStepTrendPoint,
  type DueMedicationAdherenceUnit,
  type MedicationAdherenceBreakdown,
  type StepEntry,
  type StepSource,
} from './adherence';
import { isPatientSideRole, type ClinicalActor, type MutationResult } from './clinical-types';
import { getDatabase } from './db';

const strengthUnitSchema = z.enum(['mg', 'mcg', 'g', 'iu']);

const dueUnitRow = dueAdherenceUnitSchema.extend({
  title: z.string(),
  dueTime: z.string(),
  type: z.enum(['medication', 'vitals']).optional(),
  strength: z.number().positive().nullable().optional(),
  strengthUnit: strengthUnitSchema.optional(),
  sortOrder: z.number().int().optional(),
});

const legacyStepsRow = z.object({
  count: stepCountSchema,
  level: z.literal(0),
  source: stepSourceSchema,
  aiMode: z.literal('manual'),
  updatedAt: z.iso.datetime(),
});

const activityRow = z.object({
  today: z.iso.date(),
  isDemo: z.boolean().optional(),
  dailyStepGoal: z.number().int().min(100).max(50000).nullable().optional(),
  units: z.array(dueUnitRow),
  steps: legacyStepsRow.nullable().optional(),
  stepEntries: z.array(stepEntrySchema).optional(),
});

const mutationRow = z.object({ result: z.enum(['saved', 'already_saved', 'not_found']) });

export type ActivityDashboard = {
  localDate: string;
  dailyStepGoal: number;
  adherence: ReturnType<typeof calculateAdherence>;
  steps: DailyStepReading | null;
  dueUnits: DueMedicationAdherenceUnit[];
  stepTrend?: DailyStepTrendPoint[];
  todayStepsBySource?: DailyStepsBySource;
  medicationAdherence?: MedicationAdherenceBreakdown[];
};

export async function getActivityDashboard(actor: ClinicalActor): Promise<ActivityDashboard | null> {
  if (actor.role === 'caregiver' || (actor.role === 'doctor' && !actor.doctorId) || !actor.patientId) return null;
  const sql = getDatabase();
  if (!sql) return null;

  const [row] = await sql`
    WITH clock AS (SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent' AS local_now),
    scoped AS (
      SELECT p.workspace_id, p.id, p.doctor_id, w.is_demo
      FROM public.patients AS p
      JOIN public.workspaces AS w ON w.id = p.workspace_id
      WHERE p.workspace_id = ${actor.workspaceId} AND p.id = ${actor.patientId}
        AND p.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
    ), due AS (
      SELECT item.id AS "planItemId", item.type, item.title, left(item.due_time::text, 5) AS "dueTime",
             item.box_strength_mg::float8 AS strength, item.strength_unit AS "strengthUnit",
             item.sort_order AS "sortOrder",
             to_char(days.calendar_date, 'YYYY-MM-DD') AS "scheduledDate", task.status
      FROM scoped
      JOIN public.plans AS plan ON plan.workspace_id = scoped.workspace_id AND plan.patient_id = scoped.id
        AND plan.doctor_id IS NOT DISTINCT FROM scoped.doctor_id
      JOIN public.plan_items AS item ON item.workspace_id = plan.workspace_id AND item.plan_id = plan.id
      CROSS JOIN clock
      CROSS JOIN LATERAL (
        SELECT clock.local_now::date - day_number AS calendar_date
        FROM generate_series(0, 6) AS day_number
      ) AS days
      LEFT JOIN public.task_instances AS task ON task.workspace_id = item.workspace_id
        AND task.plan_item_id = item.id AND task.scheduled_date = days.calendar_date
      WHERE item.type IN ('medication', 'vitals') AND days.calendar_date >= plan.start_date
        AND days.calendar_date + item.due_time <= clock.local_now
    ), step_rows AS (
      SELECT to_char(activity.activity_date, 'YYYY-MM-DD') AS date,
             activity.step_count AS count,
             activity.level,
             activity.source,
             activity.ai_mode AS "aiMode",
             to_char(activity.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
      FROM scoped
      CROSS JOIN clock
      JOIN public.daily_step_counts AS activity
        ON activity.workspace_id = scoped.workspace_id
        AND activity.patient_id = scoped.id
        AND activity.activity_date BETWEEN clock.local_now::date - 6 AND clock.local_now::date
      WHERE activity.source <> 'demo_sim' OR scoped.is_demo = true
    )
    SELECT to_char(clock.local_now, 'YYYY-MM-DD') AS today,
           scoped.is_demo AS "isDemo",
           plan.daily_step_goal AS "dailyStepGoal",
           COALESCE((SELECT jsonb_agg(due ORDER BY "scheduledDate" DESC, "dueTime", "sortOrder", title) FROM due), '[]'::jsonb) AS units,
           COALESCE((SELECT jsonb_agg(step_rows ORDER BY date ASC, source ASC) FROM step_rows), '[]'::jsonb) AS "stepEntries"
    FROM scoped CROSS JOIN clock
    LEFT JOIN public.plans AS plan ON plan.workspace_id = scoped.workspace_id AND plan.patient_id = scoped.id
      AND plan.doctor_id IS NOT DISTINCT FROM scoped.doctor_id
  `;

  if (!row) return null;
  const parsed = activityRow.parse(row);
  const { today, dailyStepGoal, units } = parsed;
  const isDemo = parsed.isDemo ?? actor.isDemo === true;

  const entries: StepEntry[] = parsed.stepEntries !== undefined
    ? parsed.stepEntries
    : parsed.steps
      ? [{ date: today, ...parsed.steps }]
      : [];

  const stepTrend = buildSevenDayStepTrend(entries, today, { isDemo });
  const todayPoint = stepTrend[stepTrend.length - 1];
  const todayStepsBySource: DailyStepsBySource = todayPoint
    ? {
        deviceSensor: todayPoint.deviceSensor,
        selfReport: todayPoint.selfReport,
        demoSim: todayPoint.demoSim,
      }
    : { deviceSensor: null, selfReport: null, demoSim: null };

  const preferredSteps = pickPreferredStepReading(todayStepsBySource, isDemo);

  return {
    localDate: today,
    dailyStepGoal: dailyStepGoal ?? defaultDailyStepGoal,
    adherence: calculateAdherence(units, today),
    steps: preferredSteps,
    dueUnits: units,
    stepTrend,
    todayStepsBySource,
    medicationAdherence: calculateMedicationAdherence(units, today),
  };
}

export async function saveStepCount(
  actor: ClinicalActor,
  input: number | { count: number; source?: StepSource },
): Promise<MutationResult> {
  if (!isPatientSideRole(actor.role) || !actor.patientId) return 'not_found';
  const count = stepCountSchema.parse(typeof input === 'number' ? input : input.count);
  const source = stepSourceSchema.parse(typeof input === 'number' ? 'self_report' : (input.source ?? 'self_report'));
  if (source === 'demo_sim' && actor.isDemo !== true) return 'not_found';
  const sql = getDatabase();
  if (!sql) throw new Error('Activity database is unavailable');

  const [row] = await sql`
    WITH scoped AS (
      SELECT p.workspace_id, p.id
      FROM public.patients AS p
      JOIN public.workspaces AS w ON w.id = p.workspace_id
      WHERE p.workspace_id = ${actor.workspaceId} AND p.id = ${actor.patientId}
        AND p.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
        AND (${source} <> 'demo_sim' OR w.is_demo = true)
    ), saved AS (
      INSERT INTO public.daily_step_counts AS activity (workspace_id, patient_id, activity_date, step_count, source)
      SELECT workspace_id, id, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date, ${count}, ${source}
      FROM scoped
      ON CONFLICT (workspace_id, patient_id, activity_date, source) DO UPDATE
      SET step_count = EXCLUDED.step_count, updated_at = CURRENT_TIMESTAMP
      WHERE activity.step_count IS DISTINCT FROM EXCLUDED.step_count
      RETURNING 1
    )
    SELECT CASE
      WHEN EXISTS (SELECT 1 FROM saved) THEN 'saved'
      WHEN EXISTS (SELECT 1 FROM scoped) THEN 'already_saved'
      ELSE 'not_found'
    END AS result
  `;
  return mutationRow.parse(row).result;
}
