import type { NextRequest } from 'next/server';
import { handleClinicalPatientsGet, handleClinicalPatientsPost } from '../../../../lib/clinical-handlers';

export async function GET(request: NextRequest) {
  return handleClinicalPatientsGet(request);
}

export async function POST(request: NextRequest) {
  return handleClinicalPatientsPost(request);
}
