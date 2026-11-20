import type { NextRequest } from 'next/server';
import { getDemoSession, isSameOriginDemoPost } from '@/lib/demo-session';
import { exerciseInput } from '@/lib/exercise-inputs';
import { saveExercise } from '@/lib/exercise-store';
import { readRequestJson } from '@/lib/request-body';
import { ensureDemoWorkspace } from '@/lib/seed';

function result(status: string, code: number) {
  return Response.json({ status }, { status: code, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginDemoPost(request)) return result('invalid', 403);
  const session = await getDemoSession();
  if (session?.role !== 'patient') return result('invalid', 403);
  const body = await readRequestJson(request, 10000);
  if (!body.ok) return result('invalid', 400);
  const input = exerciseInput.safeParse(body.body);
  if (!input.success) return result('invalid', 400);

  try {
    const actors = await ensureDemoWorkspace(session.workspaceId);
    if (!actors) return result('unavailable', 503);
    const saved = await saveExercise({
      workspaceId: session.workspaceId, role: session.role,
      doctorId: actors.doctor.id, patientId: actors.patient.id,
    }, input.data);
    if (saved.status === 'saved') return Response.json(saved, { headers: { 'Cache-Control': 'no-store' } });
    return result(saved.status, saved.status === 'duplicate' ? 409 : 422);
  } catch {
    return result('unavailable', 503);
  }
}
