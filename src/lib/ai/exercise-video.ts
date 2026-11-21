import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GoogleGenAI } from '@google/genai';
import { type ExerciseAnalysis, type ExerciseProvider, exerciseProvider, videoObservation } from '../exercise-analysis';
import { exerciseSample } from '../exercise-sample';
import { requestOpenRouterCompletion } from './openrouter';

const observationPrompt = 'Observe this short public motion demonstration. Count complete standing → seated → standing cycles only. For each complete cycle report one approximate seated timestamp in seconds from the start of the clip, in increasing order. Ignore incomplete cycles. Classify the side view as side_visible when hip, knee and ankle are broadly visible, partly_visible when any joint is obscured, or unclear with an empty array if tracking is unreliable. Report only these observations. Do not infer joint angles, diagnose, or advise the performer.';
const openRouterModel = () => process.env.OPENROUTER_EXERCISE_MODEL?.trim() || 'nvidia/nemotron-3.5-super-vl:free';

function isProviderEnabled(provider: ExerciseProvider) {
  if (provider === 'gemini') {
    return process.env.EXERCISE_GEMINI_DEMO === 'true' && Boolean(process.env.GEMINI_API_KEY?.trim());
  }
  return process.env.EXERCISE_OPENROUTER_DEMO === 'true' &&
    Boolean(process.env.OPENROUTER_API_KEY?.trim()) && openRouterModel().endsWith(':free');
}

export function availableExerciseProviders() {
  return exerciseProvider.options.filter(isProviderEnabled);
}

const videoSchema = {
  type: 'object',
  properties: {
    view: { type: 'string', enum: ['side_visible', 'partly_visible', 'unclear'] },
    seatedAtSeconds: { type: 'array', items: { type: 'number' }, maxItems: 8 },
  },
  required: ['view', 'seatedAtSeconds'],
};

async function observeWithGemini(): Promise<ExerciseAnalysis> {
  const unavailable = { status: 'unavailable' } as const;
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return unavailable;
  const model = process.env.GEMINI_EXERCISE_MODEL?.trim() || 'gemini-3.5-flash-lite';
  const fallbackModel = process.env.GEMINI_EXERCISE_FALLBACK_MODEL?.trim() || 'gemini-3.1-flash-lite';
  const ai = new GoogleGenAI({ apiKey, apiVersion: 'v1', vertexai: false });
  try {
    const video = (await readFile(join(process.cwd(), 'public', exerciseSample.path))).toString('base64');
    const observe = async (selectedModel: string, signal: AbortSignal): Promise<ExerciseAnalysis | null> => {
      const result = await ai.interactions.create({
        model: selectedModel,
        store: false,
        automatic_continuation: false,
        generation_config: { thinking_level: 'low' },
        input: [{ type: 'user_input', content: [
          { type: 'text', text: observationPrompt },
          { type: 'video', data: video, mime_type: 'video/webm' },
        ] }],
        response_format: { type: 'text', mime_type: 'application/json', schema: videoSchema },
      }, { signal, maxRetries: 0 });
      if (result.status !== 'completed') return unavailable;
      if (!result.output_text) return null;
      try {
        const observation = videoObservation.parse(JSON.parse(result.output_text));
        return { status: 'observed', model: selectedModel, observation };
      } catch {
        // A completed call without a valid observation can be retried on the fallback model.
        return null;
      }
    };
    const deadline = AbortSignal.timeout(25_000);
    if (model === fallbackModel) return (await observe(model, deadline)) ?? unavailable;
    const primaryWindow = AbortSignal.any([deadline, AbortSignal.timeout(8_000)]);
    try {
      const primary = await observe(model, primaryWindow);
      if (primary) return primary;
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? error.status : null;
      const retryable = typeof status === 'number' && (status === 408 || status === 429 || status >= 500);
      if (!primaryWindow.aborted && !retryable) return unavailable;
    }
    if (deadline.aborted) return unavailable;
    return (await observe(fallbackModel, deadline)) ?? unavailable;
  } catch {
    return unavailable;
  }
}

async function observeWithOpenRouter(): Promise<ExerciseAnalysis> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return { status: 'unavailable' };
  const model = openRouterModel();
  // These Gemma endpoints support JSON mode without enforcing a schema.
  const usesJsonMode = model === 'google/gemma-4-26b-a4b-it:free' || model === 'google/gemma-4-31b-it:free';
  const schema = { ...videoSchema, additionalProperties: false };
  const prompt = usesJsonMode
    ? `${observationPrompt} Return a JSON object matching this schema: ${JSON.stringify(schema)}`
    : observationPrompt;
  const responseFormat = usesJsonMode
    ? { type: 'json_object' }
    : { type: 'json_schema', json_schema: { name: 'exercise_observation', strict: true, schema } };
  try {
    const clip = await readFile(join(process.cwd(), 'public/demo/pose-cdc-lower-body.mp4'));
    const { model: routedModel, content } = await requestOpenRouterCompletion(key, {
      model,
      max_tokens: 512,
      messages: [{ role: 'user', content: [
        { type: 'text', text: prompt },
        { type: 'video_url', video_url: { url: `data:video/mp4;base64,${clip.toString('base64')}` } },
      ] }],
      response_format: responseFormat,
    }, AbortSignal.timeout(25_000));
    const observation = videoObservation.parse(JSON.parse(content));
    return { status: 'observed', model: routedModel, observation };
  } catch {
    return { status: 'unavailable' };
  }
}

const inFlight = new Map<ExerciseProvider, Promise<ExerciseAnalysis>>();
const cache = new Map<ExerciseProvider, { value: ExerciseAnalysis; until: number }>();

/** Only bundled samples are sent. Share one concurrent call per provider and process. */
export async function reviewExerciseSample(provider: ExerciseProvider): Promise<ExerciseAnalysis> {
  if (!isProviderEnabled(provider)) return { status: 'unavailable' };
  const cached = cache.get(provider);
  if (cached && cached.until > Date.now()) return cached.value;
  const pending = inFlight.get(provider);
  if (pending) return pending;
  const observer = provider === 'gemini' ? observeWithGemini : observeWithOpenRouter;
  const request = observer().then(value => {
    cache.set(provider, { value, until: Date.now() + (value.status === 'observed' ? 300_000 : 15_000) });
    return value;
  }).finally(() => { inFlight.delete(provider); });
  inFlight.set(provider, request);
  return request;
}
