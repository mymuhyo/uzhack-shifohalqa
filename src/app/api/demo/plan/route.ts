import { assignPlan } from '@/lib/clinical-store';
import { planForm } from '@/lib/clinical-inputs';
import { createClinicalPost } from '@/lib/clinical-post';

export const POST = createClinicalPost('doctor', planForm, assignPlan);
