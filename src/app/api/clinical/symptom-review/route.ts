import type { NextRequest } from 'next/server';
import { handleClinicalSymptomReviewPost } from '../../../../lib/clinical-handlers';

export async function POST(request: NextRequest) {
  return handleClinicalSymptomReviewPost(request);
}
