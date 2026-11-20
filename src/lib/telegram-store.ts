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
    SELECT 1 FROM shifohalqa.telegram_doctor_links
    WHERE workspace_id = ${actor.workspaceId} AND doctor_id = ${actor.doctorId}
  `;
  return rows.length > 0;
}

export async function createTelegramPairing(actor: ClinicalActor): Promise<string | null> {
  if (actor.role !== 'doctor') return null;
  const sql = database();
  const code = randomBytes(32).toString('base64url');
  const rows = await sql`
    INSERT INTO shifohalqa.telegram_pairings AS pairing (workspace_id, doctor_id, code_hash, expires_at)
    SELECT doctor.workspace_id, doctor.id, ${digest(code)}, CURRENT_TIMESTAMP + interval '10 minutes'
    FROM shifohalqa.doctors AS doctor
    WHERE doctor.workspace_id = ${actor.workspaceId} AND doctor.id = ${actor.doctorId}
      AND NOT EXISTS (
        SELECT 1 FROM shifohalqa.telegram_doctor_links AS link
        WHERE link.workspace_id = doctor.workspace_id AND link.doctor_id = doctor.id
      )
    ON CONFLICT (workspace_id, doctor_id) DO UPDATE
    SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, redeemed_at = NULL
    RETURNING 1
  `;
  return rows.length ? code : null;
}

export async function disconnectDoctorTelegram(actor: ClinicalActor): Promise<void> {
  if (actor.role !== 'doctor') return;
  const sql = database();
  await sql.transaction((tx) => [
    tx`DELETE FROM shifohalqa.telegram_pairings WHERE workspace_id = ${actor.workspaceId} AND doctor_id = ${actor.doctorId}`,
    tx`DELETE FROM shifohalqa.telegram_doctor_links WHERE workspace_id = ${actor.workspaceId} AND doctor_id = ${actor.doctorId}`,
  ]);
}
