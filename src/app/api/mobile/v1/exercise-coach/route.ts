import { publicCoachRequestSchema } from '@/lib/ai/exercise-coach';
import { publicExerciseCoach } from '@/lib/ai/public-exercise-coach';
import { androidPatient, isAndroidDemoEnabled, mobileJson, readMobileBody } from '@/lib/mobile-demo';

export async function POST(request: Request) {
  if (!isAndroidDemoEnabled()) return mobileJson({ error: 'not_found' }, 404);
  try {
    if (!await androidPatient(request)) return mobileJson({ error: 'unauthorized' }, 401);
    const input = publicCoachRequestSchema.safeParse(await readMobileBody(request));
    if (!input.success) return mobileJson({ error: 'invalid' }, 400);
    return mobileJson(await publicExerciseCoach(input.data.sample));
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
