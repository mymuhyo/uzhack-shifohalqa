import type { NextRequest } from 'next/server';
import { handleClinicalTelegramGet, handleClinicalTelegramPost } from '../../../../lib/clinical-handlers';

export async function GET(request: NextRequest) {
  return handleClinicalTelegramGet(request);
}

export async function POST(request: NextRequest) {
  return handleClinicalTelegramPost(request);
}
