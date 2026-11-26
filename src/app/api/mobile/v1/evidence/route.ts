import { resolveMobilePatientActor } from '../../../../../lib/auth';
import { evidenceJsonInput, prepareEvidence } from '../../../../../lib/clinical-inputs';
import { getTaskContext, saveEvidence } from '../../../../../lib/clinical-store';
import { mobileJson, readMobileBody } from '../../../../../lib/mobile-demo';

export async function POST(request: Request) {
  try {
    const auth = await resolveMobilePatientActor(request);
    if (!auth.ok) return mobileJson({ error: auth.error }, auth.status);
    const raw = await readMobileBody(request);
    if (!raw.ok) return mobileJson({ error: raw.status === 413 ? 'too_large' : 'invalid' }, raw.status === 413 ? 413 : 400);
    const input = evidenceJsonInput.safeParse(raw.body);
    if (!input.success || input.data.patientId !== undefined) {
      return mobileJson({ error: 'invalid' }, 400);
    }
    const task = await getTaskContext(auth.actor, input.data.command.taskId);
    const evidence = task && prepareEvidence(input.data.command, task);
    const result = evidence ? await saveEvidence(auth.actor, evidence) : 'not_found';
    return result === 'not_found' ? mobileJson({ error: 'not_found' }, 404) : mobileJson({ result });
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
