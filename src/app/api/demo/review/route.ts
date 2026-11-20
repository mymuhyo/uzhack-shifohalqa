import { reviewFlag } from '@/lib/clinical-store';
import { reviewForm } from '@/lib/clinical-inputs';
import { createClinicalPost } from '@/lib/clinical-post';

export const POST = createClinicalPost('doctor', reviewForm, reviewFlag);
