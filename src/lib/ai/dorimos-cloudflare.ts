import { Buffer } from 'node:buffer';
import { z } from 'zod';
import {
  medicationBoxDoseBucketSchema,
  medicationBoxGatesSchema,
  medicationBoxLabelSchema,
  minimumBoxConfidence,
  type MedicationBoxLabel,
  type MedicationBoxReading,
} from './medication-box';

const defaultDecisionModel = '@cf/cloudflare/clef';
const defaultExtractionModel = '@cf/cloudflare/clairic-flash';
type BoxGates = z.infer<typeof medicationBoxGatesSchema>;

const cloudflareNoul = z.object({
  type: z.literal('noul'),
  noul: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1).optional(),
});
const cloudflareClefEnvelope = z.object({
  success: z.literal(true),
  result: z.object({
    model: z.string().min(1),
    answers: z.object({
      is_packaging_visible: cloudflareNoul,
      is_label_legible: cloudflareNoul,
      matches_prescribed_drug: cloudflareNoul,
      detected_dose_bucket: z.object({
        type: z.literal('choice'),
        choice: medicationBoxDoseBucketSchema,
        confidence: z.number().min(0).max(1),
      }),
    }),
  }),
});

const cloudflareField = z.object({
  type: z.string(),
  value: z.unknown(),
  valid: z.boolean().optional(),
  confidence: z.number().min(0).max(1).optional(),
  p_null: z.number().min(0).max(1).optional(),
});
const cloudflareClairicEnvelope = z.object({
  success: z.literal(true),
  result: z.object({
    model: z.string().min(1),
    answers: z.object({
      drugName: cloudflareField,
      strength: cloudflareField,
      unit: cloudflareField,
    }),
  }),
});

function binaryCertainty(answer: z.infer<typeof cloudflareNoul>): number {
  return answer.confidence ?? Math.max(answer.noul, 1 - answer.noul);
}

function normalizeCloudflareModelPath(model: string): { path: string; selector: string } {
  const selector = model.trim().replace(/^@cf\/cloudflare\//, '');
  if (!/^(clef|clairic)(-flash)?$/.test(selector)) throw new Error('Invalid Cloudflare System One model');
  return { path: `@cf/cloudflare/${selector}`, selector };
}

async function runCloudflareAi(
  accountId: string,
  apiToken: string,
  modelPath: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${modelPath}`,
    {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    },
  );
  if (!response.ok) throw new Error(`Cloudflare Workers AI returned HTTP ${response.status}`);
  return response.json();
}

export async function readCloudflareBox(
  accountId: string,
  apiToken: string,
  image: Uint8Array,
  mimeType: 'image/png' | 'image/jpeg',
  expected: MedicationBoxLabel,
  signal: AbortSignal,
): Promise<MedicationBoxReading> {
  let gates: BoxGates | undefined;
  try {
    const decisionConfig = normalizeCloudflareModelPath(process.env.CLOUDFLARE_DECISION_MODEL?.trim() || defaultDecisionModel);
    const extractionConfig = normalizeCloudflareModelPath(process.env.CLOUDFLARE_EXTRACTION_MODEL?.trim() || defaultExtractionModel);
    const images = [{ content_type: mimeType, base64: Buffer.from(image).toString('base64') }];
    const rawDecision = await runCloudflareAi(accountId, apiToken, decisionConfig.path, {
      model: decisionConfig.selector,
      state: 'Evaluate the front label of this synthetic practice medicine box image.',
      images,
      questions: {
        is_packaging_visible: {
          type: 'noul',
          instructions: 'Does the image show the front of a box for a single medicine, including a synthetic practice box?',
        },
        is_label_legible: {
          type: 'noul',
          instructions: 'Can you directly read the full medicine name and a single strength with its unit on the front label? Require the complete lettering and digits to be visible. Answer no if blur, glare, crop or obstruction leaves the name, number or unit illegible.',
        },
        matches_prescribed_drug: {
          type: 'noul',
          instructions: `Is ${JSON.stringify(expected.drugName)} the medicine name printed on the package? Compare only the name text, ignoring case and differences in whitespace. Ignore strength, units, tablet count, and all other package text.`,
          criteria: {
            true: 'The entire printed medicine name matches the reference name. Any strength or unit on the label can accompany a matching name.',
            false: 'A different medicine name is printed or the complete medicine name cannot be read.',
          },
        },
        detected_dose_bucket: {
          type: 'choice',
          instructions: 'What single strength is visibly printed next to the medicine name? Choose other for any unlisted unit or number, illegible strength, or multiple strengths.',
          criteria: {
            '2.5mg': 'Precisely 2.5 milligrams, including the decimal-comma spelling 2,5 mg.',
            '5mg': 'Precisely 5 milligrams.',
            '10mg': 'Precisely 10 milligrams.',
            '20mg': 'Precisely 20 milligrams.',
            '50mg': 'Precisely 50 milligrams.',
            '100mg': 'Precisely 100 milligrams.',
            other: 'Any different strength or unit, ambiguous text, missing text or multiple strengths.',
          },
        },
      },
    }, signal);
    signal.throwIfAborted();
    const decision = cloudflareClefEnvelope.parse(rawDecision).result;
    const { answers } = decision;
    gates = {
      packaging: { probability: answers.is_packaging_visible.noul, confidence: binaryCertainty(answers.is_packaging_visible) },
      legibility: { probability: answers.is_label_legible.noul, confidence: binaryCertainty(answers.is_label_legible) },
      prescribedDrug: { probability: answers.matches_prescribed_drug.noul, confidence: binaryCertainty(answers.matches_prescribed_drug) },
      dose: { bucket: answers.detected_dose_bucket.choice, confidence: answers.detected_dose_bucket.confidence },
    };

    const confidence = Math.min(...Object.values(gates).map((gate) => gate.confidence));
    if (gates.packaging.probability < 0.5 || gates.legibility.probability < 0.5) {
      return { status: 'retake', reason: 'unreadable', gates };
    }
    if (confidence < minimumBoxConfidence || Math.min(gates.packaging.probability, gates.legibility.probability) < minimumBoxConfidence) {
      return { status: 'retake', reason: 'low_confidence', gates };
    }

    const rawExtract = await runCloudflareAi(accountId, apiToken, extractionConfig.path, {
      model: extractionConfig.selector,
      state: 'Transcribe the front label of this synthetic practice medicine box. Ignore pill counts and concentration labels.',
      images,
      fields: {
        drugName: {
          type: 'text',
          instructions: 'Exact medicine name printed on the front label without strength or unit. Return null if obscured or unreadable.',
        },
        strength: {
          type: 'number',
          decimals: 3,
          minimum: 0.001,
          maximum: 1_000_000,
          instructions: 'Single printed strength number next to the medicine name (for example 2.5, 5, 10, 20). Ignore tablet counts.',
        },
        unit: {
          type: 'enum',
          enum: [...medicationBoxLabelSchema.shape.unit.options],
          instructions: 'Unit of the printed strength. Use mcg for microgram and iu for international units.',
        },
      },
    }, signal);
    signal.throwIfAborted();
    const extracted = cloudflareClairicEnvelope.parse(rawExtract).result;
    const { drugName, strength, unit } = extracted.answers;
    const fields = Object.values(extracted.answers);
    if (fields.some((field) => field.valid === false || field.value == null)) {
      return { status: 'retake', reason: 'extraction_unreadable', gates };
    }
    const extractionConfidence = Math.min(confidence, ...fields.map((field) => field.confidence ?? 1));
    if (extractionConfidence < minimumBoxConfidence) return { status: 'retake', reason: 'low_confidence', gates };
    const label = medicationBoxLabelSchema.safeParse({
      drugName: drugName.value,
      strength: strength.value,
      unit: unit.value,
    });
    if (!label.success) return { status: 'retake', reason: 'extraction_unreadable', gates };

    return {
      status: 'needs_confirmation',
      label: label.data,
      model: extractionConfig.path,
      decisionModel: decisionConfig.path,
      confidence: extractionConfidence,
      gates,
    };
  } catch {
    return { status: 'manual', reason: signal.aborted ? 'timeout' : 'provider_error', gates };
  }
}
