import { z } from 'zod';
import { explainExerciseComparison } from '../../../../../../lib/ai/exercise-explanation';
import { availableExerciseProviders, reviewExerciseSample } from '../../../../../../lib/ai/exercise-video';
import { resolveMobilePatientActor } from '../../../../../../lib/auth';
import { exerciseProvider } from '../../../../../../lib/exercise-analysis';
import { exerciseExplanationRequest } from '../../../../../../lib/exercise-explanation';
import { mobileJson } from '../../../../../../lib/mobile-demo';
import { readRequestJson } from '../../../../../../lib/request-body';

const requestSchema = z.union([
  z.strictObject({ provider: exerciseProvider }),
  exerciseExplanationRequest.extend({ provider: z.literal('baidu') }),
]);

export async function POST(request: Request) {
  try {
    const auth = await resolveMobilePatientActor(request);
    if (!auth.ok) return mobileJson({ error: auth.error }, auth.status);
    const body = await readRequestJson(request, 256);
    if (!body.ok) return mobileJson({ error: 'invalid' }, body.status);
    const input = requestSchema.safeParse(body.body);
    if (!input.success) return mobileJson({ error: 'invalid' }, 400);

    const providers = availableExerciseProviders();
    if (input.data.provider === 'baidu') {
      if (providers.length === 0) return mobileJson({ error: 'not_found' }, 404);
      const explanation = await explainExerciseComparison(input.data.comparison);
      return mobileJson(explanation, explanation.status === 'explained' ? 200 : 503);
    }

    // The original Android app uses "openrouter" as its public video action ID.
    const provider = input.data.provider === 'openrouter' ? providers[0] : input.data.provider;
    if (!providers.includes(provider)) return mobileJson({ error: 'not_found' }, 404);
    const observation = await reviewExerciseSample(provider);
    return mobileJson(observation, observation.status === 'observed' ? 200 : 503);
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
