import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDemoSession, isDemoEnabled } from '../../../../lib/demo-session';
import { isSameOriginPost, readRequestJson } from '../../../../lib/request-body';
import { ensureDemoWorkspace } from '../../../../lib/seed';
import {
  getTelegramBotToken,
  issueTelegramBearerToken,
  resolveTelegramLinkedChat,
  verifyTelegramBearerToken,
  verifyTelegramInitData,
} from '../../../../lib/telegram-auth';

const noStoreHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
};

const authPostSchema = z.union([
  z.strictObject({
    mode: z.literal('initData').optional(),
    initData: z.string().min(1).max(8192),
    focus: z.enum(['patient', 'doctor']).optional(),
  }),
  z.strictObject({
    mode: z.literal('demo'),
    role: z.enum(['patient', 'doctor']).optional().default('patient'),
  }),
]);

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: noStoreHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await readRequestJson(request, 12_288);
    if (!body.ok) {
      return json({ error: body.status === 413 ? 'too_large' : 'invalid' }, body.status);
    }

    const parsed = authPostSchema.safeParse(body.body);
    if (!parsed.success) {
      return json({ error: 'invalid' }, 400);
    }

    if (parsed.data.mode === 'demo') {
      if (!isDemoEnabled()) {
        return json({ error: 'not_found' }, 404);
      }
      if (!isSameOriginPost(request)) {
        return json({ error: 'forbidden' }, 403);
      }

      const authHeader = request.headers.get('authorization')?.trim() ?? '';
      const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
      const existingToken = bearerMatch ? bearerMatch[1]!.trim() : '';
      const existingClaims = existingToken ? verifyTelegramBearerToken(existingToken) : null;
      const cookieDemo = !existingClaims ? await getDemoSession().catch(() => null) : null;
      const workspaceId =
        existingClaims?.kind === 'demo'
          ? existingClaims.workspaceId
          : cookieDemo?.workspaceId ?? randomUUID();

      const workspace = await ensureDemoWorkspace(workspaceId);
      if (!workspace) {
        return json({ error: 'unavailable' }, 503);
      }

      const role = parsed.data.role;
      const issued = issueTelegramBearerToken({
        kind: 'demo',
        role,
        workspaceId,
        actorId: role === 'doctor' ? workspace.doctor.id : workspace.patient.id,
        isDemo: true,
      });
      if (!issued) {
        return json({ error: 'unavailable' }, 503);
      }

      return json({
        authenticated: true,
        mode: 'demo',
        token: issued.token,
        expiresAt: issued.expiresAt,
        role,
        workspaceId,
        patientName: workspace.patient.name,
        doctorName: workspace.doctor.name,
        isDemo: true,
        detailsEnabled: false,
      });
    }

    const botToken = getTelegramBotToken();
    if (!botToken) {
      return json({ error: 'unavailable' }, 503);
    }

    const verified = verifyTelegramInitData(parsed.data.initData, botToken);
    if (!verified.ok) {
      return json({ error: verified.error }, 401);
    }

    const linked = await resolveTelegramLinkedChat(verified.user.id, parsed.data.focus ?? null);
    if (linked === null) {
      return json({
        authenticated: false,
        linked: false,
        demoAvailable: isDemoEnabled(),
        telegramUser: {
          id: verified.user.id,
          firstName: verified.user.first_name?.trim() || null,
        },
      });
    }
    if (!linked.ok) {
      return json({ error: linked.error }, linked.status);
    }

    const tokenRole = linked.actor.role === 'doctor' ? 'doctor' : 'patient';
    const actorId = tokenRole === 'doctor' ? linked.actor.doctorId : linked.actor.patientId;
    if (!actorId || !linked.chatId || !linked.linkId) {
      return json({ error: 'unavailable' }, 503);
    }

    const issued = issueTelegramBearerToken({
      kind: 'linked',
      role: tokenRole,
      workspaceId: linked.actor.workspaceId,
      actorId,
      chatId: linked.chatId,
      linkId: linked.linkId,
      isDemo: Boolean(linked.actor.isDemo),
    });
    if (!issued) {
      return json({ error: 'unavailable' }, 503);
    }

    return json({
      authenticated: true,
      mode: 'linked',
      token: issued.token,
      expiresAt: issued.expiresAt,
      role: linked.actor.role,
      workspaceId: linked.actor.workspaceId,
      patientName: linked.patientName,
      doctorName: linked.doctorName,
      isDemo: Boolean(linked.actor.isDemo),
      detailsEnabled: linked.detailsEnabled,
    });
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
}
