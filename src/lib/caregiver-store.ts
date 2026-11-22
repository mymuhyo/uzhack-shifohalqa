import { z } from 'zod';
import { calculateAdherence, dueAdherenceUnitSchema } from './adherence';
import { createCaregiverToken, digestCaregiverToken } from './caregiver';
import type { ClinicalActor } from './clinical-types';
import { getDatabase } from './db';
import { isDemoEnabled } from './demo-session';

const expiresRow = z.object({ expires_at: z.iso.datetime() });
export type CaregiverStatusSignal = 'supply_help' | 'doctor_reviewing' | 'doctor_replied' | 'all_good' | 'waiting';
const summaryRow = z.object({
  local_date: z.iso.date(),
  observed_at: z.iso.datetime(),
  due: z.array(dueAdherenceUnitSchema),
  supply_needed: z.boolean(),
  open_reviews: z.boolean(),
  reviewed_today: z.boolean(),
  ack_kind: z.enum(['supply_on_the_way', 'checked_in']).nullable(),
  ack_at: z.iso.datetime().nullable(),
});

export async function getCaregiverSharing(actor: ClinicalActor) {
  const sql = getDatabase();
  if (!sql || actor.role !== 'patient') return null;

  const [row] = await sql`
    SELECT to_char(link.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS expires_at
    FROM shifohalqa.caregiver_links AS link
    JOIN shifohalqa.patients AS patient ON patient.workspace_id = link.workspace_id
      AND patient.id = link.patient_id
    WHERE link.workspace_id = ${actor.workspaceId} AND link.patient_id = ${actor.patientId}
      AND patient.doctor_id = ${actor.doctorId}
      AND link.revoked_at IS NULL AND link.expires_at > CURRENT_TIMESTAMP
  `;

  return row ? expiresRow.parse(row).expires_at : null;
}

export async function changeCaregiverSharing(actor: ClinicalActor, action: 'enable' | 'disable') {
  const sql = getDatabase();
  if (!sql || actor.role !== 'patient') return null;
  const token = action === 'enable' ? createCaregiverToken() : null;
  const tokenHash = digestCaregiverToken(token);

  const [patients, changed] = await sql.transaction((tx) => {
    const lock = tx`
      SELECT id FROM shifohalqa.patients
      WHERE workspace_id = ${actor.workspaceId} AND id = ${actor.patientId} AND doctor_id = ${actor.doctorId}
      FOR NO KEY UPDATE
    `;
    if (action === 'disable') {
      return [lock, tx`
        WITH disabled AS (
          UPDATE shifohalqa.caregiver_links AS link SET revoked_at = clock_timestamp()
          FROM shifohalqa.patients AS patient
          WHERE link.workspace_id = ${actor.workspaceId} AND link.patient_id = ${actor.patientId}
            AND patient.workspace_id = link.workspace_id AND patient.id = link.patient_id
            AND patient.doctor_id = ${actor.doctorId} AND link.revoked_at IS NULL
          RETURNING link.workspace_id, link.patient_id
        )
        INSERT INTO shifohalqa.caregiver_audit_events (workspace_id, patient_id, action)
        SELECT workspace_id, patient_id, 'share_disabled' FROM disabled
      `];
    }

    return [lock, tx`
      WITH enabled AS (
        INSERT INTO shifohalqa.caregiver_links AS link (workspace_id, patient_id, token_hash, expires_at)
        SELECT workspace_id, id, ${tokenHash}, clock_timestamp() + INTERVAL '24 hours'
        FROM shifohalqa.patients
        WHERE workspace_id = ${actor.workspaceId} AND id = ${actor.patientId} AND doctor_id = ${actor.doctorId}
        ON CONFLICT (workspace_id, patient_id) DO UPDATE SET
          token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at, revoked_at = NULL
        RETURNING workspace_id, patient_id, expires_at
      ), audited AS (
        INSERT INTO shifohalqa.caregiver_audit_events (workspace_id, patient_id, action)
        SELECT workspace_id, patient_id, 'share_enabled' FROM enabled
        RETURNING 1
      )
      SELECT to_char(enabled.expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS expires_at
      FROM enabled CROSS JOIN audited
    `];
  });

  if (!patients.length) return null;
  if (!token) return { path: null, expiresAt: null };
  return { path: `/caregiver/${token}`, expiresAt: expiresRow.parse(changed[0]).expires_at };
}

export async function readCaregiverSummary(token: unknown) {
  const tokenHash = digestCaregiverToken(token);
  if (!tokenHash || !isDemoEnabled()) return null;
  const sql = getDatabase();
  if (!sql) return null;

  const [row] = await sql`
    WITH active AS (
      SELECT workspace_id, patient_id
      FROM shifohalqa.caregiver_links
      WHERE token_hash = ${tokenHash} AND revoked_at IS NULL AND expires_at > clock_timestamp()
      FOR SHARE
    ), audited AS (
      INSERT INTO shifohalqa.caregiver_audit_events (workspace_id, patient_id, action)
      SELECT workspace_id, patient_id, 'summary_viewed' FROM active
      RETURNING workspace_id, patient_id
    ), clock AS (
      SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent' AS local_now
    ), due AS (
      SELECT item.id AS "planItemId", to_char(clock.local_now, 'YYYY-MM-DD') AS "scheduledDate", task.status
      FROM audited
      JOIN shifohalqa.plans AS plan ON plan.workspace_id = audited.workspace_id AND plan.patient_id = audited.patient_id
      JOIN shifohalqa.plan_items AS item ON item.workspace_id = plan.workspace_id AND item.plan_id = plan.id
      CROSS JOIN clock
      LEFT JOIN shifohalqa.task_instances AS task ON task.workspace_id = item.workspace_id
        AND task.plan_item_id = item.id AND task.scheduled_date = clock.local_now::date
      WHERE item.type IN ('medication', 'vitals') AND clock.local_now::date >= plan.start_date
        AND clock.local_now::date + item.due_time <= clock.local_now
    ), today_flags AS (
      SELECT flag.id, flag.decision
      FROM audited
      JOIN shifohalqa.plans AS plan ON plan.workspace_id = audited.workspace_id AND plan.patient_id = audited.patient_id
      JOIN shifohalqa.plan_items AS item ON item.workspace_id = plan.workspace_id AND item.plan_id = plan.id
      JOIN shifohalqa.task_instances AS task ON task.workspace_id = item.workspace_id AND task.plan_item_id = item.id
      JOIN shifohalqa.evidence_logs AS evidence ON evidence.workspace_id = task.workspace_id AND evidence.task_instance_id = task.id
      JOIN shifohalqa.flags AS flag ON flag.workspace_id = evidence.workspace_id AND flag.evidence_log_id = evidence.id
      CROSS JOIN clock
      WHERE task.scheduled_date = clock.local_now::date
    ), supply_reports AS (
      SELECT 1
      FROM audited
      JOIN shifohalqa.plans AS plan ON plan.workspace_id = audited.workspace_id AND plan.patient_id = audited.patient_id
      JOIN shifohalqa.plan_items AS item ON item.workspace_id = plan.workspace_id AND item.plan_id = plan.id
      JOIN shifohalqa.task_instances AS task ON task.workspace_id = item.workspace_id AND task.plan_item_id = item.id
      JOIN shifohalqa.evidence_logs AS evidence ON evidence.workspace_id = task.workspace_id AND evidence.task_instance_id = task.id
      LEFT JOIN shifohalqa.flags AS flag ON flag.workspace_id = evidence.workspace_id AND flag.evidence_log_id = evidence.id
      CROSS JOIN clock
      WHERE task.scheduled_date = clock.local_now::date
        AND evidence.entry_kind = 'task'
        AND evidence.payload->>'kind' = 'medication'
        AND evidence.payload->>'reason' = 'out_of_supply'
        AND NOT EXISTS (
          SELECT 1 FROM shifohalqa.flag_followups AS followup
          WHERE followup.workspace_id = flag.workspace_id AND followup.flag_id = flag.id
            AND followup.kind = 'supply_resolved'
        )
    ), today_symptoms AS (
      SELECT symptom.review_decision
      FROM audited
      JOIN shifohalqa.urgent_symptoms AS symptom ON symptom.workspace_id = audited.workspace_id AND symptom.patient_id = audited.patient_id
      CROSS JOIN clock
      WHERE (symptom.created_at AT TIME ZONE 'Asia/Tashkent')::date = clock.local_now::date
    ), today_ack AS (
      SELECT ack.kind,
             to_char(ack.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
      FROM audited
      JOIN shifohalqa.caregiver_acks AS ack ON ack.workspace_id = audited.workspace_id AND ack.patient_id = audited.patient_id
      CROSS JOIN clock
      WHERE ack.activity_date = clock.local_now::date
    )
    SELECT to_char(clock.local_now, 'YYYY-MM-DD') AS local_date,
           to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS observed_at,
           COALESCE((SELECT jsonb_agg(due) FROM due), '[]'::jsonb) AS due,
           EXISTS (SELECT 1 FROM supply_reports) AS supply_needed,
           (EXISTS (SELECT 1 FROM today_flags WHERE decision IS NULL)
             OR EXISTS (SELECT 1 FROM today_symptoms WHERE review_decision IS NULL)) AS open_reviews,
           (EXISTS (SELECT 1 FROM today_flags WHERE decision IS NOT NULL)
             OR EXISTS (SELECT 1 FROM today_symptoms WHERE review_decision IS NOT NULL)) AS reviewed_today,
           (SELECT kind FROM today_ack LIMIT 1) AS ack_kind,
           (SELECT created_at FROM today_ack LIMIT 1) AS ack_at
    FROM audited CROSS JOIN clock
  `;

  if (!row) return null;
  const parsed = summaryRow.parse(row);
  const counts = calculateAdherence(parsed.due, parsed.local_date).today;
  let statusSignal: CaregiverStatusSignal = 'waiting';
  if (parsed.supply_needed) statusSignal = 'supply_help';
  else if (parsed.open_reviews) statusSignal = 'doctor_reviewing';
  else if (parsed.reviewed_today) statusSignal = 'doctor_replied';
  else if (counts.scheduled > 0 && counts.completed === counts.scheduled) statusSignal = 'all_good';

  return {
    observedAt: parsed.observed_at,
    counts,
    statusSignal,
    caregiverAck: parsed.ack_kind && parsed.ack_at ? { kind: parsed.ack_kind, createdAt: parsed.ack_at } : null,
  };
}

export async function acknowledgeCaregiverHelp(
  token: unknown,
  kind: 'supply_on_the_way' | 'checked_in',
): Promise<{ status: 'saved'; kind: 'supply_on_the_way' | 'checked_in'; createdAt: string } | null> {
  const tokenHash = digestCaregiverToken(token);
  if (!tokenHash || !isDemoEnabled()) return null;
  const sql = getDatabase();
  if (!sql) return null;

  const [row] = await sql`
    WITH active AS (
      SELECT workspace_id, patient_id
      FROM shifohalqa.caregiver_links
      WHERE token_hash = ${tokenHash} AND revoked_at IS NULL AND expires_at > clock_timestamp()
    ), saved AS (
      INSERT INTO shifohalqa.caregiver_acks (workspace_id, patient_id, activity_date, kind)
      SELECT workspace_id, patient_id, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date, ${kind}
      FROM active
      ON CONFLICT (workspace_id, patient_id, activity_date) DO UPDATE SET
        kind = EXCLUDED.kind,
        created_at = CURRENT_TIMESTAMP
      RETURNING kind, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
    )
    SELECT kind, "createdAt" FROM saved
  `;

  if (!row) return null;
  const parsed = z.object({ kind: z.enum(['supply_on_the_way', 'checked_in']), createdAt: z.iso.datetime() }).parse(row);
  return { status: 'saved', ...parsed };
}
