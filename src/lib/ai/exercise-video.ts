import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { type ExerciseAnalysis, videoObservation } from '../exercise-analysis';
import { exerciseSample } from '../exercise-sample';

export function isExerciseAnalysisEnabled() {
  return process.env.EXERCISE_GEMINI_DEMO === 'true' && Boolean(process.env.GEMINI_API_KEY?.trim());
}

const videoSchema = {
  type: 'object',
  properties: {
    view: { type: 'string', enum: ['side_visible', 'partly_visible', 'unclear'] },
    seatedAtSeconds: { type: 'array', items: { type: 'number' }, maxItems: 8 },
  },
  required: ['view', 'seatedAtSeconds'],
};

async function observeSample(): Promise<ExerciseAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return { status: 'unavailable' };
  const model = process.env.GEMINI_EXERCISE_MODEL?.trim() || 'gemini-3.5-flash-lite';
  const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1', vertexai: false });
  try {
    const clip = await readFile(join(process.cwd(), 'public', exerciseSample.path));
    const signal = AbortSignal.timeout(25_000);
    const result = await ai.interactions.create({
      model,
      store: false,
      automatic_continuation: false,
      generation_config: { thinking_level: 'low' },
      input: [{
        type: 'user_input',
        content: [{
          type: 'text',
          text: 'Observe this short public motion demonstration. Count complete standing → seated → standing cycles only. For each complete cycle report one approximate seated timestamp in seconds from the start of the clip, in increasing order. Ignore incomplete cycles. Classify the side view as side_visible when hip, knee and ankle are broadly visible, partly_visible when any joint is obscured, or unclear with an empty array if tracking is unreliable. Report only these observations. Do not infer joint angles, diagnose, or advise the performer.',
        }, { type: 'video', data: clip.toString('base64'), mime_type: 'video/webm' }],
      }],
      response_format: { type: 'text', mime_type: 'application/json', schema: videoSchema },
    }, { signal, maxRetries: 0 });
    if (result.status !== 'completed' || !result.output_text) return { status: 'unavailable' };
    const observation = videoObservation.parse(JSON.parse(result.output_text));
    return { status: 'observed', model, observation };
  } catch {
    return { status: 'unavailable' };
  }
}

let inFlight: Promise<ExerciseAnalysis> | undefined;
let cached: { value: ExerciseAnalysis; until: number } | undefined;

/** All callers analyze the same bundled clip. Share one provider call per process. */
export async function reviewExerciseSample(): Promise<ExerciseAnalysis> {
  if (!isExerciseAnalysisEnabled()) return { status: 'unavailable' };
  if (cached && cached.until > Date.now()) return cached.value;
  inFlight ??= observeSample().then(value => {
    cached = { value, until: Date.now() + (value.status === 'observed' ? 300_000 : 15_000) };
    return value;
  }).finally(() => { inFlight = undefined; });
  return inFlight;
}
