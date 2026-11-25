import { z } from 'zod';
import { medicationBoxLabelSchema } from './ai/medication-box';
import { isPatientSideRole, type ClinicalActor, type MutationResult } from './clinical-types';
import { getDatabase } from './db';
import { medicationBoxEvidenceSchema, type MedicationBoxEvidence } from './dorimos-contract';
import { deriveEvidenceLevel } from './rules/evidence-level';

const mutation = z.object({ result: z.enum(['saved', 'already_saved', 'not_found']) });

const dorimosTargetRowSchema = z.object({
  taskId: z.uuid(),
  planItemId: z.uuid(),
  drugName: z.string(),
  strength: z.number().positive().nullable(),
  strengthUnit: medicationBoxLabelSchema.shape.unit.catch('mg'),
  date: z.iso.date(),
});

export type DorimosMedicationTarget = z.infer<typeof dorimosTargetRowSchema>;

/**
 * Reads the exact selected medication `plan_item` bound to `taskId` (including `strength_unit`
 * with safe fallback to `'mg'`) for today's Asia/Tashkent scheduled date.
 */
export async function getDorimosMedicationTarget(
  actor: ClinicalActor,
  taskId: string,
): Promise<DorimosMedicationTarget | null> {
  if (!isPatientSideRole(actor.role) || !actor.patientId) return null;
  const sql = getDatabase();
  if (!sql) throw new Error('DoriMos database is unavailable');

  const [row] = await sql`
    SELECT task.id AS "taskId",
           item.id AS "planItemId",
           item.title AS "drugName",
           item.box_strength_mg::float8 AS strength,
           COALESCE(item.strength_unit, 'mg') AS "strengthUnit",
           to_char(task.scheduled_date, 'YYYY-MM-DD') AS date
    FROM public.task_instances AS task
    JOIN public.plan_items AS item
      ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
    JOIN public.plans AS plan
      ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
    WHERE task.workspace_id = ${actor.workspaceId}
      AND task.id = ${taskId}
      AND plan.patient_id = ${actor.patientId}
      AND plan.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
      AND item.type = 'medication'
      AND task.scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date
    LIMIT 1
  `;
  if (!row) return null;
  const parsed = dorimosTargetRowSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

export async function reserveDorimosScan(workspaceId: string): Promise<boolean> {
  const sql = getDatabase();
  if (!sql) return false;
  for (const [scope, limit] of [[z.uuid().parse(workspaceId), 10], ['global', 30]] as const) {
    const rows = await sql`
      INSERT INTO public.dorimos_scan_limits AS quota (scope, window_ends_at, scans)
      VALUES (${scope}, CURRENT_TIMESTAMP + interval '1 minute', 1)
      ON CONFLICT (scope) DO UPDATE SET
        window_ends_at = CASE WHEN quota.window_ends_at <= CURRENT_TIMESTAMP THEN EXCLUDED.window_ends_at ELSE quota.window_ends_at END,
        scans = CASE WHEN quota.window_ends_at <= CURRENT_TIMESTAMP THEN 1 ELSE quota.scans + 1 END
      WHERE quota.window_ends_at <= CURRENT_TIMESTAMP OR quota.scans < ${limit}
      RETURNING 1
    `;
    if (!rows.length) return false;
  }
  return true;
}

export async function saveDorimosEvidence(actor: ClinicalActor, taskId: string, input: MedicationBoxEvidence): Promise<MutationResult> {
  if (!isPatientSideRole(actor.role) || !actor.patientId) return 'not_found';
  const sql = getDatabase();
  if (!sql) throw new Error('DoriMos database is unavailable');

  const payload = medicationBoxEvidenceSchema.parse(input);
  const isSelfReport = payload.result === 'manual' || payload.result === 'deferred';
  const provenance = isSelfReport
    ? { source: 'self_report', ai_mode: 'manual' } as const
    : { source: 'photo_ocr', ai_mode: 'live', patient_confirmed: true,
      measurement: { status: 'verified', confidence: payload.reading.confidence } } as const;
  const level = deriveEvidenceLevel(provenance);
  if (level.status !== 'accepted') return 'not_found';
  const mismatch = !isSelfReport && payload.result !== 'match';

  const [row] = await sql`
    WITH scoped AS (
      SELECT task.workspace_id, task.id
      FROM public.task_instances AS task
      JOIN public.plan_items AS item ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
      JOIN public.plans AS plan ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
      WHERE task.workspace_id = ${actor.workspaceId} AND task.id = ${taskId}
        AND plan.patient_id = ${actor.patientId} AND plan.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
        AND item.type = 'medication' AND task.scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date
        AND (${isSelfReport} OR (
          item.title = ${'expected' in payload ? payload.expected.drugName : null}
          AND item.box_strength_mg = ${'expected' in payload ? payload.expected.strength : null}::numeric
          AND COALESCE(item.strength_unit, 'mg') = ${'expected' in payload ? payload.expected.unit : null}
        ))
    ), added AS (
      INSERT INTO public.evidence_logs (workspace_id, task_instance_id, entry_kind, level, source, ai_mode, payload)
      SELECT workspace_id, id, 'medication_box', ${level.level}, ${provenance.source}, ${provenance.ai_mode}, ${sql.json(payload)}::jsonb
      FROM scoped
      ON CONFLICT (workspace_id, task_instance_id, entry_kind) DO UPDATE SET
        level = EXCLUDED.level,
        source = EXCLUDED.source,
        ai_mode = EXCLUDED.ai_mode,
        payload = EXCLUDED.payload,
        created_at = CURRENT_TIMESTAMP
      WHERE public.evidence_logs.payload->>'result' = 'deferred'
        AND public.evidence_logs.level = 0
        AND NOT ${isSelfReport}
      RETURNING workspace_id, id
    ), flagged AS (
      INSERT INTO public.flags (workspace_id, evidence_log_id, color, rule_key, detail)
      SELECT workspace_id, id, 'red', 'medication_box_mismatch', '{}'::jsonb FROM added WHERE ${mismatch}
      ON CONFLICT (workspace_id, evidence_log_id) DO NOTHING
    ), audited AS (
      INSERT INTO public.audit_events (workspace_id, evidence_log_id, actor_id, action)
      SELECT workspace_id, id, ${actor.patientId}::uuid, 'record_evidence' FROM added
      ON CONFLICT (workspace_id, evidence_log_id, action) DO NOTHING
    )
    SELECT CASE WHEN EXISTS (SELECT 1 FROM added) THEN 'saved'
                WHEN EXISTS (SELECT 1 FROM scoped) THEN 'already_saved' ELSE 'not_found' END AS result
  `;
  return mutation.parse(row).result;
}
