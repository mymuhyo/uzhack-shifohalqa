import { exerciseCatalog } from '../pose/diagnostics';
import {
  aiCoachPayloadSchema, exerciseCoachAdvice, exerciseCoachRequestSchema,
  type ExerciseCoachResponse, type PublicCoachSample,
} from './exercise-coach';
import { OpenRouterHttpError, requestOpenRouterCompletion } from './openrouter';
import { configuredAiCompletion, openCodeTextModel, requestOpenCodeCompletion, type AiCompletion } from './opencode';

const validityMs = 5 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; result: Promise<ExerciseCoachResponse> }>();

async function readPublicAdvice(sample: PublicCoachSample, completion: AiCompletion | null): Promise<ExerciseCoachResponse> {
  const exercise = exerciseCatalog[sample];
  const fixed = exerciseCoachRequestSchema.parse({
    movement: sample, targetAngle: exercise.defaultTargetAngle,
    targetReps: sample === 'chair_stand' ? 2 : 1, validReps: sample === 'chair_stand' ? 2 : 1,
    shallowReps: 0, minAngle: null,
  });
  const base = exerciseCoachAdvice(fixed);
  if (!completion) return base;
  const { provider, key } = completion;
  const prompt = [
    'Ommaviy sintetik mashq namunasidagi texnika haqida o‘zbekcha qisqa izoh yozing.',
    'Tashxis, dori yoki mashq rejasi tavsiyasini bermang. Berilgan ko‘rsatkichlardan tashqariga chiqmang.',
    'JSON: patientAdviceUz (texnika izohi), focusCueUz (kadrga oid ko‘rsatma), doctorInsightUz (namuna xulosasi).',
    JSON.stringify(fixed),
  ].join('\n');
  const schema = {
    type: 'object',
    properties: {
      patientAdviceUz: { type: 'string' },
      focusCueUz: { type: 'string' },
      doctorInsightUz: { type: 'string' },
    },
    required: ['patientAdviceUz', 'focusCueUz', 'doctorInsightUz'],
    additionalProperties: false,
  };
  const signal = AbortSignal.timeout(15_000);
  try {
    const result = provider === 'opencode' ? await requestOpenCodeCompletion(key, {
      model: openCodeTextModel, prompt, schema, maxOutputTokens: 640,
    }, signal) : await requestOpenRouterCompletion(key, {
      model: 'baidu/ernie-5.5-flash-preview:free', max_tokens: 640, reasoning: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'public_exercise_coach',
          strict: true,
          schema,
        },
      },
    }, signal);
    const parsed = aiCoachPayloadSchema.safeParse(JSON.parse(result.content));
    if (parsed.success) return { ...base, ...parsed.data, source: provider, model: result.model };
    console.warn('Public exercise coach: invalid advice');
  } catch (error) {
    if (error instanceof OpenRouterHttpError) {
      console.warn('Public exercise coach: provider HTTP status', error.status);
    } else {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      console.warn(timedOut ? 'Public exercise coach: timeout' : 'Public exercise coach: provider response failed');
    }
  }
  return base;
}

export async function publicExerciseCoach(sample: PublicCoachSample) {
  const completion = configuredAiCompletion();
  const enabled = completion?.provider === 'opencode'
    ? process.env.EXERCISE_COACH_OPENCODE_DEMO : process.env.EXERCISE_COACH_OPENROUTER_DEMO;
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
