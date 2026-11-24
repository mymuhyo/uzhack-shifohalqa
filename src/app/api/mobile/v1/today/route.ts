import { getActivityDashboard } from '../../../../../lib/activity-store';
import { resolveMobilePatientActor } from '../../../../../lib/auth';
import { getClinicalView } from '../../../../../lib/clinical-store';
import { mobileJson, mobileToday } from '../../../../../lib/mobile-demo';

export async function GET(request: Request) {
  try {
    const auth = await resolveMobilePatientActor(request);
    if (!auth.ok) return mobileJson({ error: auth.error }, auth.status);
    const [view, activity] = await Promise.all([
      getClinicalView(auth.actor),
      getActivityDashboard(auth.actor).catch(() => null),
    ]);
    return mobileJson(mobileToday(auth.patientName, view, undefined, activity));
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
