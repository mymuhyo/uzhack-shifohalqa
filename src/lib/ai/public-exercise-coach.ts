import { exerciseCatalog } from '../pose/diagnostics';
import {
  aiCoachPayloadSchema, exerciseCoachAdvice, exerciseCoachRequestSchema,
  type ExerciseCoachResponse, type PublicCoachSample,
} from './exercise-coach';
import { requestOpenRouterCompletion } from './openrouter';

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
      model: 'baidu/ernie-5.5-flash-preview:free', max_tokens: 400, reasoning: { effort: 'low' },
      messages: [{ role: 'user', content: [
        'Ommaviy sintetik mashq namunasidagi texnika haqida o‘zbekcha qisqa izoh yozing.',
        'Tashxis, dori yoki mashq rejasi tavsiyasini bermang. Berilgan ko‘rsatkichlardan tashqariga chiqmang.',
        'JSON: patientAdviceUz (texnika izohi), focusCueUz (kadrga oid ko‘rsatma), doctorInsightUz (namuna xulosasi).',
        JSON.stringify(fixed),
      ].join('\n') }],
      response_format: { type: 'json_object' },
    }, AbortSignal.timeout(8_000));
    const parsed = aiCoachPayloadSchema.safeParse(JSON.parse(result.content));
    if (parsed.success) return { ...base, ...parsed.data, source: 'openrouter', model: result.model };
  } catch {
    // The same public sample still has deterministic feedback.
  }
  return base;
}

export function publicExerciseCoach(sample: PublicCoachSample) {
  const now = Date.now();
  const retained = cache.get(sample);
  if (retained && retained.expiresAt > now) return retained.result;
  const key = process.env.EXERCISE_COACH_OPENROUTER_DEMO === 'true' ? process.env.OPENROUTER_API_KEY?.trim() ?? '' : '';
  if (!key) return readPublicAdvice(sample, '');
  const result = readPublicAdvice(sample, key);
  cache.set(sample, { expiresAt: now + validityMs, result });
  return result;
}
