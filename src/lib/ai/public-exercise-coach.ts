import { exerciseCatalog } from '../pose/diagnostics';
import {
  aiCoachPayloadSchema, exerciseCoachAdvice, exerciseCoachRequestSchema,
  type ExerciseCoachRequest, type ExerciseCoachResponse, type PublicCoachSample,
} from './exercise-coach';
import { OpenRouterHttpError, requestOpenRouterCompletion } from './openrouter';
import { configuredAiCompletion, openCodeTextModel, requestOpenCodeCompletion, type AiCompletion } from './opencode';
import { requestFallbackCompletion } from './completion-fallback';

const validityMs = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; result: Promise<ExerciseCoachResponse> }>();

const coachSchema = {
  type: 'object',
  properties: {
    patientAdviceUz: { type: 'string' },
    focusCueUz: { type: 'string' },
    doctorInsightUz: { type: 'string' },
  },
  required: ['patientAdviceUz', 'focusCueUz', 'doctorInsightUz'],
  additionalProperties: false,
};

async function completeCoachAdvice(
  metrics: ExerciseCoachRequest,
  completion: AiCompletion | null,
  promptLead: string,
  timeoutMs: number,
): Promise<ExerciseCoachResponse> {
  const base = exerciseCoachAdvice(metrics);
  if (!completion) return base;
  const prompt = [
    promptLead,
    'Tashxis, dori yoki mashq rejasi tavsiyasini bermang. Faqat berilgan sonlar va texnika xatolariga asoslanib o‘zbekcha qisqa maslahat bering.',
    'JSON: patientAdviceUz (bemor uchun qisqa maslahat), focusCueUz (keyingi urinishda asosiy e’tibor), doctorInsightUz (shifokor uchun qisqa xulosa).',
    JSON.stringify(metrics),
  ].join('\n');
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    if (completion.provider === 'auto') {
      const result = await requestFallbackCompletion(completion.targets, {
        name: 'public_exercise_coach', prompt, schema: coachSchema, maxOutputTokens: 1024,
      }, aiCoachPayloadSchema, signal);
      return result ? { ...base, ...result.data, source: result.provider, model: result.model } : base;
    }
    const { provider, key } = completion;
    const result = provider === 'opencode' ? await requestOpenCodeCompletion(key, {
      model: openCodeTextModel, prompt, schema: coachSchema, maxOutputTokens: 640,
    }, signal) : await requestOpenRouterCompletion(key, {
      model: 'baidu/ernie-5.5-flash-preview:free', max_tokens: 640, reasoning: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'public_exercise_coach',
          strict: true,
          schema: coachSchema,
        },
      },
    }, signal);
    const parsed = aiCoachPayloadSchema.safeParse(JSON.parse(result.content));
    if (parsed.success) return { ...base, ...parsed.data, source: provider, model: result.model };
    console.warn('Exercise coach: invalid advice');
  } catch (error) {
    if (error instanceof OpenRouterHttpError) {
      console.warn('Exercise coach: provider HTTP status', error.status);
    } else {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      console.warn(timedOut ? 'Exercise coach: timeout' : 'Exercise coach: provider response failed');
    }
  }
  return base;
}

async function readPublicAdvice(sample: PublicCoachSample, completion: AiCompletion | null): Promise<ExerciseCoachResponse> {
  const exercise = exerciseCatalog[sample];
  const fixed = exerciseCoachRequestSchema.parse({
    movement: sample, targetAngle: exercise.defaultTargetAngle,
    targetReps: sample === 'chair_stand' ? 2 : 1, validReps: sample === 'chair_stand' ? 2 : 1,
    shallowReps: 0, minAngle: null,
  });
  return completeCoachAdvice(
    fixed,
    completion,
    'Ommaviy sintetik mashq namunasidagi texnika haqida o‘zbekcha qisqa izoh yozing.',
    15_000,
  );
}

export async function personalizedExerciseCoach(input: ExerciseCoachRequest): Promise<ExerciseCoachResponse> {
  const completion = configuredAiCompletion();
  if (!completion) return exerciseCoachAdvice(input);
  const exerciseTitle = exerciseCatalog[input.movement].title;
  return completeCoachAdvice(
    input,
    completion,
    `Bemor "${exerciseTitle}" mashqini bajardi. Natijalarga qarab 1–2 jumlada amaliy texnika maslahati bering.`,
    8_000,
  );
}

export async function publicExerciseCoach(sample: PublicCoachSample) {
  const completion = configuredAiCompletion();
  const flags = {
    auto: process.env.EXERCISE_COACH_AI_DEMO,
    opencode: process.env.EXERCISE_COACH_OPENCODE_DEMO,
    openrouter: process.env.EXERCISE_COACH_OPENROUTER_DEMO,
  };
  const enabled = completion && flags[completion.provider];
  if (!completion || enabled?.trim() !== 'true') return readPublicAdvice(sample, null);
  const cacheKey = `${completion.provider}:${sample}`;
  const retained = cache.get(cacheKey);
  if (retained && retained.expiresAt > Date.now()) return retained.result;
  const entry = { expiresAt: Infinity, result: readPublicAdvice(sample, completion) };
  cache.set(cacheKey, entry);
  const advice = await entry.result;
  entry.expiresAt = Date.now() + (advice.source === 'deterministic_coach' ? 15_000 : validityMs);
  return advice;
}
