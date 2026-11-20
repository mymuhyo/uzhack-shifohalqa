import type { NextRequest } from 'next/server';
import { caregiverActionSchema } from '@/lib/caregiver';
import { changeCaregiverSharing } from '@/lib/caregiver-store';
import { getDemoSession, isSameOriginDemoPost } from '@/lib/demo-session';
import { ensureDemoWorkspace } from '@/lib/seed';

const noStore = { 'Cache-Control': 'private, no-store' };
const maxBodyBytes = 1024;

function reject(status: number) {
  return new Response(null, { status, headers: noStore });
}

async function readAction(request: NextRequest) {
  if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') return null;
  if (Number(request.headers.get('content-length')) > maxBodyBytes) return null;
  const raw = await request.text().catch(() => '');
  if (Buffer.byteLength(raw) > maxBodyBytes) return null;
  try {
    const parsed = caregiverActionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.action : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginDemoPost(request)) return reject(403);
  const session = await getDemoSession();
  if (session?.role !== 'patient') return reject(403);

  const action = await readAction(request);
  if (!action) return reject(400);

  try {
    const workspace = await ensureDemoWorkspace(session.workspaceId);
    if (!workspace) return reject(503);

    const result = await changeCaregiverSharing({
      workspaceId: session.workspaceId,
      role: 'patient',
      patientId: workspace.patient.id,
      doctorId: workspace.doctor.id,
    }, action);
    return result ? Response.json(result, { headers: noStore }) : reject(404);
  } catch {
    return reject(503);
  }
}
