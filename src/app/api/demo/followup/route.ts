import { followupForm } from '@/lib/clinical-inputs';
import { createClinicalPost } from '@/lib/clinical-post';
import { saveFlagFollowup } from '@/lib/clinical-store';

export const POST = createClinicalPost('patient', followupForm, saveFlagFollowup);
