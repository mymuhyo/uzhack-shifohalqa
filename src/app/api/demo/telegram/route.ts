import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getDemoSession, isSameOriginDemoPost } from '@/lib/demo-session';
import { ensureDemoWorkspace } from '@/lib/seed';
import { getTelegramBotUsername } from '@/lib/telegram-web';
import { readRequestJson } from '@/lib/request-body';
import {
  createTelegramPairing,
  disconnectDoctorTelegram,
  disconnectPatientTelegram,
  setPatientTelegramDetails,
} from '@/lib/telegram-store';

const actionSchema = z.union([
  z.strictObject({ action: z.enum(['pair', 'disconnect']) }),
  z.strictObject({ action: z.literal('set_details'), detailsEnabled: z.boolean() }),
]);
const maxBodyBytes = 1024;
const responseHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };

function reject(status: number) {
  return new Response(null, { status, headers: responseHeaders });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginDemoPost(request)) return reject(403);
  const session = await getDemoSession();
  if (!session || (session.role !== 'doctor' && session.role !== 'patient')) return reject(403);

  const input = await readRequestJson(request, maxBodyBytes);
  if (!input.ok) return reject(input.status);
  const parsed = actionSchema.safeParse(input.body);
  if (!parsed.success) return reject(400);

  try {
    const workspace = await ensureDemoWorkspace(session.workspaceId);
    if (!workspace) return reject(503);
    const actor = {
      role: session.role,
      workspaceId: session.workspaceId,
      doctorId: workspace.doctor.id,
      patientId: workspace.patient.id,
      isDemo: true,
    };

    if (parsed.data.action === 'set_details') {
      if (actor.role !== 'patient') return reject(403);
      const updated = await setPatientTelegramDetails(actor, parsed.data.detailsEnabled);
      if (!updated) return reject(404);
      return Response.json(updated, { headers: responseHeaders });
    }

    if (parsed.data.action === 'disconnect') {
      if (actor.role === 'doctor') await disconnectDoctorTelegram(actor);
      else await disconnectPatientTelegram(actor);
      return new Response(null, { status: 204, headers: responseHeaders });
    }

    const botUsername = getTelegramBotUsername();
    if (!botUsername) return reject(503);

    const code = await createTelegramPairing(actor);
    if (!code) return reject(409);
    const url = new URL(`/${botUsername}`, 'https://t.me');
    url.searchParams.set('start', code);
    return Response.json({ href: url.href }, { headers: responseHeaders });
  } catch {
    return reject(503);
  }
}
