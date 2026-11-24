import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalActor } from '../../src/lib/clinical-types';
import type { SqlAdapter, TransactionSqlAdapter } from '../../src/lib/db';

type CapturedSqlCall = {
  sqlText: string;
  values: unknown[];
};

const state = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  capturedSql: [] as CapturedSqlCall[],
  sqlHandler: null as null | ((sqlText: string, values: unknown[]) => unknown[] | Promise<unknown[]>),
  txHandler: null as null | ((queries: { sqlText: string; values: unknown[] }[]) => unknown[][] | Promise<unknown[][]>),
  routeAuthUser: null as null | { id: string; email?: string | null; user_metadata?: Record<string, unknown> },
  routeGetUserError: null as null | { message: string },
  signInResult: null as null | { data: { user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null }; error: { message: string } | null },
  signUpResult: null as null | { data: { user: { id: string; email?: string | null } | null }; error: { message: string; code?: string; status?: number } | null },
  signOutCalls: [] as unknown[],
  routePendingCookies: [] as { name: string; value: string; options: Record<string, unknown> }[],
  adminCreateUserResult: null as null | { data: { user: { id: string; email?: string | null } | null }; error: { message: string; code?: string; status?: number } | null },
  adminDeleteUserCalls: [] as string[],
  adminGetUserResult: null as null | { data: { user: { id: string; email?: string | null } | null }; error: { message: string } | null },
  adminAvailable: true,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = state.cookies.get(name);
      return value !== undefined ? { name, value } : undefined;
    },
    getAll: () => Array.from(state.cookies.entries()).map(([name, value]) => ({ name, value })),
  }),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        getAll: () => { name: string; value: string }[];
        setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[], headers: Record<string, string>) => void;
      };
    },
  ) => ({
    auth: {
      getUser: async () => {
        if (state.routeGetUserError) return { data: { user: null }, error: state.routeGetUserError };
        return { data: { user: state.routeAuthUser }, error: null };
      },
      signInWithPassword: async () => {
        if (state.signInResult && !state.signInResult.error && state.signInResult.data.user) {
          options.cookies.setAll(
            [{ name: 'sb-test-auth-token', value: 'signed-jwt-cookie', options: { path: '/', httpOnly: true } }],
            { 'Cache-Control': 'private, no-store' },
          );
        }
        return state.signInResult ?? { data: { user: null }, error: { message: 'Invalid credentials' } };
      },
      signUp: async () => state.signUpResult ?? { data: { user: null }, error: { message: 'Signup unavailable' } },
      signOut: async (arg?: unknown) => {
        state.signOutCalls.push(arg);
        options.cookies.setAll(
          [{ name: 'sb-test-auth-token', value: '', options: { path: '/', maxAge: 0 } }],
          {},
        );
        return { error: null };
      },
    },
  }),
}));

vi.mock('../../src/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => {
    if (!state.adminAvailable) return null;
    return {
      auth: {
        getUser: async () => state.adminGetUserResult ?? { data: { user: null }, error: { message: 'Invalid JWT' } },
        admin: {
          createUser: async () => state.adminCreateUserResult ?? { data: { user: null }, error: { message: 'createUser failed' } },
          deleteUser: async (userId: string) => {
            state.adminDeleteUserCalls.push(userId);
            return { data: { user: null }, error: null };
          },
        },
      },
    };
  },
}));

vi.mock('../../src/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => {
        if (state.routeGetUserError) return { data: { user: null }, error: state.routeGetUserError };
        return { data: { user: state.routeAuthUser }, error: null };
      },
    },
  }),
}));

function assertValidPatientsColumns(sqlText: string) {
  if (/\bpublic\.patients\b/i.test(sqlText) && /\b(?:p|patients)\.created_at\b/i.test(sqlText)) {
    throw Object.assign(new Error('column p.created_at does not exist'), { code: '42703' });
  }
}

const mockSql = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join('?');
    state.capturedSql.push({ sqlText, values });
    assertValidPatientsColumns(sqlText);
    return Promise.resolve(state.sqlHandler ? state.sqlHandler(sqlText, values) : []);
  },
  {
    json: (value: unknown) => ({ type: 3802, value }),
    transaction: async (
      fn: (tx: TransactionSqlAdapter) => readonly Promise<unknown[]>[],
    ) => {
      const txCaptured: { sqlText: string; values: unknown[]; promise: Promise<unknown[]> }[] = [];
      const txAdapter = Object.assign(
        (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sqlText = strings.join('?');
          state.capturedSql.push({ sqlText, values });
          assertValidPatientsColumns(sqlText);
          const promise = Promise.resolve(state.sqlHandler ? state.sqlHandler(sqlText, values) : []);
          txCaptured.push({ sqlText, values, promise });
          return promise;
        },
        { json: (value: unknown) => ({ type: 3802, value }) },
      ) as unknown as TransactionSqlAdapter;
      const queries = fn(txAdapter);
      if (state.txHandler) {
        return state.txHandler(txCaptured.map(({ sqlText, values }) => ({ sqlText, values })));
      }
      const out = [];
      for (const q of queries) out.push(await q);
      return out;
    },
    end: async () => {},
  },
) as unknown as SqlAdapter;

vi.mock('../../src/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/db')>();
  return {
    ...actual,
    getDatabase: () => mockSql,
  };
});

import { POST as authLoginPost } from '../../src/app/api/auth/login/route';
import { POST as authLogoutPost } from '../../src/app/api/auth/logout/route';
import { GET as authSessionGet } from '../../src/app/api/auth/session/route';
import { POST as authSignupPost } from '../../src/app/api/auth/signup/route';
import { GET as caregiverGet, POST as caregiverPost } from '../../src/app/api/clinical/caregiver/route';
import { POST as caregiverInvitePost } from '../../src/app/api/clinical/caregiver-invite/route';
import { POST as clinicalEvidencePost } from '../../src/app/api/clinical/evidence/route';
import { POST as clinicalExerciseReviewPost } from '../../src/app/api/clinical/exercise-review/route';
import { GET as clinicalPatientsGet, POST as clinicalPatientsPost } from '../../src/app/api/clinical/patients/route';
import { POST as clinicalPlanPost } from '../../src/app/api/clinical/plan/route';
import { POST as clinicalReviewPost } from '../../src/app/api/clinical/review/route';
import { POST as clinicalStepsPost } from '../../src/app/api/clinical/steps/route';
import { GET as clinicalTelegramGet } from '../../src/app/api/clinical/telegram/route';
import { GET as clinicalViewGet } from '../../src/app/api/clinical/view/route';
import { POST as demoLoginPost } from '../../src/app/api/demo/login/route';
import { GET as mobileExerciseGet } from '../../src/app/api/mobile/v1/exercise/route';
import { POST as mobileStepsPost } from '../../src/app/api/mobile/v1/steps/route';
import { GET as mobileTodayGet } from '../../src/app/api/mobile/v1/today/route';
import { getActivityDashboard, saveStepCount } from '../../src/lib/activity-store';
import { resolveWebSessionContext } from '../../src/lib/auth';
import { changeCaregiverSharing, getCaregiverSharing } from '../../src/lib/caregiver-store';
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
} from '../../src/lib/clinical-store';
import { saveDorimosEvidence } from '../../src/lib/dorimos-store';
import {
  assignExercise,
  readExerciseAttempts,
  readExercisePlan,
  reviewExerciseAttempt,
  saveExercise,
} from '../../src/lib/exercise-store';
import { ensureDemoWorkspace } from '../../src/lib/seed';
import {
  createTelegramPairing,
  disconnectDoctorTelegram,
  disconnectPatientTelegram,
  getDoctorTelegramStatus,
  getPatientTelegramStatus,
} from '../../src/lib/telegram-store';

const origin = 'https://clinic.example.test';
const testSecret = 'test-signing-secret-with-at-least-32-chars';

const userId = '10000000-0000-4000-8000-000000000001';
const targetUserId = '10000000-0000-4000-8000-000000000002';
const workspaceId = '20000000-0000-4000-8000-000000000001';
const demoWorkspaceId = '20000000-0000-4000-8000-000000000099';
const doctorId = '30000000-0000-4000-8000-000000000001';
const patientId1 = '40000000-0000-4000-8000-000000000001';
const patientId2 = '40000000-0000-4000-8000-000000000002';
const membershipId = '50000000-0000-4000-8000-000000000001';
const taskId = '60000000-0000-4000-8000-000000000001';
const flagId = '70000000-0000-4000-8000-000000000001';
const followupId = '75000000-0000-4000-8000-000000000001';
const symptomId = '80000000-0000-4000-8000-000000000001';
const prescriptionId = '90000000-0000-4000-8000-000000000001';
const attemptId = '95000000-0000-4000-8000-000000000001';
const evidenceId = '99000000-0000-4000-8000-000000000001';

function jsonPostRequest(path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(`${origin}${path}`, {
    method: 'POST',
    headers: {
      origin,
      host: new URL(origin).host,
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

function getRequest(path: string, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(`${origin}${path}`, {
    method: 'GET',
    headers: {
      host: new URL(origin).host,
      ...extraHeaders,
    },
  });
}

function setCookieHeaders(response: Response): string[] {
  const getSetCookie = (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === 'function') return getSetCookie.call(response.headers);
  const single = response.headers.get('set-cookie');
  return single ? [single] : [];
}

beforeEach(() => {
  state.cookies.clear();
  state.capturedSql.length = 0;
  state.sqlHandler = null;
  state.txHandler = null;
  state.routeAuthUser = null;
  state.routeGetUserError = null;
  state.signInResult = null;
  state.signUpResult = null;
  state.signOutCalls.length = 0;
  state.adminCreateUserResult = null;
  state.adminDeleteUserCalls.length = 0;
  state.adminGetUserResult = null;
  state.adminAvailable = true;

  vi.stubEnv('DEMO_MODE', 'true');
  vi.stubEnv('DEMO_ANDROID_ENABLED', 'false');
  vi.stubEnv('SESSION_SECRET', testSecret);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-test-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('M1b-3 Dual Auth & Hard Tenant Isolation', () => {
  it('enforces hard is_demo isolation on Supabase and Demo paths plus X-Workspace-Id fail-closed', async () => {
    // 1. Supabase user whose mock DB returns isDemo: true is rejected by resolveWebSessionContext
    state.routeAuthUser = { id: userId, email: 'doc@clinic.uz', user_metadata: { default_role: 'doctor' } };
    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.profiles')) return [{ fullName: 'Dr. Test', defaultRole: 'doctor' }];
      if (sqlText.includes('FROM public.clinic_memberships')) {
        return [{ workspaceId: demoWorkspaceId, role: 'doctor', actorId: doctorId, isDemo: true }];
      }
      return [];
    };

    const rejected = await resolveWebSessionContext(getRequest('/api/clinical/view'));
    expect(rejected).toBeNull();
    expect(state.capturedSql.some((c) => c.sqlText.includes('cm.is_demo = false') && c.sqlText.includes('w.is_demo = false'))).toBe(true);

    // 2. X-Workspace-Id for an unowned workspace fails closed (returns null, does NOT fall back to demo cookie)
    state.cookies.set('shifohalqa_demo', 'stale-demo-cookie');
    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.profiles')) return [{ fullName: 'Dr. Test', defaultRole: 'doctor' }];
      return [];
    };
    const idorAttempt = await resolveWebSessionContext(
      getRequest('/api/clinical/view', { 'x-workspace-id': demoWorkspaceId }),
    );
    expect(idorAttempt).toBeNull();

    // 3. ensureDemoWorkspace fails closed on is_demo = false workspaces (empty actorRows)
    state.txHandler = async () => [[], [], [], []];
    await expect(ensureDemoWorkspace(workspaceId)).resolves.toBeNull();
  });

  it('enforces mutually exclusive cookies across /api/auth/{signup,login,logout} and /api/demo/login', async () => {
    // 1. POST /api/auth/signup for patient provisions placeholder doctor + clears shifohalqa_demo
    state.adminCreateUserResult = { data: { user: { id: userId, email: 'bemor@clinic.uz' } }, error: null };
    state.signInResult = { data: { user: { id: userId, email: 'bemor@clinic.uz' } }, error: null };
    state.sqlHandler = () => [];

    const signupRes = await authSignupPost(
      jsonPostRequest('/api/auth/signup', {
        email: 'bemor@clinic.uz',
        password: 'StrongPassword123',
        fullName: 'Dilshod',
        role: 'patient',
      }),
    );
    expect(signupRes.status).toBe(201);
    expect(signupRes.headers.get('cache-control')).toBe('private, no-store');
    const signupBody = await signupRes.json();
    expect(signupBody.session).toMatchObject({
      kind: 'supabase',
      userId,
      role: 'patient',
      isDemo: false,
    });
    const signupCookies = setCookieHeaders(signupRes).join('\n');
    expect(signupCookies).toMatch(/shifohalqa_demo=;\s*Path=\/;.*Max-Age=0/i);
    expect(signupCookies).toMatch(/sb-test-auth-token=signed-jwt-cookie/i);
    expect(state.capturedSql.some((c) => c.sqlText.includes('INSERT INTO public.doctors'))).toBe(true);
    expect(state.capturedSql.some((c) => c.sqlText.includes('INSERT INTO public.patients'))).toBe(true);

    // 2. POST /api/demo/login clears existing sb-* cookies
    const demoReq = new NextRequest(`${origin}/api/demo/login`, {
      method: 'POST',
      headers: {
        origin,
        host: new URL(origin).host,
        cookie: 'sb-test-auth-token=signed-jwt-cookie; sb-refresh=xyz',
      },
      body: new URLSearchParams({ role: 'doctor' }),
    });
    const demoRes = await demoLoginPost(demoReq);
    expect(demoRes.status).toBe(303);
    const demoCookies = setCookieHeaders(demoRes).join('\n');
    expect(demoCookies).toMatch(/shifohalqa_demo=[^;]+/);
    expect(demoCookies).toMatch(/sb-test-auth-token=;.*Max-Age=0/i);
    expect(demoCookies).toMatch(/sb-refresh=;.*Max-Age=0/i);

    // 3. POST /api/auth/login clears shifohalqa_demo and sets sb-*
    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.profiles')) return [{ fullName: 'Dr. Clinic', defaultRole: 'doctor' }];
      if (sqlText.includes('FROM public.clinic_memberships') && !sqlText.includes("status = 'invited'")) {
        return [{ workspaceId, role: 'doctor', actorId: doctorId, isDemo: false }];
      }
      return [];
    };
    const loginRes = await authLoginPost(
      jsonPostRequest('/api/auth/login', { email: 'doc@clinic.uz', password: 'StrongPassword123' }),
    );
    expect(loginRes.status).toBe(200);
    expect(loginRes.headers.get('cache-control')).toBe('private, no-store');
    const loginCookies = setCookieHeaders(loginRes).join('\n');
    expect(loginCookies).toMatch(/shifohalqa_demo=;.*Max-Age=0/i);
    expect(loginCookies).toMatch(/sb-test-auth-token=signed-jwt-cookie/i);

    // 4. POST /api/auth/logout clears both shifohalqa_demo and sb-*
    const logoutReq = new NextRequest(`${origin}/api/auth/logout`, {
      method: 'POST',
      headers: {
        origin,
        host: new URL(origin).host,
        cookie: 'sb-test-auth-token=signed-jwt-cookie; shifohalqa_demo=abc',
      },
    });
    const logoutRes = await authLogoutPost(logoutReq);
    expect(logoutRes.status).toBe(200);
    const logoutCookies = setCookieHeaders(logoutRes).join('\n');
    expect(logoutCookies).toMatch(/shifohalqa_demo=;.*Max-Age=0/i);
    expect(logoutCookies).toMatch(/sb-test-auth-token=;.*Max-Age=0/i);
  });

  it('rolls back workspace and deletes auth user if signup provisioning throws', async () => {
    state.adminCreateUserResult = { data: { user: { id: userId, email: 'fail@clinic.uz' } }, error: null };
    state.txHandler = async () => {
      throw new Error('simulated DB insert error');
    };
    state.sqlHandler = () => [];

    const res = await authSignupPost(
      jsonPostRequest('/api/auth/signup', {
        email: 'fail@clinic.uz',
        password: 'StrongPassword123',
        fullName: 'Fail User',
        role: 'doctor',
      }),
    );
    expect(res.status).toBe(503);
    expect(state.capturedSql.some((c) => c.sqlText.includes('DELETE FROM public.workspaces WHERE id = ? AND is_demo = false'))).toBe(true);
    expect(state.adminDeleteUserCalls).toEqual([userId]);
  });

  it('supports nullable doctorId for individual role across all stores and blocks caregiver & doctorId=null on doctor mutations', async () => {
    const individualActor: ClinicalActor = {
      workspaceId,
      doctorId: null,
      patientId: patientId1,
      role: 'individual',
      isDemo: false,
    };
    const caregiverActor: ClinicalActor = {
      workspaceId,
      doctorId: null,
      patientId: patientId1,
      role: 'caregiver',
      isDemo: false,
    };
    const brokenDoctorActor: ClinicalActor = {
      workspaceId,
      doctorId: null,
      patientId: patientId1,
      role: 'doctor',
      isDemo: false,
    };

    // Individual queries use IS NOT DISTINCT FROM and execute without failing on doctorId: null
    state.txHandler = async () => [[], [], [], [], [], []];
    const view = await getClinicalView(individualActor);
    expect(view.plan).toBeNull();
    expect(
      state.capturedSql.filter((c) => c.sqlText.includes('IS NOT DISTINCT FROM')).length,
    ).toBeGreaterThanOrEqual(6);

    state.capturedSql.length = 0;
    state.sqlHandler = () => [];
    expect(await getTaskContext(individualActor, taskId)).toBeNull();
    expect(state.capturedSql[0]!.sqlText).toContain('plan.doctor_id IS NOT DISTINCT FROM');

    state.sqlHandler = () => [{ result: 'saved' }];
    expect(
      await saveEvidence(individualActor, {
        taskId,
        payload: { kind: 'medication', status: 'taken' },
        level: 0,
        source: 'self_report',
        aiMode: 'none',
        flag: null,
      }),
    ).toBe('saved');
    expect(await saveFlagFollowup(individualActor, { flagId, kind: 'supply_resolved', payload: {} })).toBe('saved');
    expect(await saveUrgentSymptom(individualActor, { symptom: 'dizziness', note: 'yengil' })).toBe('saved');
    expect(await saveStepCount(individualActor, { count: 4200, source: 'self_report' })).toBe('saved');
    expect(
      await saveDorimosEvidence(individualActor, taskId, { kind: 'medication_box', result: 'manual' }),
    ).toBe('saved');

    state.sqlHandler = () => [{
      today: '2026-11-24',
      dailyStepGoal: 3000,
      units: [],
      steps: null,
    }];
    expect(await getActivityDashboard(individualActor)).not.toBeNull();

    state.sqlHandler = () => [{
      id: prescriptionId,
      movement: 'chair_stand',
      targetAngle: 100,
      targetReps: 5,
      maxShallow: 1,
      painColor: 'yellow',
    }];
    expect(await readExercisePlan(individualActor)).not.toBeNull();

    state.txHandler = async () => [[{ is_primary: true }], []];
    expect(
      await saveExercise(individualActor, { source: 'self_report', reason: 'manual', reps: 5, movement: 'chair_stand' }),
    ).toMatchObject({ status: 'saved', level: 0 });

    state.sqlHandler = () => [];
    expect(await readExerciseAttempts(individualActor)).toEqual([]);
    expect(await getCaregiverSharing(individualActor)).toBeNull();
    state.txHandler = async () => [[{ id: patientId1 }], [{ expires_at: '2026-11-25T10:00:00.000Z' }]];
    expect(await changeCaregiverSharing(individualActor, 'enable')).toMatchObject({
      expiresAt: '2026-11-25T10:00:00.000Z',
    });

    state.sqlHandler = () => [{ ok: 1 }];
    expect(await getPatientTelegramStatus(individualActor)).toBe(true);
    expect(await createTelegramPairing(individualActor)).toEqual(expect.any(String));
    state.txHandler = async () => [[], []];
    await disconnectPatientTelegram(individualActor);

    // Caregiver rejected across all patient & doctor store functions
    state.capturedSql.length = 0;
    expect(await getClinicalView(caregiverActor)).toEqual({
      plan: null,
      tasks: [],
      flags: [],
      urgentSymptoms: [],
      caregiverAck: null,
    });
    expect(await getTaskContext(caregiverActor, taskId)).toBeNull();
    expect(
      await saveEvidence(caregiverActor, {
        taskId,
        payload: { kind: 'medication', status: 'taken' },
        level: 0,
        source: 'self_report',
        aiMode: 'none',
        flag: null,
      }),
    ).toBe('not_found');
    expect(await saveFlagFollowup(caregiverActor, { flagId, kind: 'supply_resolved', payload: {} })).toBe('not_found');
    expect(await saveUrgentSymptom(caregiverActor, { symptom: 'dizziness', note: '' })).toBe('not_found');
    expect(await readExercisePlan(caregiverActor)).toBeNull();
    expect(await readExerciseAttempts(caregiverActor)).toEqual([]);
    expect(await saveExercise(caregiverActor, { source: 'self_report', reason: 'manual', reps: 5 })).toEqual({ status: 'invalid' });
    expect(await getActivityDashboard(caregiverActor)).toBeNull();
    expect(await saveStepCount(caregiverActor, 100)).toBe('not_found');
    expect(await saveDorimosEvidence(caregiverActor, taskId, { kind: 'medication_box', result: 'manual' })).toBe('not_found');
    expect(await getCaregiverSharing(caregiverActor)).toBeNull();
    expect(await changeCaregiverSharing(caregiverActor, 'enable')).toBeNull();
    expect(await getPatientTelegramStatus(caregiverActor)).toBe(false);
    expect(await createTelegramPairing(caregiverActor)).toBeNull();
    expect(state.capturedSql).toHaveLength(0);

    // Doctor-only functions reject doctorId: null and individual role
    for (const actor of [brokenDoctorActor, individualActor]) {
      expect(
        await assignPlan(actor, {
          medicationName: 'Amlodipin',
          medicationStrengthMg: 5,
          medicationTime: '08:00',
          vitalsTime: '09:00',
          targets: { maxSystolic: 140, maxDiastolic: 90, warnSystolic: 130, warnDiastolic: 85 },
          supplyFollowUp: false,
          dailyStepGoal: 3000,
        }),
      ).toBe('not_found');
      expect(await reviewFlag(actor, { flagId, decision: 'approved', reply: 'Yaxshi', note: '' })).toBe('not_found');
      expect(await acknowledgeFlagFollowup(actor, { followupId, note: '' })).toBe('not_found');
      expect(await reviewUrgentSymptom(actor, { symptomId, decision: 'approved', reply: 'OK', note: '' })).toBe('not_found');
      expect(
        await assignExercise(actor, {
          movement: 'chair_stand',
          targetAngle: 100,
          targetReps: 5,
          maxShallow: 1,
          painColor: 'yellow',
        }),
      ).toBe('not_found');
      expect(await reviewExerciseAttempt(actor, { attemptId, decision: 'reviewed', reply: 'OK' })).toBe('not_found');
      expect(await getDoctorTelegramStatus(actor)).toBe(false);
      await disconnectDoctorTelegram(actor);
      if (actor.role === 'doctor') {
        expect(await createTelegramPairing(actor)).toBeNull();
      }
    }
    expect(state.capturedSql).toHaveLength(0);
  });

  it('enforces multi-patient clinic doctor ownership, 400 patient_required, and IDOR 404 checks', async () => {
    state.routeAuthUser = { id: userId, email: 'doc@clinic.uz', user_metadata: { default_role: 'doctor' } };
    state.sqlHandler = (sqlText, values) => {
      if (sqlText.includes('FROM public.profiles')) return [{ fullName: 'Dr. Clinic', defaultRole: 'doctor' }];
      if (sqlText.includes('FROM public.clinic_memberships')) {
        return [{ workspaceId, role: 'doctor', actorId: doctorId, isDemo: false }];
      }
      if (sqlText.includes('FROM public.patients AS p') && sqlText.includes('ORDER BY p.name ASC, p.id ASC')) {
        return [
          { id: patientId1, name: 'Anvar', roleKind: 'patient' },
          { id: patientId2, name: 'Malika', roleKind: 'patient' },
        ];
      }
      if (sqlText.includes('FROM public.patients AS p') && values.includes('ffffffff-ffff-4fff-8fff-ffffffffffff')) {
        return [];
      }
      if (sqlText.includes('FROM public.flags AS flag')) {
        return [];
      }
      if (sqlText.includes('FROM public.exercise_attempts AS attempt')) {
        return [];
      }
      return [];
    };

    // Multi-patient doctor omitting patientId receives 400 patient_required
    const viewRes = await clinicalViewGet(getRequest('/api/clinical/view'));
    expect(viewRes.status).toBe(400);
    await expect(viewRes.json()).resolves.toMatchObject({ error: 'patient_required' });

    const planNoPatient = await clinicalPlanPost(
      jsonPostRequest('/api/clinical/plan', {
        medicationName: 'Amlodipin',
        medicationStrengthMg: 5,
        medicationTime: '08:00',
        vitalsTime: '09:00',
        maxSystolic: 140,
        maxDiastolic: 90,
        warnSystolic: 130,
        warnDiastolic: 85,
        supplyFollowUp: false,
      }),
    );
    expect(planNoPatient.status).toBe(400);
    await expect(planNoPatient.json()).resolves.toEqual({ error: 'patient_required' });

    // Cross-doctor / cross-workspace patientId -> 404
    const idorPlan = await clinicalPlanPost(
      jsonPostRequest('/api/clinical/plan', {
        patientId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        medicationName: 'Amlodipin',
        medicationStrengthMg: 5,
        medicationTime: '08:00',
        vitalsTime: '09:00',
        maxSystolic: 140,
        maxDiastolic: 90,
        warnSystolic: 130,
        warnDiastolic: 85,
        supplyFollowUp: false,
      }),
    );
    expect(idorPlan.status).toBe(404);

    // Cross-doctor flagId / attemptId -> 404
    const idorReview = await clinicalReviewPost(
      jsonPostRequest('/api/clinical/review', {
        flagId,
        decision: 'approved',
        reply: 'Tasdiqlandi',
      }),
    );
    expect(idorReview.status).toBe(404);

    const idorExerciseReview = await clinicalExerciseReviewPost(
      jsonPostRequest('/api/clinical/exercise-review', {
        attemptId,
        decision: 'reviewed',
        reply: 'Yaxshi',
      }),
    );
    expect(idorExerciseReview.status).toBe(404);

    // Clinic doctor creates & links patient
    state.txHandler = async () => [[], [{ id: membershipId, status: 'invited' }]];
    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.profiles')) return [{ fullName: 'Dr. Clinic', defaultRole: 'doctor' }];
      if (sqlText.includes('FROM public.clinic_memberships')) {
        return [{ workspaceId, role: 'doctor', actorId: doctorId, isDemo: false }];
      }
      if (sqlText.includes('FROM auth.users')) return [{ id: targetUserId }];
      return [];
    };
    const createPatientRes = await clinicalPatientsPost(
      jsonPostRequest('/api/clinical/patients', { action: 'create', name: 'Yangi bemor', email: 'new@clinic.uz' }),
    );
    expect(createPatientRes.status).toBe(201);
    await expect(createPatientRes.json()).resolves.toMatchObject({
      name: 'Yangi bemor',
      membershipStatus: 'invited',
    });

    // Demo session is blocked from /api/clinical/patients
    state.routeAuthUser = null;
    state.sqlHandler = null;
    const demoCookieRes = await demoLoginPost(
      new NextRequest(`${origin}/api/demo/login`, {
        method: 'POST',
        headers: { origin, host: new URL(origin).host },
        body: new URLSearchParams({ role: 'doctor' }),
      }),
    );
    const cookieVal = setCookieHeaders(demoCookieRes)[0]!.split(';')[0]!.split('=')[1]!;
    state.cookies.set('shifohalqa_demo', cookieVal);
    state.txHandler = async () => [
      [],
      [],
      [],
      [{ doctor_id: doctorId, doctor_name: 'Dr. Sardor', patient_id: patientId1, patient_name: 'Anvar aka' }],
    ];
    const demoPatientsRes = await clinicalPatientsGet(getRequest('/api/clinical/patients'));
    expect(demoPatientsRes.status).toBe(403);
  });

  it('supports caregiver signup, invite/accept/summary/ack flow, and enforces 403 on clinical routes', async () => {
    // 1. Caregiver signup creates no workspace
    state.adminCreateUserResult = { data: { user: { id: userId, email: 'yaqin@clinic.uz' } }, error: null };
    state.signInResult = { data: { user: { id: userId, email: 'yaqin@clinic.uz' } }, error: null };
    state.sqlHandler = () => [];
    const cgSignup = await authSignupPost(
      jsonPostRequest('/api/auth/signup', {
        email: 'yaqin@clinic.uz',
        password: 'StrongPassword123',
        fullName: 'Aziza',
        role: 'caregiver',
      }),
    );
    expect(cgSignup.status).toBe(201);
    await expect(cgSignup.json()).resolves.toMatchObject({
      session: null,
      user: { userId, email: 'yaqin@clinic.uz', defaultRole: 'caregiver' },
      pendingInvites: [],
    });
    expect(state.capturedSql.some((c) => c.sqlText.includes('INSERT INTO public.workspaces'))).toBe(false);

    // 2. Caregiver accepts invite
    state.routeAuthUser = { id: userId, email: 'yaqin@clinic.uz', user_metadata: { default_role: 'caregiver' } };
    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.profiles')) return [{ fullName: 'Aziza', defaultRole: 'caregiver' }];
      if (sqlText.includes('UPDATE public.clinic_memberships')) {
        return [{ membershipId, workspaceId, patientId: patientId1, status: 'active' }];
      }
      return [];
    };
    const acceptRes = await caregiverInvitePost(
      jsonPostRequest('/api/clinical/caregiver-invite', { action: 'accept', membershipId }),
    );
    expect(acceptRes.status).toBe(200);
    await expect(acceptRes.json()).resolves.toMatchObject({ status: 'active', patientId: patientId1 });

    // 3. Active caregiver reads summary and acknowledges help without note or raw BP leaks
    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.profiles')) return [{ fullName: 'Aziza', defaultRole: 'caregiver' }];
      if (sqlText.includes('FROM public.clinic_memberships')) {
        return [{ workspaceId, role: 'caregiver', actorId: patientId1, isDemo: false }];
      }
      if (sqlText.includes('caregiver_audit_events')) {
        return [{
          local_date: '2026-11-24',
          observed_at: '2026-11-24T10:00:00.000Z',
          due: [{ planItemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', scheduledDate: '2026-11-24', status: 'taken' }],
          supply_needed: false,
          open_reviews: true,
          reviewed_today: false,
          ack_kind: null,
          ack_at: null,
        }];
      }
      if (sqlText.includes('INSERT INTO public.caregiver_acks')) {
        return [{ kind: 'checked_in', createdAt: '2026-11-24T10:05:00.000Z' }];
      }
      return [];
    };

    const summaryRes = await caregiverGet(getRequest('/api/clinical/caregiver'));
    expect(summaryRes.status).toBe(200);
    const summaryText = await summaryRes.text();
    const summaryJson = JSON.parse(summaryText);
    expect(summaryJson).toEqual({
      role: 'caregiver',
      observedAt: '2026-11-24T10:00:00.000Z',
      counts: { scheduled: 1, completed: 1, answered: 1 },
      statusSignal: 'doctor_reviewing',
      caregiverAck: null,
    });
    expect(summaryText).not.toMatch(/doctor_note|doctorNote|acknowledged_note|acknowledgedNote|systolic|diastolic/i);

    const ackRes = await caregiverPost(
      jsonPostRequest('/api/clinical/caregiver', { action: 'ack', kind: 'checked_in' }),
    );
    expect(ackRes.status).toBe(200);

    // 4. Caregiver gets 403 on all clinical/doctor/patient/telegram routes
    expect((await clinicalViewGet(getRequest('/api/clinical/view'))).status).toBe(403);
    expect((await clinicalPlanPost(jsonPostRequest('/api/clinical/plan', {}))).status).toBe(403);
    expect((await clinicalEvidencePost(jsonPostRequest('/api/clinical/evidence', {}))).status).toBe(403);
    expect((await clinicalStepsPost(jsonPostRequest('/api/clinical/steps', { count: 100 }))).status).toBe(403);
    expect((await clinicalTelegramGet(getRequest('/api/clinical/telegram'))).status).toBe(403);

    // 5. /api/auth/session reports authenticated caregiver with null session before invite accepted
    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.profiles')) return [{ fullName: 'Aziza', defaultRole: 'caregiver' }];
      return [];
    };
    const sessionRes = await authSessionGet(getRequest('/api/auth/session'));
    expect(sessionRes.status).toBe(200);
    await expect(sessionRes.json()).resolves.toMatchObject({
      session: null,
      user: { userId, defaultRole: 'caregiver' },
      pendingInvites: [],
    });
  });

  it('supports Supabase Bearer JWT on /api/mobile/v1/* even when DEMO_ANDROID_ENABLED=false', async () => {
    vi.stubEnv('DEMO_ANDROID_ENABLED', 'false');

    // 1. Anonymous -> 401
    const anonRes = await mobileTodayGet(new Request(`${origin}/api/mobile/v1/today`));
    expect(anonRes.status).toBe(401);

    // 2. 64-hex demo token when DEMO_ANDROID_ENABLED=false -> 404
    const hexToken = 'a'.repeat(64);
    const demoDisabledRes = await mobileTodayGet(
      new Request(`${origin}/api/mobile/v1/today`, { headers: { authorization: `Bearer ${hexToken}` } }),
    );
    expect(demoDisabledRes.status).toBe(404);

    // 3. Valid Supabase Bearer JWT for individual role (doctorId: null) -> 200 on /today, /steps, /exercise
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature123';
    state.adminGetUserResult = { data: { user: { id: userId, email: 'ind@clinic.uz' } }, error: null };
    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.clinic_memberships')) {
        return [{
          workspaceId,
          patientId: patientId1,
          doctorId: null,
          role: 'individual',
          patientName: 'Mustaqil Foydalanuvchi',
          isDemo: false,
        }];
      }
      if (sqlText.includes('INSERT INTO public.daily_step_counts')) return [{ result: 'saved' }];
      if (sqlText.includes('FROM public.patients AS scoped') || sqlText.includes('generate_series')) {
        return [{ today: '2026-11-24', dailyStepGoal: 3000, units: [], steps: { count: 2500, level: 0, source: 'device_sensor', aiMode: 'manual', updatedAt: '2026-11-24T10:00:00.000Z' } }];
      }
      if (sqlText.includes('FROM public.exercise_prescriptions')) return [];
      if (sqlText.includes('FROM public.exercise_attempts')) return [];
      return [];
    };
    state.txHandler = async () => [[], [], [], [], [], []];

    const jwtTodayRes = await mobileTodayGet(
      new Request(`${origin}/api/mobile/v1/today`, { headers: { authorization: `Bearer ${jwt}` } }),
    );
    expect(jwtTodayRes.status).toBe(200);
    await expect(jwtTodayRes.json()).resolves.toMatchObject({ patientName: 'Mustaqil Foydalanuvchi' });

    const jwtStepsRes = await mobileStepsPost(
      new Request(`${origin}/api/mobile/v1/steps`, {
        method: 'POST',
        headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ count: 2500, source: 'device_sensor' }),
      }),
    );
    expect(jwtStepsRes.status).toBe(200);
    await expect(jwtStepsRes.json()).resolves.toMatchObject({ status: 'saved', count: 2500 });

    const jwtExRes = await mobileExerciseGet(
      new Request(`${origin}/api/mobile/v1/exercise`, { headers: { authorization: `Bearer ${jwt}` } }),
    );
    expect(jwtExRes.status).toBe(200);

    // 4. Doctor or caregiver JWT on mobile -> 403 forbidden
    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.clinic_memberships')) {
        return [{
          workspaceId,
          patientId: null,
          doctorId: null,
          role: 'doctor',
          patientName: null,
          isDemo: false,
        }];
      }
      return [];
    };
    const docMobileRes = await mobileTodayGet(
      new Request(`${origin}/api/mobile/v1/today`, { headers: { authorization: `Bearer ${jwt}` } }),
    );
    expect(docMobileRes.status).toBe(403);
  });

  it('omits doctor_note and acknowledged_note from patient /api/clinical/view and mobile /api/mobile/v1/today DTOs', async () => {
    state.routeAuthUser = { id: userId, email: 'bemor@clinic.uz', user_metadata: { default_role: 'patient' } };
    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.profiles')) return [{ fullName: 'Anvar', defaultRole: 'patient' }];
      if (sqlText.includes('FROM public.clinic_memberships')) {
        return [{ workspaceId, role: 'patient', actorId: patientId1, isDemo: false }];
      }
      if (sqlText.includes('FROM public.patients AS p')) {
        return [{ id: patientId1, doctorId }];
      }
      return [];
    };
    state.txHandler = async () => [
      [{
        medicationName: 'Amlodipin',
        medicationStrengthMg: 5,
        medicationTime: '08:00',
        vitalsTime: '09:00',
        targets: { maxSystolic: 140, maxDiastolic: 90, warnSystolic: 130, warnDiastolic: 85 },
        supplyFollowUp: false,
        dailyStepGoal: 3000,
      }],
      [],
      [{
        taskId,
        type: 'medication',
        title: 'Amlodipin',
        date: '2026-11-24',
        dueTime: '08:00',
        status: 'missed',
        recent: true,
        evidenceId,
        level: 4,
        source: 'self_report',
        aiMode: 'none',
        payload: { kind: 'medication', status: 'missed', reason: 'forgot' },
        createdAt: '2026-11-24T08:05:00.000Z',
        flagId,
        color: 'yellow',
        ruleKey: 'medication_missed_consecutive_days',
        detail: {},
        decision: 'approved',
        reply: 'Ertaga o‘z vaqtida iching.',
        reviewedAt: '2026-11-24T09:00:00.000Z',
      }],
      [{
        id: followupId,
        flagId,
        kind: 'still_need_help',
        payload: {},
        createdAt: '2026-11-24T09:10:00.000Z',
        acknowledgedAt: '2026-11-24T09:20:00.000Z',
      }],
      [{
        id: symptomId,
        symptom: 'dizziness',
        note: 'Bosh aylanishi',
        level: 4,
        createdAt: '2026-11-24T09:30:00.000Z',
        decision: 'approved',
        reply: 'Ko‘rikka keling.',
        reviewedAt: '2026-11-24T09:40:00.000Z',
      }],
      [],
    ];

    const viewRes = await clinicalViewGet(getRequest('/api/clinical/view'));
    expect(viewRes.status).toBe(200);
    const viewText = await viewRes.text();
    expect(viewText).toContain('Ertaga o‘z vaqtida iching.');
    expect(viewText).not.toMatch(/doctor_note|doctorNote|acknowledged_note|acknowledgedNote/);

    // Verify none of the clinical view SELECT queries touch doctor_note or acknowledged_note
    for (const call of state.capturedSql) {
      expect(call.sqlText).not.toMatch(/doctor_note|acknowledged_note/);
    }

    // Mobile /today check
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature123';
    state.adminGetUserResult = { data: { user: { id: userId, email: 'bemor@clinic.uz' } }, error: null };
    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.clinic_memberships')) {
        return [{ workspaceId, patientId: patientId1, doctorId, role: 'patient', patientName: 'Anvar', isDemo: false }];
      }
      return [];
    };
    const todayRes = await mobileTodayGet(
      new Request(`${origin}/api/mobile/v1/today`, { headers: { authorization: `Bearer ${jwt}` } }),
    );
    expect(todayRes.status).toBe(200);
    const todayText = await todayRes.text();
    expect(todayText).not.toMatch(/doctor_note|doctorNote|acknowledged_note|acknowledgedNote/);
  });

  it('completes live clinic doctor view (open 160/100 bp_max flag), patients list, telegram status, and single-patient plan fallback without referencing public.patients.created_at', async () => {
    state.routeAuthUser = { id: userId, email: 'doc@clinic.uz', user_metadata: { default_role: 'doctor' } };
    let linkedPatients = [{ id: patientId1, name: 'Anvar', roleKind: 'patient' }];
    let planAssigned = false;

    state.sqlHandler = (sqlText, values) => {
      if (sqlText.includes('FROM public.profiles')) return [{ fullName: 'Dr. Clinic', defaultRole: 'doctor' }];
      if (sqlText.includes('FROM public.clinic_memberships')) {
        return [{ workspaceId, role: 'doctor', actorId: doctorId, isDemo: false }];
      }
      if (sqlText.includes('FROM public.patients AS p') && sqlText.includes('ORDER BY p.name ASC, p.id ASC')) {
        return linkedPatients.map((p) => ({ ...p, doctorId }));
      }
      if (sqlText.includes('FROM public.patients AS p') && values.includes(patientId1)) {
        return [{ id: patientId1, doctorId }];
      }
      if (sqlText.includes('INSERT INTO public.plans')) {
        planAssigned = true;
        return [{ result: 'saved' }];
      }
      if (sqlText.includes('FROM public.telegram_doctor_links')) {
        return [];
      }
      if (sqlText.includes('FROM public.exercise_prescriptions')) return [];
      if (sqlText.includes('FROM public.exercise_attempts')) return [];
      return [];
    };

    state.txHandler = async () => [
        [{
          medicationName: 'Amlodipin',
          medicationStrengthMg: 5,
          medicationTime: '08:00',
          vitalsTime: '09:00',
          targets: { maxSystolic: 140, maxDiastolic: 90, warnSystolic: 130, warnDiastolic: 85 },
          supplyFollowUp: false,
          dailyStepGoal: 3000,
        }],
        [],
        [{
          taskId,
          type: 'vitals',
          title: 'Qon bosimi',
          date: '2026-11-24',
          dueTime: '09:00',
          status: 'recorded',
          recent: true,
          evidenceId,
          level: 0,
          source: 'self_report',
          aiMode: 'none',
          payload: { kind: 'vitals', systolic: 160, diastolic: 100, chestPain: false },
          createdAt: '2026-11-24T09:05:00.000Z',
          flagId,
          color: 'red',
          ruleKey: 'bp_max',
          detail: { metric: 'systolic', observed: 160, threshold: 140 },
          decision: null,
          reply: null,
          reviewedAt: null,
        }],
        [],
        [],
        [],
      ];

    // 1. GET /api/clinical/view?patientId=${patientId1} with open 160/100 bp_max red flag -> 200
    const viewRes = await clinicalViewGet(getRequest(`/api/clinical/view?patientId=${patientId1}`));
    expect(viewRes.status).toBe(200);
    const viewBody = await viewRes.json();
    expect(viewBody.view.flags).toEqual([
      expect.objectContaining({
        id: flagId,
        color: 'red',
        ruleKey: 'bp_max',
      }),
    ]);

    // 2. GET /api/clinical/patients -> 200 returning the doctor's linked patients
    const patientsRes = await clinicalPatientsGet(getRequest('/api/clinical/patients'));
    expect(patientsRes.status).toBe(200);
    await expect(patientsRes.json()).resolves.toEqual({
      patients: [{ id: patientId1, name: 'Anvar', roleKind: 'patient' }],
    });

    // 3. GET /api/clinical/telegram -> 200 { connected: false } (both with 1 patient and with 0 patients)
    const tgRes = await clinicalTelegramGet(getRequest('/api/clinical/telegram'));
    expect(tgRes.status).toBe(200);
    await expect(tgRes.json()).resolves.toEqual({ connected: false });

    linkedPatients = [];
    const tgZeroPatientsRes = await clinicalTelegramGet(getRequest('/api/clinical/telegram'));
    expect(tgZeroPatientsRes.status).toBe(200);
    await expect(tgZeroPatientsRes.json()).resolves.toEqual({ connected: false });
    linkedPatients = [{ id: patientId1, name: 'Anvar', roleKind: 'patient' }];

    // 4. POST /api/clinical/plan omitting patientId (single-patient doctor fallback) -> 200 { status: 'saved' }
    const planRes = await clinicalPlanPost(
      jsonPostRequest('/api/clinical/plan', {
        medicationName: 'Amlodipin',
        medicationStrengthMg: 5,
        medicationTime: '08:00',
        vitalsTime: '09:00',
        maxSystolic: 140,
        maxDiastolic: 90,
        warnSystolic: 130,
        warnDiastolic: 85,
        supplyFollowUp: false,
      }),
    );
    expect(planRes.status).toBe(200);
    await expect(planRes.json()).resolves.toEqual({ status: 'saved' });
    expect(planAssigned).toBe(true);
  });
});
