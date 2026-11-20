import { getTaskContext, saveEvidence } from '@/lib/clinical-store';
import { evidenceForm, prepareEvidence } from '@/lib/clinical-inputs';
import { createClinicalPost } from '@/lib/clinical-post';

export const POST = createClinicalPost('patient', evidenceForm, async (actor, input) => {
  const context = await getTaskContext(actor, input.taskId);
  const evidence = context ? prepareEvidence(input, context) : null;
  return evidence ? saveEvidence(actor, evidence) : 'not_found';
});
