import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { isPatientSideRole, type ClinicalActor } from './clinical-types';
import { getDatabase } from './db';
import { isDemoEnabled } from './demo-session';

function digest(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

function database() {
  const sql = getDatabase();
  if (!sql) throw new Error('Telegram database is unavailable');
  return sql;
}

const linkRow = z.object({
  workspaceId: z.uuid(),
  patientId: z.uuid(),
  doctorId: z.uuid().nullable(),
  patientName: z.string(),
  roleKind: z.enum(['patient', 'individual']),
  linkId: z.uuid(),
  connectedAt: z.number(),
  isDemo: z.boolean(),
  detailsEnabled: z.boolean(),
});

export async function getTelegramPatientLink(chatId: number, linkId: string | null = null) {
  const sql = database();
  const [row] = await sql`
    SELECT link.workspace_id AS "workspaceId", link.patient_id AS "patientId",
           patient.doctor_id AS "doctorId", patient.name AS "patientName",
           patient.role_kind AS "roleKind", link.link_id AS "linkId",
           floor(extract(epoch from link.connected_at))::double precision AS "connectedAt",
           workspace.is_demo AS "isDemo", link.details_enabled AS "detailsEnabled"
    FROM public.telegram_patient_links AS link
    JOIN public.patients AS patient ON patient.workspace_id = link.workspace_id AND patient.id = link.patient_id
    JOIN public.workspaces AS workspace ON workspace.id = link.workspace_id
    WHERE link.chat_id = ${chatId}
      AND (${linkId}::uuid IS NULL OR link.link_id = ${linkId}::uuid)
  `;
  if (!row) return null;
  const data = linkRow.parse(row);
  if (data.isDemo && !isDemoEnabled()) return null;
  const actor: ClinicalActor = {
    workspaceId: data.workspaceId, patientId: data.patientId,
    doctorId: data.doctorId, role: data.roleKind, isDemo: data.isDemo,
  };
  return {
    actor, chatId, linkId: data.linkId, connectedAt: data.connectedAt,
    patientName: data.patientName, detailsEnabled: data.detailsEnabled,
  };
}

export type TelegramPatientLink = NonNullable<Awaited<ReturnType<typeof getTelegramPatientLink>>>;

export async function setTelegramPatientDetails(link: TelegramPatientLink, enabled: boolean) {
  const sql = database();
  const [row] = await sql`
    UPDATE public.telegram_patient_links SET details_enabled = ${enabled}
    WHERE workspace_id = ${link.actor.workspaceId} AND patient_id = ${link.actor.patientId}
      AND chat_id = ${link.chatId} AND link_id = ${link.linkId}
    RETURNING 1
  `;
  return Boolean(row);
}

export const telegramNoticeKind = z.enum(['doctor_reply', 'exercise_reply', 'brief_reply']);
export type TelegramNoticeKind = z.infer<typeof telegramNoticeKind>;

export async function readTelegramNoticeReply(link: TelegramPatientLink, kind: TelegramNoticeKind, id: string) {
  const [row] = await database()`
    SELECT CASE notice.kind
      WHEN 'doctor_reply' THEN (
        SELECT flag.patient_reply FROM public.flags AS flag
        WHERE flag.workspace_id = notice.workspace_id AND flag.id = notice.ref_id AND flag.decision IS NOT NULL
      ) WHEN 'exercise_reply' THEN (
        SELECT attempt.review_reply FROM public.exercise_attempts AS attempt
        WHERE attempt.workspace_id = notice.workspace_id AND attempt.id = notice.ref_id AND attempt.review_decision IS NOT NULL
      ) WHEN 'brief_reply' THEN (
        SELECT brief.approved_reply_uz FROM public.ai_clinical_briefs AS brief
        WHERE brief.workspace_id = notice.workspace_id AND brief.patient_id = notice.patient_id
          AND brief.id = notice.ref_id AND brief.level = 4 AND brief.approved_at IS NOT NULL
      ) END AS body
    FROM public.telegram_patient_notices AS notice
    WHERE notice.workspace_id = ${link.actor.workspaceId} AND notice.patient_id = ${link.actor.patientId}
      AND notice.link_id = ${link.linkId} AND notice.kind = ${kind} AND notice.ref_id = ${id}
  `;
  return typeof row?.body === 'string' && row.body ? { id, kind, body: row.body } : null;
}

export async function getDoctorTelegramStatus(actor: ClinicalActor): Promise<boolean> {
  if (actor.role !== 'doctor' || !actor.doctorId) return false;
  const sql = database();
  const rows = await sql`
    SELECT 1 FROM public.telegram_doctor_links
    WHERE workspace_id = ${actor.workspaceId} AND doctor_id = ${actor.doctorId}
  `;
  return rows.length > 0;
}

export async function getPatientTelegramStatus(actor: ClinicalActor): Promise<boolean> {
  if (!isPatientSideRole(actor.role) || !actor.patientId) return false;
  const sql = database();
  const rows = await sql`
    SELECT 1 FROM public.telegram_patient_links
    WHERE workspace_id = ${actor.workspaceId} AND patient_id = ${actor.patientId}
  `;
  return rows.length > 0;
}

export async function createTelegramPairing(actor: ClinicalActor): Promise<string | null> {
  if (actor.role === 'doctor') {
    if (!actor.doctorId) return null;
    const sql = database();
    const code = randomBytes(32).toString('base64url');
    const rows = await sql`
      INSERT INTO public.telegram_pairings AS pairing (workspace_id, doctor_id, code_hash, expires_at)
      SELECT doctor.workspace_id, doctor.id, ${digest(code)}, CURRENT_TIMESTAMP + interval '10 minutes'
      FROM public.doctors AS doctor
      WHERE doctor.workspace_id = ${actor.workspaceId} AND doctor.id = ${actor.doctorId}
        AND NOT EXISTS (
          SELECT 1 FROM public.telegram_doctor_links AS link
          WHERE link.workspace_id = doctor.workspace_id AND link.doctor_id = doctor.id
        )
      ON CONFLICT (workspace_id, doctor_id) DO UPDATE
      SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, redeemed_at = NULL
      RETURNING 1
    `;
    return rows.length ? code : null;
  }

  if (!isPatientSideRole(actor.role) || !actor.patientId) return null;
  const sql = database();
  const code = randomBytes(32).toString('base64url');
  const rows = await sql`
    INSERT INTO public.telegram_patient_pairings AS pairing (workspace_id, patient_id, code_hash, expires_at)
    SELECT patient.workspace_id, patient.id, ${digest(code)}, CURRENT_TIMESTAMP + interval '10 minutes'
    FROM public.patients AS patient
    WHERE patient.workspace_id = ${actor.workspaceId} AND patient.id = ${actor.patientId}
      AND NOT EXISTS (
        SELECT 1 FROM public.telegram_patient_links AS link
        WHERE link.workspace_id = patient.workspace_id AND link.patient_id = patient.id
      )
    ON CONFLICT (workspace_id, patient_id) DO UPDATE
    SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, redeemed_at = NULL
    RETURNING 1
  `;
  return rows.length ? code : null;
}

export async function disconnectDoctorTelegram(actor: ClinicalActor): Promise<void> {
  if (actor.role !== 'doctor' || !actor.doctorId) return;
  const sql = database();
  await sql.transaction((tx) => [
    tx`DELETE FROM public.telegram_pairings WHERE workspace_id = ${actor.workspaceId} AND doctor_id = ${actor.doctorId}`,
    tx`DELETE FROM public.telegram_doctor_links WHERE workspace_id = ${actor.workspaceId} AND doctor_id = ${actor.doctorId}`,
  ]);
}

export async function disconnectPatientTelegram(actor: ClinicalActor): Promise<void> {
  if (!isPatientSideRole(actor.role) || !actor.patientId) return;
  const sql = database();
  await sql.transaction((tx) => [
    tx`DELETE FROM public.telegram_patient_pairings WHERE workspace_id = ${actor.workspaceId} AND patient_id = ${actor.patientId}`,
    tx`DELETE FROM public.telegram_patient_links WHERE workspace_id = ${actor.workspaceId} AND patient_id = ${actor.patientId}`,
  ]);
}
