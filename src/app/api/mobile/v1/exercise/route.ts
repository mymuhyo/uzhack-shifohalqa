import { mobileExerciseInput } from '@/lib/exercise-inputs';
import { exerciseDate, readExerciseAttempts, readExercisePlan, saveExercise } from '@/lib/exercise-store';
import { androidPatient, isAndroidDemoEnabled, mobileJson, readMobileBody } from '@/lib/mobile-demo';

export async function GET(request: Request) {
  if (!isAndroidDemoEnabled()) return mobileJson({ error: 'not_found' }, 404);
  try {
    const actor = await androidPatient(request);
    if (!actor) return mobileJson({ error: 'unauthorized' }, 401);
    const [plan, attempts] = await Promise.all([readExercisePlan(actor), readExerciseAttempts(actor)]);
    return mobileJson({
      date: exerciseDate(),
      plan: plan && { id: plan.id, targetAngle: plan.targetAngle, targetReps: plan.targetReps, maxShallow: plan.maxShallow, movement: plan.movement },
      attempts: attempts.map(({ id, scheduledDate, reason, validReps, shallowReps, level, sample, review, movement, diagnostics }) =>
        ({ id, scheduledDate, reason, validReps, shallowReps, level, sample, review, movement, diagnostics })),
    });
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}

export async function POST(request: Request) {
  if (!isAndroidDemoEnabled()) return mobileJson({ error: 'not_found' }, 404);
  try {
    const actor = await androidPatient(request);
    if (!actor) return mobileJson({ error: 'unauthorized' }, 401);
    const raw = await readMobileBody(request);
    if (!raw.ok) return mobileJson({ error: raw.status === 413 ? 'too_large' : 'invalid' }, raw.status === 413 ? 413 : 400);
    const input = mobileExerciseInput.safeParse(raw.body);
    if (!input.success) return mobileJson({ error: 'invalid' }, 400);
    const result = await saveExercise(actor, input.data.evidence, input.data);
    switch (result.status) {
      case 'saved': return mobileJson(result);
      case 'conflict': case 'duplicate': return mobileJson({ error: result.status }, 409);
      case 'invalid': return mobileJson({ error: 'not_found' }, 404);
      default: return mobileJson({ error: result.status }, 422);
    }
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
