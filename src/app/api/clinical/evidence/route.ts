import type { NextRequest } from 'next/server';
import { handleClinicalEvidencePost } from '../../../../lib/clinical-handlers';

export async function POST(request: NextRequest) {
  return handleClinicalEvidencePost(request);
}
