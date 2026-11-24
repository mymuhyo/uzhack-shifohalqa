import { getActivityDashboard, saveStepCount } from '../../../../../lib/activity-store';
import { defaultDailyStepGoal, mobileStepsInputSchema } from '../../../../../lib/adherence';
import { resolveMobilePatientActor } from '../../../../../lib/auth';
import { mobileJson, readMobileBody } from '../../../../../lib/mobile-demo';

export async function POST(request: Request) {
  try {
    const auth = await resolveMobilePatientActor(request);
    if (!auth.ok) return mobileJson({ error: auth.error }, auth.status);
    const body = await readMobileBody(request);
    if (!body.ok) return mobileJson({ error: body.status === 413 ? 'too_large' : 'invalid' }, body.status);
    const parsed = mobileStepsInputSchema.safeParse(body.body);
    if (!parsed.success) return mobileJson({ error: 'invalid' }, 400);

    const status = await saveStepCount(auth.actor, parsed.data);
    if (status === 'not_found') return mobileJson({ error: 'not_found' }, 404);

    const dashboard = await getActivityDashboard(auth.actor).catch(() => null);
    const goal = dashboard?.dailyStepGoal ?? defaultDailyStepGoal;
    return mobileJson({
      status,
      count: parsed.data.count,
      goal,
      achieved: parsed.data.count >= goal,
      source: parsed.data.source,
    });
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
