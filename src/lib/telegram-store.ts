import { createHash, randomBytes } from 'node:crypto';
import type { ClinicalActor } from './clinical-types';
import { getDatabase } from './db';

function digest(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

function database() {
  const sql = getDatabase();
  if (!sql) throw new Error('Telegram database is unavailable');
  return sql;
}

export async function getDoctorTelegramStatus(actor: ClinicalActor): Promise<boolean> {
  if (actor.role !== 'doctor') return false;
  const sql = database();
  const rows = await sql`
    SELECT 1 FROM public.telegram_doctor_links
    WHERE workspace_id = ${actor.workspaceId} AND doctor_id = ${actor.doctorId}
  `;
  return rows.length > 0;
}

export async function getPatientTelegramStatus(actor: ClinicalActor): Promise<boolean> {
  if (actor.role !== 'patient') return false;
  const sql = database();
  const rows = await sql`
    SELECT 1 FROM public.telegram_patient_links
    WHERE workspace_id = ${actor.workspaceId} AND patient_id = ${actor.patientId}
  `;
  return rows.length > 0;
}

export async function createTelegramPairing(actor: ClinicalActor): Promise<string | null> {
  const sql = database();
  const code = randomBytes(32).toString('base64url');
  if (actor.role === 'doctor') {
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
  if (actor.role !== 'doctor') return;
  const sql = database();
  await sql.transaction((tx) => [
    tx`DELETE FROM public.telegram_pairings WHERE workspace_id = ${actor.workspaceId} AND doctor_id = ${actor.doctorId}`,
    tx`DELETE FROM public.telegram_doctor_links WHERE workspace_id = ${actor.workspaceId} AND doctor_id = ${actor.doctorId}`,
  ]);
}

export async function disconnectPatientTelegram(actor: ClinicalActor): Promise<void> {
  if (actor.role !== 'patient') return;
  const sql = database();
  await sql.transaction((tx) => [
    tx`DELETE FROM public.telegram_patient_pairings WHERE workspace_id = ${actor.workspaceId} AND patient_id = ${actor.patientId}`,
    tx`DELETE FROM public.telegram_patient_links WHERE workspace_id = ${actor.workspaceId} AND patient_id = ${actor.patientId}`,
  ]);
}
