import type { NextRequest } from 'next/server';
import { handleClinicalViewGet } from '../../../../lib/clinical-handlers';

export async function GET(request: NextRequest) {
  return handleClinicalViewGet(request);
}
