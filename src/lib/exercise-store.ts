import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { compareAttempt } from './anticheat/compare-attempt';
import type { ClinicalActor, MutationResult } from './clinical-types';
import { getDatabase } from './db';
import type { ExerciseInput, ExercisePlan } from './exercise-inputs';
import { exerciseSample } from './exercise-sample';
import { deriveEvidenceLevel } from './rules/evidence-level';

const exercisePlanRow = z.object({
  id: z.uuid(), targetAngle: z.int(), targetReps: z.int(), maxShallow: z.int(), painColor: z.enum(['red', 'yellow']),
});
const attemptRow = z.object({
  id: z.uuid(), source: z.enum(['self_report', 'uploaded_video', 'live_camera']),
  aiMode: z.enum(['none', 'manual', 'live']), level: z.union([z.literal(0), z.literal(2), z.literal(3)]),
  reason: z.enum(['manual', 'pain', 'measured']), validReps: z.int().nullable(),
  shallowReps: z.int().nullable(), minAngle: z.number().nullable(), confidence: z.number().nullable(),
  primary: z.boolean(), sample: z.boolean(), similarMotion: z.boolean(), flagColor: z.enum(['red', 'yellow']).nullable(),
  createdAt: z.iso.datetime(),
});
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
        workspace_id, patient_id, doctor_id, target_angle, target_reps, max_shallow, pain_color
      )
      SELECT workspace_id, id, doctor_id, ${input.targetAngle}, ${input.targetReps}, ${input.maxShallow}, ${input.painColor}
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
    SELECT id, target_angle AS "targetAngle", target_reps AS "targetReps", max_shallow AS "maxShallow", pain_color AS "painColor"
    FROM shifohalqa.exercise_prescriptions
    WHERE workspace_id = ${actor.workspaceId} AND patient_id = ${actor.patientId} AND doctor_id = ${actor.doctorId}
  `;
  return row ? exercisePlanRow.parse(row) : null;
}

export async function readExerciseAttempts(actor: ClinicalActor) {
  const sql = requireDatabase();
  const rows = await sql`
    SELECT attempt.id, source, ai_mode AS "aiMode", level, reason, valid_reps AS "validReps", shallow_reps AS "shallowReps",
      min_angle AS "minAngle", confidence, is_primary AS "primary", similar_motion AS "similarMotion", flag_color AS "flagColor",
      attempt.file_sha256 IS NOT DISTINCT FROM ${exerciseSample.sha256} AS sample,
      to_char(attempt.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
    FROM shifohalqa.exercise_attempts AS attempt
    JOIN shifohalqa.exercise_prescriptions AS plan ON plan.workspace_id = attempt.workspace_id AND plan.id = attempt.prescription_id
    WHERE plan.workspace_id = ${actor.workspaceId} AND plan.patient_id = ${actor.patientId} AND plan.doctor_id = ${actor.doctorId}
    ORDER BY attempt.created_at DESC, attempt.id LIMIT 10
  `;
  return z.array(attemptRow).parse(rows);
}

export async function saveExercise(actor: ClinicalActor, input: ExerciseInput) {
  if (actor.role !== 'patient') return { status: 'invalid' } as const;
  const plan = await readExercisePlan(actor);
  if (!plan) return { status: 'invalid' } as const;

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
  const sample = fileSha256 === exerciseSample.sha256;
  const motionSignature = measured?.motionSignature ?? null;
  const previous = measured ? z.array(fingerprint).parse(await sql`
    SELECT file_sha256 AS "fileSha256", motion_signature AS "motionSignature"
    FROM shifohalqa.exercise_attempts
    WHERE workspace_id = ${actor.workspaceId} AND prescription_id = ${plan.id}
      AND (file_sha256 = ${fileSha256} OR (motion_signature IS NOT NULL AND file_sha256 IS DISTINCT FROM ${exerciseSample.sha256}))
    ORDER BY (file_sha256 = ${fileSha256}) DESC NULLS LAST, created_at DESC LIMIT 100
  `) : [];
  const { duplicateFile, similarMotion } = compareAttempt({ fileSha256, motionSignature: sample ? null : motionSignature, previous });
  if (duplicateFile) return { status: 'duplicate' } as const;

  const flag = sample ? null : reason === 'pain' ? plan.painColor
    : similarMotion || (measured && measured.shallowReps > plan.maxShallow) ? 'yellow' : null;
  const id = randomUUID();
  const measurements = {
    valid: measured?.validReps ?? (report?.reason === 'manual' ? report.reps : null),
    shallow: measured?.shallowReps ?? null, minimum: measured?.minAngle ?? null,
    confidence: measured?.confidence ?? null, frames: measured?.analyzedFrames ?? null,
  };
  const [primaryRows, retryRows] = await sql.transaction((tx) => [true, false].map((primary) => tx`
    INSERT INTO shifohalqa.exercise_attempts (
      id, workspace_id, prescription_id, is_primary, source, ai_mode, level, reason,
      valid_reps, shallow_reps, min_angle, confidence, analyzed_frames, file_sha256, motion_signature, similar_motion, flag_color
    )
    SELECT ${id}, ${actor.workspaceId}, ${plan.id}, ${primary}, ${input.source}, ${aiMode}, ${assessment.level}, ${reason},
      ${measurements.valid}, ${measurements.shallow}, ${measurements.minimum}, ${measurements.confidence}, ${measurements.frames},
      ${fileSha256}, ${motionSignature ? JSON.stringify(motionSignature) : null}::jsonb, ${similarMotion}, ${flag}
    WHERE NOT (${primary} AND (${reason} = 'pain' OR ${sample}))
    ON CONFLICT DO NOTHING RETURNING is_primary
  `));
  if (!primaryRows[0] && !retryRows[0]) return { status: 'duplicate' } as const;
  return { status: 'saved', level: assessment.level, primary: Boolean(primaryRows[0]), similarMotion, sample } as const;
}
