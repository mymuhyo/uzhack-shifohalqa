import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalActor } from '../../src/lib/clinical-types';
import type { SqlAdapter } from '../../src/lib/db';

const origin = 'https://final.shifohalqa.test';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const doctorId = '22222222-2222-4222-8222-222222222222';
const patientId = '33333333-3333-4333-8333-333333333333';
const userId = '66666666-6666-4666-8666-666666666666';
const attemptId = '44444444-4444-4444-8444-444444444444';
const briefId = '55555555-5555-4555-8555-555555555555';
const validJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature123';

const state = vi.hoisted(() => ({
  bearerUserValid: true,
  cookieUser: null as null | { id: string; email: string; user_metadata?: Record<string, unknown> },
  membershipRole: 'patient' as 'patient' | 'doctor',
}));

const mockSql = Object.assign(
  (strings: TemplateStringsArray) => {
    const sqlText = strings.join('?');
    if (sqlText.includes('FROM public.profiles')) {
      return Promise.resolve([{ fullName: 'Dr. Clinic', defaultRole: state.membershipRole }]);
    }
    if (sqlText.includes('FROM public.clinic_memberships')) {
      if (state.membershipRole === 'doctor') {
        return Promise.resolve([{
          workspaceId,
          patientId: null,
          doctorId,
          role: 'doctor',
          actorId: doctorId,
          patientName: null,
          isDemo: false,
        }]);
      }
      return Promise.resolve([{
        workspaceId,
        patientId,
        doctorId,
        role: 'patient',
        actorId: patientId,
        patientName: 'Anvar',
        isDemo: false,
      }]);
    }
    return Promise.resolve([]);
  },
  {
    json: (v: unknown) => v,
    transaction: async () => [],
    end: async () => {},
  },
) as unknown as SqlAdapter;

vi.mock('../../src/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/db')>();
  return {
    ...actual,
    getDatabase: () => mockSql,
  };
});

vi.mock('../../src/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        state.bearerUserValid && token === validJwt
          ? { data: { user: { id: userId, email: 'bemor@clinic.uz' } }, error: null }
          : { data: { user: null }, error: { message: 'invalid' } },
      ),
    },
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: state.cookieUser },
        error: null,
      })),
    },
  }),
}));

vi.mock('../../src/lib/ai/clinical-brief-ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/ai/clinical-brief-ai')>();
  return {
    ...actual,
    readLatestClinicalBrief: vi.fn(async () => ({
      id: briefId,
      briefDate: '2026-11-25',
      level: 4,
      approvedReplyUz: 'Tasdiqlangan shifokor javobi.',
      approvedAt: '2026-11-25T12:00:00.000Z',
    })),
  };
});

vi.mock('../../src/lib/teach-back-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/teach-back-store')>();
  return {
    ...actual,
    getTeachBackStatus: vi.fn(async () => ({ questions: [], latestAttempt: null })),
    submitTeachBackAttempt: vi.fn(async () => ({
      ok: true,
      attempt: {
        id: briefId,
        activityDate: '2026-11-25',
        score: 1,
        totalQuestions: 1,
        passed: true,
        createdAt: '2026-11-25T12:00:00.000Z',
      },
      feedback: [],
    })),
  };
});

vi.mock('../../src/lib/ai/exercise-video-review', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/ai/exercise-video-review')>();
  return {
    ...actual,
    reviewExerciseKeyframes: vi.fn(async (_input: unknown, actor?: ClinicalActor) => {
      if (!actor) return { ok: false as const, status: 403 as const, error: 'forbidden' };
      return {
        ok: true as const,
        status: 200 as const,
        data: {
          sourceMode: 'deterministic_fallback' as const,
          provider: 'deterministic' as const,
          model: 'shifo-keyframe-fallback-v1',
          cycleIndex: 0,
          cycleNumber: 1,
          fromMs: 1000,
          toMs: 3500,
          timeRangeLabel: '00:01–00:03',
          visibility: 'partly_obscured' as const,
          summaryUz: '1-takror · 00:01–00:03 · tizza ko‘rinishi qisman to‘silgan (ehtimol kamera burchagi)',
          observationUz: 'tizza ko‘rinishi qisman to‘silgan (ehtimol kamera burchagi)',
          uncertaintyNoteUz: 'Bu faqat kadrlardagi kuzatuv (tibbiy tashxis emas); ehtimol kamera burchagi ta’sir qilgan.',
          possibleCausesUz: ['Kamera burchagi'],
          persisted: false,
          segmentId: null,
        },
      };
    }),
  };
});

vi.mock('../../src/lib/exercise-video-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/exercise-video-store')>();
  return {
    ...actual,
    requestExerciseVideoUpload: vi.fn(async () => ({
      ok: true as const,
      status: 200 as const,
      data: {
        attemptId,
        bucket: 'exercise-segments' as const,
        path: `${workspaceId}/${patientId}/${attemptId}.webm`,
        signedUrl: 'https://example.supabase.co/upload',
        token: 'tok',
        maxSizeBytes: actual.MAX_VIDEO_SIZE_BYTES,
        maxDurationSec: actual.MAX_VIDEO_DURATION_SEC,
        mimeType: 'video/webm' as const,
      },
    })),
    getExerciseVideoPlayback: vi.fn(async () => ({
      ok: true as const,
      status: 200 as const,
      data: {
        status: 'active' as const,
        attemptId,
        movement: 'seated_knee_ext' as const,
        playbackUrl: 'https://example.supabase.co/play',
        playbackExpiresInSec: 300,
        durationSec: 12,
        sizeBytes: 380000,
        mimeType: 'video/webm' as const,
        uploadedAt: '2026-11-25T10:00:00.000Z',
        expiresAt: '2026-12-25T10:00:00.000Z',
        reviewedAt: null,
        flaggedSegments: [],
      },
    })),
  };
});

import { GET as briefGet, POST as briefPost } from '../../src/app/api/clinical/brief/route';
import { GET as videoGet } from '../../src/app/api/clinical/exercise/[attemptId]/video/route';
import { POST as keyframePost } from '../../src/app/api/clinical/exercise/keyframe-review/route';
import { POST as videoUploadPost } from '../../src/app/api/clinical/exercise/video-upload/route';
import { GET as teachBackGet, POST as teachBackPost } from '../../src/app/api/clinical/teach-back/route';

const sampleJpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]).toString('base64');

function bearerGet(path: string, token = validJwt) {
  return new NextRequest(`${origin}${path}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` },
  });
}

function bearerPost(path: string, body: unknown, token = validJwt) {
  return new NextRequest(`${origin}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

describe('M2 clinical endpoints Bearer auth & CSRF isolation (M4/M5 readiness)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    state.bearerUserValid = true;
    state.cookieUser = null;
    state.membershipRole = 'patient';
  });

  it('allows patient Bearer calls without cookies or Origin on brief GET, teach-back GET/POST, keyframe-review, video-upload, and video playback', async () => {
    const briefRes = await briefGet(bearerGet('/api/clinical/brief'));
    expect(briefRes.status).toBe(200);
    await expect(briefRes.json()).resolves.toMatchObject({ role: 'patient', brief: { level: 4 } });

    const tbGetRes = await teachBackGet(bearerGet('/api/clinical/teach-back'));
    expect(tbGetRes.status).toBe(200);

    const tbPostRes = await teachBackPost(
      bearerPost('/api/clinical/teach-back', { answers: [{ questionId: 'med_schedule', selectedOptionId: 'a' }] }),
    );
    expect(tbPostRes.status).toBe(200);

    const kfRes = await keyframePost(
      bearerPost('/api/clinical/exercise/keyframe-review', {
        movement: 'seated_knee_ext',
        cycleIndex: 0,
        fromMs: 1000,
        toMs: 3500,
        peakAngleDeg: 145,
        errorCodes: ['shallow_range'],
        keyframes: [
          { timestampMs: 1200, mimeType: 'image/jpeg', dataBase64: sampleJpegBase64 },
          { timestampMs: 2200, mimeType: 'image/jpeg', dataBase64: sampleJpegBase64 },
          { timestampMs: 3200, mimeType: 'image/jpeg', dataBase64: sampleJpegBase64 },
        ],
      }),
    );
    expect(kfRes.status).toBe(200);

    const uploadRes = await videoUploadPost(
      bearerPost('/api/clinical/exercise/video-upload', {
        action: 'request',
        attemptId,
        consent: true,
        durationSec: 12,
        sizeBytes: 380_000,
        mimeType: 'video/webm',
      }),
    );
    expect(uploadRes.status).toBe(200);

    const playRes = await videoGet(bearerGet(`/api/clinical/exercise/${attemptId}/video`), {
      params: Promise.resolve({ attemptId }),
    });
    expect(playRes.status).toBe(200);
  });

  it('never falls back to web cookies on invalid Bearer, blocks patient Bearer from doctor POST /brief, and blocks cookie POST without Origin', async () => {
    state.cookieUser = { id: userId, email: 'doc@clinic.uz', user_metadata: { default_role: 'doctor' } };
    state.membershipRole = 'doctor';
    state.bearerUserValid = false;

    // Invalid Bearer must return 401 even when cookie session would resolve a doctor
    const badBearer = await briefGet(bearerGet('/api/clinical/brief', 'bad.jwt.token'));
    expect(badBearer.status).toBe(401);

    // Patient Bearer cannot invoke doctor-only POST /api/clinical/brief
    state.cookieUser = null;
    state.membershipRole = 'patient';
    state.bearerUserValid = true;
    const doctorOnly = await briefPost(
      bearerPost('/api/clinical/brief', { action: 'generate' }),
    );
    expect(doctorOnly.status).toBe(401);

    // Cookie POST without Origin header must fail CSRF check (403)
    const noOriginPost = await teachBackPost(
      new NextRequest(`${origin}/api/clinical/teach-back`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers: [{ questionId: 'med_schedule', selectedOptionId: 'a' }] }),
      }),
    );
    expect(noOriginPost.status).toBe(403);
  });
});
