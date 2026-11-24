import { resolveMobilePatientActor } from '../../../../../lib/auth';
import { handleDorimosRequest } from '../../../../../lib/dorimos-server';
import { mobileJson } from '../../../../../lib/mobile-demo';

export async function POST(request: Request) {
  try {
    const auth = await resolveMobilePatientActor(request);
    if (!auth.ok) return mobileJson({ error: auth.error }, auth.status);
    const outcome = await handleDorimosRequest(auth.actor, request);
    return mobileJson(outcome.data, outcome.status);
  } catch {
    return mobileJson({ status: 'manual' }, 503);
  }
}
