import {
  type ExerciseComparison, type ExerciseExplanation, exerciseExplanationText,
} from '../exercise-explanation';
import { requestOpenRouterCompletion } from './openrouter';
import { configuredAiCompletion, openCodeTextModel, requestOpenCodeCompletion, type AiCompletion } from './opencode';
import { requestFallbackCompletion } from './completion-fallback';

const model = 'baidu/ernie-5.5-flash-preview:free';
const observations: Record<ExerciseComparison, string> = {
  pose_only: 'MediaPipe o‘lchovi bor. Mustaqil video kuzatuvi mavjud emas, shuning uchun taqqoslash yo‘q.',
  video_unclear: 'MediaPipe o‘lchovi bor. Video modeli harakatni ishonchli ajrata olmadi, shuning uchun taqqoslash yakunlanmadi.',
  no_cycles: 'MediaPipe va video modeli hech bir to‘liq siklni topmadi. Taqqoslanadigan o‘tirish vaqtlari yo‘q.',
  count_differs: 'MediaPipe va video modeli topgan to‘liq sikllar soni farq qildi. Taqqoslash qaysi usul to‘g‘ri sanaganini belgilamaydi.',
  time_differs: 'MediaPipe va video modeli topgan to‘liq sikllar soni teng, lekin ayrim o‘tirish vaqtlari MediaPipe sikllari oralig‘iga tushmadi.',
  match: 'MediaPipe va video modeli topgan to‘liq sikllar soni teng. O‘tirish vaqtlari MediaPipe topgan sikllar oralig‘iga tushdi.',
};

async function requestExplanation(
  completion: AiCompletion,
  comparison: ExerciseComparison,
): Promise<ExerciseExplanation> {
  const prompt = `Bu ommaviy CDC mashq klipi bo‘yicha demo natijasi. Quyidagi kuzatuvni sodda, lotin yozuvidagi o‘zbek tilida bir yoki ikki qisqa jumlada ifodalang. Faqat berilgan faktlarni yozing. Son, sabab, tashxis yoki maslahat qo‘shmang. Kuzatuv: ${observations[comparison]}`;
  const schema = {
    type: 'object',
    properties: { summary: { type: 'string' } },
    required: ['summary'],
    additionalProperties: false,
  };
  const signal = AbortSignal.timeout(15_000);
  try {
    if (completion.provider === 'auto') {
      const result = await requestFallbackCompletion(completion.targets, {
        name: 'exercise_explanation', prompt, schema, maxOutputTokens: 1024,
      }, exerciseExplanationText, signal);
      return result ? {
        status: 'explained', provider: result.provider, model: result.model, summary: result.data.summary,
      } : { status: 'unavailable' };
    }
    const { provider, key } = completion;
    const { model: routedModel, content } = provider === 'opencode' ? await requestOpenCodeCompletion(key, {
      model: openCodeTextModel, prompt, schema, maxOutputTokens: 512,
    }, signal) : await requestOpenRouterCompletion(key, {
      model,
      max_tokens: 512,
      reasoning: { effort: 'low' },
      messages: [{ role: 'user', content: prompt }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'exercise_explanation',
          strict: true,
          schema,
        },
      },
    }, signal);
    const { summary } = exerciseExplanationText.parse(JSON.parse(content));
    return { status: 'explained', model: routedModel, summary };
  } catch {
    return { status: 'unavailable' };
  }
}

const explanations = new Map<string, { result: Promise<ExerciseExplanation>; expiresAt: number }>();

export async function explainExerciseComparison(comparison: ExerciseComparison): Promise<ExerciseExplanation> {
  const completion = configuredAiCompletion();
  if (!completion) return { status: 'unavailable' };
  const cacheKey = `${completion.provider}:${comparison}`;
  const cached = explanations.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const entry = { result: requestExplanation(completion, comparison), expiresAt: Infinity };
  explanations.set(cacheKey, entry);
  const result = await entry.result;
  entry.expiresAt = Date.now() + (result.status === 'explained' ? 300_000 : 15_000);
  return result;
}
