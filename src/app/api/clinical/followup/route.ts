import type { NextRequest } from 'next/server';
import { handleClinicalFollowupPost } from '../../../../lib/clinical-handlers';

export async function POST(request: NextRequest) {
  return handleClinicalFollowupPost(request);
}
