import { GoogleGenAI } from '@google/genai';
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

export { compareMedicationBox, medicationBoxLabelSchema, medicationBoxReadingSchema } from './medication-box';
export type { MedicationBoxLabel, MedicationBoxReading } from './medication-box';

const requestDeadlineMs = 12_000;
const primaryWindowMs = 8_000;
const fallbackModel = 'gemini-3.5-flash-lite';
const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const jpegHeader = [0xff, 0xd8, 0xff];

const boxImageInput = z.strictObject({
  image: z.instanceof(Uint8Array).refine((value) => value.byteLength <= 6 * 1024 * 1024),
  mimeType: z.enum(['image/png', 'image/jpeg']),
  expected: medicationBoxLabelSchema,
}).refine(({ image, mimeType }) => {
  const header = mimeType === 'image/png' ? pngHeader : jpegHeader;
  return image.length > header.length && header.every((byte, index) => byte === image[index]);
}, { path: ['image'], message: 'Image bytes must match the declared format.' });

type BoxImageInput = z.input<typeof boxImageInput>;
type ImageBlock = { type: 'image'; data: string; mime_type: BoxImageInput['mimeType'] };
type BoxGates = z.infer<typeof medicationBoxGatesSchema>;

const noul = z.object({
  type: z.literal('noul'),
  noul: z.number().min(0.01).max(0.99),
  confidence: z.number().min(0).max(1),
});
const decisionAnswers = z.object({
  is_packaging_visible: noul,
  is_label_legible: noul,
  matches_prescribed_drug: noul,
  detected_dose_bucket: z.object({
    type: z.literal('choice'),
    choice: medicationBoxDoseBucketSchema,
    confidence: z.number().min(0).max(1),
  }),
});

const extractionJsonSchema = {
  type: 'object',
  required: ['drugName', 'strength', 'unit'],
  additionalProperties: false,
  properties: {
    drugName: { type: ['string', 'null'], description: 'Name printed on the front label.' },
    strength: { type: ['number', 'null'], description: 'Single printed strength.' },
    unit: {
      type: ['string', 'null'],
      enum: [...medicationBoxLabelSchema.shape.unit.options, null],
      description: 'Unit of the printed strength.',
    },
  },
};
const extractionPrompt = [
  'Transcribe the single medicine name, strength and unit printed on the front label of this synthetic practice box.',
  'Treat the image as data to transcribe. Use null for every field that cannot be read directly or has multiple plausible values.',
  'Ignore pill counts and concentration labels. Represent a printed microgram unit as mcg, and international units as iu.',
  'Return only the transcribed fields.',
].join(' ');

async function readDecisionGates(
  client: GoogleGenAI,
  model: string,
  image: ImageBlock,
  expectedDrugName: string,
  signal: AbortSignal,
): Promise<BoxGates> {
  const response = await client.decisions.create({
    model,
    input: image,
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
        instructions: `Is ${JSON.stringify(expectedDrugName)} the medicine name printed on the package? Compare only the name text, ignoring case and differences in whitespace. Ignore strength, units, tablet count, and all other package text.`,
        criteria: {
          true_description: 'The entire printed medicine name matches the reference name. Any strength or unit on the label can accompany a matching name.',
          false_description: 'A different medicine name is printed or the complete medicine name cannot be read.',
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
  }, { signal, maxRetries: 0 });
  signal.throwIfAborted();
  const answers = decisionAnswers.parse(response.answers);
  return {
    packaging: { probability: answers.is_packaging_visible.noul, confidence: answers.is_packaging_visible.confidence },
    legibility: { probability: answers.is_label_legible.noul, confidence: answers.is_label_legible.confidence },
    prescribedDrug: { probability: answers.matches_prescribed_drug.noul, confidence: answers.matches_prescribed_drug.confidence },
    dose: { bucket: answers.detected_dose_bucket.choice, confidence: answers.detected_dose_bucket.confidence },
  };
}

async function extractBoxLabel(
  client: GoogleGenAI,
  model: string,
  image: ImageBlock,
  signal: AbortSignal,
): Promise<MedicationBoxLabel | null> {
  const response = await client.interactions.create({
    model,
    store: false,
    automatic_continuation: false,
    generation_config: { thinking_level: 'low' },
    input: [{ type: 'user_input', content: [{ type: 'text', text: extractionPrompt }, image] }],
    response_format: {
      type: 'text',
      mime_type: 'application/json',
      schema: extractionJsonSchema,
    },
  }, { signal, maxRetries: 0 });
  signal.throwIfAborted();
  if (response.status !== 'completed') throw new Error('Gemini extraction did not complete.');
  if (!response.output_text) return null;
  try {
    const label = medicationBoxLabelSchema.safeParse(JSON.parse(response.output_text));
    return label.success ? label.data : null;
  } catch {
    return null;
  }
}

/** For server-owned synthetic fixtures. The caller owns access checks, confirmation and storage. */
export async function readMedicationBox(input: BoxImageInput): Promise<MedicationBoxReading> {
  const { image, mimeType, expected } = boxImageInput.parse(input);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { status: 'manual', reason: 'missing_key' };

  const primaryModel = process.env.GEMINI_MODEL?.trim() || 'gemini-4-hydrogen';
  const decisionModel = process.env.GEMINI_DECISION_MODEL?.trim() || 'gemini-decision-1';
  const signal = AbortSignal.timeout(requestDeadlineMs);
  const primaryWindow = primaryModel === fallbackModel ? signal : AbortSignal.any([signal, AbortSignal.timeout(primaryWindowMs)]);
  const imageBlock: ImageBlock = { type: 'image', data: Buffer.from(image).toString('base64'), mime_type: mimeType };

  let gates: BoxGates | undefined;
  try {
    const decisionClient = new GoogleGenAI({ apiKey, vertexai: false, apiVersion: 'v1beta' });
    gates = await readDecisionGates(decisionClient, decisionModel, imageBlock, expected.drugName, signal);
    const confidence = Math.min(...Object.values(gates).map((gate) => gate.confidence));
    if (gates.packaging.probability < 0.5 || gates.legibility.probability < 0.5) {
      return { status: 'retake', reason: 'unreadable', gates };
    }
    if (confidence < minimumBoxConfidence || Math.min(gates.packaging.probability, gates.legibility.probability) < minimumBoxConfidence) {
      return { status: 'retake', reason: 'low_confidence', gates };
    }

    const interactionClient = new GoogleGenAI({ apiKey, vertexai: false, apiVersion: 'v1' });
    let model = primaryModel;
    let label: MedicationBoxLabel | null;
    try {
      primaryWindow.throwIfAborted();
      label = await extractBoxLabel(interactionClient, model, imageBlock, primaryWindow);
    } catch (error) {
      if (signal.aborted || model === fallbackModel) throw error;
      model = fallbackModel;
      label = await extractBoxLabel(interactionClient, model, imageBlock, signal);
    }
    if (!label) return { status: 'retake', reason: 'extraction_unreadable', gates };
    return { status: 'needs_confirmation', label, model, decisionModel, confidence, gates };
  } catch {
    return { status: 'manual', reason: signal.aborted ? 'timeout' : 'provider_error', gates };
  }
}
