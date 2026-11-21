import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { ClinicalActor, ClinicalTask, ClinicalView } from './clinical-types';
import { getDatabase } from './db';
import { isDemoEnabled } from './demo-session';
import { readRequestJson } from './request-body';

const bearerPattern = /^[a-f0-9]{64}$/;
const bodyLimit = 2048;
const accessRow = z.object({ workspaceId: z.uuid(), patientId: z.uuid(), doctorId: z.uuid(), patientName: z.string() });
const expiryRow = z.object({ expiresAt: z.iso.datetime() });
export const androidPairingForm = z.strictObject({ code: z.string().regex(/^[a-f0-9]{32}$/) });

export function isAndroidDemoEnabled(): boolean {
  return process.env.DEMO_ANDROID_ENABLED === 'true' && isDemoEnabled();
}

function database() {
  const sql = getDatabase();
  if (!sql) throw new Error('Android demo storage unavailable');
  return sql;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function issueAndroidPairing(workspaceId: string, patientId: string) {
  const sql = database();
  const code = randomBytes(16).toString('hex');
  const [row] = await sql`
    INSERT INTO shifohalqa.android_demo_access (workspace_id, patient_id, pairing_hash, pairing_expires_at)
    VALUES (${workspaceId}, ${patientId}, ${hash(code)}, CURRENT_TIMESTAMP + interval '10 minutes')
    ON CONFLICT (workspace_id) DO UPDATE SET
      patient_id = EXCLUDED.patient_id, pairing_hash = EXCLUDED.pairing_hash,
      pairing_expires_at = EXCLUDED.pairing_expires_at, session_hash = NULL, session_expires_at = NULL
    RETURNING to_char(pairing_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "expiresAt"
  `;
  return { code, ...expiryRow.parse(row) };
}

export async function redeemAndroidPairing(code: string) {
  const sql = database();
  const token = randomBytes(32).toString('hex');
  const [row] = await sql`
    UPDATE shifohalqa.android_demo_access
    SET pairing_hash = NULL, pairing_expires_at = NULL,
        session_hash = ${hash(token)}, session_expires_at = CURRENT_TIMESTAMP + interval '8 hours'
    WHERE pairing_hash = ${hash(code)} AND pairing_expires_at > CURRENT_TIMESTAMP
    RETURNING workspace_id AS "workspaceId", to_char(session_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "expiresAt"
  `;
  return row ? { token, ...expiryRow.extend({ workspaceId: z.uuid() }).parse(row) } : null;
}

export async function androidPatient(request: Request): Promise<(ClinicalActor & { patientName: string }) | null> {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!bearerPattern.test(token)) return null;
  const sql = database();
  const [row] = await sql`
    SELECT access.workspace_id AS "workspaceId", access.patient_id AS "patientId",
           patient.doctor_id AS "doctorId", patient.name AS "patientName"
    FROM shifohalqa.android_demo_access AS access
    JOIN shifohalqa.patients AS patient
      ON patient.workspace_id = access.workspace_id AND patient.id = access.patient_id
    WHERE access.session_hash = ${hash(token)} AND access.session_expires_at > CURRENT_TIMESTAMP
  `;
  return row ? { ...accessRow.parse(row), role: 'patient' } : null;
}

export async function readMobileBody(request: Request): Promise<unknown> {
  const input = await readRequestJson(request, bodyLimit);
  return input.ok ? input.body : null;
}

export function mobileJson(data: object, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

const tashkentDate = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'Asia/Tashkent' });

function medicationRecord(task: ClinicalTask) {
  const entry = task.evidence;
  if (!entry || entry.payload.kind !== 'medication') return null;
  const { status } = entry.payload;
  const reply = entry.review && { body: entry.review.reply, decision: entry.review.decision, reviewedAt: entry.review.reviewedAt };
  return { id: entry.id, status, reason: status === 'missed' ? entry.payload.reason : null, reply };
}

export function mobileToday(patientName: string, view: ClinicalView, date = tashkentDate.format(new Date())) {
  const medication = view.tasks.filter((task) => task.type === 'medication');
  const tasks = medication.filter((task) => task.date === date).map((task) => ({
    id: task.id, title: task.title, time: task.dueTime, record: medicationRecord(task),
  }));
  const replies = medication.flatMap((task) => {
    const record = medicationRecord(task);
    return record?.reply ? [{ recordId: record.id, taskTitle: task.title, date: task.date, ...record.reply }] : [];
  });
  return { patientName, date, tasks, replies };
}
