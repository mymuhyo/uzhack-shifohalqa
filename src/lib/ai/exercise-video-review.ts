import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { isPatientSideRole, type ClinicalActor } from '../clinical-types';
import { getDatabase } from '../db';
import { exerciseCatalog, exerciseErrorCodeSchema, type ExerciseErrorCode } from '../pose/diagnostics';
import { movementId, type PoseMovement } from '../pose/engine';

export const MIN_KEYFRAMES = 3;
export const MAX_KEYFRAMES = 5;
export const MAX_KEYFRAME_BYTES = 512 * 1024; // 512 KiB per keyframe
export const ALLOWED_KEYFRAME_MIME_TYPES = ['image/jpeg', 'image/webp', 'image/png'] as const;

export type KeyframeMimeType = (typeof ALLOWED_KEYFRAME_MIME_TYPES)[number];

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const DATA_URL_PREFIX = /^data:image\/(?:jpeg|webp|png);base64,/i;
const DEFAULT_VERCEL_VISION_MODEL = 'alibaba/qwen3.6-35b-a3b';
const DEFAULT_CLOUDFLARE_VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const DEFAULT_PROVIDER_TIMEOUT_MS = 10_000;

const DIAGNOSTIC_CLAIM_PATTERN =
  /\b(tashxis|diagnoz|artroz|artrit|sinish|sinishi|yirtilish|menisk|displaziya|osteoporoz|insult|infarkt|dori iching|dozani oshiring|diagnosis|arthritis|fracture|torn meniscus)\b/i;

const UNCERTAINTY_CUE_PATTERN =
  /\b(ehtimol|ko['‘’]rinishicha|taxminan|aniq emas|to['‘’]liq ko['‘’]rinmadi|qisman|shifokor|tekshiruv|kamera)\b/i;

function normalizeBase64(raw: string): string {
  return raw.trim().replace(DATA_URL_PREFIX, '').replace(/\s+/g, '');
}

function decodeBoundedBase64(raw: string): Buffer | null {
  const clean = normalizeBase64(raw);
  if (clean.length < 4 || clean.length % 4 !== 0 || !BASE64_PATTERN.test(clean)) {
    return null;
  }
  const bytes = Buffer.from(clean, 'base64');
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_KEYFRAME_BYTES) {
    return null;
  }
  return bytes;
}

export const keyframeMimeTypeSchema = z.enum(ALLOWED_KEYFRAME_MIME_TYPES);

export const keyframeItemSchema = z
  .strictObject({
    timestampMs: z.int().min(0).max(600_000),
    mimeType: keyframeMimeTypeSchema,
    dataBase64: z.string().trim().min(4).max(750_000),
  })
  .refine((item) => decodeBoundedBase64(item.dataBase64) !== null, {
    path: ['dataBase64'],
    message: 'Keyframe must be valid base64 within 512 KiB.',
  });

export const keyframeReviewInputSchema = z
  .strictObject({
    attemptId: z.uuid().optional(),
    movement: movementId,
    cycleIndex: z.int().min(0).max(999),
    fromMs: z.int().min(0).max(600_000),
    toMs: z.int().min(0).max(600_000),
    severity: z.enum(['ok', 'yellow', 'red']).optional().default('yellow'),
    peakAngleDeg: z.number().min(0).max(180).nullable(),
    targetAngle: z.number().min(60).max(170).optional(),
    errorCodes: z.array(exerciseErrorCodeSchema).max(12),
    keyframes: z.array(keyframeItemSchema).min(MIN_KEYFRAMES).max(MAX_KEYFRAMES),
  })
  .refine((value) => value.toMs >= value.fromMs, {
    path: ['toMs'],
    message: 'toMs must be greater than or equal to fromMs.',
  });

export type KeyframeReviewInput = z.infer<typeof keyframeReviewInputSchema>;

export const keyframeAiObservationSchema = z.strictObject({
  visibility: z.enum(['clear', 'partly_obscured', 'unclear']),
  observationUz: z.string().trim().min(10).max(400),
  uncertaintyNoteUz: z.string().trim().min(5).max(240),
  possibleCausesUz: z.array(z.string().trim().min(3).max(120)).min(1).max(3),
});

export type KeyframeAiObservation = z.infer<typeof keyframeAiObservationSchema>;

export const keyframeReviewResultSchema = z.strictObject({
  sourceMode: z.enum(['ai', 'deterministic_fallback']),
  provider: z.enum(['vercel', 'cloudflare', 'deterministic']),
  model: z.string(),
  cycleIndex: z.int().min(0),
  cycleNumber: z.int().min(1),
  fromMs: z.int().min(0),
  toMs: z.int().min(0),
  timeRangeLabel: z.string(),
  visibility: z.enum(['clear', 'partly_obscured', 'unclear']),
  summaryUz: z.string(),
  observationUz: z.string(),
  uncertaintyNoteUz: z.string(),
  possibleCausesUz: z.array(z.string()),
  persisted: z.boolean(),
  segmentId: z.uuid().nullable(),
});

export type KeyframeReviewResult = z.infer<typeof keyframeReviewResultSchema>;

const keyframeObservationJsonSchema = {
  type: 'object',
  required: ['visibility', 'observationUz', 'uncertaintyNoteUz', 'possibleCausesUz'],
  additionalProperties: false,
  properties: {
    visibility: {
      type: 'string',
      enum: ['clear', 'partly_obscured', 'unclear'],
    },
    observationUz: {
      type: 'string',
      description: 'Short plain-Uzbek visual observation of the flagged exercise cycle with uncertainty phrasing.',
    },
    uncertaintyNoteUz: {
      type: 'string',
      description: 'Explicit uncertainty note explaining visual/camera limits without any medical diagnosis.',
    },
    possibleCausesUz: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: { type: 'string' },
    },
  },
} as const;

const chatCompletionEnvelopeSchema = z.object({
  model: z.string().min(1).optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    )
    .min(1),
});

const cloudflareVisionEnvelopeSchema = z.object({
  success: z.literal(true),
  result: z.union([
    z.object({ response: z.union([z.string(), z.record(z.string(), z.unknown())]) }),
    z.object({
      choices: z
        .array(
          z.object({
            message: z.object({ content: z.string() }),
          }),
        )
        .min(1),
    }),
  ]),
});

const uuidRowSchema = z.object({ id: z.uuid() });

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function formatTimeRangeUz(fromMs: number, toMs: number): string {
  return `${formatClock(fromMs)}–${formatClock(toMs)}`;
}

function jointPhraseUz(movement: PoseMovement): string {
  const info = exerciseCatalog[movement];
  return info.jointLabel.toLowerCase();
}

const NEGATED_DIAGNOSIS_DISCLAIMER_PATTERN =
  /\b(?:tibbiy\s+)?(?:tashxis|diagnoz)\s+emas\b|\bnot\s+a\s+(?:medical\s+)?diagnosis\b/gi;

function hasDiagnosticClaim(observation: KeyframeAiObservation): boolean {
  const combined = [
    observation.observationUz,
    observation.uncertaintyNoteUz,
    ...observation.possibleCausesUz,
  ]
    .join(' ')
    .replace(NEGATED_DIAGNOSIS_DISCLAIMER_PATTERN, ' ');
  return DIAGNOSTIC_CLAIM_PATTERN.test(combined);
}

function ensureUncertaintyNote(observation: KeyframeAiObservation): KeyframeAiObservation {
  const combined = `${observation.observationUz} ${observation.uncertaintyNoteUz}`;
  if (UNCERTAINTY_CUE_PATTERN.test(combined)) {
    return observation;
  }
  return {
    ...observation,
    uncertaintyNoteUz: `${observation.uncertaintyNoteUz} (ehtimol kamera burchagi yoki qisman to‘silish sababli; yakuniy bahoni shifokor beradi).`,
  };
}

function stripJsonFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1').trim();
}

function buildVisualPrompt(input: KeyframeReviewInput): string {
  const info = exerciseCatalog[input.movement];
  const cycleNumber = input.cycleIndex + 1;
  const timeRange = formatTimeRangeUz(input.fromMs, input.toMs);
  const angleText = input.peakAngleDeg !== null ? `${Math.round(input.peakAngleDeg)}°` : 'aniqlanmadi';
  const targetText = input.targetAngle !== undefined ? `${Math.round(input.targetAngle)}°` : `${info.defaultTargetAngle}°`;
  const codesText = input.errorCodes.length > 0 ? input.errorCodes.join(', ') : 'none';
  const timestamps = input.keyframes.map((k) => `${k.timestampMs}ms`).join(', ');

  return [
    `You are assisting a physiotherapist reviewing ${input.keyframes.length} extracted keyframes from a home rehabilitation clip.`,
    `Movement: ${input.movement} (${info.title}, joint: ${info.jointLabel}, direction: ${info.direction}).`,
    `Flagged cycle: #${cycleNumber} (${timeRange}), keyframe timestamps: [${timestamps}].`,
    `Measured CV peak angle: ${angleText} (target ${targetText}), deterministic flags: [${codesText}].`,
    'Rules:',
    '1. Report ONLY what is visually observable across the keyframes and CV metrics.',
    '2. Write concise plain Uzbek (Latin script).',
    '3. ALWAYS include explicit uncertainty phrasing (for example: "ehtimol kamera burchagi yoki qisman to‘silish sababli", "ko‘rinishicha").',
    '4. NEVER make a medical diagnosis, name a disease/injury, or prescribe/change treatment.',
    '5. Keep observationUz under 260 characters.',
  ].join('\n');
}

export function buildDeterministicKeyframeObservation(
  input: Pick<
    KeyframeReviewInput,
    'movement' | 'cycleIndex' | 'fromMs' | 'toMs' | 'peakAngleDeg' | 'targetAngle' | 'errorCodes'
  >,
): {
  visibility: KeyframeAiObservation['visibility'];
  observationUz: string;
  uncertaintyNoteUz: string;
  possibleCausesUz: string[];
  summaryUz: string;
  timeRangeLabel: string;
  cycleNumber: number;
} {
  const info = exerciseCatalog[input.movement];
  const joint = jointPhraseUz(input.movement);
  const cycleNumber = input.cycleIndex + 1;
  const timeRangeLabel = formatTimeRangeUz(input.fromMs, input.toMs);
  const codes = new Set<ExerciseErrorCode>(input.errorCodes);
  const angleText = input.peakAngleDeg !== null ? `${Math.round(input.peakAngleDeg)}°` : null;
  const targetAngle = input.targetAngle ?? info.defaultTargetAngle;

  let visibility: KeyframeAiObservation['visibility'] = 'partly_obscured';
  let observationUz: string;
  const possibleCausesUz: string[] = [];

  if (codes.has('interrupted_tracking')) {
    visibility = 'unclear';
    observationUz = `${joint} burchagi to‘liq ko‘rinmadi (ehtimol kamera burchagi, yorug‘lik yoki qisman to‘silish)`;
    possibleCausesUz.push('Kamera yon tomondan to‘liq qamrab olmagan bo‘lishi mumkin');
    possibleCausesUz.push('Kiyim yoki mebel bo‘g‘imni qisman to‘sgan bo‘lishi mumkin');
  } else if (codes.has('pain_reported')) {
    visibility = 'clear';
    observationUz = `bemor ushbu takrorda noqulaylik yoki og‘riq bildirgan (ko‘rinishicha harakat to‘xtatilgan; yakuniy bahoni shifokor beradi)`;
    possibleCausesUz.push('Harakat vaqtida noqulaylik sababli takror erta to‘xtatilgan bo‘lishi mumkin');
  } else if (codes.has('shallow_range')) {
    visibility = 'partly_obscured';
    const angleClause = angleText ? ` (kuzatilgan ${angleText}, maqsad ${targetAngle}°)` : '';
    const actionClause =
      info.direction === 'extend'
        ? `${joint} to‘liq yozilmagandek ko‘rindi`
        : `${joint} burchagi maqsadgacha yetmagandek ko‘rindi`;
    observationUz = `${actionClause}${angleClause} (ehtimol harakat chuqurligi yetarli emas yoki kamera burchagi tufayli to‘liq ko‘rinmadi)`;
    possibleCausesUz.push('Harakat amplitudasi maqsadga yetmagan bo‘lishi mumkin');
    possibleCausesUz.push('Kamera burchagi yoki qisman to‘silish burchak o‘lchoviga ta’sir qilgan bo‘lishi mumkin');
  } else if (codes.has('trunk_lean')) {
    visibility = 'clear';
    observationUz = `gavda harakat davomida sezilarli og‘gandek ko‘rindi (ehtimol tayanch yetishmasligi yoki kamera rakursi ta’siri)`;
    possibleCausesUz.push('Harakat vaqtida gavda kompensatsiyasi bo‘lishi mumkin');
    possibleCausesUz.push('Kamera yon rakursdan biroz og‘gan bo‘lishi mumkin');
  } else if (codes.has('elbow_drift')) {
    visibility = 'clear';
    observationUz = `tirsak tanadan biroz uzoqlashgandek ko‘rindi (ehtimol qo‘l holati o‘zgargan yoki rakurs sababli shunday ko‘rinmoqda)`;
    possibleCausesUz.push('Yuqori qo‘l harakat paytida oldinga siljigan bo‘lishi mumkin');
    possibleCausesUz.push('Kamera burchagi bo‘g‘im holatini biroz o‘zgartirib ko‘rsatgan bo‘lishi mumkin');
  } else if (codes.has('too_fast') || codes.has('tempo_irregular')) {
    visibility = 'clear';
    observationUz = `takror sur’ati odatdagidan tezroq yoki notekis ko‘rindi (ehtimol kadrlar oralig‘i yoki shoshilib bajarish sababli)`;
    possibleCausesUz.push('Harakat tez sur’atda bajarilgan bo‘lishi mumkin');
    possibleCausesUz.push('Past kadr tezligi sur’at bahosiga ta’sir qilgan bo‘lishi mumkin');
  } else {
    visibility = 'partly_obscured';
    const angleClause = angleText ? ` (kuzatilgan ${angleText})` : '';
    observationUz = `${joint} harakati ushbu oraliqda qo‘shimcha ko‘rikka belgilandi${angleClause} (ehtimol kamera burchagi yoki qisman to‘silish sababli)`;
    possibleCausesUz.push('Kamera burchagi yoki yorug‘lik tufayli kuzatuv to‘liq bo‘lmagan bo‘lishi mumkin');
  }

  const uncertaintyNoteUz =
    'Bu faqat kadrlardagi dastlabki kuzatuv (tibbiy tashxis emas); ehtimol kamera burchagi yoki qisman to‘silish ta’sir qilgan, yakuniy qarorni shifokor beradi.';
  const summaryUz = `${cycleNumber}-takror · ${timeRangeLabel} · ${observationUz}`;

  return {
    visibility,
    observationUz,
    uncertaintyNoteUz,
    possibleCausesUz,
    summaryUz,
    timeRangeLabel,
    cycleNumber,
  };
}

async function callVercelGatewayVision(
  apiKey: string,
  input: KeyframeReviewInput,
  signal: AbortSignal,
): Promise<{ provider: 'vercel'; model: string; data: KeyframeAiObservation } | null> {
  const model = process.env.AI_GATEWAY_VISION_MODEL?.trim() || DEFAULT_VERCEL_VISION_MODEL;
  const prompt = buildVisualPrompt(input);
  const contentParts = [
    { type: 'text', text: prompt },
    ...input.keyframes.map((frame) => ({
      type: 'image_url',
      image_url: { url: `data:${frame.mimeType};base64,${normalizeBase64(frame.dataBase64)}` },
    })),
  ];

  const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
    method: 'POST',
    redirect: 'error',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 450,
      messages: [{ role: 'user', content: contentParts }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'exercise_keyframe_observation',
          strict: true,
          schema: keyframeObservationJsonSchema,
        },
      },
    }),
  });
  if (!response.ok) return null;

  const envelope = chatCompletionEnvelopeSchema.safeParse(await response.json());
  if (!envelope.success) return null;
  const rawText = stripJsonFences(envelope.data.choices[0].message.content);
  const parsed = keyframeAiObservationSchema.safeParse(JSON.parse(rawText));
  if (!parsed.success || hasDiagnosticClaim(parsed.data)) return null;

  return {
    provider: 'vercel',
    model: envelope.data.model ?? model,
    data: ensureUncertaintyNote(parsed.data),
  };
}

async function callCloudflareWorkersVision(
  accountId: string,
  apiToken: string,
  input: KeyframeReviewInput,
  signal: AbortSignal,
): Promise<{ provider: 'cloudflare'; model: string; data: KeyframeAiObservation } | null> {
  const model = process.env.CLOUDFLARE_VISION_MODEL?.trim() || DEFAULT_CLOUDFLARE_VISION_MODEL;
  const prompt = [
    buildVisualPrompt(input),
    `Return ONLY a valid JSON object matching this schema: ${JSON.stringify(keyframeObservationJsonSchema)}`,
  ].join('\n');

  const contentParts = [
    { type: 'text', text: prompt },
    ...input.keyframes.map((frame) => ({
      type: 'image_url',
      image_url: { url: `data:${frame.mimeType};base64,${normalizeBase64(frame.dataBase64)}` },
    })),
  ];

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
    {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        max_tokens: 450,
        messages: [{ role: 'user', content: contentParts }],
      }),
    },
  );
  if (!response.ok) return null;

  const envelope = cloudflareVisionEnvelopeSchema.safeParse(await response.json());
  if (!envelope.success) return null;

  let candidate: unknown;
  if ('response' in envelope.data.result) {
    const raw = envelope.data.result.response;
    candidate = typeof raw === 'string' ? JSON.parse(stripJsonFences(raw)) : raw;
  } else {
    candidate = JSON.parse(stripJsonFences(envelope.data.result.choices[0].message.content));
  }

  const parsed = keyframeAiObservationSchema.safeParse(candidate);
  if (!parsed.success || hasDiagnosticClaim(parsed.data)) return null;

  return {
    provider: 'cloudflare',
    model,
    data: ensureUncertaintyNote(parsed.data),
  };
}

async function verifyAttemptOwnership(actor: ClinicalActor, attemptId: string): Promise<boolean> {
  const sql = getDatabase();
  if (!sql) throw new Error('Exercise database is unavailable');

  if (actor.role === 'doctor') {
    if (!actor.doctorId) return false;
    const rows = await sql`
      SELECT attempt.id
      FROM public.exercise_attempts AS attempt
      JOIN public.exercise_prescriptions AS plan
        ON plan.workspace_id = attempt.workspace_id AND plan.id = attempt.prescription_id
      WHERE attempt.workspace_id = ${actor.workspaceId}
        AND attempt.id = ${attemptId}
        AND plan.doctor_id = ${actor.doctorId}
        AND (${actor.patientId}::uuid IS NULL OR plan.patient_id = ${actor.patientId}::uuid)
      LIMIT 1
    `;
    return rows.length > 0;
  }

  if (isPatientSideRole(actor.role) && actor.patientId) {
    const rows = await sql`
      SELECT attempt.id
      FROM public.exercise_attempts AS attempt
      JOIN public.exercise_prescriptions AS plan
        ON plan.workspace_id = attempt.workspace_id AND plan.id = attempt.prescription_id
      WHERE attempt.workspace_id = ${actor.workspaceId}
        AND attempt.id = ${attemptId}
        AND plan.patient_id = ${actor.patientId}
      LIMIT 1
    `;
    return rows.length > 0;
  }

  return false;
}

async function persistSegmentObservation(
  actor: ClinicalActor,
  input: KeyframeReviewInput,
  review: Omit<KeyframeReviewResult, 'persisted' | 'segmentId'>,
): Promise<string | null> {
  if (!input.attemptId) return null;
  const sql = getDatabase();
  if (!sql) throw new Error('Exercise database is unavailable');

  const aiReviewPayload = {
    sourceMode: review.sourceMode,
    provider: review.provider,
    model: review.model,
    visibility: review.visibility,
    observationUz: review.observationUz,
    uncertaintyNoteUz: review.uncertaintyNoteUz,
    possibleCausesUz: review.possibleCausesUz,
    timeRangeLabel: review.timeRangeLabel,
    keyframeCount: input.keyframes.length,
    keyframeTimestampsMs: input.keyframes.map((frame) => frame.timestampMs),
    reviewedAt: new Date().toISOString(),
  };

  const [existing] = await sql`
    SELECT id
    FROM public.exercise_segments
    WHERE workspace_id = ${actor.workspaceId}
      AND attempt_id = ${input.attemptId}
      AND cycle_index = ${input.cycleIndex}
    LIMIT 1
  `;
  const existingParsed = existing ? uuidRowSchema.safeParse(existing) : null;

  if (existingParsed?.success) {
    const [updated] = await sql`
      UPDATE public.exercise_segments
      SET from_ms = ${input.fromMs},
          to_ms = ${input.toMs},
          severity = ${input.severity},
          error_codes = ${input.errorCodes}::text[],
          peak_angle_deg = ${input.peakAngleDeg},
          summary_uz = ${review.summaryUz},
          ai_review = ${sql.json(aiReviewPayload)}::jsonb
      WHERE id = ${existingParsed.data.id}
        AND workspace_id = ${actor.workspaceId}
      RETURNING id
    `;
    return updated ? uuidRowSchema.parse(updated).id : existingParsed.data.id;
  }

  const [inserted] = await sql`
    INSERT INTO public.exercise_segments (
      workspace_id,
      attempt_id,
      cycle_index,
      from_ms,
      to_ms,
      severity,
      error_codes,
      peak_angle_deg,
      summary_uz,
      ai_review,
      doctor_flagged
    )
    VALUES (
      ${actor.workspaceId},
      ${input.attemptId},
      ${input.cycleIndex},
      ${input.fromMs},
      ${input.toMs},
      ${input.severity},
      ${input.errorCodes}::text[],
      ${input.peakAngleDeg},
      ${review.summaryUz},
      ${sql.json(aiReviewPayload)}::jsonb,
      ${input.severity !== 'ok'}
    )
    RETURNING id
  `;
  return inserted ? uuidRowSchema.parse(inserted).id : null;
}

export type KeyframeReviewOutcome =
  | { ok: true; status: 200; data: KeyframeReviewResult }
  | { ok: false; status: 400 | 403 | 404 | 503; error: string };

export async function reviewExerciseKeyframes(
  rawInput: unknown,
  actor?: ClinicalActor,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<KeyframeReviewOutcome> {
  if (actor && actor.role === 'caregiver') {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  const parsed = keyframeReviewInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'invalid' };
  }
  const input = parsed.data;

  if (input.attemptId) {
    if (!actor) {
      return { ok: false, status: 403, error: 'forbidden' };
    }
    const owned = await verifyAttemptOwnership(actor, input.attemptId);
    if (!owned) {
      return { ok: false, status: 404, error: 'not_found' };
    }
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const baseSignal = options?.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  const vercelKey = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim() || '';
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || '';
  const cfApiToken = process.env.CLOUDFLARE_API_TOKEN?.trim() || '';

  let aiMatch: { provider: 'vercel' | 'cloudflare'; model: string; data: KeyframeAiObservation } | null = null;

  if (vercelKey) {
    try {
      const attemptSignal = cfAccountId && cfApiToken
        ? AbortSignal.any([baseSignal, AbortSignal.timeout(Math.min(5_500, timeoutMs))])
        : baseSignal;
      aiMatch = await callVercelGatewayVision(vercelKey, input, attemptSignal);
    } catch {
      aiMatch = null;
    }
  }

  if (!aiMatch && cfAccountId && cfApiToken && !baseSignal.aborted) {
    try {
      aiMatch = await callCloudflareWorkersVision(cfAccountId, cfApiToken, input, baseSignal);
    } catch {
      aiMatch = null;
    }
  }

  const cycleNumber = input.cycleIndex + 1;
  const timeRangeLabel = formatTimeRangeUz(input.fromMs, input.toMs);

  let draft: Omit<KeyframeReviewResult, 'persisted' | 'segmentId'>;
  if (aiMatch) {
    draft = {
      sourceMode: 'ai',
      provider: aiMatch.provider,
      model: aiMatch.model,
      cycleIndex: input.cycleIndex,
      cycleNumber,
      fromMs: input.fromMs,
      toMs: input.toMs,
      timeRangeLabel,
      visibility: aiMatch.data.visibility,
      summaryUz: `${cycleNumber}-takror · ${timeRangeLabel} · ${aiMatch.data.observationUz}`,
      observationUz: aiMatch.data.observationUz,
      uncertaintyNoteUz: aiMatch.data.uncertaintyNoteUz,
      possibleCausesUz: aiMatch.data.possibleCausesUz,
    };
  } else {
    const fallback = buildDeterministicKeyframeObservation(input);
    draft = {
      sourceMode: 'deterministic_fallback',
      provider: 'deterministic',
      model: 'shifo-keyframe-fallback-v1',
      cycleIndex: input.cycleIndex,
      cycleNumber: fallback.cycleNumber,
      fromMs: input.fromMs,
      toMs: input.toMs,
      timeRangeLabel: fallback.timeRangeLabel,
      visibility: fallback.visibility,
      summaryUz: fallback.summaryUz,
      observationUz: fallback.observationUz,
      uncertaintyNoteUz: fallback.uncertaintyNoteUz,
      possibleCausesUz: fallback.possibleCausesUz,
    };
  }

  let segmentId: string | null = null;
  let persisted = false;
  if (input.attemptId && actor) {
    segmentId = await persistSegmentObservation(actor, input, draft);
    persisted = segmentId !== null;
  }

  return {
    ok: true,
    status: 200,
    data: keyframeReviewResultSchema.parse({
      ...draft,
      persisted,
      segmentId,
    }),
  };
}
