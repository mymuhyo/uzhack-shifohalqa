import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compareMedicationBox, readMedicationBox } from '../src/lib/ai/dorimos';
import { dorimosPracticePrescription, dorimosSamples } from '../src/lib/dorimos-samples';

if (!process.env.GEMINI_API_KEY?.trim()) throw new Error('Set GEMINI_API_KEY for the live DoriMos benchmark.');

for (const sample of Object.values(dorimosSamples)) {
  const image = await readFile(join(process.cwd(), 'public', sample.imagePath));
  const started = performance.now();
  const result = await readMedicationBox({ image, mimeType: 'image/png', expected: dorimosPracticePrescription });
  const elapsedMs = Math.round(performance.now() - started);
  const { expected } = sample;
  const comparison = result.status === 'needs_confirmation'
    ? compareMedicationBox(dorimosPracticePrescription, result.label) : null;
  const correct = expected.status === 'readable'
    ? result.status === 'needs_confirmation' && compareMedicationBox({
      drugName: expected.drugName, strength: expected.strength, unit: expected.unit,
    }, result.label) === 'match'
    : result.status === 'retake';
  console.log(JSON.stringify({ id: sample.id, expected, result, comparison, correct, elapsedMs }));
}
