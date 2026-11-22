import { createClinicalPost } from '@/lib/clinical-post';
import { exerciseReviewForm } from '@/lib/exercise-inputs';
import { reviewExerciseAttempt } from '@/lib/exercise-store';

export const POST = createClinicalPost('doctor', exerciseReviewForm, reviewExerciseAttempt);
