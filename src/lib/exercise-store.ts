import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { compareAttempt } from './anticheat/compare-attempt';
import type { ClinicalActor, MutationResult } from './clinical-types';
import { getDatabase } from './db';
import type { ExerciseInput, ExercisePlan, ExerciseReview, MobileExerciseInput } from './exercise-inputs';
import { elbowSample, exerciseSample } from './exercise-sample';
import { analyzeExerciseDiagnostics, exerciseDiagnosticsSchema } from './pose/diagnostics';
import { movementId } from './pose/engine';
import { deriveEvidenceLevel } from './rules/evidence-level';

const exercisePlanRow = z.object({
  id: z.uuid(), movement: movementId, targetAngle: z.int(), targetReps: z.int(), maxShallow: z.int(), painColor: z.enum(['red', 'yellow']),
});
const reviewRow = z.object({
  decision: z.enum(['reviewed', 'retake']), body: z.string(), reviewedAt: z.iso.datetime(),
});
const attemptRow = z.object({
  id: z.uuid(), source: z.enum(['self_report', 'uploaded_video', 'live_camera']),
  aiMode: z.enum(['none', 'manual', 'live']), level: z.union([z.literal(0), z.literal(2), z.literal(3)]),
  reason: z.enum(['manual', 'pain', 'measured']), validReps: z.int().nullable(),
  shallowReps: z.int().nullable(), minAngle: z.number().nullable(), confidence: z.number().nullable(),
  primary: z.boolean(), sample: z.boolean(), similarMotion: z.boolean(), flagColor: z.enum(['red', 'yellow']).nullable(),
  createdAt: z.iso.datetime(), scheduledDate: z.iso.date(), android: z.boolean(),
  movement: movementId, diagnostics: exerciseDiagnosticsSchema.nullable(), review: reviewRow.nullable(),
});
const receiptRow = z.object({
  id: z.uuid(), level: z.number(), primary: z.boolean(), similarMotion: z.boolean(),
  sample: z.boolean(), hash: z.string(),
});
export type ExerciseAttempt = z.infer<typeof attemptRow>;

const tashkentDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tashkent', dateStyle: 'short' });
export function exerciseDate() { return tashkentDay.format(new Date()); }

const fingerprint = z.object({ fileSha256: z.string().nullable(), motionSignature: z.array(z.number()).nullable() });

function requireDatabase() {
  const sql = getDatabase();
  if (!sql) throw new Error('Exercise database is unavailable');
  return sql;
}

export async function assignExercise(actor: ClinicalActor, input: ExercisePlan): Promise<MutationResult> {
  if (actor.role !== 'doctor') return 'not_found';
  const sql = requireDatabase();
  const [row] = await sql`
    WITH scoped AS (
      SELECT workspace_id, id, doctor_id FROM shifohalqa.patients
      WHERE workspace_id = ${actor.workspaceId} AND id = ${actor.patientId} AND doctor_id = ${actor.doctorId}
    ), assigned AS (
      INSERT INTO shifohalqa.exercise_prescriptions (
        workspace_id, patient_id, doctor_id, movement, target_angle, target_reps, max_shallow, pain_color
      )
      SELECT workspace_id, id, doctor_id, ${input.movement}, ${input.targetAngle}, ${input.targetReps}, ${input.maxShallow}, ${input.painColor}
      FROM scoped ON CONFLICT (workspace_id, patient_id) DO NOTHING RETURNING id
    )
    SELECT CASE WHEN EXISTS (SELECT FROM assigned) THEN 'saved'
      WHEN EXISTS (SELECT FROM scoped) THEN 'already_saved' ELSE 'not_found' END AS status
  `;
  return z.enum(['saved', 'already_saved', 'not_found']).parse(row?.status);
}

export async function readExercisePlan(actor: ClinicalActor) {
  const sql = requireDatabase();
  const [row] = await sql`
    SELECT id, movement, target_angle AS "targetAngle", target_reps AS "targetReps", max_shallow AS "maxShallow", pain_color AS "painColor"
    FROM shifohalqa.exercise_prescriptions
    WHERE workspace_id = ${actor.workspaceId} AND patient_id = ${actor.patientId} AND doctor_id = ${actor.doctorId}
  `;
  return row ? exercisePlanRow.parse(row) : null;
}

export async function readExerciseAttempts(actor: ClinicalActor) {
  const sql = requireDatabase();
  const rows = await sql`
    SELECT attempt.id, attempt.movement, attempt.diagnostics, source, ai_mode AS "aiMode", level, reason, valid_reps AS "validReps", shallow_reps AS "shallowReps",
      min_angle AS "minAngle", confidence, is_primary AS "primary", similar_motion AS "similarMotion", flag_color AS "flagColor",
      COALESCE(attempt.file_sha256 IN (${exerciseSample.sha256}, ${elbowSample.sha256}), false) AS sample,
      attempt.client_attempt_id IS NOT NULL AS android, attempt.scheduled_date::text AS "scheduledDate",
      to_char(attempt.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
      CASE WHEN attempt.review_decision IS NOT NULL THEN jsonb_build_object(
        'decision', attempt.review_decision, 'body', attempt.review_reply,
        'reviewedAt', to_char(attempt.reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) END AS review
    FROM shifohalqa.exercise_attempts AS attempt
    JOIN shifohalqa.exercise_prescriptions AS plan ON plan.workspace_id = attempt.workspace_id AND plan.id = attempt.prescription_id
    WHERE plan.workspace_id = ${actor.workspaceId} AND plan.patient_id = ${actor.patientId} AND plan.doctor_id = ${actor.doctorId}
      AND (
        (${actor.role} = 'doctor' AND attempt.flag_color IS NOT NULL AND attempt.review_decision IS NULL)
        OR attempt.id IN (
          SELECT recent.id FROM shifohalqa.exercise_attempts AS recent
          WHERE recent.workspace_id = plan.workspace_id AND recent.prescription_id = plan.id
          ORDER BY greatest(recent.created_at, recent.reviewed_at) DESC, recent.id LIMIT 30
        )
      )
    ORDER BY
      CASE WHEN ${actor.role} = 'doctor' AND attempt.flag_color IS NOT NULL AND attempt.review_decision IS NULL
        THEN CASE WHEN attempt.flag_color = 'red' THEN 0 ELSE 1 END ELSE 2 END,
      CASE WHEN ${actor.role} = 'doctor' AND attempt.flag_color IS NOT NULL AND attempt.review_decision IS NULL
        THEN attempt.created_at END,
      greatest(attempt.created_at, attempt.reviewed_at) DESC, attempt.id
  `;
  return z.array(attemptRow).parse(rows);
}

async function readReceipt(actor: ClinicalActor, mobile: MobileExerciseInput, hash: string) {
  const [row] = await requireDatabase()`
    SELECT id, level, is_primary AS "primary", similar_motion AS "similarMotion",
      COALESCE(file_sha256 IN (${exerciseSample.sha256}, ${elbowSample.sha256}), false) AS sample, client_request_hash AS hash
    FROM shifohalqa.exercise_attempts
    WHERE workspace_id = ${actor.workspaceId} AND prescription_id = ${mobile.prescriptionId}
      AND client_attempt_id = ${mobile.clientAttemptId}
  `;
  if (!row) return null;
  const { hash: recordedHash, ...receipt } = receiptRow.parse(row);
  return recordedHash === hash ? { status: 'saved', ...receipt } as const : { status: 'conflict' } as const;
}

export async function saveExercise(actor: ClinicalActor, input: ExerciseInput, mobile?: MobileExerciseInput) {
  if (actor.role !== 'patient') return { status: 'invalid' } as const;
  const plan = await readExercisePlan(actor);
  if (!plan || (mobile && mobile.prescriptionId !== plan.id)) return { status: 'invalid' } as const;

  // Preserve the original training day when an offline report reconnects after midnight.
  const today = exerciseDate();
  const hash = mobile ? createHash('sha256').update(JSON.stringify(mobile)).digest('hex') : null;
  if (mobile && hash) {
    const existing = await readReceipt(actor, mobile, hash);
    if (existing) return existing;
    if (mobile.scheduledDate > today) {
      return { status: 'stale' } as const;
    }
  }

  const movement = input.movement ?? 'chair_stand';
  if (movement !== plan.movement) return { status: 'invalid' } as const;

  const report = input.source === 'self_report' ? input : null;
  const measured = input.source !== 'self_report' ? input : null;
  const reason = report?.reason ?? 'measured';
  const aiMode = measured ? 'live' : report?.reason === 'manual' ? 'manual' : 'none';
  const assessment = measured ? deriveEvidenceLevel({
    source: measured.source, ai_mode: aiMode,
    measurement: measured.analyzedFrames >= 5 && measured.minAngle !== null && measured.confidence !== null
      ? { status: 'verified', confidence: measured.confidence }
      : { status: 'unavailable' },
    ...(measured.source === 'uploaded_video' ? { patient_confirmed: measured.patientConfirmed } : {}),
  }) : deriveEvidenceLevel({ source: input.source, ai_mode: aiMode });
  if (assessment.status !== 'accepted') return { status: 'retake' } as const;

  const sql = requireDatabase();
  const fileSha256 = measured?.fileSha256?.toLowerCase() ?? null;
  const sample = fileSha256 === exerciseSample.sha256 || fileSha256 === elbowSample.sha256;
  if (sample && (fileSha256 === elbowSample.sha256 ? 'elbow_bend' : 'chair_stand') !== movement) return { status: 'invalid' } as const;
  const motionSignature = measured?.motionSignature ?? null;
  const previous = measured ? z.array(fingerprint).parse(await sql`
    SELECT file_sha256 AS "fileSha256", motion_signature AS "motionSignature"
    FROM shifohalqa.exercise_attempts
    WHERE workspace_id = ${actor.workspaceId} AND prescription_id = ${plan.id}
      AND (file_sha256 = ${fileSha256} OR (motion_signature IS NOT NULL AND file_sha256 IS DISTINCT FROM ${exerciseSample.sha256} AND file_sha256 IS DISTINCT FROM ${elbowSample.sha256}))
    ORDER BY (file_sha256 = ${fileSha256}) DESC NULLS LAST, created_at DESC LIMIT 100
  `) : [];
  const { duplicateFile, similarMotion } = compareAttempt({ fileSha256, motionSignature: sample ? null : motionSignature, previous });
  if (duplicateFile) {
    return (mobile && hash ? await readReceipt(actor, mobile, hash) : null) ?? { status: 'duplicate' } as const;
  }

  const diagnostics = analyzeExerciseDiagnostics({
    ...plan, reason, validReps: measured?.validReps ?? (report?.reason === 'manual' ? report.reps : null),
    shallowReps: measured?.shallowReps ?? null, minAngle: measured?.minAngle ?? null,
    avgCycleSeconds: measured?.avgCycleSeconds, interruptedCycles: measured?.interruptedCycles,
    incompleteCycles: measured?.incompleteCycles, formMetrics: measured?.formMetrics, similarMotion, sample,
  });
  const flag = sample || diagnostics.severity === 'ok' ? null : diagnostics.severity;
  const id = randomUUID();
  const measurements = {
    valid: measured?.validReps ?? (report?.reason === 'manual' ? report.reps : null),
    shallow: measured?.shallowReps ?? null, minimum: measured?.minAngle ?? null,
    confidence: measured?.confidence ?? null, frames: measured?.analyzedFrames ?? null,
  };
  const [primaryRows, retryRows] = await sql.transaction((tx) => [true, false].map((primary) => tx`
    INSERT INTO shifohalqa.exercise_attempts (
      id, workspace_id, prescription_id, is_primary, source, ai_mode, level, reason,
      valid_reps, shallow_reps, min_angle, confidence, analyzed_frames, file_sha256, motion_signature, similar_motion, flag_color,
      scheduled_date, client_attempt_id, client_request_hash, movement, diagnostics
    )
    SELECT ${id}, ${actor.workspaceId}, ${plan.id}, ${primary}, ${input.source}, ${aiMode}, ${assessment.level}, ${reason},
      ${measurements.valid}, ${measurements.shallow}, ${measurements.minimum}, ${measurements.confidence}, ${measurements.frames},
      ${fileSha256}, ${motionSignature ? JSON.stringify(motionSignature) : null}::jsonb, ${similarMotion}, ${flag},
      ${mobile?.scheduledDate ?? today}::date, ${mobile?.clientAttemptId ?? null}::uuid, ${hash}, ${movement}, ${JSON.stringify(diagnostics)}::jsonb
    WHERE NOT (${primary} AND (${reason} = 'pain' OR ${sample}))
    ON CONFLICT DO NOTHING RETURNING is_primary
  `));
  if (!primaryRows[0] && !retryRows[0]) {
    if (mobile && hash) {
      const existing = await readReceipt(actor, mobile, hash);
      if (existing) return existing;
    }
    return { status: 'duplicate' } as const;
  }
  return { status: 'saved', id, level: assessment.level, primary: Boolean(primaryRows[0]), similarMotion, sample } as const;
}

export async function reviewExerciseAttempt(actor: ClinicalActor, input: ExerciseReview): Promise<MutationResult> {
  if (actor.role !== 'doctor') return 'not_found';
  const [result] = await requireDatabase()`
    WITH scoped AS (
      SELECT attempt.id FROM shifohalqa.exercise_attempts AS attempt
      JOIN shifohalqa.exercise_prescriptions AS plan
        ON plan.workspace_id = attempt.workspace_id AND plan.id = attempt.prescription_id
      WHERE plan.workspace_id = ${actor.workspaceId} AND plan.patient_id = ${actor.patientId}
        AND plan.doctor_id = ${actor.doctorId} AND attempt.id = ${input.attemptId}
    ), reviewed AS (
      UPDATE shifohalqa.exercise_attempts AS attempt
      SET review_decision = ${input.decision}, review_reply = ${input.reply}, reviewed_at = CURRENT_TIMESTAMP
      FROM scoped WHERE attempt.id = scoped.id AND attempt.review_decision IS NULL RETURNING attempt.id
    )
    SELECT CASE WHEN EXISTS (SELECT FROM reviewed) THEN 'saved'
      WHEN EXISTS (SELECT FROM scoped) THEN 'already_saved' ELSE 'not_found' END AS status
  `;
  return z.enum(['saved', 'already_saved', 'not_found']).parse(result?.status);
}
