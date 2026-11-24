import type { NextRequest } from 'next/server';
import { handleClinicalExercisePlanPost } from '../../../../lib/clinical-handlers';

export async function POST(request: NextRequest) {
  return handleClinicalExercisePlanPost(request);
}
