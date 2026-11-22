import { z } from 'zod';

export const minimumBoxConfidence = 0.80;

export const medicationBoxLabelSchema = z.strictObject({
  drugName: z.string().trim().min(1).max(120).regex(/\p{L}/u),
  strength: z.number().positive().max(1_000_000),
  unit: z.enum(['mg', 'mcg', 'g', 'iu']),
});

export const medicationBoxDoseBucketSchema = z.enum(['2.5mg', '5mg', '10mg', '20mg', '50mg', '100mg', 'other']);

const probability = z.number().min(0).max(1);
const binaryGate = z.strictObject({ probability, confidence: probability });
export const medicationBoxGatesSchema = z.strictObject({
  packaging: binaryGate,
  legibility: binaryGate,
  prescribedDrug: binaryGate,
  dose: z.strictObject({ bucket: medicationBoxDoseBucketSchema, confidence: probability }),
});

export const medicationBoxReadingSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('needs_confirmation'),
    label: medicationBoxLabelSchema,
    model: z.string().trim().min(1).max(120),
    decisionModel: z.string().trim().min(1).max(120),
    confidence: z.number().min(minimumBoxConfidence).max(1),
    gates: medicationBoxGatesSchema,
  }).refine(({ gates, confidence }) => (
    gates.packaging.probability >= minimumBoxConfidence &&
    gates.legibility.probability >= minimumBoxConfidence &&
    confidence <= Math.min(...Object.values(gates).map((gate) => gate.confidence))
  )),
  z.strictObject({
    status: z.literal('retake'),
    reason: z.enum(['unreadable', 'low_confidence', 'extraction_unreadable']),
    gates: medicationBoxGatesSchema.optional(),
  }),
  z.strictObject({
    status: z.literal('manual'),
    reason: z.enum(['missing_key', 'timeout', 'provider_error']),
    gates: medicationBoxGatesSchema.optional(),
  }),
]);

export type MedicationBoxLabel = z.infer<typeof medicationBoxLabelSchema>;
export type MedicationBoxReading = z.infer<typeof medicationBoxReadingSchema>;
export type MedicationBoxComparison = 'match' | 'name_mismatch' | 'strength_mismatch' | 'name_and_strength_mismatch';

function normalizeDrugName(value: string) {
  return value.normalize('NFKC').replace(/[‘’ʻʼ]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
}

const massInMicrograms = { g: 1_000_000, mg: 1_000, mcg: 1 } as const;

function strengthsMatch(expected: MedicationBoxLabel, detected: MedicationBoxLabel) {
  if (expected.unit === 'iu' || detected.unit === 'iu') {
    return expected.unit === detected.unit && expected.strength === detected.strength;
  }
  const left = expected.strength * massInMicrograms[expected.unit];
  const right = detected.strength * massInMicrograms[detected.unit];
  return Math.abs(left - right) <= Number.EPSILON * Math.max(left, right);
}

/** Compare transcribed package labels after confirmation. No dosage or equivalence advice. */
export function compareMedicationBox(expected: MedicationBoxLabel, detected: MedicationBoxLabel): MedicationBoxComparison {
  const wanted = medicationBoxLabelSchema.parse(expected);
  const observed = medicationBoxLabelSchema.parse(detected);
  const sameName = normalizeDrugName(wanted.drugName) === normalizeDrugName(observed.drugName);
  const sameStrength = strengthsMatch(wanted, observed);
  if (sameName && sameStrength) return 'match';
  if (sameName) return 'strength_mismatch';
  return sameStrength ? 'name_mismatch' : 'name_and_strength_mismatch';
}
