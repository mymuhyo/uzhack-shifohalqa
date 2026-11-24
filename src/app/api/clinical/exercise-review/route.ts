import type { NextRequest } from 'next/server';
import { handleClinicalExerciseReviewPost } from '../../../../lib/clinical-handlers';

export async function POST(request: NextRequest) {
  return handleClinicalExerciseReviewPost(request);
}
