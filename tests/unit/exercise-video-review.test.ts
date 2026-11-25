import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalActor } from '../../src/lib/clinical-types';
import type { SqlAdapter } from '../../src/lib/db';

const realClient = postgres('postgres://user:pass@localhost:5432/test_db', { prepare: false });

type CapturedCall = { sqlText: string; values: unknown[] };
const capturedCalls: CapturedCall[] = [];
let queuedResults: unknown[][] = [];

const mockTx = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => {
    capturedCalls.push({ sqlText: strings.join('?'), values });
    return Promise.resolve(queuedResults.shift() ?? []);
  },
  {
    json: (value: postgres.JSONValue) => realClient.json(value),
  },
);

const mockSql = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => {
    capturedCalls.push({ sqlText: strings.join('?'), values });
    return Promise.resolve(queuedResults.shift() ?? []);
  },
  {
    json: (value: postgres.JSONValue) => realClient.json(value),
    transaction: async (fn: (tx: typeof mockTx) => readonly Promise<unknown[]>[]) => {
      const queries = fn(mockTx);
      const results = [];
      for (const q of queries) results.push(await q);
      return results;
    },
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

import {
  MAX_KEYFRAME_BYTES,
  MAX_KEYFRAMES,
  MIN_KEYFRAMES,
  buildDeterministicKeyframeObservation,
  formatTimeRangeUz,
  keyframeReviewInputSchema,
  reviewExerciseKeyframes,
} from '../../src/lib/ai/exercise-video-review';
import { seatedKneeSample } from '../../src/lib/exercise-sample';
import { saveExercise } from '../../src/lib/exercise-store';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const doctorId = '22222222-2222-4222-8222-222222222222';
const patientId = '33333333-3333-4333-8333-333333333333';
const attemptId = '44444444-4444-4444-8444-444444444444';
const segmentId = '55555555-5555-4555-8555-555555555555';

const patientActor: ClinicalActor = { workspaceId, doctorId, patientId, role: 'patient' };
const caregiverActor: ClinicalActor = { workspaceId, doctorId: null, patientId, role: 'caregiver' };

const sampleJpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]).toString('base64');

function makeKeyframes(count: number, dataBase64 = sampleJpegBase64) {
  return Array.from({ length: count }, (_, idx) => ({
    timestampMs: 12_000 + idx * 1_000,
    mimeType: 'image/jpeg' as const,
    dataBase64,
  }));
}

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

beforeEach(() => {
  capturedCalls.length = 0;
  queuedResults = [];
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.VERCEL_OIDC_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
});

afterEach(() => {
  process.env = { ...originalEnv };
  globalThis.fetch = originalFetch;
});

afterAll(async () => {
  await realClient.end({ timeout: 0 });
});

describe('seated_knee_ext cleared public sample asset', () => {
  it('exists on disk, matches its registered SHA-256 digest, and is recognized by saveExercise only for seated_knee_ext', async () => {
    const filePath = join(process.cwd(), 'public', seatedKneeSample.path.replace(/^\//, ''));
    const bytes = await readFile(filePath);
    const digest = createHash('sha256').update(bytes).digest('hex');

    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect(bytes.byteLength).toBeLessThan(1_000_000);
    expect(digest).toBe(seatedKneeSample.sha256);
    expect(seatedKneeSample.source).toContain('archive.org');

    const prescriptionId = '66666666-6666-4666-8666-666666666666';
    // Rejected if submitted under chair_stand
    queuedResults = [[{ id: prescriptionId, movement: 'chair_stand', targetAngle: 100, targetReps: 5, maxShallow: 1, painColor: 'yellow' }]];
    const wrongMovement = await saveExercise(patientActor, {
      source: 'uploaded_video',
      movement: 'chair_stand',
      validReps: 3,
      shallowReps: 0,
      minAngle: 95,
      confidence: 0.9,
      analyzedFrames: 25,
      patientConfirmed: true,
      fileSha256: seatedKneeSample.sha256,
      motionSignature: Array(20).fill(120),
    });
    expect(wrongMovement).toEqual({ status: 'invalid' });

    // Recognized as sample=true for seated_knee_ext
    queuedResults = [
      [{ id: prescriptionId, movement: 'seated_knee_ext', targetAngle: 155, targetReps: 5, maxShallow: 1, painColor: 'yellow' }],
      [], // previous fingerprints
      [], // primary tx insert skipped for sample
      [{ is_primary: false }], // retry tx insert
    ];
    const okSample = await saveExercise(patientActor, {
      source: 'uploaded_video',
      movement: 'seated_knee_ext',
      validReps: 3,
      shallowReps: 0,
      minAngle: 162,
      confidence: 0.91,
      analyzedFrames: 25,
      patientConfirmed: true,
      fileSha256: seatedKneeSample.sha256,
      motionSignature: Array(20).fill(150),
    });
    expect(okSample).toMatchObject({ status: 'saved', level: 2, primary: false, sample: true });
  });
});

describe('exercise keyframe visual observation (M2.4)', () => {
  it('enforces 3–5 keyframe bounds, valid time ranges, and per-keyframe byte limits', () => {
    expect(MIN_KEYFRAMES).toBe(3);
    expect(MAX_KEYFRAMES).toBe(5);

    const tooFew = keyframeReviewInputSchema.safeParse({
      movement: 'seated_knee_ext',
      cycleIndex: 2,
      fromMs: 12_000,
      toMs: 16_000,
      peakAngleDeg: 138,
      errorCodes: ['shallow_range'],
      keyframes: makeKeyframes(2),
    });
    expect(tooFew.success).toBe(false);

    const tooMany = keyframeReviewInputSchema.safeParse({
      movement: 'seated_knee_ext',
      cycleIndex: 2,
      fromMs: 12_000,
      toMs: 16_000,
      peakAngleDeg: 138,
      errorCodes: ['shallow_range'],
      keyframes: makeKeyframes(6),
    });
    expect(tooMany.success).toBe(false);

    const oversized = Buffer.alloc(MAX_KEYFRAME_BYTES + 16, 0xaa).toString('base64');
    const tooBigFrame = keyframeReviewInputSchema.safeParse({
      movement: 'seated_knee_ext',
      cycleIndex: 2,
      fromMs: 12_000,
      toMs: 16_000,
      peakAngleDeg: 138,
      errorCodes: ['shallow_range'],
      keyframes: makeKeyframes(3, oversized),
    });
    expect(tooBigFrame.success).toBe(false);

    const badRange = keyframeReviewInputSchema.safeParse({
      movement: 'seated_knee_ext',
      cycleIndex: 2,
      fromMs: 16_000,
      toMs: 12_000,
      peakAngleDeg: 138,
      errorCodes: ['shallow_range'],
      keyframes: makeKeyframes(3),
    });
    expect(badRange.success).toBe(false);

    const valid = keyframeReviewInputSchema.safeParse({
      movement: 'seated_knee_ext',
      cycleIndex: 2,
      fromMs: 12_000,
      toMs: 16_000,
      peakAngleDeg: 138,
      errorCodes: ['shallow_range'],
      keyframes: makeKeyframes(4),
    });
    expect(valid.success).toBe(true);
  });

  it('produces deterministic Uzbek fallback with explicit uncertainty phrasing and no medical diagnosis', async () => {
    expect(formatTimeRangeUz(12_000, 16_000)).toBe('00:12–00:16');

    const det = buildDeterministicKeyframeObservation({
      movement: 'seated_knee_ext',
      cycleIndex: 2,
      fromMs: 12_000,
      toMs: 16_000,
      peakAngleDeg: 136,
      targetAngle: 155,
      errorCodes: ['interrupted_tracking'],
    });
    expect(det.summaryUz).toContain('3-takror · 00:12–00:16');
    expect(det.summaryUz.toLowerCase()).toContain('ehtimol');
    expect(det.uncertaintyNoteUz.toLowerCase()).toContain('tibbiy tashxis emas');

    const outcome = await reviewExerciseKeyframes(
      {
        movement: 'seated_knee_ext',
        cycleIndex: 2,
        fromMs: 12_000,
        toMs: 16_000,
        peakAngleDeg: 136,
        targetAngle: 155,
        errorCodes: ['shallow_range'],
        keyframes: makeKeyframes(3),
      },
      patientActor,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.data.sourceMode).toBe('deterministic_fallback');
    expect(outcome.data.provider).toBe('deterministic');
    expect(outcome.data.summaryUz).toContain('3-takror · 00:12–00:16');
    expect(outcome.data.observationUz.toLowerCase()).toMatch(/ehtimol|ko‘rin/);
    expect(outcome.data.persisted).toBe(false);
    expect(outcome.data.segmentId).toBeNull();
  });

  it('falls back from Vercel AI Gateway outage to Cloudflare Workers AI, and to deterministic Uzbek if both fail', async () => {
    process.env.AI_GATEWAY_API_KEY = 'vercel-test-key';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'cf-acct';
    process.env.CLOUDFLARE_API_TOKEN = 'cf-token';
    // reserveAiRequestQuota runs 2 DB quota upserts per external AI review
    queuedResults = [
      [{ requests: 1 }],
      [{ requests: 1 }],
      [{ requests: 1 }],
      [{ requests: 1 }],
    ];

    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('ai-gateway.vercel.sh')) {
        return new Response('upstream outage', { status: 503 });
      }
      return Response.json({
        success: true,
        result: {
          response: JSON.stringify({
            visibility: 'partly_obscured',
            observationUz: 'tizza burchagi to‘liq ko‘rinmadi (ehtimol kamera burchagi yoki qisman to‘silish)',
            uncertaintyNoteUz: 'Kadrlardagi kuzatuv dastlabki bo‘lib, ehtimol yorug‘lik ta’sir qilgan.',
            possibleCausesUz: ['Kamera yon rakursdan biroz siljigan bo‘lishi mumkin'],
          }),
        },
      });
    }) as typeof fetch;

    const cfFallback = await reviewExerciseKeyframes(
      {
        movement: 'seated_knee_ext',
        cycleIndex: 2,
        fromMs: 12_000,
        toMs: 16_000,
        peakAngleDeg: 138,
        errorCodes: ['shallow_range'],
        keyframes: makeKeyframes(3),
      },
      patientActor,
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain('ai-gateway.vercel.sh');
    expect(calls[1]).toContain('api.cloudflare.com');
    expect(cfFallback.ok).toBe(true);
    if (cfFallback.ok) {
      expect(cfFallback.data.sourceMode).toBe('ai');
      expect(cfFallback.data.provider).toBe('cloudflare');
      expect(cfFallback.data.summaryUz).toContain('3-takror · 00:12–00:16');
    }

    // Now simulate both providers failing -> deterministic Uzbek fallback
    globalThis.fetch = vi.fn(async () => new Response('down', { status: 502 })) as typeof fetch;
    const fullOutage = await reviewExerciseKeyframes(
      {
        movement: 'chair_stand',
        cycleIndex: 1,
        fromMs: 5_000,
        toMs: 8_000,
        peakAngleDeg: 118,
        errorCodes: ['shallow_range'],
        keyframes: makeKeyframes(3),
      },
      patientActor,
    );
    expect(fullOutage.ok).toBe(true);
    if (fullOutage.ok) {
      expect(fullOutage.data.sourceMode).toBe('deterministic_fallback');
      expect(fullOutage.data.provider).toBe('deterministic');
      expect(fullOutage.data.summaryUz).toContain('2-takror · 00:05–00:08');
    }
  });

  it('rejects AI output containing medical diagnosis claims and falls back safely', async () => {
    process.env.AI_GATEWAY_API_KEY = 'vercel-test-key';
    process.env.VERCEL_AI_VISION_MODEL = 'alibaba/qwen3.6-custom-vl';
    queuedResults = [[{ requests: 1 }], [{ requests: 1 }]];
    let seenModel: unknown;
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof init?.body === 'string') {
        seenModel = (JSON.parse(init.body) as { model?: unknown }).model;
      }
      return Response.json({
        model: 'alibaba/qwen3.6-custom-vl',
        choices: [
          {
            message: {
              content: JSON.stringify({
                visibility: 'clear',
                observationUz: 'Bemorda tizza artroz tashxis aniqlandi, dori iching.',
                uncertaintyNoteUz: 'Aniq ko‘rinmoqda.',
                possibleCausesUz: ['Artroz'],
              }),
            },
          },
        ],
      });
    }) as typeof fetch;

    const outcome = await reviewExerciseKeyframes(
      {
        movement: 'seated_knee_ext',
        cycleIndex: 0,
        fromMs: 1_000,
        toMs: 4_000,
        peakAngleDeg: 135,
        errorCodes: ['shallow_range'],
        keyframes: makeKeyframes(3),
      },
      patientActor,
    );

    expect(seenModel).toBe('alibaba/qwen3.6-custom-vl');
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.sourceMode).toBe('deterministic_fallback');
      expect(outcome.data.observationUz.toLowerCase()).not.toContain('artroz');
    }
  });

  it('skips external AI providers when DB rate limiter denies quota', async () => {
    process.env.AI_GATEWAY_API_KEY = 'vercel-test-key';
    queuedResults = [[]]; // workspace quota exceeded
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const outcome = await reviewExerciseKeyframes(
      {
        movement: 'seated_knee_ext',
        cycleIndex: 1,
        fromMs: 4_000,
        toMs: 7_000,
        peakAngleDeg: 132,
        errorCodes: ['shallow_range'],
        keyframes: makeKeyframes(3),
      },
      patientActor,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.data.sourceMode).toBe('deterministic_fallback');
      expect(outcome.data.provider).toBe('deterministic');
    }
  });

  it('persists segment observation in exercise_segments when attemptId is owned, and rejects unowned or caregiver calls', async () => {
    const caregiverBlocked = await reviewExerciseKeyframes(
      {
        movement: 'seated_knee_ext',
        cycleIndex: 0,
        fromMs: 1_000,
        toMs: 4_000,
        peakAngleDeg: 135,
        errorCodes: ['shallow_range'],
        keyframes: makeKeyframes(3),
      },
      caregiverActor,
    );
    expect(caregiverBlocked).toEqual({ ok: false, status: 403, error: 'forbidden' });

    // Unowned attempt -> 404 before touching AI or segments
    queuedResults = [[]];
    const crossTenant = await reviewExerciseKeyframes(
      {
        attemptId,
        movement: 'seated_knee_ext',
        cycleIndex: 0,
        fromMs: 1_000,
        toMs: 4_000,
        peakAngleDeg: 135,
        errorCodes: ['shallow_range'],
        keyframes: makeKeyframes(3),
      },
      patientActor,
    );
    expect(crossTenant).toEqual({ ok: false, status: 404, error: 'not_found' });

    // Owned attempt -> inserts segment with sql.json() ai_review
    capturedCalls.length = 0;
    queuedResults = [
      [{ id: attemptId }], // ownership check
      [], // existing segment check
      [{ id: segmentId }], // insert returning id
    ];

    const saved = await reviewExerciseKeyframes(
      {
        attemptId,
        movement: 'seated_knee_ext',
        cycleIndex: 2,
        fromMs: 12_000,
        toMs: 16_000,
        peakAngleDeg: 138,
        errorCodes: ['shallow_range'],
        keyframes: makeKeyframes(3),
      },
      patientActor,
    );

    expect(saved.ok).toBe(true);
    if (saved.ok) {
      expect(saved.data.persisted).toBe(true);
      expect(saved.data.segmentId).toBe(segmentId);
    }
    const insertCall = capturedCalls[2]!;
    expect(insertCall.sqlText).toContain('INSERT INTO public.exercise_segments');
    const jsonbParam = insertCall.values.find(
      (v) => v && typeof v === 'object' && (v as { type?: unknown }).type === 3802,
    ) as { value?: Record<string, unknown> } | undefined;
    expect(jsonbParam).toBeDefined();
    expect(jsonbParam?.value?.keyframeCount).toBe(3);
    // Raw base64 images are never persisted into ai_review JSONB
    expect(JSON.stringify(jsonbParam?.value)).not.toContain(sampleJpegBase64);
  });
});
