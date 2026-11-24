import type { NextRequest } from 'next/server';
import {
  handleClinicalCaregiverInviteGet,
  handleClinicalCaregiverInvitePost,
} from '../../../../lib/clinical-handlers';

export async function GET(request: NextRequest) {
  return handleClinicalCaregiverInviteGet(request);
}

export async function POST(request: NextRequest) {
  return handleClinicalCaregiverInvitePost(request);
}
