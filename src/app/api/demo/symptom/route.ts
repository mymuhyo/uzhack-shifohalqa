import { urgentSymptomForm } from '@/lib/clinical-inputs';
import { createClinicalPost } from '@/lib/clinical-post';
import { saveUrgentSymptom } from '@/lib/clinical-store';

export const POST = createClinicalPost('patient', urgentSymptomForm, saveUrgentSymptom);
