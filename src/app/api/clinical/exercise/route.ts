import type { NextRequest } from 'next/server';
import { handleClinicalExercisePost } from '../../../../lib/clinical-handlers';

export async function POST(request: NextRequest) {
  return handleClinicalExercisePost(request);
}
