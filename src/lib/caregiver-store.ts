import { z } from 'zod';
import { calculateAdherence, dueAdherenceUnitSchema } from './adherence';
import { createCaregiverToken, digestCaregiverToken } from './caregiver';
import type { ClinicalActor } from './clinical-types';
import { getDatabase } from './db';
import { isDemoEnabled } from './demo-session';

const expiresRow = z.object({ expires_at: z.iso.datetime() });
const summaryRow = z.object({
  local_date: z.iso.date(),
  observed_at: z.iso.datetime(),
  due: z.array(dueAdherenceUnitSchema),
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
    )
    SELECT to_char(clock.local_now, 'YYYY-MM-DD') AS local_date,
           to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS observed_at,
           COALESCE((SELECT jsonb_agg(due) FROM due), '[]'::jsonb) AS due
    FROM audited CROSS JOIN clock
  `;

  if (!row) return null;
  const { local_date, observed_at, due } = summaryRow.parse(row);
  return { observedAt: observed_at, counts: calculateAdherence(due, local_date).today };
}
