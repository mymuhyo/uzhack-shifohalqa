import { z } from 'zod';
import { medicationBoxLabelSchema } from './ai/medication-box';
import { dorimosSampleIds } from './dorimos-samples';

const modelName = z.string().min(1).max(128);
const comparison = z.enum(['match', 'name_mismatch', 'strength_mismatch', 'name_and_strength_mismatch']);

export const boxReading = z.object({
  label: medicationBoxLabelSchema,
  model: modelName,
  decisionModel: modelName,
  confidence: z.number().min(0.80).max(1),
});

export const medicationBoxEvidenceSchema = z.union([
  z.strictObject({ kind: z.literal('medication_box'), result: z.literal('manual') }),
  z.strictObject({
    kind: z.literal('medication_box'),
    result: comparison,
    sampleId: z.enum(dorimosSampleIds),
    expected: medicationBoxLabelSchema,
    reading: boxReading,
  }),
]);

export type MedicationBoxEvidence = z.infer<typeof medicationBoxEvidenceSchema>;

export const dorimosInput = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('scan'), taskId: z.uuid(), sampleId: z.enum(dorimosSampleIds) }),
  z.strictObject({ action: z.literal('confirm'), taskId: z.uuid(), token: z.string().max(2300) }),
  z.strictObject({ action: z.literal('manual'), taskId: z.uuid() }),
]);

export const dorimosResponse = z.discriminatedUnion('status', [
  z.object({ status: z.literal('needs_confirmation'), reading: boxReading, token: z.string() }),
  z.object({ status: z.literal('retake') }),
  z.object({ status: z.literal('manual') }),
  z.object({ status: z.literal('saved') }),
  z.object({ status: z.literal('already_saved') }),
  z.object({ status: z.literal('expired') }),
  z.object({ status: z.literal('invalid') }),
  z.object({ status: z.literal('not_found') }),
]);

export function formatBoxLabel(label: z.infer<typeof medicationBoxLabelSchema>): string {
  const units = { mg: 'mg', mcg: 'mkg', g: 'g', iu: 'IU' };
  return `${label.drugName} · ${label.strength} ${units[label.unit]}`;
}
