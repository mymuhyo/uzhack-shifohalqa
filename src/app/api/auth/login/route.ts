import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseRouteClient, listPendingMembershipInvites } from '../../../../lib/auth';
import type { AppRole, AuthenticatedSupabaseUser, SessionContext } from '../../../../lib/auth-types';
import { getDatabase } from '../../../../lib/db';
import { clearDemoSession } from '../../../../lib/demo-session';
import { isSameOriginPost, readRequestJson } from '../../../../lib/request-body';

const loginSchema = z.strictObject({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(1).max(128),
  workspaceId: z.uuid().optional(),
});

const appRoleSchema = z.enum(['doctor', 'patient', 'caregiver', 'individual']);
const membershipRowSchema = z.object({
  workspaceId: z.uuid(),
  role: appRoleSchema,
  actorId: z.uuid(),
  isDemo: z.literal(false).optional().default(false),
});
const profileRowSchema = z.object({
  fullName: z.string().nullable(),
  defaultRole: appRoleSchema.nullable(),
});

const noStore = { 'Cache-Control': 'private, no-store' };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginPost(request)) return jsonError('forbidden', 403);

  const body = await readRequestJson(request, 2048);
  if (!body.ok) return jsonError(body.status === 413 ? 'too_large' : 'invalid', body.status);

  const parsed = loginSchema.safeParse(body.body);
  if (!parsed.success) return jsonError('invalid', 400);

  const sql = getDatabase();
  const routeClient = createSupabaseRouteClient(request);
  if (!sql || !routeClient) return jsonError('unavailable', 503);

  const { email, password, workspaceId } = parsed.data;
  const { data, error } = await routeClient.client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return jsonError('invalid_credentials', 401);
  }

  const userId = data.user.id;
  const metaName = typeof data.user.user_metadata?.full_name === 'string'
    ? data.user.user_metadata.full_name.trim() || null
    : null;
  const parsedMetaRole = appRoleSchema.safeParse(data.user.user_metadata?.default_role);
  const metaRole: AppRole | null = parsedMetaRole.success ? parsedMetaRole.data : null;

  const [profileRows, membershipRows, pendingInvites] = await Promise.all([
    sql`
      SELECT full_name AS "fullName", default_role AS "defaultRole"
      FROM public.profiles
      WHERE id = ${userId}
      LIMIT 1
    `,
    sql`
      SELECT cm.workspace_id AS "workspaceId", cm.role, cm.actor_id AS "actorId", w.is_demo AS "isDemo"
      FROM public.clinic_memberships AS cm
      JOIN public.workspaces AS w ON w.id = cm.workspace_id AND w.is_demo = false
      WHERE cm.user_id = ${userId}
        AND cm.is_demo = false
        AND cm.status = 'active'
        AND w.is_demo = false
        AND (${workspaceId ?? null}::uuid IS NULL OR cm.workspace_id = ${workspaceId ?? null}::uuid)
      ORDER BY cm.created_at DESC, cm.id DESC
      LIMIT 1
    `,
    listPendingMembershipInvites(userId).catch(() => []),
  ]);

  const profile = profileRows[0] ? profileRowSchema.safeParse(profileRows[0]) : null;
  const user: AuthenticatedSupabaseUser = {
    userId,
    email: data.user.email ?? email,
    fullName: profile?.success ? (profile.data.fullName ?? metaName) : metaName,
    defaultRole: profile?.success ? (profile.data.defaultRole ?? metaRole) : metaRole,
  };

  const membership = membershipRows[0] ? membershipRowSchema.safeParse(membershipRows[0]) : null;
  if (!membership?.success) {
    const allowUnlinkedCaregiver = !workspaceId && (
      user.defaultRole === 'caregiver'
      || pendingInvites.some((invite) => invite.role === 'caregiver')
    );
    if (!allowUnlinkedCaregiver) {
      await routeClient.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      const denied = NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
      routeClient.applyToResponse(denied);
      denied.headers.set('Cache-Control', 'private, no-store');
      return denied;
    }

    const response = NextResponse.json(
      { session: null, user, pendingInvites },
      { status: 200, headers: noStore },
    );
    clearDemoSession(request, response);
    routeClient.applyToResponse(response);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  const session: SessionContext = {
    kind: 'supabase',
    userId,
    workspaceId: membership.data.workspaceId,
    role: membership.data.role,
    actorId: membership.data.actorId,
    isDemo: false,
    email: user.email,
    fullName: user.fullName,
  };

  const response = NextResponse.json(
    { session, user, ...(pendingInvites.length > 0 ? { pendingInvites } : {}) },
    { status: 200, headers: noStore },
  );
  clearDemoSession(request, response);
  routeClient.applyToResponse(response);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
