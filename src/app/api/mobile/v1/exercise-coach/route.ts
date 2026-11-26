import { exerciseCoachInputSchema } from '../../../../../lib/ai/exercise-coach';
import { readVercelOidcTokenFromRequest } from '../../../../../lib/ai/provider-config';
import { personalizedExerciseCoach, publicExerciseCoach } from '../../../../../lib/ai/public-exercise-coach';
import { resolveMobilePatientActor } from '../../../../../lib/auth';
import { mobileJson, readMobileBody } from '../../../../../lib/mobile-demo';

export async function POST(request: Request) {
  try {
    const auth = await resolveMobilePatientActor(request);
    if (!auth.ok) return mobileJson({ error: auth.error }, auth.status);
    const raw = await readMobileBody(request);
    if (!raw.ok) return mobileJson({ error: raw.status === 413 ? 'too_large' : 'invalid' }, raw.status === 413 ? 413 : 400);
    const input = exerciseCoachInputSchema.safeParse(raw.body);
    if (!input.success) return mobileJson({ error: 'invalid' }, 400);
    const oidcToken = readVercelOidcTokenFromRequest(request);
    const advice = 'sample' in input.data
      ? await publicExerciseCoach(input.data.sample, oidcToken)
      : await personalizedExerciseCoach(input.data, oidcToken);
    return mobileJson(advice);
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
