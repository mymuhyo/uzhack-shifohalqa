import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type {
  AuthenticatedSupabaseUser,
  PendingMembershipInvite,
  SessionContext,
} from './auth-types';
import type { AppRole, ClinicalActor } from './clinical-types';
import { getDatabase } from './db';
import { getDemoSession } from './demo-session';
import { androidPatient, isAndroidDemoEnabled } from './mobile-demo';
import { isSameOriginPost } from './request-body';
import { ensureDemoWorkspace } from './seed';
import { createSupabaseAdminClient } from './supabase/admin';
import type { Database } from './supabase/database.types';
import { createSupabaseServerClient } from './supabase/server';

const appRoleSchema = z.enum(['doctor', 'patient', 'caregiver', 'individual']);
const demoBearerPattern = /^[a-f0-9]{64}$/;
const jwtBearerPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

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

const patientRowSchema = z.object({
  id: z.uuid(),
  doctorId: z.uuid().nullable(),
});

const entityPatientRowSchema = z.object({
  patientId: z.uuid(),
});

const mobileMembershipRowSchema = z.object({
  workspaceId: z.uuid(),
  patientId: z.uuid().nullable(),
  doctorId: z.uuid().nullable(),
  role: appRoleSchema,
  patientName: z.string().nullable(),
  isDemo: z.literal(false).optional().default(false),
});

const pendingInviteRowSchema = z.object({
  membershipId: z.uuid(),
  workspaceId: z.uuid(),
  workspaceName: z.string(),
  role: z.enum(['patient', 'caregiver']),
  actorId: z.uuid(),
  patientName: z.string(),
  createdAt: z.iso.datetime(),
});

function getSupabasePublicEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    '';
  if (!url || !key) return null;
  return { url, key };
}

export function createStatelessSupabaseClient() {
  const env = getSupabasePublicEnv();
  return env ? createClient<Database>(env.url, env.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }) : null;
}

export type SupabaseRouteClient = {
  client: ReturnType<typeof createServerClient<Database>>;
  applyToResponse: (response: NextResponse) => NextResponse;
};

export function createSupabaseRouteClient(request: NextRequest): SupabaseRouteClient | null {
  const env = getSupabasePublicEnv();
  if (!env) return null;

  const pendingCookies = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const pendingHeaders: Record<string, string> = {};

  const client = createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          const cookieKey = `${name}::${options?.domain ?? ''}::${options?.path ?? ''}`;
          pendingCookies.set(cookieKey, { name, value, options });
        }
        Object.assign(pendingHeaders, headers);
      },
    },
  });

  function applyToResponse(response: NextResponse): NextResponse {
    const seenCookieNames = new Set<string>();
    const extraSetCookies: string[] = [];
    for (const { name, value, options } of pendingCookies.values()) {
      if (!seenCookieNames.has(name)) {
        seenCookieNames.add(name);
        response.cookies.set(name, value, options);
      } else {
        const serializer = new NextResponse();
        serializer.cookies.set(name, value, options);
        const serialized = serializer.headers.get('set-cookie');
        if (serialized) {
          extraSetCookies.push(serialized);
        }
      }
    }
    for (const cookieHeader of extraSetCookies) {
      response.headers.append('set-cookie', cookieHeader);
    }
    for (const [headerName, headerValue] of Object.entries(pendingHeaders)) {
      if (headerName.toLowerCase() === 'cache-control') continue;
      response.headers.set(headerName, headerValue);
    }
    return response;
  }

  return { client, applyToResponse };
}

export function clearSupabaseCookies(request: NextRequest, response: NextResponse): void {
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.set(cookie.name, '', {
        path: '/',
        maxAge: 0,
        httpOnly: true,
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
      });
    }
  }
}

function parseUserMetadataRole(value: unknown): AppRole | null {
  const parsed = appRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function getAuthenticatedSupabaseUser(
  request?: NextRequest,
): Promise<AuthenticatedSupabaseUser | null> {
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | null = null;
  try {
    if (request) {
      supabase = createSupabaseRouteClient(request)?.client ?? null;
    } else {
      supabase = await createSupabaseServerClient();
    }
  } catch {
    return null;
  }
  if (!supabase) return null;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    const metaName = typeof data.user.user_metadata?.full_name === 'string'
      ? data.user.user_metadata.full_name.trim() || null
      : null;
    const metaRole = parseUserMetadataRole(data.user.user_metadata?.default_role);

    const sql = getDatabase();
    if (!sql) {
      return {
        userId: data.user.id,
        email: data.user.email ?? null,
        fullName: metaName,
        defaultRole: metaRole,
      };
    }

    const [profileRaw] = await sql`
      SELECT full_name AS "fullName", default_role AS "defaultRole"
      FROM public.profiles
      WHERE id = ${data.user.id}
      LIMIT 1
    `;
    const profile = profileRaw ? profileRowSchema.safeParse(profileRaw) : null;
    return {
      userId: data.user.id,
      email: data.user.email ?? null,
      fullName: profile?.success ? (profile.data.fullName ?? metaName) : metaName,
      defaultRole: profile?.success ? (profile.data.defaultRole ?? metaRole) : metaRole,
    };
  } catch {
    return null;
  }
}

export async function listPendingMembershipInvites(userId: string): Promise<PendingMembershipInvite[]> {
  const sql = getDatabase();
  if (!sql) return [];
  const rows = await sql`
    SELECT cm.id AS "membershipId",
           cm.workspace_id AS "workspaceId",
           w.name AS "workspaceName",
           cm.role,
           cm.actor_id AS "actorId",
           pat.name AS "patientName",
           to_char(cm.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
    FROM public.clinic_memberships AS cm
    JOIN public.workspaces AS w ON w.id = cm.workspace_id AND w.is_demo = false
    JOIN public.patients AS pat ON pat.workspace_id = cm.workspace_id AND pat.id = cm.actor_id
    WHERE cm.user_id = ${userId}
      AND cm.is_demo = false
      AND cm.status = 'invited'
      AND cm.role IN ('patient', 'caregiver')
    ORDER BY cm.created_at DESC, cm.id DESC
  `;
  return z.array(pendingInviteRowSchema).parse(rows);
}

export async function resolveWebSessionContext(request?: NextRequest): Promise<SessionContext | null> {
  const authUser = await getAuthenticatedSupabaseUser(request);
  if (authUser) {
    const rawHeader = request?.headers.get('x-workspace-id')?.trim();
    let requestedWorkspaceId: string | null = null;
    if (rawHeader) {
      const parsedWs = z.uuid().safeParse(rawHeader);
      if (!parsedWs.success) return null;
      requestedWorkspaceId = parsedWs.data;
    }

    const sql = getDatabase();
    if (!sql) return null;

    const [row] = await sql`
      SELECT cm.workspace_id AS "workspaceId", cm.role, cm.actor_id AS "actorId", w.is_demo AS "isDemo"
      FROM public.clinic_memberships AS cm
      JOIN public.workspaces AS w ON w.id = cm.workspace_id AND w.is_demo = false
      WHERE cm.user_id = ${authUser.userId}
        AND cm.is_demo = false
        AND cm.status = 'active'
        AND w.is_demo = false
        AND (${requestedWorkspaceId}::uuid IS NULL OR cm.workspace_id = ${requestedWorkspaceId}::uuid)
      ORDER BY cm.created_at DESC, cm.id DESC
      LIMIT 1
    `;
    const parsed = row ? membershipRowSchema.safeParse(row) : null;
    if (!parsed?.success) return null;

    return {
      kind: 'supabase',
      userId: authUser.userId,
      workspaceId: parsed.data.workspaceId,
      role: parsed.data.role,
      actorId: parsed.data.actorId,
      isDemo: false,
      email: authUser.email,
      fullName: authUser.fullName,
    };
  }

  const demo = await getDemoSession();
  if (!demo) return null;

  const workspace = await ensureDemoWorkspace(demo.workspaceId);
  if (!workspace) return null;

  return {
    kind: 'demo',
    workspaceId: demo.workspaceId,
    role: demo.role,
    actorId: demo.role === 'doctor' ? workspace.doctor.id : workspace.patient.id,
    isDemo: true,
  };
}

export type ResolveClinicalActorOptions = {
  patientId?: string;
  entityCheck?: {
    kind: 'flag' | 'followup' | 'symptom' | 'exercise_attempt';
    id: string;
  };
  allowDoctorWithoutPatient?: boolean;
};

export type ResolveClinicalActorResult =
  | { ok: true; actor: ClinicalActor }
  | { ok: false; status: 400 | 403 | 404 | 503; error: string };

export async function resolveClinicalActor(
  session: SessionContext,
  options: ResolveClinicalActorOptions = {},
): Promise<ResolveClinicalActorResult> {
  if (session.role === 'caregiver') {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  if (session.kind === 'demo') {
    const workspace = await ensureDemoWorkspace(session.workspaceId);
    if (!workspace) return { ok: false, status: 503, error: 'unavailable' };
    if (options.patientId && options.patientId !== workspace.patient.id) {
      return { ok: false, status: 404, error: 'not_found' };
    }
    return {
      ok: true,
      actor: {
        workspaceId: session.workspaceId,
        doctorId: workspace.doctor.id,
        patientId: workspace.patient.id,
        role: session.role,
        isDemo: true,
      },
    };
  }

  const sql = getDatabase();
  if (!sql) return { ok: false, status: 503, error: 'unavailable' };

  if (session.role === 'patient' || session.role === 'individual') {
    if (options.patientId && options.patientId !== session.actorId) {
      return { ok: false, status: 404, error: 'not_found' };
    }
    const roleKind = session.role === 'individual' ? 'individual' : 'patient';
    const [row] = await sql`
      SELECT p.id, p.doctor_id AS "doctorId"
      FROM public.patients AS p
      JOIN public.workspaces AS w ON w.id = p.workspace_id AND w.is_demo = false
      WHERE p.workspace_id = ${session.workspaceId}
        AND p.id = ${session.actorId}
        AND p.role_kind = ${roleKind}
      LIMIT 1
    `;
    const parsed = row ? patientRowSchema.safeParse(row) : null;
    if (!parsed?.success) return { ok: false, status: 404, error: 'not_found' };
    return {
      ok: true,
      actor: {
        workspaceId: session.workspaceId,
        doctorId: parsed.data.doctorId,
        patientId: parsed.data.id,
        role: session.role,
        isDemo: false,
      },
    };
  }

  // session.role === 'doctor'
  if (options.entityCheck) {
    const { kind, id } = options.entityCheck;
    const rows =
      kind === 'flag'
        ? await sql`
            SELECT plan.patient_id AS "patientId"
            FROM public.flags AS flag
            JOIN public.evidence_logs AS evidence ON evidence.workspace_id = flag.workspace_id AND evidence.id = flag.evidence_log_id
            JOIN public.task_instances AS task ON task.workspace_id = evidence.workspace_id AND task.id = evidence.task_instance_id
            JOIN public.plan_items AS item ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
            JOIN public.plans AS plan ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
            JOIN public.workspaces AS w ON w.id = plan.workspace_id AND w.is_demo = false
            WHERE flag.workspace_id = ${session.workspaceId}
              AND flag.id = ${id}
              AND plan.doctor_id = ${session.actorId}
              AND (${options.patientId ?? null}::uuid IS NULL OR plan.patient_id = ${options.patientId ?? null}::uuid)
            LIMIT 1
          `
        : kind === 'followup'
          ? await sql`
              SELECT plan.patient_id AS "patientId"
              FROM public.flag_followups AS followup
              JOIN public.flags AS flag ON flag.workspace_id = followup.workspace_id AND flag.id = followup.flag_id
              JOIN public.evidence_logs AS evidence ON evidence.workspace_id = flag.workspace_id AND evidence.id = flag.evidence_log_id
              JOIN public.task_instances AS task ON task.workspace_id = evidence.workspace_id AND task.id = evidence.task_instance_id
              JOIN public.plan_items AS item ON item.workspace_id = task.workspace_id AND item.id = task.plan_item_id
              JOIN public.plans AS plan ON plan.workspace_id = item.workspace_id AND plan.id = item.plan_id
              JOIN public.workspaces AS w ON w.id = plan.workspace_id AND w.is_demo = false
              WHERE followup.workspace_id = ${session.workspaceId}
                AND followup.id = ${id}
                AND plan.doctor_id = ${session.actorId}
                AND (${options.patientId ?? null}::uuid IS NULL OR plan.patient_id = ${options.patientId ?? null}::uuid)
              LIMIT 1
            `
          : kind === 'symptom'
            ? await sql`
                SELECT patient.id AS "patientId"
                FROM public.urgent_symptoms AS symptom
                JOIN public.patients AS patient ON patient.workspace_id = symptom.workspace_id AND patient.id = symptom.patient_id
                JOIN public.workspaces AS w ON w.id = patient.workspace_id AND w.is_demo = false
                WHERE symptom.workspace_id = ${session.workspaceId}
                  AND symptom.id = ${id}
                  AND patient.doctor_id = ${session.actorId}
                  AND (${options.patientId ?? null}::uuid IS NULL OR patient.id = ${options.patientId ?? null}::uuid)
                LIMIT 1
              `
            : await sql`
                SELECT plan.patient_id AS "patientId"
                FROM public.exercise_attempts AS attempt
                JOIN public.exercise_prescriptions AS plan ON plan.workspace_id = attempt.workspace_id AND plan.id = attempt.prescription_id
                JOIN public.workspaces AS w ON w.id = plan.workspace_id AND w.is_demo = false
                WHERE attempt.workspace_id = ${session.workspaceId}
                  AND attempt.id = ${id}
                  AND plan.doctor_id = ${session.actorId}
                  AND (${options.patientId ?? null}::uuid IS NULL OR plan.patient_id = ${options.patientId ?? null}::uuid)
                LIMIT 1
              `;

    const parsed = rows[0] ? entityPatientRowSchema.safeParse(rows[0]) : null;
    if (!parsed?.success) return { ok: false, status: 404, error: 'not_found' };
    return {
      ok: true,
      actor: {
        workspaceId: session.workspaceId,
        doctorId: session.actorId,
        patientId: parsed.data.patientId,
        role: 'doctor',
        isDemo: false,
      },
    };
  }

  if (options.patientId) {
    const [row] = await sql`
      SELECT p.id, p.doctor_id AS "doctorId"
      FROM public.patients AS p
      JOIN public.workspaces AS w ON w.id = p.workspace_id AND w.is_demo = false
      WHERE p.workspace_id = ${session.workspaceId}
        AND p.id = ${options.patientId}
        AND p.doctor_id = ${session.actorId}
      LIMIT 1
    `;
    const parsed = row ? patientRowSchema.safeParse(row) : null;
    if (!parsed?.success) return { ok: false, status: 404, error: 'not_found' };
    return {
      ok: true,
      actor: {
        workspaceId: session.workspaceId,
        doctorId: session.actorId,
        patientId: parsed.data.id,
        role: 'doctor',
        isDemo: false,
      },
    };
  }

  if (options.allowDoctorWithoutPatient) {
    return {
      ok: true,
      actor: {
        workspaceId: session.workspaceId,
        doctorId: session.actorId,
        patientId: null,
        role: 'doctor',
        isDemo: false,
      },
    };
  }

  const rows = await sql`
    SELECT p.id, p.doctor_id AS "doctorId"
    FROM public.patients AS p
    JOIN public.workspaces AS w ON w.id = p.workspace_id AND w.is_demo = false
    WHERE p.workspace_id = ${session.workspaceId}
      AND p.doctor_id = ${session.actorId}
    ORDER BY p.name ASC, p.id ASC
    LIMIT 2
  `;

  if (rows.length === 1) {
    const parsed = patientRowSchema.safeParse(rows[0]);
    if (!parsed.success) return { ok: false, status: 404, error: 'not_found' };
    return {
      ok: true,
      actor: {
        workspaceId: session.workspaceId,
        doctorId: session.actorId,
        patientId: parsed.data.id,
        role: 'doctor',
        isDemo: false,
      },
    };
  }

  if (rows.length === 0) {
    return { ok: false, status: 404, error: 'not_found' };
  }

  return { ok: false, status: 400, error: 'patient_required' };
}

export type ResolveMobilePatientResult =
  | { ok: true; actor: ClinicalActor; patientName: string }
  | { ok: false; status: 401 | 403 | 404 | 503; error: string };

export async function resolveMobilePatientActor(request: Request): Promise<ResolveMobilePatientResult> {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization);
  const token = bearerMatch ? bearerMatch[1].trim() : '';
  if (!token) return { ok: false, status: 401, error: 'unauthorized' };

  if (demoBearerPattern.test(token)) {
    if (!isAndroidDemoEnabled()) return { ok: false, status: 404, error: 'not_found' };
    const demoActor = await androidPatient(request);
    if (!demoActor) return { ok: false, status: 401, error: 'unauthorized' };
    return {
      ok: true,
      actor: {
        workspaceId: demoActor.workspaceId,
        doctorId: demoActor.doctorId,
        patientId: demoActor.patientId,
        role: demoActor.role,
        isDemo: true,
      },
      patientName: demoActor.patientName,
    };
  }

  if (!jwtBearerPattern.test(token)) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }

  const supabaseClient = createSupabaseAdminClient() ?? createStatelessSupabaseClient();
  if (!supabaseClient) return { ok: false, status: 503, error: 'unavailable' };

  let authUserId: string;
  try {
    const { data, error } = await supabaseClient.auth.getUser(token);
    if (error || !data.user) {
      return { ok: false, status: 401, error: 'unauthorized' };
    }
    authUserId = data.user.id;
  } catch {
    return { ok: false, status: 503, error: 'unavailable' };
  }

  const rawWorkspaceHeader = request.headers.get('x-workspace-id')?.trim();
  let requestedWorkspaceId: string | null = null;
  if (rawWorkspaceHeader) {
    const parsedWs = z.uuid().safeParse(rawWorkspaceHeader);
    if (!parsedWs.success) return { ok: false, status: 403, error: 'forbidden' };
    requestedWorkspaceId = parsedWs.data;
  }

  return resolveMobileClinicPatient(authUserId, requestedWorkspaceId);
}

// The caller must already have verified this user with Supabase Auth.
export async function resolveMobileClinicPatient(
  authUserId: string,
  requestedWorkspaceId: string | null = null,
): Promise<ResolveMobilePatientResult> {
  const sql = getDatabase();
  if (!sql) return { ok: false, status: 503, error: 'unavailable' };

  const rows = await sql`
    SELECT cm.workspace_id AS "workspaceId",
           p.id AS "patientId",
           p.doctor_id AS "doctorId",
           cm.role,
           p.name AS "patientName",
           w.is_demo AS "isDemo"
    FROM public.clinic_memberships AS cm
    JOIN public.workspaces AS w ON w.id = cm.workspace_id AND w.is_demo = false
    LEFT JOIN public.patients AS p ON p.workspace_id = cm.workspace_id AND p.id = cm.actor_id
    WHERE cm.user_id = ${authUserId}
      AND cm.is_demo = false
      AND cm.status = 'active'
      AND w.is_demo = false
      AND (${requestedWorkspaceId}::uuid IS NULL OR cm.workspace_id = ${requestedWorkspaceId}::uuid)
    ORDER BY (cm.role IN ('patient', 'individual')) DESC, cm.created_at DESC, cm.id DESC
  `;

  for (const raw of rows) {
    const parsed = mobileMembershipRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    if ((parsed.data.role === 'patient' || parsed.data.role === 'individual') && parsed.data.patientId) {
      return {
        ok: true,
        actor: {
          workspaceId: parsed.data.workspaceId,
          doctorId: parsed.data.doctorId,
          patientId: parsed.data.patientId,
          role: parsed.data.role,
          isDemo: false,
        },
        patientName: parsed.data.patientName ?? 'Bemor',
      };
    }
  }

  return { ok: false, status: 403, error: 'forbidden' };
}

export type ResolveClinicalRequestActorOptions = ResolveClinicalActorOptions & {
  allowBearer?: boolean;
  requireSameOrigin?: boolean;
  allowRoles?: readonly AppRole[];
};

export type ResolveClinicalRequestActorResult =
  | { ok: true; actor: ClinicalActor; authMode: 'bearer' | 'cookie' }
  | { ok: false; status: 400 | 401 | 403 | 404 | 503; error: string };

/**
 * Resolves a clinical actor from either an `Authorization: Bearer <token>` header
 * (for M4 Android / M5 Telegram Mini App) or a web session cookie.
 * Never falls back to cookies when a Bearer header is present, and always
 * enforces `isSameOriginPost` on cookie-authenticated mutations when `requireSameOrigin` is set.
 */
export async function resolveClinicalRequestActor(
  request: NextRequest,
  options: ResolveClinicalRequestActorOptions = {},
): Promise<ResolveClinicalRequestActorResult> {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  if (/^Bearer(?:\s+|$)/i.test(authorization)) {
    if (!options.allowBearer) {
      return { ok: false, status: 401, error: 'unauthorized' };
    }
    const auth = await resolveMobilePatientActor(request);
    if (!auth.ok) {
      return { ok: false, status: auth.status, error: auth.error };
    }
    if (options.allowRoles && !options.allowRoles.includes(auth.actor.role)) {
      return { ok: false, status: 403, error: 'forbidden' };
    }
    if (options.patientId && options.patientId !== auth.actor.patientId) {
      return { ok: false, status: 404, error: 'not_found' };
    }
    return { ok: true, actor: auth.actor, authMode: 'bearer' };
  }

  if (options.requireSameOrigin && !isSameOriginPost(request)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  const session = await resolveWebSessionContext(request);
  if (!session) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  if (options.allowRoles && !options.allowRoles.includes(session.role)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  const resolved = await resolveClinicalActor(session, options);
  if (!resolved.ok) {
    return resolved;
  }
  return { ok: true, actor: resolved.actor, authMode: 'cookie' };
}
