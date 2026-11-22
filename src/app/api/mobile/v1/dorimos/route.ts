import { handleDorimosRequest } from '@/lib/dorimos-server';
import { androidPatient, isAndroidDemoEnabled, mobileJson } from '@/lib/mobile-demo';

export async function POST(request: Request) {
  if (!isAndroidDemoEnabled()) return mobileJson({ error: 'not_found' }, 404);
  try {
    const actor = await androidPatient(request);
    if (!actor) return mobileJson({ error: 'unauthorized' }, 401);
    const outcome = await handleDorimosRequest(actor, request);
    return mobileJson(outcome.data, outcome.status);
  } catch {
    return mobileJson({ status: 'manual' }, 503);
  }
}
