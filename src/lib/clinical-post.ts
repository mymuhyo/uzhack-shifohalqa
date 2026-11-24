import type { NextRequest } from 'next/server';
import type { ZodType } from 'zod';
import { getDemoSession, isSameOriginDemoPost } from './demo-session';
import { readRequestText } from './request-body';
import { ensureDemoWorkspace } from './seed';
import type { ClinicalActor, MutationResult } from './clinical-types';

const formSizeLimit = 16 * 1024;

async function readForm(request: NextRequest) {
  const body = await readRequestText(request, 'application/x-www-form-urlencoded', formSizeLimit);
  if (!body.ok) return null;
  const entries = new URLSearchParams(body.text);
  const fields = Object.fromEntries(entries);
  return entries.size === Object.keys(fields).length ? fields : null;
}

export function createClinicalPost<T>(
  role: 'doctor' | 'patient',
  form: ZodType<T>,
  mutate: (actor: ClinicalActor, input: T) => Promise<MutationResult>,
) {
  function returnToRole(result?: Exclude<MutationResult, 'saved'> | 'invalid' | 'unavailable') {
    return new Response(null, {
      status: 303,
      headers: {
        Location: result ? `/${role}?result=${result}` : `/${role}`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return async function POST(request: NextRequest): Promise<Response> {
    if (!isSameOriginDemoPost(request)) return new Response('So‘rov rad etildi.', { status: 403 });
    const session = await getDemoSession();
    if (session?.role !== role) return new Response('Bu amal uchun mos demo rolida kiring.', { status: 403 });

    const parsed = form.safeParse(await readForm(request));
    if (!parsed.success) return returnToRole('invalid');

    try {
      const workspace = await ensureDemoWorkspace(session.workspaceId);
      if (!workspace) return returnToRole('unavailable');

      const result = await mutate({
        workspaceId: session.workspaceId,
        role,
        doctorId: workspace.doctor.id,
        patientId: workspace.patient.id,
        isDemo: true,
      }, parsed.data);
      return returnToRole(result === 'saved' ? undefined : result);
    } catch {
      return returnToRole('unavailable');
    }
  };
}
