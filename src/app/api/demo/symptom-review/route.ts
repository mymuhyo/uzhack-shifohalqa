import { symptomReviewForm } from '@/lib/clinical-inputs';
import { createClinicalPost } from '@/lib/clinical-post';
import { reviewUrgentSymptom } from '@/lib/clinical-store';

export const POST = createClinicalPost('doctor', symptomReviewForm, reviewUrgentSymptom);
