import type { NextRequest } from 'next/server';
import { handleClinicalExerciseCoachPost } from '../../../../lib/clinical-handlers';

export async function POST(request: NextRequest) {
  return handleClinicalExerciseCoachPost(request);
}
