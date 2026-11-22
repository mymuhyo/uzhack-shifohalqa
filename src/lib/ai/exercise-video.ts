import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ExerciseAnalysis, type ExerciseProvider, videoObservation } from '../exercise-analysis';
import { OpenRouterHttpError, requestOpenRouterCompletion } from './openrouter';
import { configuredAiCompletion, openCodeVideoModel, requestOpenCodeCompletion, type AiCompletion } from './opencode';
import { requestFallbackCompletion } from './completion-fallback';

const observationPrompt = 'Observe this short public motion demonstration. Count complete standing → seated → standing cycles only. For each complete cycle report one approximate seated timestamp in seconds from the start of the clip, in increasing order. Ignore incomplete cycles. Classify the side view as side_visible when hip, knee and ankle are broadly visible, partly_visible when any joint is obscured, or unclear with an empty array if tracking is unreliable. Report only these observations. Do not infer joint angles, diagnose, or advise the performer.';
const framePrompt = 'This contact sheet contains 9 consecutive frames shown in row-major order from left to right and top to bottom, at seconds 0 through 8. The final 0.8 seconds are unsampled. Use only what is visible. Several seated frames with no standing frame between them represent one seated phase.';
const openRouterModel = () => process.env.OPENROUTER_EXERCISE_MODEL?.trim() || 'nvidia/nemotron-3.5-super-vl:free';
const frameModel = 'nvidia/nemotron-3.5-super-vl:free';

export function availableExerciseProviders(): ExerciseProvider[] {
  const completion = configuredAiCompletion();
  if (completion?.provider === 'auto') {
    return process.env.EXERCISE_AI_DEMO === 'true' ? ['auto'] : [];
  }
  if (completion?.provider === 'opencode') {
    return process.env.EXERCISE_OPENCODE_DEMO === 'true' ? ['opencode'] : [];
  }
  return completion && process.env.EXERCISE_OPENROUTER_DEMO === 'true' && openRouterModel().endsWith(':free')
    ? ['openrouter'] : [];
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

async function observePublicSample(completion: AiCompletion): Promise<ExerciseAnalysis> {
  const signal = AbortSignal.timeout(25_000);
  try {
    if (completion.provider === 'auto') {
      const clip = await readFile(join(process.cwd(), 'public/demo/pose-cdc-lower-body.mp4'));
      const result = await requestFallbackCompletion(completion.targets, {
        name: 'exercise_observation', prompt: observationPrompt, schema, maxOutputTokens: 1536,
        media: { mimeType: 'video/mp4', data: clip.toString('base64') },
        frames: async () => ({
          mimeType: 'image/jpeg',
          data: (await readFile(join(process.cwd(), 'public/demo/pose-cdc-contact-sheet.jpg'))).toString('base64'),
          prompt: `${framePrompt} ${observationPrompt}`,
        }),
      }, videoObservation, signal);
      return result ? {
        status: 'observed', provider: result.provider, model: result.model,
        observation: result.data, input: result.usedFrames ? 'frames' : 'video',
      } : { status: 'unavailable' };
    }
    const { provider, key } = completion;
    if (provider === 'opencode') {
      const clip = await readFile(join(process.cwd(), 'public/demo/pose-cdc-lower-body.mp4'));
      const reply = await requestOpenCodeCompletion(key, {
        model: openCodeVideoModel, prompt: observationPrompt, schema, maxOutputTokens: 1024,
        media: { mimeType: 'video/mp4', data: clip.toString('base64') },
      }, signal);
      const observation = videoObservation.parse(JSON.parse(reply.content));
      return { status: 'observed', model: reply.model, observation, input: 'video' };
    }
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

const observations = new Map<ExerciseProvider, { result: Promise<ExerciseAnalysis>; until: number }>();

/** Only the bundled, edited demo clip or its contact sheet can leave the server. */
export async function reviewExerciseSample(provider: ExerciseProvider): Promise<ExerciseAnalysis> {
  const completion = configuredAiCompletion();
  if (completion?.provider !== provider || !availableExerciseProviders().includes(provider)) return { status: 'unavailable' };
  const cached = observations.get(provider);
  if (cached && cached.until > Date.now()) return cached.result;
  const entry = { result: observePublicSample(completion), until: Infinity };
  observations.set(provider, entry);
  const result = await entry.result;
  entry.until = Date.now() + (result.status === 'observed' ? 300_000 : 15_000);
  return result;
}
