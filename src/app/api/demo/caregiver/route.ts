import type { NextRequest } from 'next/server';
import { caregiverActionSchema } from '@/lib/caregiver';
import { changeCaregiverSharing } from '@/lib/caregiver-store';
import { getDemoSession, isSameOriginDemoPost } from '@/lib/demo-session';
import { readRequestJson } from '@/lib/request-body';
import { ensureDemoWorkspace } from '@/lib/seed';

const noStore = { 'Cache-Control': 'private, no-store' };
const maxBodyBytes = 1024;

function reject(status: number) {
  return new Response(null, { status, headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginDemoPost(request)) return reject(403);
  const session = await getDemoSession();
  if (session?.role !== 'patient') return reject(403);

  const body = await readRequestJson(request, maxBodyBytes);
  if (!body.ok) return reject(body.status);
  const parsed = caregiverActionSchema.safeParse(body.body);
  if (!parsed.success) return reject(400);
  const action = parsed.data.action;

  try {
    const workspace = await ensureDemoWorkspace(session.workspaceId);
    if (!workspace) return reject(503);

    const result = await changeCaregiverSharing({
      workspaceId: session.workspaceId,
      role: 'patient',
      patientId: workspace.patient.id,
      doctorId: workspace.doctor.id,
      isDemo: true,
    }, action);
    return result ? Response.json(result, { headers: noStore }) : reject(404);
  } catch {
    return reject(503);
  }
}
