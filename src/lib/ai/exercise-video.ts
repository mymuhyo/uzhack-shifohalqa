import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ExerciseAnalysis, type ExerciseProvider, videoObservation } from '../exercise-analysis';
import { OpenRouterHttpError, requestOpenRouterCompletion } from './openrouter';

const observationPrompt = 'Observe this short public motion demonstration. Count complete standing → seated → standing cycles only. For each complete cycle report one approximate seated timestamp in seconds from the start of the clip, in increasing order. Ignore incomplete cycles. Classify the side view as side_visible when hip, knee and ankle are broadly visible, partly_visible when any joint is obscured, or unclear with an empty array if tracking is unreliable. Report only these observations. Do not infer joint angles, diagnose, or advise the performer.';
const framePrompt = 'This contact sheet contains 9 consecutive frames shown in row-major order from left to right and top to bottom, at seconds 0 through 8. The final 0.8 seconds are unsampled. Use only what is visible. Several seated frames with no standing frame between them represent one seated phase.';
const openRouterModel = () => process.env.OPENROUTER_EXERCISE_MODEL?.trim() || 'nvidia/nemotron-3.5-super-vl:free';
const frameModel = 'nvidia/nemotron-3.5-super-vl:free';

export function availableExerciseProviders(): ExerciseProvider[] {
  return process.env.EXERCISE_OPENROUTER_DEMO === 'true' &&
    process.env.OPENROUTER_API_KEY?.trim() && openRouterModel().endsWith(':free') ? ['openrouter'] : [];
}

const schema = {
  type: 'object',
  properties: {
    view: { type: 'string', enum: ['side_visible', 'partly_visible', 'unclear'] },
    seatedAtSeconds: { type: 'array', items: { type: 'number' }, maxItems: 8 },
  },
  required: ['view', 'seatedAtSeconds'],
  additionalProperties: false,
};

async function observe(key: string, model: string, input: 'video' | 'frames', signal: AbortSignal): Promise<ExerciseAnalysis> {
  const usesJsonMode = input === 'frames' || model === 'google/gemma-4-26b-a4b-it:free' || model === 'google/gemma-4-31b-it:free';
  const prompt = [
    input === 'frames' ? framePrompt : '',
    observationPrompt,
    usesJsonMode ? `Return a JSON object matching this schema: ${JSON.stringify(schema)}` : '',
  ].filter(Boolean).join(' ');
  const asset = input === 'video' ? 'pose-cdc-lower-body.mp4' : 'pose-cdc-contact-sheet.jpg';
  const bytes = await readFile(join(process.cwd(), 'public/demo', asset));
  const media = input === 'video'
    ? { type: 'video_url', video_url: { url: `data:video/mp4;base64,${bytes.toString('base64')}` } }
    : { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${bytes.toString('base64')}` } };
  const reply = await requestOpenRouterCompletion(key, {
    model,
    max_tokens: 512,
    ...(input === 'frames' ? { reasoning: { enabled: false } } : {}),
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, media] }],
    response_format: usesJsonMode
      ? { type: 'json_object' }
      : { type: 'json_schema', json_schema: { name: 'exercise_observation', strict: true, schema } },
  }, signal);
  const observation = videoObservation.parse(JSON.parse(reply.content));
  return { status: 'observed', model: reply.model, observation, input };
}

async function observePublicSample(): Promise<ExerciseAnalysis> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return { status: 'unavailable' };
  const signal = AbortSignal.timeout(25_000);
  try {
    try {
      return await observe(key, openRouterModel(), 'video', signal);
    } catch (error) {
      if (!(error instanceof OpenRouterHttpError) || error.status !== 402 || signal.aborted) throw error;
    }
    return await observe(key, frameModel, 'frames', signal);
  } catch {
    return { status: 'unavailable' };
  }
}

let inFlight: Promise<ExerciseAnalysis> | undefined;
let cached: { value: ExerciseAnalysis; until: number } | undefined;

/** Only the bundled, edited demo clip or its contact sheet can leave the server. */
export async function reviewExerciseSample(provider: ExerciseProvider): Promise<ExerciseAnalysis> {
  if (!availableExerciseProviders().includes(provider)) return { status: 'unavailable' };
  if (cached && cached.until > Date.now()) return cached.value;
  inFlight ??= observePublicSample().then(value => {
    cached = { value, until: Date.now() + (value.status === 'observed' ? 300_000 : 15_000) };
    return value;
  }).finally(() => { inFlight = undefined; });
  return inFlight;
}
