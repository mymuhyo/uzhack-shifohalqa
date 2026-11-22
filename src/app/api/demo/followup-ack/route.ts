import { followupAckForm } from '@/lib/clinical-inputs';
import { createClinicalPost } from '@/lib/clinical-post';
import { acknowledgeFlagFollowup } from '@/lib/clinical-store';

export const POST = createClinicalPost('doctor', followupAckForm, acknowledgeFlagFollowup);
