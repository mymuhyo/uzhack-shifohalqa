import type { NextRequest } from 'next/server';
import { handleClinicalCaregiverGet, handleClinicalCaregiverPost } from '../../../../lib/clinical-handlers';

export async function GET(request: NextRequest) {
  return handleClinicalCaregiverGet(request);
}

export async function POST(request: NextRequest) {
  return handleClinicalCaregiverPost(request);
}
