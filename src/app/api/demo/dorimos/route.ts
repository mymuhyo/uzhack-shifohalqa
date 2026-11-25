import type { NextRequest } from 'next/server';
import type { z } from 'zod';
import { getDemoSession, isSameOriginDemoPost } from '@/lib/demo-session';
import type { dorimosResponse } from '@/lib/dorimos-contract';
import { handleDorimosRequest } from '@/lib/dorimos-server';
import { ensureDemoWorkspace } from '@/lib/seed';

function result(data: z.infer<typeof dorimosResponse>, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginDemoPost(request)) return result({ status: 'invalid' }, 403);
  const session = await getDemoSession();
  if (session?.role !== 'patient') return result({ status: 'invalid' }, 403);

  try {
    const workspace = await ensureDemoWorkspace(session.workspaceId);
    if (!workspace) return result({ status: 'manual' }, 503);
    const actor = {
      workspaceId: session.workspaceId,
      role: session.role,
      doctorId: workspace.doctor.id,
      patientId: workspace.patient.id,
      isDemo: true,
    };
    const outcome = await handleDorimosRequest(actor, request);
    return result(outcome.data, outcome.status);
  } catch {
    return result({ status: 'manual' }, 503);
  }
}
