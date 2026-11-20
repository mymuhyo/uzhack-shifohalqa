import { stepsForm } from '@/lib/adherence';
import { saveStepCount } from '@/lib/activity-store';
import { createClinicalPost } from '@/lib/clinical-post';

export const POST = createClinicalPost('patient', stepsForm, (actor, { steps }) => saveStepCount(actor, steps));
