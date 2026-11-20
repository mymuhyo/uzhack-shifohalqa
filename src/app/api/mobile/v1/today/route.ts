import { getClinicalView } from '@/lib/clinical-store';
import { androidPatient, isAndroidDemoEnabled, mobileJson, mobileToday } from '@/lib/mobile-demo';

export async function GET(request: Request) {
  if (!isAndroidDemoEnabled()) return mobileJson({ error: 'not_found' }, 404);
  try {
    const actor = await androidPatient(request);
    if (!actor) return mobileJson({ error: 'unauthorized' }, 401);
    return mobileJson(mobileToday(actor.patientName, await getClinicalView(actor)));
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
