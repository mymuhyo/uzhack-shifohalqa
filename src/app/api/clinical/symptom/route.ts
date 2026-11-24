import type { NextRequest } from 'next/server';
import { handleClinicalSymptomPost } from '../../../../lib/clinical-handlers';

export async function POST(request: NextRequest) {
  return handleClinicalSymptomPost(request);
}
