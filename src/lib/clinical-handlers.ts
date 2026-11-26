import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getActivityDashboard, saveStepCount } from './activity-store';
import { stepsJsonInput } from './adherence';
import { exerciseCoachInputSchema } from './ai/exercise-coach';
import { personalizedExerciseCoach, publicExerciseCoach } from './ai/public-exercise-coach';
import {
  getAuthenticatedSupabaseUser,
  listPendingMembershipInvites,
  resolveClinicalActor,
  resolveClinicalRequestActor,
  resolveWebSessionContext,
} from './auth';
import { caregiverActionSchema } from './caregiver';
import {
  acknowledgeAuthenticatedCaregiverHelp,
  changeCaregiverSharing,
  getCaregiverSharing,
  readAuthenticatedCaregiverSummary,
} from './caregiver-store';
import {
  evidenceJsonInput,
  followupAckJsonInput,
  followupJsonInput,
  planJsonInput,
  prepareEvidence,
  reviewJsonInput,
  symptomReviewJsonInput,
  urgentSymptomJsonInput,
} from './clinical-inputs';
import {
  acknowledgeFlagFollowup,
  assignPlan,
  getClinicalView,
  getTaskContext,
  reviewFlag,
  reviewUrgentSymptom,
  saveEvidence,
  saveFlagFollowup,
  saveUrgentSymptom,
} from './clinical-store';
import { isPatientSideRole, type ClinicalActor, type MutationResult } from './clinical-types';
import { getDatabase } from './db';
import { handleDorimosRequest } from './dorimos-server';
import {
  exerciseInput,
  exercisePlanJsonInput,
  exerciseReviewJsonInput,
} from './exercise-inputs';
import {
  assignExercise,
  readExerciseAttempts,
  readExercisePlan,
  reviewExerciseAttempt,
  saveExercise,
} from './exercise-store';
import { isSameOriginPost, readRequestJson } from './request-body';
import {
  createTelegramPairing,
  disconnectDoctorTelegram,
  disconnectPatientTelegram,
  getDoctorTelegramStatus,
  getPatientTelegramStatus,
} from './telegram-store';
import { getTelegramBotUsername } from './telegram-web';

const noStore = { 'Cache-Control': 'private, no-store' };
const telegramHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };

function json(data: unknown, status = 200, headers: Record<string, string> = noStore) {
  return NextResponse.json(data, { status, headers });
}

function errorJson(error: string, status: number, headers: Record<string, string> = noStore) {
  return NextResponse.json({ error }, { status, headers });
}

function mutationResponse(result: MutationResult, extra?: Record<string, unknown>) {
  if (result === 'not_found') return errorJson('not_found', 404);
  return json({ status: result, ...extra }, 200);
}

const doctorPatientRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  roleKind: z.enum(['patient', 'individual']),
});

const caregiverAckSchema = z.strictObject({
  action: z.literal('ack'),
  kind: z.enum(['supply_on_the_way', 'checked_in']),
});

const caregiverInvitePostSchema = z.union([
  z.strictObject({
    action: z.literal('invite'),
    email: z.email().trim().toLowerCase().max(254),
    patientId: z.uuid().optional(),
  }),
  z.strictObject({
    action: z.literal('revoke'),
    membershipId: z.uuid(),
    patientId: z.uuid().optional(),
  }),
  z.strictObject({
    action: z.enum(['accept', 'decline']),
    membershipId: z.uuid(),
  }),
]);

const patientsPostSchema = z.union([
  z.strictObject({
    action: z.literal('create'),
    name: z.string().trim().min(1).max(120),
    email: z.email().trim().toLowerCase().max(254).optional(),
  }),
  z.strictObject({
    action: z.literal('link'),
    patientId: z.uuid(),
    email: z.email().trim().toLowerCase().max(254),
  }),
  z.strictObject({
    action: z.enum(['accept', 'decline']),
    membershipId: z.uuid(),
  }),
]);

const telegramActionSchema = z.strictObject({
  action: z.enum(['pair', 'disconnect']),
});

const caregiverInviteListRowSchema = z.object({
  membershipId: z.uuid(),
  status: z.enum(['active', 'invited', 'revoked']),
  caregiverName: z.string(),
  caregiverEmail: z.string(),
  createdAt: z.iso.datetime(),
});

const caregiverUserInviteRowSchema = z.object({
  membershipId: z.uuid(),
  workspaceId: z.uuid(),
  workspaceName: z.string(),
  patientId: z.uuid(),
  patientName: z.string(),
  status: z.enum(['active', 'invited']),
  createdAt: z.iso.datetime(),
});

const membershipStatusRowSchema = z.object({
  id: z.uuid(),
  status: z.enum(['active', 'invited', 'revoked']),
});

async function requireSameOriginWebSession(
  request: NextRequest,
  roleCheck: (role: ClinicalActor['role']) => boolean,
) {
  if (!isSameOriginPost(request)) {
    return { ok: false as const, response: errorJson('forbidden', 403) };
  }
  const session = await resolveWebSessionContext(request);
  if (!session) {
    return { ok: false as const, response: errorJson('unauthorized', 401) };
  }
  if (!roleCheck(session.role)) {
    return { ok: false as const, response: errorJson('forbidden', 403) };
  }
  return { ok: true as const, session };
}

function resolvePatientRequest(request: NextRequest) {
  return resolveClinicalRequestActor(request, {
    allowBearer: true, requireSameOrigin: true, allowRoles: ['patient', 'individual'],
  });
}

async function readPostJson<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
  maxBytes = 4096,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const body = await readRequestJson(request, maxBytes);
  if (!body.ok) {
    return { ok: false, response: errorJson(body.status === 413 ? 'too_large' : 'invalid', body.status) };
  }
  const parsed = schema.safeParse(body.body);
  if (!parsed.success) {
    return { ok: false, response: errorJson('invalid', 400) };
  }
  return { ok: true, data: parsed.data };
}

async function readValidatedPostJson<T>(
  request: NextRequest,
  schema: z.ZodType<T>,
  maxBytes = 4096,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  if (!isSameOriginPost(request)) {
    return { ok: false, response: errorJson('forbidden', 403) };
  }
  return readPostJson(request, schema, maxBytes);
}

export async function handleClinicalViewGet(request: NextRequest) {
  try {
    const session = await resolveWebSessionContext(request);
    if (!session) return errorJson('unauthorized', 401);
    if (session.role === 'caregiver') return errorJson('forbidden', 403);

    const rawPatientId = request.nextUrl.searchParams.get('patientId')?.trim();
    let patientIdParam: string | undefined;
    if (rawPatientId) {
      const parsedId = z.uuid().safeParse(rawPatientId);
      if (!parsedId.success) return errorJson('invalid', 400);
      patientIdParam = parsedId.data;
    }

    if (session.kind === 'supabase' && session.role === 'doctor') {
      const sql = getDatabase();
      if (!sql) return errorJson('unavailable', 503);

      const patientRows = await sql`
        SELECT p.id, p.name, p.role_kind AS "roleKind"
        FROM public.patients AS p
        JOIN public.workspaces AS w ON w.id = p.workspace_id AND w.is_demo = false
        WHERE p.workspace_id = ${session.workspaceId}
          AND p.doctor_id = ${session.actorId}
        ORDER BY p.name ASC, p.id ASC
      `;
      const patients = z.array(doctorPatientRowSchema).parse(patientRows);

      if (!patientIdParam && patients.length === 0) {
        return json({
          role: 'doctor',
          isDemo: false,
          workspaceId: session.workspaceId,
          patientId: null,
          patients: [],
          view: null,
          activity: null,
          exercisePlan: null,
          exerciseAttempts: [],
        });
      }

      if (!patientIdParam && patients.length > 1) {
        return json({ error: 'patient_required', patients }, 400);
      }

      const resolved = await resolveClinicalActor(session, {
        patientId: patientIdParam ?? patients[0]!.id,
      });
      if (!resolved.ok) return errorJson(resolved.error, resolved.status);

      const [view, activity, exercisePlan, exerciseAttempts] = await Promise.all([
        getClinicalView(resolved.actor),
        getActivityDashboard(resolved.actor).catch(() => null),
        readExercisePlan(resolved.actor).catch(() => null),
        readExerciseAttempts(resolved.actor).catch(() => []),
      ]);

      return json({
        role: resolved.actor.role,
        isDemo: false,
        workspaceId: resolved.actor.workspaceId,
        patientId: resolved.actor.patientId,
        patients,
        view,
        activity,
        exercisePlan,
        exerciseAttempts,
      });
    }

    const resolved = await resolveClinicalActor(session, { patientId: patientIdParam });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);

    const [view, activity, exercisePlan, exerciseAttempts] = await Promise.all([
      getClinicalView(resolved.actor),
      getActivityDashboard(resolved.actor).catch(() => null),
      readExercisePlan(resolved.actor).catch(() => null),
      readExerciseAttempts(resolved.actor).catch(() => []),
    ]);

    return json({
      role: resolved.actor.role,
      isDemo: Boolean(resolved.actor.isDemo),
      workspaceId: resolved.actor.workspaceId,
      patientId: resolved.actor.patientId,
      view,
      activity,
      exercisePlan,
      exerciseAttempts,
    });
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalPlanPost(request: NextRequest) {
  try {
    const auth = await requireSameOriginWebSession(request, (r) => r === 'doctor');
    if (!auth.ok) return auth.response;

    const parsed = await readPostJson(request, planJsonInput);
    if (!parsed.ok) return parsed.response;

    const resolved = await resolveClinicalActor(auth.session, { patientId: parsed.data.patientId });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);

    const result = await assignPlan(resolved.actor, parsed.data.plan);
    return mutationResponse(result);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalEvidencePost(request: NextRequest) {
  try {
    const auth = await resolvePatientRequest(request);
    if (!auth.ok) return errorJson(auth.error, auth.status);

    const parsed = await readPostJson(request, evidenceJsonInput);
    if (!parsed.ok) return parsed.response;

    if (parsed.data.patientId && parsed.data.patientId !== auth.actor.patientId) return errorJson('not_found', 404);
    const context = await getTaskContext(auth.actor, parsed.data.command.taskId);
    const evidence = context ? prepareEvidence(parsed.data.command, context) : null;
    const result = evidence ? await saveEvidence(auth.actor, evidence) : 'not_found';
    return mutationResponse(result);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalReviewPost(request: NextRequest) {
  try {
    const auth = await requireSameOriginWebSession(request, (r) => r === 'doctor');
    if (!auth.ok) return auth.response;

    const parsed = await readPostJson(request, reviewJsonInput);
    if (!parsed.ok) return parsed.response;

    const resolved = await resolveClinicalActor(auth.session, {
      patientId: parsed.data.patientId,
      entityCheck: { kind: 'flag', id: parsed.data.flagId },
    });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);

    const result = await reviewFlag(resolved.actor, {
      flagId: parsed.data.flagId,
      decision: parsed.data.decision,
      reply: parsed.data.reply,
      note: parsed.data.note,
    });
    return mutationResponse(result);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalFollowupPost(request: NextRequest) {
  try {
    const auth = await requireSameOriginWebSession(request, isPatientSideRole);
    if (!auth.ok) return auth.response;

    const parsed = await readPostJson(request, followupJsonInput);
    if (!parsed.ok) return parsed.response;

    const resolved = await resolveClinicalActor(auth.session, { patientId: parsed.data.patientId });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);

    const result = await saveFlagFollowup(resolved.actor, parsed.data.followup);
    return mutationResponse(result);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalFollowupAckPost(request: NextRequest) {
  try {
    const auth = await requireSameOriginWebSession(request, (r) => r === 'doctor');
    if (!auth.ok) return auth.response;

    const parsed = await readPostJson(request, followupAckJsonInput);
    if (!parsed.ok) return parsed.response;

    const resolved = await resolveClinicalActor(auth.session, {
      patientId: parsed.data.patientId,
      entityCheck: { kind: 'followup', id: parsed.data.followupId },
    });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);

    const result = await acknowledgeFlagFollowup(resolved.actor, {
      followupId: parsed.data.followupId,
      note: parsed.data.note,
    });
    return mutationResponse(result);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalSymptomPost(request: NextRequest) {
  try {
    const auth = await resolvePatientRequest(request);
    if (!auth.ok) return errorJson(auth.error, auth.status);

    const parsed = await readPostJson(request, urgentSymptomJsonInput);
    if (!parsed.ok) return parsed.response;

    if (parsed.data.patientId && parsed.data.patientId !== auth.actor.patientId) return errorJson('not_found', 404);
    const result = await saveUrgentSymptom(auth.actor, {
      symptom: parsed.data.symptom,
      note: parsed.data.note,
    });
    return mutationResponse(result);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalSymptomReviewPost(request: NextRequest) {
  try {
    const auth = await requireSameOriginWebSession(request, (r) => r === 'doctor');
    if (!auth.ok) return auth.response;

    const parsed = await readPostJson(request, symptomReviewJsonInput);
    if (!parsed.ok) return parsed.response;

    const resolved = await resolveClinicalActor(auth.session, {
      patientId: parsed.data.patientId,
      entityCheck: { kind: 'symptom', id: parsed.data.symptomId },
    });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);

    const result = await reviewUrgentSymptom(resolved.actor, {
      symptomId: parsed.data.symptomId,
      decision: parsed.data.decision,
      reply: parsed.data.reply,
      note: parsed.data.note,
    });
    return mutationResponse(result);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalStepsPost(request: NextRequest) {
  try {
    const auth = await resolvePatientRequest(request);
    if (!auth.ok) return errorJson(auth.error, auth.status);

    const parsed = await readPostJson(request, stepsJsonInput, 1024);
    if (!parsed.ok) return parsed.response;

    if ((auth.authMode === 'telegram' && parsed.data.source !== 'self_report')
      || (parsed.data.source === 'demo_sim' && auth.actor.isDemo !== true)) {
      return errorJson('forbidden', 403);
    }

    const result = await saveStepCount(auth.actor, parsed.data);
    return mutationResponse(result, { count: parsed.data.count });
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalDorimosPost(request: NextRequest) {
  try {
    const auth = await resolvePatientRequest(request);
    if (!auth.ok) return errorJson(auth.error, auth.status);

    const outcome = await handleDorimosRequest(auth.actor, request);
    return json(outcome.data, outcome.status);
  } catch {
    return json({ status: 'manual' }, 503);
  }
}

export async function handleClinicalExercisePlanPost(request: NextRequest) {
  try {
    const auth = await requireSameOriginWebSession(request, (r) => r === 'doctor');
    if (!auth.ok) return auth.response;

    const parsed = await readPostJson(request, exercisePlanJsonInput);
    if (!parsed.ok) return parsed.response;

    const resolved = await resolveClinicalActor(auth.session, { patientId: parsed.data.patientId });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);

    const result = await assignExercise(resolved.actor, {
      movement: parsed.data.movement,
      targetAngle: parsed.data.targetAngle,
      targetReps: parsed.data.targetReps,
      maxShallow: parsed.data.maxShallow,
      painColor: parsed.data.painColor,
    });
    return mutationResponse(result);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalExercisePost(request: NextRequest) {
  try {
    const auth = await resolvePatientRequest(request);
    if (!auth.ok) return errorJson(auth.error, auth.status);

    const parsed = await readPostJson(request, exerciseInput, 10_000);
    if (!parsed.ok) return parsed.response;

    const saved = await saveExercise(auth.actor, parsed.data);
    if (saved.status === 'saved') return json(saved, 200);
    if (saved.status === 'duplicate') return json({ status: saved.status }, 409);
    return json({ status: saved.status }, 422);
  } catch {
    return json({ status: 'unavailable' }, 503);
  }
}

export async function handleClinicalExerciseReviewPost(request: NextRequest) {
  try {
    const auth = await requireSameOriginWebSession(request, (r) => r === 'doctor');
    if (!auth.ok) return auth.response;

    const parsed = await readPostJson(request, exerciseReviewJsonInput);
    if (!parsed.ok) return parsed.response;

    const resolved = await resolveClinicalActor(auth.session, {
      patientId: parsed.data.patientId,
      entityCheck: { kind: 'exercise_attempt', id: parsed.data.attemptId },
    });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);

    const result = await reviewExerciseAttempt(resolved.actor, {
      attemptId: parsed.data.attemptId,
      decision: parsed.data.decision,
      reply: parsed.data.reply,
    });
    return mutationResponse(result);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalExerciseCoachPost(request: NextRequest) {
  try {
    const auth = await resolveClinicalRequestActor(request, {
      allowBearer: true, requireSameOrigin: true, allowRoles: ['doctor', 'patient', 'individual'],
      allowDoctorWithoutPatient: true,
    });
    if (!auth.ok) return errorJson(auth.error, auth.status);

    const parsed = await readPostJson(request, exerciseCoachInputSchema, 2048);
    if (!parsed.ok) return parsed.response;

    const advice = 'sample' in parsed.data
      ? await publicExerciseCoach(parsed.data.sample)
      : await personalizedExerciseCoach(parsed.data);
    return json(advice, 200);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalCaregiverGet(request: NextRequest) {
  try {
    const session = await resolveWebSessionContext(request);
    if (!session) return errorJson('unauthorized', 401);
    if (session.role === 'doctor') return errorJson('forbidden', 403);

    if (session.kind === 'supabase' && session.role === 'caregiver') {
      const summary = await readAuthenticatedCaregiverSummary({
        workspaceId: session.workspaceId,
        patientId: session.actorId,
        doctorId: null,
        role: 'caregiver',
        isDemo: false,
      });
      if (!summary) return errorJson('not_found', 404);
      return json({ role: 'caregiver', ...summary }, 200);
    }

    const resolved = await resolveClinicalActor(session);
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);
    const expiresAt = await getCaregiverSharing(resolved.actor);
    return json({ role: resolved.actor.role, expiresAt }, 200);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalCaregiverPost(request: NextRequest) {
  try {
    if (!isSameOriginPost(request)) return errorJson('forbidden', 403);
    const session = await resolveWebSessionContext(request);
    if (!session) return errorJson('unauthorized', 401);
    if (session.role === 'doctor') return errorJson('forbidden', 403);

    const body = await readRequestJson(request, 1024);
    if (!body.ok) return errorJson(body.status === 413 ? 'too_large' : 'invalid', body.status);

    if (session.kind === 'supabase' && session.role === 'caregiver') {
      const parsed = caregiverAckSchema.safeParse(body.body);
      if (!parsed.success) return errorJson('invalid', 400);
      const saved = await acknowledgeAuthenticatedCaregiverHelp(
        {
          workspaceId: session.workspaceId,
          patientId: session.actorId,
          doctorId: null,
          role: 'caregiver',
          isDemo: false,
        },
        parsed.data.kind,
      );
      if (!saved) return errorJson('not_found', 404);
      return json(saved, 200);
    }

    const parsed = caregiverActionSchema.safeParse(body.body);
    if (!parsed.success) return errorJson('invalid', 400);

    const resolved = await resolveClinicalActor(session);
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);

    const result = await changeCaregiverSharing(resolved.actor, parsed.data.action);
    return result ? json(result, 200) : errorJson('not_found', 404);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalCaregiverInviteGet(request: NextRequest) {
  try {
    const sql = getDatabase();
    if (!sql) return errorJson('unavailable', 503);

    const session = await resolveWebSessionContext(request);
    if (session?.kind === 'demo') return errorJson('forbidden', 403);

    if (session?.kind === 'supabase' && session.role !== 'caregiver') {
      const rawPatientId = request.nextUrl.searchParams.get('patientId')?.trim();
      let patientIdParam: string | undefined;
      if (rawPatientId) {
        const parsedId = z.uuid().safeParse(rawPatientId);
        if (!parsedId.success) return errorJson('invalid', 400);
        patientIdParam = parsedId.data;
      }

      const resolved = await resolveClinicalActor(session, { patientId: patientIdParam });
      if (!resolved.ok) return errorJson(resolved.error, resolved.status);
      if (!resolved.actor.patientId) return errorJson('patient_required', 400);

      const rows = await sql`
        SELECT cm.id AS "membershipId",
               cm.status,
               COALESCE(p.full_name, u.email, '') AS "caregiverName",
               COALESCE(u.email, '') AS "caregiverEmail",
               to_char(cm.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
        FROM public.clinic_memberships AS cm
        JOIN auth.users AS u ON u.id = cm.user_id
        LEFT JOIN public.profiles AS p ON p.id = cm.user_id
        WHERE cm.workspace_id = ${resolved.actor.workspaceId}
          AND cm.role = 'caregiver'
          AND cm.is_demo = false
          AND cm.actor_id = ${resolved.actor.patientId}
        ORDER BY cm.created_at DESC, cm.id DESC
      `;
      return json({ invites: z.array(caregiverInviteListRowSchema).parse(rows) }, 200);
    }

    const authUser = await getAuthenticatedSupabaseUser(request);
    if (!authUser) return errorJson('unauthorized', 401);

    const rows = await sql`
      SELECT cm.id AS "membershipId",
             cm.workspace_id AS "workspaceId",
             w.name AS "workspaceName",
             cm.actor_id AS "patientId",
             pat.name AS "patientName",
             cm.status,
             to_char(cm.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM public.clinic_memberships AS cm
      JOIN public.workspaces AS w ON w.id = cm.workspace_id AND w.is_demo = false
      JOIN public.patients AS pat ON pat.workspace_id = cm.workspace_id AND pat.id = cm.actor_id
      WHERE cm.user_id = ${authUser.userId}
        AND cm.role = 'caregiver'
        AND cm.is_demo = false
        AND cm.status IN ('invited', 'active')
      ORDER BY cm.created_at DESC, cm.id DESC
    `;
    return json({ invites: z.array(caregiverUserInviteRowSchema).parse(rows) }, 200);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalCaregiverInvitePost(request: NextRequest) {
  try {
    const parsed = await readValidatedPostJson(request, caregiverInvitePostSchema);
    if (!parsed.ok) return parsed.response;

    const sql = getDatabase();
    if (!sql) return errorJson('unavailable', 503);

    const input = parsed.data;
    switch (input.action) {
      case 'accept':
      case 'decline': {
        const authUser = await getAuthenticatedSupabaseUser(request);
        if (!authUser) return errorJson('unauthorized', 401);

        const nextStatus = input.action === 'accept' ? 'active' : 'revoked';
        const [updated] = await sql`
          UPDATE public.clinic_memberships
          SET status = ${nextStatus},
              created_at = CASE WHEN ${nextStatus} = 'active' THEN CURRENT_TIMESTAMP ELSE created_at END
          WHERE id = ${input.membershipId}
            AND user_id = ${authUser.userId}
            AND role = 'caregiver'
            AND is_demo = false
            AND status = 'invited'
          RETURNING id AS "membershipId", workspace_id AS "workspaceId", actor_id AS "patientId", status
        `;
        if (!updated) return errorJson('not_found', 404);
        return json(updated, 200);
      }
      case 'revoke': {
        const session = await resolveWebSessionContext(request);
        if (!session) return errorJson('unauthorized', 401);
        if (session.kind !== 'supabase' || session.role === 'caregiver') {
          return errorJson('forbidden', 403);
        }

        const resolved = await resolveClinicalActor(session, { patientId: input.patientId });
        if (!resolved.ok) return errorJson(resolved.error, resolved.status);
        if (!resolved.actor.patientId) return errorJson('patient_required', 400);

        const [revoked] = await sql`
          UPDATE public.clinic_memberships
          SET status = 'revoked'
          WHERE id = ${input.membershipId}
            AND workspace_id = ${resolved.actor.workspaceId}
            AND role = 'caregiver'
            AND actor_id = ${resolved.actor.patientId}
            AND is_demo = false
          RETURNING id, status
        `;
        const row = revoked ? membershipStatusRowSchema.safeParse(revoked) : null;
        if (!row?.success) return errorJson('not_found', 404);
        return json({ membershipId: row.data.id, status: row.data.status }, 200);
      }
      case 'invite': {
        const session = await resolveWebSessionContext(request);
        if (!session) return errorJson('unauthorized', 401);
        if (session.kind !== 'supabase' || session.role === 'caregiver') {
          return errorJson('forbidden', 403);
        }

        const resolved = await resolveClinicalActor(session, { patientId: input.patientId });
        if (!resolved.ok) return errorJson(resolved.error, resolved.status);
        if (!resolved.actor.patientId) return errorJson('patient_required', 400);

        const [targetUser] = await sql`
          SELECT id FROM auth.users WHERE lower(email) = lower(${input.email}) LIMIT 1
        `;
        const targetId = z.object({ id: z.uuid() }).safeParse(targetUser);
        if (!targetId.success) return errorJson('user_not_found', 404);
        if (targetId.data.id === session.userId) return errorJson('invalid', 400);

        const [upserted] = await sql`
          INSERT INTO public.clinic_memberships (user_id, workspace_id, is_demo, role, actor_id, status)
          VALUES (${targetId.data.id}, ${resolved.actor.workspaceId}, false, 'caregiver', ${resolved.actor.patientId}, 'invited')
          ON CONFLICT (user_id, workspace_id, role, actor_id) DO UPDATE
          SET status = CASE
            WHEN public.clinic_memberships.status = 'revoked' THEN 'invited'
            ELSE public.clinic_memberships.status
          END
          RETURNING id, status
        `;
        const row = upserted ? membershipStatusRowSchema.parse(upserted) : null;
        if (!row) return errorJson('unavailable', 503);
        return json({ membershipId: row.id, status: row.status }, 200);
      }
    }
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalPatientsGet(request: NextRequest) {
  try {
    const sql = getDatabase();
    if (!sql) return errorJson('unavailable', 503);

    const session = await resolveWebSessionContext(request);
    if (session?.kind === 'demo') return errorJson('forbidden', 403);

    if (session?.kind === 'supabase' && session.role === 'doctor') {
      const rows = await sql`
        SELECT p.id, p.name, p.role_kind AS "roleKind"
        FROM public.patients AS p
        JOIN public.workspaces AS w ON w.id = p.workspace_id AND w.is_demo = false
        WHERE p.workspace_id = ${session.workspaceId}
          AND p.doctor_id = ${session.actorId}
        ORDER BY p.name ASC, p.id ASC
      `;
      return json({ patients: z.array(doctorPatientRowSchema).parse(rows) }, 200);
    }

    const authUser = await getAuthenticatedSupabaseUser(request);
    if (!authUser) return errorJson('unauthorized', 401);

    const allInvites = await listPendingMembershipInvites(authUser.userId);
    const pendingInvites = allInvites.filter((invite) => invite.role === 'patient');
    return json({ pendingInvites }, 200);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalPatientsPost(request: NextRequest) {
  try {
    const parsed = await readValidatedPostJson(request, patientsPostSchema);
    if (!parsed.ok) return parsed.response;

    const sql = getDatabase();
    if (!sql) return errorJson('unavailable', 503);

    const input = parsed.data;
    switch (input.action) {
      case 'accept':
      case 'decline': {
        const authUser = await getAuthenticatedSupabaseUser(request);
        if (!authUser) return errorJson('unauthorized', 401);

        const nextStatus = input.action === 'accept' ? 'active' : 'revoked';
        const [updated] = await sql`
          UPDATE public.clinic_memberships
          SET status = ${nextStatus},
              created_at = CASE WHEN ${nextStatus} = 'active' THEN CURRENT_TIMESTAMP ELSE created_at END
          WHERE id = ${input.membershipId}
            AND user_id = ${authUser.userId}
            AND role = 'patient'
            AND is_demo = false
            AND status = 'invited'
          RETURNING id AS "membershipId", workspace_id AS "workspaceId", actor_id AS "patientId", status
        `;
        if (!updated) return errorJson('not_found', 404);
        return json(updated, 200);
      }
      case 'link': {
        const session = await resolveWebSessionContext(request);
        if (!session) return errorJson('unauthorized', 401);
        if (session.kind !== 'supabase' || session.role !== 'doctor') {
          return errorJson('forbidden', 403);
        }

        const [patientRow] = await sql`
          SELECT p.id
          FROM public.patients AS p
          JOIN public.workspaces AS w ON w.id = p.workspace_id AND w.is_demo = false
          WHERE p.workspace_id = ${session.workspaceId}
            AND p.id = ${input.patientId}
            AND p.doctor_id = ${session.actorId}
          LIMIT 1
        `;
        if (!patientRow) return errorJson('not_found', 404);

        const [targetUser] = await sql`
          SELECT id FROM auth.users WHERE lower(email) = lower(${input.email}) LIMIT 1
        `;
        const targetId = z.object({ id: z.uuid() }).safeParse(targetUser);
        if (!targetId.success) return errorJson('user_not_found', 404);
        if (targetId.data.id === session.userId) return errorJson('invalid', 400);

        const [membership] = await sql`
          INSERT INTO public.clinic_memberships (user_id, workspace_id, is_demo, role, actor_id, status)
          VALUES (${targetId.data.id}, ${session.workspaceId}, false, 'patient', ${input.patientId}, 'invited')
          ON CONFLICT (user_id, workspace_id, role, actor_id) DO UPDATE
          SET status = CASE
            WHEN public.clinic_memberships.status = 'revoked' THEN 'invited'
            ELSE public.clinic_memberships.status
          END
          RETURNING id, status
        `;
        const row = membership ? membershipStatusRowSchema.parse(membership) : null;
        return json({
          patientId: input.patientId,
          membershipId: row?.id ?? null,
          membershipStatus: row?.status ?? 'invited',
        }, 200);
      }
      case 'create': {
        const session = await resolveWebSessionContext(request);
        if (!session) return errorJson('unauthorized', 401);
        if (session.kind !== 'supabase' || session.role !== 'doctor') {
          return errorJson('forbidden', 403);
        }

        let targetUserId: string | null = null;
        if (input.email) {
          const [targetUser] = await sql`
            SELECT id FROM auth.users WHERE lower(email) = lower(${input.email}) LIMIT 1
          `;
          const targetId = z.object({ id: z.uuid() }).safeParse(targetUser);
          if (!targetId.success) return errorJson('user_not_found', 404);
          if (targetId.data.id === session.userId) return errorJson('invalid', 400);
          targetUserId = targetId.data.id;
        }

        const patientId = randomUUID();
        const patientName = input.name;
        if (targetUserId) {
          const [, membershipRows] = await sql.transaction((tx) => [
            tx`
              INSERT INTO public.patients (id, workspace_id, doctor_id, role_kind, name)
              VALUES (${patientId}, ${session.workspaceId}, ${session.actorId}, 'patient', ${patientName})
            `,
            tx`
              INSERT INTO public.clinic_memberships (user_id, workspace_id, is_demo, role, actor_id, status)
              VALUES (${targetUserId}, ${session.workspaceId}, false, 'patient', ${patientId}, 'invited')
              RETURNING id, status
            `,
          ], { isolationLevel: 'ReadCommitted' });
          const membership = membershipRows[0] ? membershipStatusRowSchema.parse(membershipRows[0]) : null;
          return json({
            patientId,
            name: patientName,
            membershipId: membership?.id ?? null,
            membershipStatus: membership?.status ?? 'invited',
          }, 201);
        }

        await sql`
          INSERT INTO public.patients (id, workspace_id, doctor_id, role_kind, name)
          VALUES (${patientId}, ${session.workspaceId}, ${session.actorId}, 'patient', ${patientName})
        `;
        return json({
          patientId,
          name: patientName,
          membershipId: null,
          membershipStatus: null,
        }, 201);
      }
    }
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function handleClinicalTelegramGet(request: NextRequest) {
  try {
    const session = await resolveWebSessionContext(request);
    if (!session) return errorJson('unauthorized', 401, telegramHeaders);
    if (session.role === 'caregiver') return errorJson('forbidden', 403, telegramHeaders);

    const resolved = await resolveClinicalActor(session, { allowDoctorWithoutPatient: true });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status, telegramHeaders);

    const connected = resolved.actor.role === 'doctor'
      ? await getDoctorTelegramStatus(resolved.actor)
      : await getPatientTelegramStatus(resolved.actor);
    return json({ connected }, 200, telegramHeaders);
  } catch {
    return errorJson('unavailable', 503, telegramHeaders);
  }
}

export async function handleClinicalTelegramPost(request: NextRequest) {
  try {
    const auth = await requireSameOriginWebSession(
      request,
      (r) => r === 'doctor' || isPatientSideRole(r),
    );
    if (!auth.ok) return auth.response;

    const parsed = await readPostJson(request, telegramActionSchema, 1024);
    if (!parsed.ok) return parsed.response;

    const resolved = await resolveClinicalActor(auth.session, { allowDoctorWithoutPatient: true });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status, telegramHeaders);

    if (parsed.data.action === 'disconnect') {
      if (resolved.actor.role === 'doctor') await disconnectDoctorTelegram(resolved.actor);
      else await disconnectPatientTelegram(resolved.actor);
      return new NextResponse(null, { status: 204, headers: telegramHeaders });
    }

    const botUsername = getTelegramBotUsername();
    if (!botUsername) return errorJson('unavailable', 503, telegramHeaders);

    const code = await createTelegramPairing(resolved.actor);
    if (!code) return errorJson('conflict', 409, telegramHeaders);

    const url = new URL(`/${botUsername}`, 'https://t.me');
    url.searchParams.set('start', code);
    return json({ href: url.href }, 200, telegramHeaders);
  } catch {
    return errorJson('unavailable', 503, telegramHeaders);
  }
}
