import type { NextRequest } from 'next/server';
import { handleClinicalStepsPost } from '../../../../lib/clinical-handlers';

export async function POST(request: NextRequest) {
  return handleClinicalStepsPost(request);
}
