import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseRouteClient, listPendingMembershipInvites } from '../../../../lib/auth';
import type { AuthenticatedSupabaseUser, SessionContext } from '../../../../lib/auth-types';
import { getDatabase } from '../../../../lib/db';
import { clearDemoSession } from '../../../../lib/demo-session';
import { isSameOriginPost, readRequestJson } from '../../../../lib/request-body';
import { createSupabaseAdminClient } from '../../../../lib/supabase/admin';

const signupSchema = z.strictObject({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(1).max(120),
  role: z.enum(['patient', 'caregiver', 'individual']),
  clinicName: z.string().trim().min(1).max(120).optional(),
});

const noStore = { 'Cache-Control': 'private, no-store' };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStore });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginPost(request)) return jsonError('forbidden', 403);
  if (process.env.AUTH_SIGNUP_ENABLED !== 'true') {
    return jsonError('signup_disabled', 403);
  }

  const body = await readRequestJson(request, 4096);
  if (!body.ok) return jsonError(body.status === 413 ? 'too_large' : 'invalid', body.status);

  const parsed = signupSchema.safeParse(body.body);
  if (!parsed.success) return jsonError('invalid', 400);

  const sql = getDatabase();
  const routeClient = createSupabaseRouteClient(request);
  if (!sql || !routeClient) return jsonError('unavailable', 503);

  const { email, password, fullName, role, clinicName } = parsed.data;
  const admin = createSupabaseAdminClient();

  let userId: string;
  if (admin) {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, default_role: role },
    });
    if (created.error) {
      const code = (created.error as { code?: string; status?: number }).code;
      const status = (created.error as { status?: number }).status;
      if (code === 'email_exists' || status === 422 || /already/i.test(created.error.message)) {
        return jsonError('email_exists', 409);
      }
      return jsonError('unavailable', 503);
    }
    if (!created.data.user) return jsonError('unavailable', 503);
    userId = created.data.user.id;
  } else {
    const created = await routeClient.client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, default_role: role } },
    });
    if (created.error) {
      const code = (created.error as { code?: string; status?: number }).code;
      if (code === 'user_already_exists' || /already/i.test(created.error.message)) {
        return jsonError('email_exists', 409);
      }
      return jsonError('unavailable', 503);
    }
    if (!created.data.user) return jsonError('unavailable', 503);
    userId = created.data.user.id;
  }

  let createdWorkspaceId: string | null = null;
  let session: SessionContext | null = null;

  try {
    if (role === 'individual') {
      const workspaceId = randomUUID();
      const patientId = randomUUID();
      createdWorkspaceId = workspaceId;
      await sql.transaction((tx) => [
        tx`
          INSERT INTO public.workspaces (id, is_demo, kind, name)
          VALUES (${workspaceId}, false, 'individual', ${fullName})
        `,
        tx`
          INSERT INTO public.patients (id, workspace_id, doctor_id, role_kind, name)
          VALUES (${patientId}, ${workspaceId}, NULL, 'individual', ${fullName})
        `,
        tx`
          INSERT INTO public.clinic_memberships (user_id, workspace_id, is_demo, role, actor_id, status)
          VALUES (${userId}, ${workspaceId}, false, 'individual', ${patientId}, 'active')
        `,
      ], { isolationLevel: 'ReadCommitted' });
      session = {
        kind: 'supabase',
        userId,
        workspaceId,
        role: 'individual',
        actorId: patientId,
        isDemo: false,
        email,
        fullName,
      };
    } else if (role === 'patient') {
      const workspaceId = randomUUID();
      const doctorId = randomUUID();
      const patientId = randomUUID();
      createdWorkspaceId = workspaceId;
      const wsName = clinicName ?? `${fullName} kabineti`;
      await sql.transaction((tx) => [
        tx`
          INSERT INTO public.workspaces (id, is_demo, kind, name)
          VALUES (${workspaceId}, false, 'clinic', ${wsName})
        `,
        tx`
          INSERT INTO public.doctors (id, workspace_id, name)
          VALUES (${doctorId}, ${workspaceId}, 'Klinika shifokori')
        `,
        tx`
          INSERT INTO public.patients (id, workspace_id, doctor_id, role_kind, name)
          VALUES (${patientId}, ${workspaceId}, ${doctorId}, 'patient', ${fullName})
        `,
        tx`
          INSERT INTO public.clinic_memberships (user_id, workspace_id, is_demo, role, actor_id, status)
          VALUES (${userId}, ${workspaceId}, false, 'patient', ${patientId}, 'active')
        `,
      ], { isolationLevel: 'ReadCommitted' });
      session = {
        kind: 'supabase',
        userId,
        workspaceId,
        role: 'patient',
        actorId: patientId,
        isDemo: false,
        email,
        fullName,
      };
    }

    const signedIn = await routeClient.client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.user) {
      throw new Error('signInWithPassword failed after signup');
    }
  } catch {
    if (createdWorkspaceId) {
      await sql`DELETE FROM public.workspaces WHERE id = ${createdWorkspaceId} AND is_demo = false`.catch(() => undefined);
    }
    if (admin) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    }
    return jsonError('unavailable', 503);
  }

  const user: AuthenticatedSupabaseUser = {
    userId,
    email,
    fullName,
    defaultRole: role,
  };
  const pendingInvites = role === 'caregiver'
    ? await listPendingMembershipInvites(userId).catch(() => [])
    : undefined;

  const response = NextResponse.json(
    { session, user, ...(pendingInvites !== undefined ? { pendingInvites } : {}) },
    { status: 201, headers: noStore },
  );
  clearDemoSession(request, response);
  routeClient.applyToResponse(response);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
