import type { NextRequest } from 'next/server';
import { handleClinicalFollowupAckPost } from '../../../../lib/clinical-handlers';

export async function POST(request: NextRequest) {
  return handleClinicalFollowupAckPost(request);
}
