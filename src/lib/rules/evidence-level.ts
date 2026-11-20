import { z } from 'zod';

const measurement = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('verified'), confidence: z.number().min(0).max(1) }),
  z.strictObject({ status: z.literal('unavailable') }),
]);

const evidenceLevelInput = z.discriminatedUnion('source', [
  z.strictObject({ source: z.literal('self_report'), ai_mode: z.enum(['none', 'manual']) }),
  z.strictObject({
    source: z.literal('timer'),
    ai_mode: z.literal('none'),
    duration_seconds: z.number().positive(),
  }),
  z.strictObject({
    source: z.enum(['photo_ocr', 'uploaded_video']),
    ai_mode: z.literal('live'),
    measurement,
    patient_confirmed: z.boolean(),
  }),
  z.strictObject({ source: z.literal('live_camera'), ai_mode: z.literal('live'), measurement }),
]);

export type EvidenceLevelInput = z.infer<typeof evidenceLevelInput>;

export type EvidenceLevelResult =
  | { status: 'accepted'; level: 0 | 1 | 2 | 3 }
  | { status: 'retake'; reason: 'measurement_unavailable' | 'low_confidence' }
  | { status: 'needs_confirmation' }
  | { status: 'invalid_input' };

/** Assess a new log using provenance and measurement quality established by the server. */
export function deriveEvidenceLevel(input: unknown): EvidenceLevelResult {
  const parsed = evidenceLevelInput.safeParse(input);
  if (!parsed.success) return { status: 'invalid_input' };

  const evidence = parsed.data;
  if (evidence.source === 'self_report') return { status: 'accepted', level: 0 };
  if (evidence.source === 'timer') return { status: 'accepted', level: 1 };

  if (evidence.measurement.status === 'unavailable') {
    return { status: 'retake', reason: 'measurement_unavailable' };
  }

  const minimumConfidence = evidence.source === 'photo_ocr' ? 0.80 : 0.75;
  if (evidence.measurement.confidence < minimumConfidence) {
    return { status: 'retake', reason: 'low_confidence' };
  }

  if (evidence.source === 'live_camera') return { status: 'accepted', level: 3 };
  if (!evidence.patient_confirmed) return { status: 'needs_confirmation' };
  return { status: 'accepted', level: 2 };
}
