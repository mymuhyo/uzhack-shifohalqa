import {
  type ExerciseComparison, type ExerciseExplanation, exerciseExplanationText,
} from '../exercise-explanation';
import { requestOpenRouterCompletion } from './openrouter';

const model = 'baidu/ernie-5.5-flash-preview:free';
const observations: Record<ExerciseComparison, string> = {
  pose_only: 'MediaPipe o‘lchovi bor. Mustaqil video kuzatuvi mavjud emas, shuning uchun taqqoslash yo‘q.',
  video_unclear: 'MediaPipe o‘lchovi bor. Video modeli harakatni ishonchli ajrata olmadi, shuning uchun taqqoslash yakunlanmadi.',
  no_cycles: 'MediaPipe va video modeli hech bir to‘liq siklni topmadi. Taqqoslanadigan o‘tirish vaqtlari yo‘q.',
  count_differs: 'MediaPipe va video modeli topgan to‘liq sikllar soni farq qildi. Taqqoslash qaysi usul to‘g‘ri sanaganini belgilamaydi.',
  time_differs: 'MediaPipe va video modeli topgan to‘liq sikllar soni teng, lekin ayrim o‘tirish vaqtlari MediaPipe sikllari oralig‘iga tushmadi.',
  match: 'MediaPipe va video modeli topgan to‘liq sikllar soni teng. O‘tirish vaqtlari MediaPipe topgan sikllar oralig‘iga tushdi.',
};

async function requestExplanation(key: string, comparison: ExerciseComparison): Promise<ExerciseExplanation> {
  try {
    const { model: routedModel, content } = await requestOpenRouterCompletion(key, {
      model,
      max_tokens: 512,
      reasoning: { effort: 'low' },
      messages: [{
        role: 'user',
        content: `Bu ommaviy CDC mashq klipi bo‘yicha demo natijasi. Quyidagi kuzatuvni sodda, lotin yozuvidagi o‘zbek tilida bir yoki ikki qisqa jumlada ifodalang. Faqat berilgan faktlarni yozing. Son, sabab, tashxis yoki maslahat qo‘shmang. Kuzatuv: ${observations[comparison]}`,
      }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'exercise_explanation',
          strict: true,
          schema: {
            type: 'object',
            properties: { summary: { type: 'string' } },
            required: ['summary'],
            additionalProperties: false,
          },
        },
      },
    }, AbortSignal.timeout(15_000));
    const { summary } = exerciseExplanationText.parse(JSON.parse(content));
    return { status: 'explained', model: routedModel, summary };
  } catch {
    return { status: 'unavailable' };
  }
}

const explanations = new Map<ExerciseComparison, { result: Promise<ExerciseExplanation>; expiresAt: number }>();

export async function explainExerciseComparison(comparison: ExerciseComparison): Promise<ExerciseExplanation> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return { status: 'unavailable' };
  const cached = explanations.get(comparison);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const entry = { result: requestExplanation(key, comparison), expiresAt: Infinity };
  explanations.set(comparison, entry);
  const result = await entry.result;
  entry.expiresAt = Date.now() + (result.status === 'explained' ? 300_000 : 15_000);
  return result;
}
