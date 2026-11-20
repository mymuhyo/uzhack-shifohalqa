import { evidenceForm, prepareEvidence } from '@/lib/clinical-inputs';
import { getTaskContext, saveEvidence } from '@/lib/clinical-store';
import { androidPatient, isAndroidDemoEnabled, mobileJson, readMobileBody } from '@/lib/mobile-demo';

export async function POST(request: Request) {
  if (!isAndroidDemoEnabled()) return mobileJson({ error: 'not_found' }, 404);
  try {
    const actor = await androidPatient(request);
    if (!actor) return mobileJson({ error: 'unauthorized' }, 401);
    const input = evidenceForm.safeParse(await readMobileBody(request));
    if (!input.success || input.data.payload.kind !== 'medication') return mobileJson({ error: 'invalid' }, 400);
    const task = await getTaskContext(actor, input.data.taskId);
    const evidence = task && prepareEvidence(input.data, task);
    const result = evidence ? await saveEvidence(actor, evidence) : 'not_found';
    return result === 'not_found' ? mobileJson({ error: 'not_found' }, 404) : mobileJson({ result });
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
