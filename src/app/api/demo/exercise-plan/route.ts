import { createClinicalPost } from '@/lib/clinical-post';
import { exercisePlanForm } from '@/lib/exercise-inputs';
import { assignExercise } from '@/lib/exercise-store';

export const POST = createClinicalPost('doctor', exercisePlanForm, assignExercise);
