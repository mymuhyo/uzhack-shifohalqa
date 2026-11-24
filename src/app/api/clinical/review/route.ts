import type { NextRequest } from 'next/server';
import { handleClinicalReviewPost } from '../../../../lib/clinical-handlers';

export async function POST(request: NextRequest) {
  return handleClinicalReviewPost(request);
}
