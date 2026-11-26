import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalActor, ClinicalView, TaskContext } from '../../src/lib/clinical-types';

const state = vi.hoisted(() => ({
  signInResult: null as null | {
    data: {
      user: { id: string; email?: string | null } | null;
      session: { access_token: string; expires_at?: number; expires_in?: number } | null;
    };
    error: { message: string } | null;
  },
  sqlHandler: null as null | ((sqlText: string, values: unknown[]) => unknown[] | Promise<unknown[]>),
  mobileAuth: null as null | { ok: true; actor: ClinicalActor; patientName: string } | { ok: false; status: 401 | 403 | 404 | 503; error: string },
  taskContext: null as TaskContext | null,
  savedEvidence: null as unknown,
  saveEvidenceResult: 'saved' as 'saved' | 'already_saved' | 'not_found',
  clinicalView: null as ClinicalView | null,
  activityDashboard: null as unknown,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: async () =>
        state.signInResult ?? {
          data: { user: null, session: null },
          error: { message: 'Invalid login credentials' },
        },
    },
  }),
}));

vi.mock('../../src/lib/db', () => ({
  getDatabase: () =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sqlText = strings.join('?');
      return Promise.resolve(state.sqlHandler ? state.sqlHandler(sqlText, values) : []);
    },
}));

vi.mock('../../src/lib/auth', () => ({
  resolveMobilePatientActor: async () =>
    state.mobileAuth ?? { ok: false, status: 401, error: 'unauthorized' },
}));

vi.mock('../../src/lib/clinical-store', () => ({
  getTaskContext: async () => state.taskContext,
  saveEvidence: async (_actor: ClinicalActor, evidence: unknown) => {
    state.savedEvidence = evidence;
    return state.saveEvidenceResult;
  },
  getClinicalView: async () =>
    state.clinicalView ?? { plan: null, tasks: [], flags: [], urgentSymptoms: [], caregiverAck: null },
}));

vi.mock('../../src/lib/activity-store', () => ({
  getActivityDashboard: async () => state.activityDashboard,
}));

import { POST as mobileLoginPost } from '../../src/app/api/mobile/v1/login/route';
import { POST as mobileEvidencePost } from '../../src/app/api/mobile/v1/evidence/route';
import { GET as mobileTodayGet } from '../../src/app/api/mobile/v1/today/route';

const workspaceId = 'd0000000-0000-4000-8000-000000000001';
const patientId = 'd0000000-0000-4000-8000-000000000101';
const doctorId = 'd0000000-0000-4000-8000-000000000010';
const medTaskId = '11111111-1111-4111-8111-111111111111';
const vitalsTaskId = '22222222-2222-4222-8222-222222222222';

const basePlan = {
  medicationName: 'Amlodipin',
  medicationStrengthMg: 5,
  medicationStrengthUnit: 'mg' as const,
  medicationTime: '08:00',
  medications: [{ name: 'Amlodipin', strength: 5, strengthUnit: 'mg' as const, times: ['08:00'] }],
  vitalsTime: '09:00',
  targets: {
    maxSystolic: 140,
    maxDiastolic: 90,
    warnSystolic: 130,
    warnDiastolic: 85,
    minSystolic: 90,
    minDiastolic: 60,
  },
  supplyFollowUp: true,
  dailyStepGoal: 3000,
};

const envBackup = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  state.signInResult = null;
  state.sqlHandler = null;
  state.mobileAuth = null;
  state.taskContext = null;
  state.savedEvidence = null;
  state.saveEvidenceResult = 'saved';
  state.clinicalView = null;
  state.activityDashboard = null;
});

afterEach(() => {
  if (envBackup.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = envBackup.url;
  if (envBackup.key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = envBackup.key;
});

describe('POST /api/mobile/v1/login', () => {
  const loginRequest = (body: unknown) =>
    new Request('https://example.test/api/mobile/v1/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('returns 200 Bearer token with isDemo: false and private no-store for active patient', async () => {
    state.signInResult = {
      data: {
        user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'anvar@demo.shifohalqa.uz' },
        session: { access_token: 'header.payload.signature', expires_at: 1_900_000_000 },
      },
      error: null,
    };
    state.sqlHandler = () => [{
      workspaceId,
      patientId,
      role: 'patient',
      patientName: 'Anvar Toshmatov',
      isDemo: false,
    }];

    const res = await mobileLoginPost(loginRequest({ email: 'Anvar@demo.shifohalqa.uz', password: 'secret' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await res.json()).toEqual({
      token: 'header.payload.signature',
      expiresAt: new Date(1_900_000_000 * 1000).toISOString(),
      workspaceId,
      patientName: 'Anvar Toshmatov',
      isDemo: false,
    });
  });

  it('accepts active individual accounts without a doctor', async () => {
    state.signInResult = {
      data: {
        user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'solo@example.uz' },
        session: { access_token: 'solo.jwt.token', expires_in: 3600 },
      },
      error: null,
    };
    state.sqlHandler = () => [{
      workspaceId,
      patientId,
      role: 'individual',
      patientName: 'Dilnoza',
      isDemo: false,
    }];

    const res = await mobileLoginPost(loginRequest({ email: 'solo@example.uz', password: 'secret' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ token: 'solo.jwt.token', workspaceId, patientName: 'Dilnoza', isDemo: false });
  });

  it('returns 403 for doctor or caregiver memberships', async () => {
    state.signInResult = {
      data: {
        user: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'shifokor@demo.shifohalqa.uz' },
        session: { access_token: 'doc.jwt.token', expires_at: 1_900_000_000 },
      },
      error: null,
    };
    state.sqlHandler = () => [{
      workspaceId,
      patientId: null,
      role: 'doctor',
      patientName: null,
      isDemo: false,
    }];

    const docRes = await mobileLoginPost(loginRequest({ email: 'shifokor@demo.shifohalqa.uz', password: 'secret' }));
    expect(docRes.status).toBe(403);
    expect(await docRes.json()).toEqual({ error: 'forbidden' });

    state.sqlHandler = () => [{
      workspaceId,
      patientId,
      role: 'caregiver',
      patientName: 'Anvar',
      isDemo: false,
    }];
    const cgRes = await mobileLoginPost(loginRequest({ email: 'caregiver@demo.shifohalqa.uz', password: 'secret' }));
    expect(cgRes.status).toBe(403);
  });

  it('returns 401 on invalid credentials and 400/413 on bad input', async () => {
    const badCreds = await mobileLoginPost(loginRequest({ email: 'x@example.com', password: 'wrong' }));
    expect(badCreds.status).toBe(401);
    expect(await badCreds.json()).toEqual({ error: 'invalid_credentials' });

    const invalid = await mobileLoginPost(loginRequest({ email: 'not-an-email', password: '' }));
    expect(invalid.status).toBe(400);

    const tooLarge = await mobileLoginPost(loginRequest({ email: 'a@b.com', password: 'x'.repeat(2500) }));
    expect(tooLarge.status).toBe(413);
  });
});

describe('POST /api/mobile/v1/evidence (medication + vitals)', () => {
  const patientActor: ClinicalActor = {
    workspaceId,
    doctorId,
    patientId,
    role: 'patient',
    isDemo: false,
  };

  const evidenceReq = (body: unknown) =>
    new Request('https://example.test/api/mobile/v1/evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer header.payload.token' },
      body: JSON.stringify(body),
    });

  it('keeps medication taken/missed backwards compatibility', async () => {
    state.mobileAuth = { ok: true, actor: patientActor, patientName: 'Anvar' };
    state.taskContext = {
      type: 'medication',
      date: '2026-11-26',
      plan: basePlan,
      previousMedication: null,
    };

    const res = await mobileEvidencePost(evidenceReq({ taskId: medTaskId, medicationStatus: 'missed', reason: 'out_of_supply' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: 'saved' });
    expect(state.savedEvidence).toMatchObject({
      taskId: medTaskId,
      level: 0,
      source: 'self_report',
      aiMode: 'none',
      payload: { kind: 'medication', status: 'missed', reason: 'out_of_supply' },
      flag: { color: 'yellow', ruleKey: 'medication_out_of_supply' },
    });
  });

  it('evaluates normal, high (bp_max), low (bp_low), and chest-pain-only vitals', async () => {
    state.mobileAuth = { ok: true, actor: patientActor, patientName: 'Anvar' };
    state.taskContext = {
      type: 'vitals',
      date: '2026-11-26',
      plan: basePlan,
      previousMedication: null,
    };

    const normalRes = await mobileEvidencePost(evidenceReq({ taskId: vitalsTaskId, systolic: 122, diastolic: 78, chestPain: false }));
    expect(normalRes.status).toBe(200);
    expect(state.savedEvidence).toMatchObject({
      level: 0,
      source: 'self_report',
      aiMode: 'manual',
      payload: { kind: 'vitals', systolic: 122, diastolic: 78, chestPain: false },
      flag: null,
    });

    const highRes = await mobileEvidencePost(evidenceReq({ taskId: vitalsTaskId, systolic: 158, diastolic: 98, chestPain: false }));
    expect(highRes.status).toBe(200);
    expect(state.savedEvidence).toMatchObject({
      flag: { color: 'red', ruleKey: 'bp_max', metric: 'systolic', observed: 158, threshold: 140 },
    });

    const lowRes = await mobileEvidencePost(evidenceReq({ taskId: vitalsTaskId, systolic: 84, diastolic: 54, chestPain: false }));
    expect(lowRes.status).toBe(200);
    expect(state.savedEvidence).toMatchObject({
      flag: { color: 'red', ruleKey: 'bp_low', metric: 'systolic', observed: 84, threshold: 90 },
    });

    const painOnlyRes = await mobileEvidencePost(evidenceReq({ taskId: vitalsTaskId, systolic: null, diastolic: null, chestPain: true }));
    expect(painOnlyRes.status).toBe(200);
    expect(state.savedEvidence).toMatchObject({
      flag: { color: 'red', ruleKey: 'chest_pain' },
    });
  });

  it('rejects physiologically invalid BP, patientId injection, and task-type mismatch', async () => {
    state.mobileAuth = { ok: true, actor: patientActor, patientName: 'Anvar' };
    state.taskContext = {
      type: 'vitals',
      date: '2026-11-26',
      plan: basePlan,
      previousMedication: null,
    };

    const inverted = await mobileEvidencePost(evidenceReq({ taskId: vitalsTaskId, systolic: 90, diastolic: 100, chestPain: false }));
    expect(inverted.status).toBe(400);

    const outOfRange = await mobileEvidencePost(evidenceReq({ taskId: vitalsTaskId, systolic: 290, diastolic: 90, chestPain: false }));
    expect(outOfRange.status).toBe(400);

    const injectedPatient = await mobileEvidencePost(
      evidenceReq({ patientId, taskId: vitalsTaskId, systolic: 120, diastolic: 80, chestPain: false }),
    );
    expect(injectedPatient.status).toBe(400);

    state.taskContext = {
      type: 'medication',
      date: '2026-11-26',
      plan: basePlan,
      previousMedication: null,
    };
    const mismatch = await mobileEvidencePost(evidenceReq({ taskId: medTaskId, systolic: 120, diastolic: 80, chestPain: false }));
    expect(mismatch.status).toBe(404);
  });
});

describe('GET /api/mobile/v1/today (isDemo, vitals replies, bpHistory)', () => {
  it('merges vitals replies and returns bpHistory without leaking doctor notes', async () => {
    const today = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'Asia/Tashkent' }).format(new Date());
    state.mobileAuth = {
      ok: true,
      actor: { workspaceId, doctorId, patientId, role: 'patient', isDemo: false },
      patientName: 'Malika Rahimova',
    };
    state.clinicalView = {
      plan: basePlan,
      flags: [],
      urgentSymptoms: [],
      caregiverAck: null,
      tasks: [
        {
          id: vitalsTaskId,
          type: 'vitals',
          title: 'Qon bosimi',
          date: today,
          dueTime: '09:00',
          status: 'recorded',
          boxEvidence: null,
          evidence: {
            id: '33333333-3333-4333-8333-333333333333',
            taskId: vitalsTaskId,
            payload: { kind: 'vitals', systolic: 152, diastolic: 94, chestPain: false },
            level: 4,
            source: 'self_report',
            aiMode: 'manual',
            createdAt: `${today}T04:00:00.000Z`,
            review: {
              decision: 'approved',
              reply: 'Bosimni tinch holatda qayta o‘lchang.',
              reviewedAt: `${today}T05:00:00.000Z`,
            },
          },
        },
      ],
    };

    const res = await mobileTodayGet(new Request('https://example.test/api/mobile/v1/today'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/doctor_note|doctorNote|acknowledged_note|acknowledgedNote/);
    const json = JSON.parse(text);
    expect(json.isDemo).toBe(false);
    expect(json.replies).toEqual([
      {
        recordId: '33333333-3333-4333-8333-333333333333',
        taskTitle: 'Qon bosimi',
        date: today,
        body: 'Bosimni tinch holatda qayta o‘lchang.',
        decision: 'approved',
        reviewedAt: `${today}T05:00:00.000Z`,
      },
    ]);
    expect(json.bpHistory).toEqual([
      {
        id: '33333333-3333-4333-8333-333333333333',
        date: today,
        systolic: 152,
        diastolic: 94,
        chestPain: false,
        level: 4,
        reviewed: true,
      },
    ]);
  });
});
