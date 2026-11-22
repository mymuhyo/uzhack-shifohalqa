import { publicCoachRequestSchema } from '@/lib/ai/exercise-coach';
import { publicExerciseCoach } from '@/lib/ai/public-exercise-coach';
import { androidPatient, isAndroidDemoEnabled, mobileJson, readMobileBody } from '@/lib/mobile-demo';

export async function POST(request: Request) {
  if (!isAndroidDemoEnabled()) return mobileJson({ error: 'not_found' }, 404);
  try {
    if (!await androidPatient(request)) return mobileJson({ error: 'unauthorized' }, 401);
    const raw = await readMobileBody(request);
    if (!raw.ok) return mobileJson({ error: raw.status === 413 ? 'too_large' : 'invalid' }, raw.status === 413 ? 413 : 400);
    const input = publicCoachRequestSchema.safeParse(raw.body);
    if (!input.success) return mobileJson({ error: 'invalid' }, 400);
    return mobileJson(await publicExerciseCoach(input.data.sample));
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
