import type { NextRequest } from 'next/server';
import { handleClinicalPlanPost } from '../../../../lib/clinical-handlers';

export async function POST(request: NextRequest) {
  return handleClinicalPlanPost(request);
}
