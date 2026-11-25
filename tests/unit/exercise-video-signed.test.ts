import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalActor } from '../../src/lib/clinical-types';
import type { SqlAdapter } from '../../src/lib/db';

const realClient = postgres('postgres://user:pass@localhost:5432/test_db', { prepare: false });

type CapturedCall = { sqlText: string; values: unknown[] };
const capturedCalls: CapturedCall[] = [];
let queuedResults: unknown[][] = [];

const mockSql = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => {
    capturedCalls.push({ sqlText: strings.join('?'), values });
    return Promise.resolve(queuedResults.shift() ?? []);
  },
  {
    json: (value: postgres.JSONValue) => realClient.json(value),
    end: async () => {},
  },
) as unknown as SqlAdapter;

const storageMock = {
  createSignedUploadUrl: vi.fn(),
  createSignedUrl: vi.fn(),
  info: vi.fn(),
  list: vi.fn(),
};
const adminFromMock = vi.fn(() => storageMock);
let adminEnabled = true;

vi.mock('../../src/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/db')>();
  return {
    ...actual,
    getDatabase: () => mockSql,
  };
});

vi.mock('../../src/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () =>
    adminEnabled
      ? {
          storage: {
            from: adminFromMock,
          },
        }
      : null,
}));

import {
  readExerciseAttempts,
  reviewExerciseAttempt,
} from '../../src/lib/exercise-store';
import {
  EXERCISE_VIDEO_BUCKET,
  MAX_VIDEO_DURATION_SEC,
  MAX_VIDEO_SIZE_BYTES,
  MAX_WORKSPACE_VIDEOS_PER_24H,
  SIGNED_PLAYBACK_TTL_SEC,
  buildExerciseVideoPath,
  computeVideoExpiresAt,
  finalizeExerciseVideoUpload,
  getExerciseVideoPlayback,
  isVideoExpired,
  requestExerciseVideoUpload,
} from '../../src/lib/exercise-video-store';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const doctorId = '22222222-2222-4222-8222-222222222222';
const patientId = '33333333-3333-4333-8333-333333333333';
const attemptId = '44444444-4444-4444-8444-444444444444';
const segmentId = '55555555-5555-4555-8555-555555555555';

const patientActor: ClinicalActor = { workspaceId, doctorId, patientId, role: 'patient' };
const doctorActor: ClinicalActor = { workspaceId, doctorId, patientId, role: 'doctor' };
const caregiverActor: ClinicalActor = { workspaceId, doctorId: null, patientId, role: 'caregiver' };

beforeEach(() => {
  capturedCalls.length = 0;
  queuedResults = [];
  adminEnabled = true;
  adminFromMock.mockClear();
  storageMock.createSignedUploadUrl.mockReset();
  storageMock.createSignedUrl.mockReset();
  storageMock.info.mockReset();
  storageMock.list.mockReset();
});

afterAll(async () => {
  await realClient.end({ timeout: 0 });
});

describe('signed full-attempt exercise video upload, finalize & playback (M2.4)', () => {
  it('rejects consent: false, > 60s duration, > 20 MiB size, bad MIME, and non-patient uploaders', async () => {
    const noConsent = await requestExerciseVideoUpload(patientActor, {
      attemptId,
      consent: false,
      durationSec: 25,
      sizeBytes: 5_000_000,
      mimeType: 'video/mp4',
    });
    expect(noConsent).toEqual({ ok: false, status: 400, error: 'consent_required' });

    const tooLong = await requestExerciseVideoUpload(patientActor, {
      attemptId,
      consent: true,
      durationSec: MAX_VIDEO_DURATION_SEC + 1,
      sizeBytes: 5_000_000,
      mimeType: 'video/mp4',
    });
    expect(tooLong).toEqual({ ok: false, status: 400, error: 'invalid_duration' });

    const tooBig = await requestExerciseVideoUpload(patientActor, {
      attemptId,
      consent: true,
      durationSec: 30,
      sizeBytes: MAX_VIDEO_SIZE_BYTES + 1,
      mimeType: 'video/webm',
    });
    expect(tooBig).toEqual({ ok: false, status: 400, error: 'invalid_size' });

    const badMime = await requestExerciseVideoUpload(patientActor, {
      attemptId,
      consent: true,
      durationSec: 30,
      sizeBytes: 5_000_000,
      mimeType: 'video/x-msvideo',
    });
    expect(badMime).toEqual({ ok: false, status: 400, error: 'invalid_mime_type' });

    const doctorUpload = await requestExerciseVideoUpload(doctorActor, {
      attemptId,
      consent: true,
      durationSec: 30,
      sizeBytes: 5_000_000,
      mimeType: 'video/mp4',
    });
    expect(doctorUpload).toEqual({ ok: false, status: 403, error: 'forbidden' });

    const caregiverUpload = await requestExerciseVideoUpload(caregiverActor, {
      attemptId,
      consent: true,
      durationSec: 30,
      sizeBytes: 5_000_000,
      mimeType: 'video/mp4',
    });
    expect(caregiverUpload).toEqual({ ok: false, status: 403, error: 'forbidden' });
    expect(capturedCalls).toHaveLength(0);
  });

  it('rejects cross-tenant IDOR with 404, already finalized with 409, and quota exceeded with 429', async () => {
    // Cross-tenant / unowned attempt -> 404
    queuedResults = [[]];
    const notFound = await requestExerciseVideoUpload(patientActor, {
      attemptId,
      consent: true,
      durationSec: 20,
      sizeBytes: 2_000_000,
      mimeType: 'video/mp4',
    });
    expect(notFound).toEqual({ ok: false, status: 404, error: 'not_found' });

    // Already has immutable video_storage_path -> 409
    queuedResults = [[{ id: attemptId, videoStoragePath: `${workspaceId}/${patientId}/${attemptId}.mp4` }]];
    const alreadyUploaded = await requestExerciseVideoUpload(patientActor, {
      attemptId,
      consent: true,
      durationSec: 20,
      sizeBytes: 2_000_000,
      mimeType: 'video/mp4',
    });
    expect(alreadyUploaded).toEqual({ ok: false, status: 409, error: 'already_uploaded' });

    // Workspace 24h quota exceeded -> 429
    queuedResults = [
      [{ id: attemptId, videoStoragePath: null }],
      [{ count: MAX_WORKSPACE_VIDEOS_PER_24H }],
    ];
    const quotaHit = await requestExerciseVideoUpload(patientActor, {
      attemptId,
      consent: true,
      durationSec: 20,
      sizeBytes: 2_000_000,
      mimeType: 'video/mp4',
    });
    expect(quotaHit).toEqual({ ok: false, status: 429, error: 'quota_exceeded' });
  });

  it('completes happy-path signed upload request, finalize verification, and atomic immutability check', async () => {
    const expectedPath = buildExerciseVideoPath(workspaceId, patientId, attemptId, 'video/webm');
    expect(expectedPath).toBe(`${workspaceId}/${patientId}/${attemptId}.webm`);

    // 1. Request signed upload URL
    queuedResults = [
      [{ id: attemptId, videoStoragePath: null }],
      [{ count: 3 }],
    ];
    storageMock.createSignedUploadUrl.mockResolvedValueOnce({
      data: {
        signedUrl: `https://example.supabase.co/storage/v1/object/upload/sign/${EXERCISE_VIDEO_BUCKET}/${expectedPath}?token=tok123`,
        token: 'tok123',
        path: expectedPath,
      },
      error: null,
    });

    const reqOutcome = await requestExerciseVideoUpload(patientActor, {
      attemptId,
      consent: true,
      durationSec: 42,
      sizeBytes: 4_500_000,
      mimeType: 'video/webm;codecs=vp9',
    });
    expect(reqOutcome.ok).toBe(true);
    if (!reqOutcome.ok) return;
    expect(reqOutcome.data).toMatchObject({
      attemptId,
      bucket: EXERCISE_VIDEO_BUCKET,
      path: expectedPath,
      token: 'tok123',
      mimeType: 'video/webm',
      maxSizeBytes: MAX_VIDEO_SIZE_BYTES,
      maxDurationSec: MAX_VIDEO_DURATION_SEC,
    });
    expect(adminFromMock).toHaveBeenCalledWith(EXERCISE_VIDEO_BUCKET);
    expect(storageMock.createSignedUploadUrl).toHaveBeenCalledWith(expectedPath);

    // 2. Finalize verifies uploaded object metadata and binds immutably
    const uploadTime = new Date('2026-11-25T10:00:00.000Z');
    const expectedExpiry = computeVideoExpiresAt(uploadTime, null).toISOString();
    queuedResults = [
      [{ id: attemptId, videoStoragePath: null, reviewedAt: null }],
      [{ count: 3 }],
      [
        {
          id: attemptId,
          path: expectedPath,
          uploadedAt: uploadTime.toISOString(),
          expiresAt: expectedExpiry,
          durationSec: 42,
          sizeBytes: '4498123',
          mimeType: 'video/webm',
        },
      ],
    ];
    storageMock.info.mockResolvedValueOnce({
      data: { size: 4_498_123, contentType: 'video/webm;codecs=vp9', metadata: {} },
      error: null,
    });

    const finOutcome = await finalizeExerciseVideoUpload(
      patientActor,
      {
        attemptId,
        consent: true,
        durationSec: 42,
        mimeType: 'video/webm',
        path: expectedPath,
      },
      { now: uploadTime },
    );
    expect(finOutcome.ok).toBe(true);
    if (!finOutcome.ok) return;
    expect(finOutcome.data).toEqual({
      status: 'finalized',
      attemptId,
      path: expectedPath,
      uploadedAt: uploadTime.toISOString(),
      expiresAt: expectedExpiry,
      durationSec: 42,
      sizeBytes: 4_498_123,
      mimeType: 'video/webm',
      consented: true,
    });

    // 3. Duplicate finalize rejected with 409 (even on race returning 0 rows)
    queuedResults = [
      [{ id: attemptId, videoStoragePath: null, reviewedAt: null }],
      [{ count: 4 }],
      [], // WHERE video_storage_path IS NULL matched 0 rows
    ];
    storageMock.info.mockResolvedValueOnce({
      data: { size: 4_498_123, contentType: 'video/webm', metadata: {} },
      error: null,
    });
    const dupFinalize = await finalizeExerciseVideoUpload(
      patientActor,
      {
        attemptId,
        consent: true,
        durationSec: 42,
        mimeType: 'video/webm',
        path: expectedPath,
      },
      { now: uploadTime },
    );
    expect(dupFinalize).toEqual({ ok: false, status: 409, error: 'already_uploaded' });

    // 4. Oversized actual storage object rejected even if client lied on request
    queuedResults = [
      [{ id: attemptId, videoStoragePath: null, reviewedAt: null }],
      [{ count: 4 }],
    ];
    storageMock.info.mockResolvedValueOnce({
      data: { size: MAX_VIDEO_SIZE_BYTES + 1024, contentType: 'video/webm', metadata: {} },
      error: null,
    });
    const oversizedActual = await finalizeExerciseVideoUpload(patientActor, {
      attemptId,
      consent: true,
      durationSec: 42,
      mimeType: 'video/webm',
    });
    expect(oversizedActual).toEqual({ ok: false, status: 400, error: 'invalid_size' });
  });

  it('enforces lazy expiry min(reviewed_at + 7d, uploaded_at + 30d) while preserving metrics', async () => {
    const uploadedAt = new Date('2026-11-01T00:00:00.000Z');
    const reviewedEarly = new Date('2026-11-03T00:00:00.000Z');
    const reviewedLate = new Date('2026-11-28T00:00:00.000Z');

    // Case A: reviewed early -> expires 7d after review (Nov 10), before 30d after upload (Dec 1)
    expect(computeVideoExpiresAt(uploadedAt, reviewedEarly).toISOString()).toBe('2026-11-10T00:00:00.000Z');
    expect(isVideoExpired(uploadedAt, reviewedEarly, new Date('2026-11-09T23:59:59.000Z'))).toBe(false);
    expect(isVideoExpired(uploadedAt, reviewedEarly, new Date('2026-11-10T00:00:00.000Z'))).toBe(true);

    // Case B: reviewed late (day 27) -> expires 30d after upload (Dec 1), before 7d after review (Dec 5)
    expect(computeVideoExpiresAt(uploadedAt, reviewedLate).toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(isVideoExpired(uploadedAt, reviewedLate, new Date('2026-12-01T00:00:00.000Z'))).toBe(true);

    // Case C: unreviewed -> expires 30d after upload
    expect(computeVideoExpiresAt(uploadedAt, null).toISOString()).toBe('2026-12-01T00:00:00.000Z');

    // Playback returns 410 Gone after 7d post-review even if stored video_expires_at was 30d
    queuedResults = [
      [
        {
          id: attemptId,
          movement: 'seated_knee_ext',
          videoStoragePath: `${workspaceId}/${patientId}/${attemptId}.mp4`,
          videoConsented: true,
          videoUploadedAt: uploadedAt.toISOString(),
          videoExpiresAt: '2026-12-01T00:00:00.000Z',
          videoDurationSec: 35,
          videoSizeBytes: '3500000',
          videoMimeType: 'video/mp4',
          reviewedAt: reviewedEarly.toISOString(),
          createdAt: uploadedAt.toISOString(),
        },
      ],
    ];
    const expiredPlayback = await getExerciseVideoPlayback(doctorActor, attemptId, {
      now: new Date('2026-11-11T00:00:00.000Z'),
    });
    expect(expiredPlayback).toEqual({
      ok: false,
      status: 410,
      error: 'expired',
      data: {
        status: 'expired',
        attemptId,
        expiredAt: '2026-11-10T00:00:00.000Z',
        metricsPreserved: true,
      },
    });
    expect(storageMock.createSignedUrl).not.toHaveBeenCalled();
  });

  it('enforces playback authorization (403 caregiver, 404 cross-tenant) and returns signed playback URL + flagged segments', async () => {
    const caregiverPlayback = await getExerciseVideoPlayback(caregiverActor, attemptId);
    expect(caregiverPlayback).toEqual({ ok: false, status: 403, error: 'forbidden' });

    queuedResults = [[]];
    const crossTenantPlayback = await getExerciseVideoPlayback(doctorActor, attemptId);
    expect(crossTenantPlayback).toEqual({ ok: false, status: 404, error: 'not_found' });

    const uploadedAt = new Date('2026-11-25T08:00:00.000Z');
    const path = `${workspaceId}/${patientId}/${attemptId}.mp4`;
    queuedResults = [
      [
        {
          id: attemptId,
          movement: 'seated_knee_ext',
          videoStoragePath: path,
          videoConsented: true,
          videoUploadedAt: uploadedAt.toISOString(),
          videoExpiresAt: '2026-12-25T08:00:00.000Z',
          videoDurationSec: 28,
          videoSizeBytes: '2100000',
          videoMimeType: 'video/mp4',
          reviewedAt: null,
          createdAt: uploadedAt.toISOString(),
        },
      ],
      [
        {
          id: segmentId,
          cycleIndex: 2,
          fromMs: 12_000,
          toMs: 16_000,
          severity: 'yellow',
          errorCodes: ['shallow_range'],
          peakAngleDeg: 138,
          summaryUz: '3-takror · 00:12–00:16 · tizza burchagi to‘liq ko‘rinmadi (ehtimol kamera burchagi)',
          aiReview: { sourceMode: 'deterministic_fallback', visibility: 'partly_obscured' },
        },
      ],
    ];
    storageMock.createSignedUrl.mockResolvedValueOnce({
      data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/${EXERCISE_VIDEO_BUCKET}/${path}?token=play123` },
      error: null,
    });

    const active = await getExerciseVideoPlayback(doctorActor, attemptId, {
      now: new Date('2026-11-25T09:00:00.000Z'),
    });
    expect(active.ok).toBe(true);
    if (!active.ok) return;
    expect(storageMock.createSignedUrl).toHaveBeenCalledWith(path, SIGNED_PLAYBACK_TTL_SEC);
    expect(active.data).toMatchObject({
      status: 'active',
      attemptId,
      movement: 'seated_knee_ext',
      playbackExpiresInSec: SIGNED_PLAYBACK_TTL_SEC,
      durationSec: 28,
      sizeBytes: 2_100_000,
      mimeType: 'video/mp4',
    });
    expect(active.data.flaggedSegments).toHaveLength(1);
    expect(active.data.flaggedSegments[0]).toMatchObject({
      id: segmentId,
      cycleIndex: 2,
      fromMs: 12_000,
      toMs: 16_000,
      severity: 'yellow',
    });
  });

  it('readExerciseAttempts exposes hasVideo/videoDurationSec/videoExpiresAt/videoExpired without video_storage_path, and reviewExerciseAttempt shortens video_expires_at to 7 days', async () => {
    queuedResults = [
      [
        {
          id: attemptId,
          movement: 'seated_knee_ext',
          diagnostics: null,
          source: 'uploaded_video',
          aiMode: 'live',
          level: 2,
          reason: 'measured',
          validReps: 6,
          shallowReps: 1,
          minAngle: 158,
          confidence: 0.91,
          primary: true,
          sample: false,
          similarMotion: false,
          flagColor: 'yellow',
          scheduledDate: '2026-11-25',
          createdAt: '2026-11-25T08:00:00.000Z',
          hasVideo: true,
          videoDurationSec: 28,
          videoExpiresAt: '2026-12-02T08:00:00.000Z',
          videoExpired: false,
          android: false,
          review: null,
        },
      ],
    ];

    const attempts = await readExerciseAttempts(doctorActor);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      id: attemptId,
      hasVideo: true,
      videoDurationSec: 28,
      videoExpiresAt: '2026-12-02T08:00:00.000Z',
      videoExpired: false,
    });
    expect(JSON.stringify(attempts[0])).not.toContain('video_storage_path');
    expect(JSON.stringify(attempts[0])).not.toContain('videoStoragePath');
    expect(capturedCalls[0]?.sqlText).toContain('AS "hasVideo"');
    expect(capturedCalls[0]?.sqlText).toContain('AS "videoDurationSec"');
    expect(capturedCalls[0]?.sqlText).toContain('AS "videoExpiresAt"');
    expect(capturedCalls[0]?.sqlText).toContain('AS "videoExpired"');

    queuedResults = [[{ status: 'saved' }]];
    const reviewed = await reviewExerciseAttempt(doctorActor, {
      attemptId,
      decision: 'reviewed',
      reply: 'Tizza yozilishi yaxshi, 3-takror biroz chala qolgan.',
    });
    expect(reviewed).toBe('saved');
    expect(capturedCalls[1]?.sqlText).toContain('video_expires_at = CASE');
    expect(capturedCalls[1]?.sqlText).toContain("CURRENT_TIMESTAMP + interval '7 days'");
  });
});
