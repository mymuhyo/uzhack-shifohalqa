import { getActivityDashboard, saveStepCount } from '@/lib/activity-store';
import { defaultDailyStepGoal, mobileStepsInputSchema } from '@/lib/adherence';
import { androidPatient, isAndroidDemoEnabled, mobileJson, readMobileBody } from '@/lib/mobile-demo';

export async function POST(request: Request) {
  if (!isAndroidDemoEnabled()) return mobileJson({ error: 'not_found' }, 404);
  try {
    const actor = await androidPatient(request);
    if (!actor) return mobileJson({ error: 'unauthorized' }, 401);
    const body = await readMobileBody(request);
    if (!body.ok) return mobileJson({ error: body.status === 413 ? 'too_large' : 'invalid' }, body.status);
    const parsed = mobileStepsInputSchema.safeParse(body.body);
    if (!parsed.success) return mobileJson({ error: 'invalid' }, 400);

    const status = await saveStepCount(actor, parsed.data);
    if (status === 'not_found') return mobileJson({ error: 'not_found' }, 404);

    const dashboard = await getActivityDashboard(actor).catch(() => null);
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
