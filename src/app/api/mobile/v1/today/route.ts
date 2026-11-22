import { getActivityDashboard } from '@/lib/activity-store';
import { getClinicalView } from '@/lib/clinical-store';
import { androidPatient, isAndroidDemoEnabled, mobileJson, mobileToday } from '@/lib/mobile-demo';

export async function GET(request: Request) {
  if (!isAndroidDemoEnabled()) return mobileJson({ error: 'not_found' }, 404);
  try {
    const actor = await androidPatient(request);
    if (!actor) return mobileJson({ error: 'unauthorized' }, 401);
    const [view, activity] = await Promise.all([
      getClinicalView(actor),
      getActivityDashboard(actor).catch(() => null),
    ]);
    return mobileJson(mobileToday(actor.patientName, view, undefined, activity));
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
