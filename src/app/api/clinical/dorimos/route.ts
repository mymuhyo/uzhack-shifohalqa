import type { NextRequest } from 'next/server';
import { handleClinicalDorimosPost } from '../../../../lib/clinical-handlers';

export async function POST(request: NextRequest) {
  return handleClinicalDorimosPost(request);
}
