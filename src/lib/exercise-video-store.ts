import { z } from 'zod';
import { isPatientSideRole, type ClinicalActor } from './clinical-types';
import { getDatabase, type SqlAdapter } from './db';
import { exerciseErrorCodeSchema } from './pose/diagnostics';
import { movementId } from './pose/engine';
import { createSupabaseAdminClient } from './supabase/admin';

export const EXERCISE_VIDEO_BUCKET = 'exercise-segments' as const;
export const MAX_VIDEO_DURATION_SEC = 60;
export const MAX_VIDEO_SIZE_BYTES = 20 * 1024 * 1024; // 20 MiB (20,971,520 bytes)
export const ALLOWED_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm'] as const;
export const MAX_WORKSPACE_VIDEOS_PER_24H = 20;
export const SIGNED_PLAYBACK_TTL_SEC = 300;
export const VIDEO_RETENTION_DAYS_AFTER_UPLOAD = 30;
export const VIDEO_RETENTION_DAYS_AFTER_REVIEW = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AllowedVideoMimeType = (typeof ALLOWED_VIDEO_MIME_TYPES)[number];

export function normalizeVideoMimeType(raw: string): string {
  return raw.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function isAllowedVideoMimeType(value: string): value is AllowedVideoMimeType {
  return (ALLOWED_VIDEO_MIME_TYPES as readonly string[]).includes(value);
}

export function buildExerciseVideoPath(
  workspaceId: string,
  patientId: string,
  attemptId: string,
  mimeType: AllowedVideoMimeType,
): string {
  const ext = mimeType === 'video/mp4' ? 'mp4' : 'webm';
  return `${workspaceId}/${patientId}/${attemptId}.${ext}`;
}

export function computeVideoExpiresAt(uploadedAt: Date, reviewedAt: Date | null): Date {
  const uploadExpiryMs = uploadedAt.getTime() + VIDEO_RETENTION_DAYS_AFTER_UPLOAD * DAY_MS;
  if (!reviewedAt) return new Date(uploadExpiryMs);
  return new Date(Math.min(uploadExpiryMs, reviewedAt.getTime() + VIDEO_RETENTION_DAYS_AFTER_REVIEW * DAY_MS));
}

export function isVideoExpired(
  uploadedAt: Date,
  reviewedAt: Date | null,
  now: Date = new Date(),
  storedExpiresAt?: Date | null,
): boolean {
  const computed = computeVideoExpiresAt(uploadedAt, reviewedAt);
  const effectiveMs =
    storedExpiresAt && storedExpiresAt.getTime() < computed.getTime()
      ? storedExpiresAt.getTime()
      : computed.getTime();
  return now.getTime() >= effectiveMs;
}

export const videoUploadRequestBodySchema = z.strictObject({
  action: z.literal('request'),
  attemptId: z.uuid(),
  consent: z.boolean(),
  durationSec: z.number(),
  sizeBytes: z.number(),
  mimeType: z.string().trim().min(1).max(120),
});

export const videoUploadFinalizeBodySchema = z.strictObject({
  action: z.literal('finalize'),
  attemptId: z.uuid(),
  consent: z.boolean(),
  durationSec: z.number(),
  sizeBytes: z.number().optional(),
  mimeType: z.string().trim().min(1).max(120),
  path: z.string().trim().min(1).max(300).optional(),
});

export const videoUploadActionBodySchema = z.discriminatedUnion('action', [
  videoUploadRequestBodySchema,
  videoUploadFinalizeBodySchema,
]);

export type RequestExerciseVideoUploadInput = Omit<z.infer<typeof videoUploadRequestBodySchema>, 'action'>;
export type FinalizeExerciseVideoUploadInput = Omit<z.infer<typeof videoUploadFinalizeBodySchema>, 'action'>;

export type VideoUploadRequestData = {
  attemptId: string;
  bucket: typeof EXERCISE_VIDEO_BUCKET;
  path: string;
  signedUrl: string;
  token: string;
  maxSizeBytes: number;
  maxDurationSec: number;
  mimeType: AllowedVideoMimeType;
};

export type VideoUploadFinalizeData = {
  status: 'finalized';
  attemptId: string;
  path: string;
  uploadedAt: string;
  expiresAt: string;
  durationSec: number;
  sizeBytes: number;
  mimeType: AllowedVideoMimeType;
  consented: true;
};

export type ExerciseFlaggedSegment = {
  id: string;
  cycleIndex: number;
  fromMs: number;
  toMs: number;
  severity: 'ok' | 'yellow' | 'red';
  errorCodes: z.infer<typeof exerciseErrorCodeSchema>[];
  peakAngleDeg: number | null;
  summaryUz: string;
  aiReview: Record<string, unknown> | null;
};

export type ExerciseVideoPlaybackData = {
  status: 'active';
  attemptId: string;
  movement: z.infer<typeof movementId>;
  playbackUrl: string;
  playbackExpiresInSec: number;
  durationSec: number | null;
  sizeBytes: number | null;
  mimeType: AllowedVideoMimeType | null;
  uploadedAt: string;
  expiresAt: string;
  reviewedAt: string | null;
  flaggedSegments: ExerciseFlaggedSegment[];
};

export type ExerciseVideoExpiredData = {
  status: 'expired';
  attemptId: string;
  expiredAt: string;
  metricsPreserved: true;
};

export type VideoStoreResult<T> =
  | { ok: true; status: 200; data: T }
  | { ok: false; status: 400 | 403 | 404 | 409 | 410 | 422 | 429 | 503; error: string; data?: ExerciseVideoExpiredData };

const attemptUploadCheckRow = z.object({
  id: z.uuid(),
  videoStoragePath: z.string().nullable(),
  reviewedAt: z.iso.datetime().nullable().optional().default(null),
});

const quotaRow = z.object({ count: z.coerce.number().int().min(0) });

const finalizedAttemptRow = z.object({
  id: z.uuid(),
  path: z.string().min(1),
  uploadedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  durationSec: z.coerce.number().int().min(1).max(MAX_VIDEO_DURATION_SEC),
  sizeBytes: z.coerce.number().int().min(1).max(MAX_VIDEO_SIZE_BYTES),
  mimeType: z.enum(ALLOWED_VIDEO_MIME_TYPES),
});

const playbackAttemptRow = z.object({
  id: z.uuid(),
  movement: movementId,
  videoStoragePath: z.string().nullable(),
  videoConsented: z.boolean(),
  videoUploadedAt: z.iso.datetime().nullable(),
  videoExpiresAt: z.iso.datetime().nullable(),
  videoDurationSec: z.coerce.number().int().nullable(),
  videoSizeBytes: z.coerce.number().int().nullable(),
  videoMimeType: z.enum(ALLOWED_VIDEO_MIME_TYPES).nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

const flaggedSegmentRow = z.object({
  id: z.uuid(),
  cycleIndex: z.coerce.number().int().min(0),
  fromMs: z.coerce.number().int().min(0),
  toMs: z.coerce.number().int().min(0),
  severity: z.enum(['ok', 'yellow', 'red']),
  errorCodes: z.array(exerciseErrorCodeSchema).default([]),
  peakAngleDeg: z.number().nullable(),
  summaryUz: z.string(),
  aiReview: z.record(z.string(), z.unknown()).nullable(),
});

function requireDatabase(): SqlAdapter {
  const sql = getDatabase();
  if (!sql) throw new Error('Exercise video database is unavailable');
  return sql;
}

function validateVideoUploadParams(
  actor: ClinicalActor,
  params: { attemptId: string; consent: boolean; durationSec: number; sizeBytes?: number; mimeType: string },
  requireSize: boolean,
): { ok: true; mimeType: AllowedVideoMimeType } | { ok: false; status: 400 | 403; error: string } {
  if (!isPatientSideRole(actor.role) || !actor.patientId) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  if (!z.uuid().safeParse(params.attemptId).success) {
    return { ok: false, status: 400, error: 'invalid' };
  }
  if (params.consent !== true) {
    return { ok: false, status: 400, error: 'consent_required' };
  }
  if (!Number.isInteger(params.durationSec) || params.durationSec < 1 || params.durationSec > MAX_VIDEO_DURATION_SEC) {
    return { ok: false, status: 400, error: 'invalid_duration' };
  }
  if (requireSize && params.sizeBytes === undefined) {
    return { ok: false, status: 400, error: 'invalid_size' };
  }
  if (
    params.sizeBytes !== undefined &&
    (!Number.isInteger(params.sizeBytes) || params.sizeBytes < 1 || params.sizeBytes > MAX_VIDEO_SIZE_BYTES)
  ) {
    return { ok: false, status: 400, error: 'invalid_size' };
  }
  const mimeType = normalizeVideoMimeType(params.mimeType);
  if (!isAllowedVideoMimeType(mimeType)) {
    return { ok: false, status: 400, error: 'invalid_mime_type' };
  }
  return { ok: true, mimeType };
}

async function checkPatientAttemptAndQuota(
  sql: SqlAdapter,
  actor: ClinicalActor,
  attemptId: string,
): Promise<
  | { ok: true; attempt: z.infer<typeof attemptUploadCheckRow> }
  | { ok: false; status: 404 | 409 | 429; error: string }
> {
  const [attemptRaw] = await sql`
    SELECT attempt.id,
           attempt.video_storage_path AS "videoStoragePath",
           CASE WHEN attempt.reviewed_at IS NOT NULL THEN
             to_char(attempt.reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           END AS "reviewedAt"
    FROM public.exercise_attempts AS attempt
    JOIN public.exercise_prescriptions AS plan
      ON plan.workspace_id = attempt.workspace_id AND plan.id = attempt.prescription_id
    WHERE attempt.workspace_id = ${actor.workspaceId}
      AND plan.patient_id = ${actor.patientId}
      AND attempt.id = ${attemptId}
    LIMIT 1
  `;
  if (!attemptRaw) return { ok: false, status: 404, error: 'not_found' };

  const attempt = attemptUploadCheckRow.parse(attemptRaw);
  if (attempt.videoStoragePath !== null) return { ok: false, status: 409, error: 'already_uploaded' };

  const [quotaRaw] = await sql`
    SELECT COUNT(*)::int AS count
    FROM public.exercise_attempts
    WHERE workspace_id = ${actor.workspaceId}
      AND video_uploaded_at >= CURRENT_TIMESTAMP - interval '24 hours'
  `;
  const recentCount = quotaRaw ? quotaRow.parse(quotaRaw).count : 0;
  if (recentCount >= MAX_WORKSPACE_VIDEOS_PER_24H) {
    return { ok: false, status: 429, error: 'quota_exceeded' };
  }
  return { ok: true, attempt };
}

type StorageObjectMetadata = { sizeBytes: number | null; mimeType: string | null };

async function inspectUploadedStorageObject(
  path: string,
): Promise<{ ok: true; meta: StorageObjectMetadata } | { ok: false; status: 422 | 503; error: string }> {
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, status: 503, error: 'storage_unavailable' };
  const bucket = admin.storage.from(EXERCISE_VIDEO_BUCKET);

  if (typeof bucket.info === 'function') {
    const { data, error } = await bucket.info(path);
    if (error || !data) return { ok: false, status: 422, error: 'video_not_uploaded' };
    const rawMeta = (data.metadata ?? {}) as Record<string, unknown>;
    const sizeCandidate = typeof data.size === 'number' ? data.size : Number(rawMeta.size);
    const mimeCandidate =
      typeof data.contentType === 'string' && data.contentType.trim()
        ? data.contentType
        : typeof rawMeta.mimetype === 'string'
          ? rawMeta.mimetype
          : null;
    return {
      ok: true,
      meta: { sizeBytes: Number.isFinite(sizeCandidate) ? Math.trunc(sizeCandidate) : null, mimeType: mimeCandidate },
    };
  }

  const slashIdx = path.lastIndexOf('/');
  const folder = slashIdx > 0 ? path.slice(0, slashIdx) : '';
  const fileName = slashIdx >= 0 ? path.slice(slashIdx + 1) : path;
  const { data, error } = await bucket.list(folder, { search: fileName, limit: 10 });
  if (error || !data) return { ok: false, status: 503, error: 'storage_unavailable' };
  const match = data.find((entry) => entry.name === fileName);
  if (!match) return { ok: false, status: 422, error: 'video_not_uploaded' };
  const rawMeta = (match.metadata ?? {}) as Record<string, unknown>;
  const sizeCandidate = Number(rawMeta.size);
  return {
    ok: true,
    meta: {
      sizeBytes: Number.isFinite(sizeCandidate) ? Math.trunc(sizeCandidate) : null,
      mimeType: typeof rawMeta.mimetype === 'string' ? rawMeta.mimetype : null,
    },
  };
}

export async function requestExerciseVideoUpload(
  actor: ClinicalActor,
  input: RequestExerciseVideoUploadInput,
): Promise<VideoStoreResult<VideoUploadRequestData>> {
  const valid = validateVideoUploadParams(actor, input, true);
  if (!valid.ok) return valid;

  const sql = requireDatabase();
  const check = await checkPatientAttemptAndQuota(sql, actor, input.attemptId);
  if (!check.ok) return check;

  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, status: 503, error: 'storage_unavailable' };

  const path = buildExerciseVideoPath(actor.workspaceId, actor.patientId!, input.attemptId, valid.mimeType);
  const { data, error } = await admin.storage.from(EXERCISE_VIDEO_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.signedUrl || !data?.token) {
    return { ok: false, status: 503, error: 'storage_unavailable' };
  }

  return {
    ok: true,
    status: 200,
    data: {
      attemptId: input.attemptId,
      bucket: EXERCISE_VIDEO_BUCKET,
      path: data.path || path,
      signedUrl: data.signedUrl,
      token: data.token,
      maxSizeBytes: MAX_VIDEO_SIZE_BYTES,
      maxDurationSec: MAX_VIDEO_DURATION_SEC,
      mimeType: valid.mimeType,
    },
  };
}

export async function finalizeExerciseVideoUpload(
  actor: ClinicalActor,
  input: FinalizeExerciseVideoUploadInput,
  options?: { now?: Date },
): Promise<VideoStoreResult<VideoUploadFinalizeData>> {
  const valid = validateVideoUploadParams(actor, input, false);
  if (!valid.ok) return valid;

  const expectedPath = buildExerciseVideoPath(actor.workspaceId, actor.patientId!, input.attemptId, valid.mimeType);
  if (input.path !== undefined && input.path !== expectedPath) {
    return { ok: false, status: 400, error: 'invalid_path' };
  }

  const sql = requireDatabase();
  const check = await checkPatientAttemptAndQuota(sql, actor, input.attemptId);
  if (!check.ok) return check;

  const inspected = await inspectUploadedStorageObject(expectedPath);
  if (!inspected.ok) return inspected;

  const actualSizeBytes = inspected.meta.sizeBytes;
  if (actualSizeBytes === null || actualSizeBytes < 1 || actualSizeBytes > MAX_VIDEO_SIZE_BYTES) {
    return { ok: false, status: 400, error: 'invalid_size' };
  }
  if (inspected.meta.mimeType === null) {
    return { ok: false, status: 400, error: 'invalid_mime_type' };
  }
  const actualMime = normalizeVideoMimeType(inspected.meta.mimeType);
  if (!isAllowedVideoMimeType(actualMime) || actualMime !== valid.mimeType) {
    return { ok: false, status: 400, error: 'invalid_mime_type' };
  }

  const now = options?.now ?? new Date();
  const reviewedAt = check.attempt.reviewedAt ? new Date(check.attempt.reviewedAt) : null;
  const expiresAt = computeVideoExpiresAt(now, reviewedAt);

  const [updatedRaw] = await sql`
    UPDATE public.exercise_attempts AS attempt
    SET video_storage_path = ${expectedPath},
        video_uploaded_at = ${now.toISOString()}::timestamptz,
        video_duration_sec = ${input.durationSec},
        video_size_bytes = ${actualSizeBytes},
        video_mime_type = ${valid.mimeType},
        video_consented = true,
        video_expires_at = ${expiresAt.toISOString()}::timestamptz
    FROM public.exercise_prescriptions AS plan
    WHERE attempt.workspace_id = ${actor.workspaceId}
      AND attempt.id = ${input.attemptId}
      AND plan.workspace_id = attempt.workspace_id
      AND plan.id = attempt.prescription_id
      AND plan.patient_id = ${actor.patientId}
      AND attempt.video_storage_path IS NULL
    RETURNING attempt.id,
              attempt.video_storage_path AS path,
              to_char(attempt.video_uploaded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "uploadedAt",
              to_char(attempt.video_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "expiresAt",
              attempt.video_duration_sec AS "durationSec",
              attempt.video_size_bytes::text AS "sizeBytes",
              attempt.video_mime_type AS "mimeType"
  `;
  if (!updatedRaw) return { ok: false, status: 409, error: 'already_uploaded' };

  const finalized = finalizedAttemptRow.parse(updatedRaw);
  return {
    ok: true,
    status: 200,
    data: {
      status: 'finalized',
      attemptId: finalized.id,
      path: finalized.path,
      uploadedAt: finalized.uploadedAt,
      expiresAt: finalized.expiresAt,
      durationSec: finalized.durationSec,
      sizeBytes: finalized.sizeBytes,
      mimeType: finalized.mimeType,
      consented: true,
    },
  };
}

export async function getExerciseVideoPlayback(
  actor: ClinicalActor,
  attemptId: string,
  options?: { now?: Date },
): Promise<VideoStoreResult<ExerciseVideoPlaybackData>> {
  if (actor.role === 'caregiver') return { ok: false, status: 403, error: 'forbidden' };
  if (actor.role === 'doctor' && !actor.doctorId) return { ok: false, status: 403, error: 'forbidden' };
  if (isPatientSideRole(actor.role) && !actor.patientId) return { ok: false, status: 403, error: 'forbidden' };
  if (!z.uuid().safeParse(attemptId).success) return { ok: false, status: 400, error: 'invalid' };

  const sql = requireDatabase();
  const rows = await sql`
    SELECT attempt.id,
           attempt.movement,
           attempt.video_storage_path AS "videoStoragePath",
           attempt.video_consented AS "videoConsented",
           CASE WHEN attempt.video_uploaded_at IS NOT NULL THEN
             to_char(attempt.video_uploaded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           END AS "videoUploadedAt",
           CASE WHEN attempt.video_expires_at IS NOT NULL THEN
             to_char(attempt.video_expires_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           END AS "videoExpiresAt",
           attempt.video_duration_sec AS "videoDurationSec",
           attempt.video_size_bytes::text AS "videoSizeBytes",
           attempt.video_mime_type AS "videoMimeType",
           CASE WHEN attempt.reviewed_at IS NOT NULL THEN
             to_char(attempt.reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           END AS "reviewedAt",
           to_char(attempt.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
    FROM public.exercise_attempts AS attempt
    JOIN public.exercise_prescriptions AS plan
      ON plan.workspace_id = attempt.workspace_id AND plan.id = attempt.prescription_id
    WHERE attempt.workspace_id = ${actor.workspaceId}
      AND attempt.id = ${attemptId}
      AND (${actor.role} = 'doctor' AND plan.doctor_id = ${actor.doctorId}::uuid
           AND (${actor.patientId}::uuid IS NULL OR plan.patient_id = ${actor.patientId}::uuid)
        OR (${actor.role} <> 'doctor' AND plan.patient_id = ${actor.patientId}::uuid))
    LIMIT 1
  `;

  if (!rows[0]) return { ok: false, status: 404, error: 'not_found' };

  const attempt = playbackAttemptRow.parse(rows[0]);
  if (!attempt.videoStoragePath || !attempt.videoConsented) {
    return { ok: false, status: 404, error: 'video_not_found' };
  }

  const now = options?.now ?? new Date();
  const uploadedAt = new Date(attempt.videoUploadedAt ?? attempt.createdAt);
  const reviewedAt = attempt.reviewedAt ? new Date(attempt.reviewedAt) : null;
  const storedExpiresAt = attempt.videoExpiresAt ? new Date(attempt.videoExpiresAt) : null;
  const computedExpiresAt = computeVideoExpiresAt(uploadedAt, reviewedAt);
  const effectiveExpiresAt =
    storedExpiresAt && storedExpiresAt.getTime() < computedExpiresAt.getTime()
      ? storedExpiresAt
      : computedExpiresAt;

  if (isVideoExpired(uploadedAt, reviewedAt, now, storedExpiresAt)) {
    return {
      ok: false,
      status: 410,
      error: 'expired',
      data: {
        status: 'expired',
        attemptId: attempt.id,
        expiredAt: effectiveExpiresAt.toISOString(),
        metricsPreserved: true,
      },
    };
  }

  const segmentRows = await sql`
    SELECT id,
           cycle_index AS "cycleIndex",
           from_ms AS "fromMs",
           to_ms AS "toMs",
           severity,
           error_codes AS "errorCodes",
           peak_angle_deg AS "peakAngleDeg",
           summary_uz AS "summaryUz",
           ai_review AS "aiReview"
    FROM public.exercise_segments
    WHERE workspace_id = ${actor.workspaceId}
      AND attempt_id = ${attempt.id}
    ORDER BY cycle_index ASC, from_ms ASC
  `;
  const flaggedSegments = z.array(flaggedSegmentRow).parse(segmentRows);

  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, status: 503, error: 'storage_unavailable' };

  const { data: signed, error: signError } = await admin.storage
    .from(EXERCISE_VIDEO_BUCKET)
    .createSignedUrl(attempt.videoStoragePath, SIGNED_PLAYBACK_TTL_SEC);
  if (signError || !signed?.signedUrl) {
    return { ok: false, status: 503, error: 'storage_unavailable' };
  }

  return {
    ok: true,
    status: 200,
    data: {
      status: 'active',
      attemptId: attempt.id,
      movement: attempt.movement,
      playbackUrl: signed.signedUrl,
      playbackExpiresInSec: SIGNED_PLAYBACK_TTL_SEC,
      durationSec: attempt.videoDurationSec,
      sizeBytes: attempt.videoSizeBytes,
      mimeType: attempt.videoMimeType,
      uploadedAt: uploadedAt.toISOString(),
      expiresAt: effectiveExpiresAt.toISOString(),
      reviewedAt: attempt.reviewedAt,
      flaggedSegments,
    },
  };
}
