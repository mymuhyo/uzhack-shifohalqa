import { z } from 'zod';
import { calculateAdherence, dueAdherenceUnitSchema, stepCountSchema } from './adherence';
import type { ClinicalActor, MutationResult } from './clinical-types';
import { getDatabase } from './db';

const activityRow = z.object({
  today: z.iso.date(),
  units: z.array(dueAdherenceUnitSchema.extend({ title: z.string(), dueTime: z.string() })),
  steps: z.object({
    count: stepCountSchema,
    level: z.literal(0),
    source: z.literal('self_report'),
    aiMode: z.literal('manual'),
    updatedAt: z.iso.datetime(),
  }).nullable(),
});

const mutationRow = z.object({ result: z.enum(['saved', 'already_saved', 'not_found']) });

export async function getActivityDashboard(actor: ClinicalActor) {
  const sql = getDatabase();
  if (!sql) return null;

  const [row] = await sql`
    WITH clock AS (SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent' AS local_now),
    scoped AS (
      SELECT workspace_id, id, doctor_id FROM shifohalqa.patients
      WHERE workspace_id = ${actor.workspaceId} AND id = ${actor.patientId} AND doctor_id = ${actor.doctorId}
    ), due AS (
      SELECT item.id AS "planItemId", item.title, left(item.due_time::text, 5) AS "dueTime",
             to_char(days.calendar_date, 'YYYY-MM-DD') AS "scheduledDate", task.status
      FROM scoped
      JOIN shifohalqa.plans AS plan ON plan.workspace_id = scoped.workspace_id AND plan.patient_id = scoped.id
        AND plan.doctor_id = scoped.doctor_id
      JOIN shifohalqa.plan_items AS item ON item.workspace_id = plan.workspace_id AND item.plan_id = plan.id
      CROSS JOIN clock
      CROSS JOIN LATERAL (
        SELECT clock.local_now::date - day_number AS calendar_date
        FROM generate_series(0, 6) AS day_number
      ) AS days
      LEFT JOIN shifohalqa.task_instances AS task ON task.workspace_id = item.workspace_id
        AND task.plan_item_id = item.id AND task.scheduled_date = days.calendar_date
      WHERE item.type IN ('medication', 'vitals') AND days.calendar_date >= plan.start_date
        AND days.calendar_date + item.due_time <= clock.local_now
    )
    SELECT to_char(clock.local_now, 'YYYY-MM-DD') AS today,
           COALESCE((SELECT jsonb_agg(due ORDER BY "scheduledDate" DESC, "dueTime", title) FROM due), '[]'::jsonb) AS units,
           CASE WHEN activity.step_count IS NOT NULL THEN jsonb_build_object(
             'count', activity.step_count, 'level', activity.level, 'source', activity.source,
             'aiMode', activity.ai_mode, 'updatedAt',
             to_char(activity.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           ) END AS steps
    FROM scoped CROSS JOIN clock
    LEFT JOIN shifohalqa.daily_step_counts AS activity ON activity.workspace_id = scoped.workspace_id
      AND activity.patient_id = scoped.id AND activity.activity_date = clock.local_now::date
  `;

  if (!row) return null;
  const { today, units, steps } = activityRow.parse(row);
  return { localDate: today, adherence: calculateAdherence(units, today), steps, dueUnits: units };
}

export async function saveStepCount(actor: ClinicalActor, input: z.infer<typeof stepCountSchema>): Promise<MutationResult> {
  if (actor.role !== 'patient') return 'not_found';
  const sql = getDatabase();
  if (!sql) throw new Error('Activity database is unavailable');
  const count = stepCountSchema.parse(input);

  const [row] = await sql`
    WITH scoped AS (
      SELECT workspace_id, id FROM shifohalqa.patients
      WHERE workspace_id = ${actor.workspaceId} AND id = ${actor.patientId} AND doctor_id = ${actor.doctorId}
    ), saved AS (
      INSERT INTO shifohalqa.daily_step_counts AS activity (workspace_id, patient_id, activity_date, step_count)
      SELECT workspace_id, id, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date, ${count}
      FROM scoped
      ON CONFLICT (workspace_id, patient_id, activity_date) DO UPDATE
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
