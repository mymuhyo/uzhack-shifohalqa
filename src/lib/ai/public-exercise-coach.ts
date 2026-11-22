import { exerciseCatalog } from '../pose/diagnostics';
import {
  aiCoachPayloadSchema, exerciseCoachAdvice, exerciseCoachRequestSchema,
  type ExerciseCoachResponse, type PublicCoachSample,
} from './exercise-coach';
import { OpenRouterHttpError, requestOpenRouterCompletion } from './openrouter';

const validityMs = 5 * 60 * 1000;
const cache = new Map<PublicCoachSample, { expiresAt: number; result: Promise<ExerciseCoachResponse> }>();

async function readPublicAdvice(sample: PublicCoachSample, key: string): Promise<ExerciseCoachResponse> {
  const exercise = exerciseCatalog[sample];
  const fixed = exerciseCoachRequestSchema.parse({
    movement: sample, targetAngle: exercise.defaultTargetAngle,
    targetReps: sample === 'chair_stand' ? 2 : 1, validReps: sample === 'chair_stand' ? 2 : 1,
    shallowReps: 0, minAngle: null,
  });
  const base = exerciseCoachAdvice(fixed);
  if (!key) return base;
  try {
    const result = await requestOpenRouterCompletion(key, {
      model: 'baidu/ernie-5.5-flash-preview:free', max_tokens: 640, reasoning: { effort: 'low' },
      messages: [{ role: 'user', content: [
        'Ommaviy sintetik mashq namunasidagi texnika haqida o‘zbekcha qisqa izoh yozing.',
        'Tashxis, dori yoki mashq rejasi tavsiyasini bermang. Berilgan ko‘rsatkichlardan tashqariga chiqmang.',
        'JSON: patientAdviceUz (texnika izohi), focusCueUz (kadrga oid ko‘rsatma), doctorInsightUz (namuna xulosasi).',
        JSON.stringify(fixed),
      ].join('\n') }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'public_exercise_coach',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              patientAdviceUz: { type: 'string' },
              focusCueUz: { type: 'string' },
              doctorInsightUz: { type: 'string' },
            },
            required: ['patientAdviceUz', 'focusCueUz', 'doctorInsightUz'],
            additionalProperties: false,
          },
        },
      },
    }, AbortSignal.timeout(15_000));
    const parsed = aiCoachPayloadSchema.safeParse(JSON.parse(result.content));
    if (parsed.success) return { ...base, ...parsed.data, source: 'openrouter', model: result.model };
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
  const now = Date.now();
  const retained = cache.get(sample);
  if (retained && retained.expiresAt > now) return retained.result;
  if (process.env.EXERCISE_COACH_OPENROUTER_DEMO?.trim() !== 'true') return readPublicAdvice(sample, '');
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) {
    console.warn('Public exercise coach: OpenRouter key is missing');
    return readPublicAdvice(sample, '');
  }
  const entry = { expiresAt: Infinity, result: readPublicAdvice(sample, key) };
  cache.set(sample, entry);
  const advice = await entry.result;
  entry.expiresAt = Date.now() + (advice.source === 'openrouter' ? validityMs : 15_000);
  return advice;
}
