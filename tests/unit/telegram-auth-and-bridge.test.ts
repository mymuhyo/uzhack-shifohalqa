import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalActor, ClinicalView, TaskContext } from '../../src/lib/clinical-types';

const state = vi.hoisted(() => ({
  sqlHandler: null as null | ((sqlText: string, values: unknown[]) => unknown[] | Promise<unknown[]>),
  demoWorkspace: null as null | { doctor: { id: string; name: string }; patient: { id: string; name: string } },
  clinicalView: null as ClinicalView | null,
  activityDashboard: null as unknown,
  taskContext: null as TaskContext | null,
  saveEvidenceResult: 'saved' as 'saved' | 'already_saved' | 'not_found',
  savedEvidence: null as unknown,
  savedSteps: null as unknown,
  approvedBrief: null as unknown,
  exercisePlan: null as unknown,
}));

vi.mock('../../src/lib/db', () => ({
  getDatabase: () =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sqlText = strings.join('?');
      return Promise.resolve(state.sqlHandler ? state.sqlHandler(sqlText, values) : []);
    },
}));

vi.mock('../../src/lib/seed', () => ({
  ensureDemoWorkspace: async () => state.demoWorkspace,
}));

vi.mock('../../src/lib/clinical-store', () => ({
  getClinicalView: async () =>
    state.clinicalView ?? { plan: null, tasks: [], flags: [], urgentSymptoms: [], caregiverAck: null },
  getTaskContext: async () => state.taskContext,
  saveEvidence: async (_actor: ClinicalActor, evidence: unknown) => {
    state.savedEvidence = evidence;
    return state.saveEvidenceResult;
  },
  assignPlan: async () => 'saved',
  reviewFlag: async () => 'saved',
  saveFlagFollowup: async () => 'saved',
  acknowledgeFlagFollowup: async () => 'saved',
  saveUrgentSymptom: async () => 'saved',
  reviewUrgentSymptom: async () => 'saved',
}));

vi.mock('../../src/lib/activity-store', () => ({
  getActivityDashboard: async () => state.activityDashboard,
  saveStepCount: async (_actor: ClinicalActor, input: unknown) => {
    state.savedSteps = input;
    return 'saved';
  },
}));

vi.mock('../../src/lib/ai/clinical-brief-ai', () => ({
  readLatestClinicalBrief: async () => state.approvedBrief,
}));

vi.mock('../../src/lib/exercise-store', () => ({
  readExercisePlan: async () => state.exercisePlan,
  readExerciseAttempts: async () => [],
  assignExercise: async () => 'saved',
  reviewExerciseAttempt: async () => 'saved',
  saveExercise: async () => ({ status: 'saved' }),
}));

import { POST as telegramAuthPost } from '../../src/app/api/telegram/auth/route';
import { GET as telegramBridgeGet, POST as telegramBridgePost } from '../../src/app/api/telegram/bridge/route';
import { GET as clinicalViewGet } from '../../src/app/api/clinical/view/route';
import {
  issueTelegramBearerToken,
  verifyTelegramBearerToken,
  verifyTelegramInitData,
} from '../../src/lib/telegram-auth';

const botToken = '123456789:shifohalqa_test_bot_token_0123456789';
const sessionSecret = '0123456789abcdef0123456789abcdef0123456789abcdef';
const serviceSecret = 'bot-service-secret-at-least-thirty-two-chars-long';
const workspaceId = 'd0000000-0000-4000-8000-000000000001';
const patientId = 'd0000000-0000-4000-8000-000000000101';
const doctorId = 'd0000000-0000-4000-8000-000000000010';
const linkId = 'd0000000-0000-4000-8000-000000000901';
const medTask1 = '11111111-1111-4111-8111-111111111111';
const medTask2 = '22222222-2222-4222-8222-222222222222';
const vitalsTaskId = '33333333-3333-4333-8333-333333333333';
const origin = 'https://shifohalqa-final.example.test';
const tashkentToday = new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'short',
  timeZone: 'Asia/Tashkent',
}).format(new Date());

function signInitData(fields: Record<string, string>, token = botToken): string {
  const entries = Object.entries(fields).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const check = entries.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secretKey).update(check).digest('hex');
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

const envBackup = {
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  sessionSecret: process.env.SESSION_SECRET,
  serviceSecret: process.env.TELEGRAM_BOT_SERVICE_SECRET,
  demoMode: process.env.DEMO_MODE,
};

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = botToken;
  process.env.SESSION_SECRET = sessionSecret;
  process.env.TELEGRAM_BOT_SERVICE_SECRET = serviceSecret;
  process.env.DEMO_MODE = 'true';
  state.sqlHandler = null;
  state.demoWorkspace = {
    doctor: { id: doctorId, name: 'Dr. Test' },
    patient: { id: patientId, name: 'Anvar aka' },
  };
  state.clinicalView = null;
  state.activityDashboard = null;
  state.taskContext = null;
  state.saveEvidenceResult = 'saved';
  state.savedEvidence = null;
  state.savedSteps = null;
  state.approvedBrief = null;
  state.exercisePlan = null;
});

afterEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = envBackup.botToken;
  process.env.SESSION_SECRET = envBackup.sessionSecret;
  process.env.TELEGRAM_BOT_SERVICE_SECRET = envBackup.serviceSecret;
  process.env.DEMO_MODE = envBackup.demoMode;
});

describe('Telegram initData HMAC and scoped Bearer tokens', () => {
  it('verifies valid initData and rejects tampered, expired, or wrong-token initData', () => {
    const now = 1_800_000_000;
    const initData = signInitData({
      auth_date: String(now - 30),
      query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
      user: JSON.stringify({ id: 5551234, first_name: 'Anvar', username: 'anvar_u' }),
    });

    const valid = verifyTelegramInitData(initData, botToken, now);
    expect(valid).toEqual({
      ok: true,
      user: { id: 5551234, first_name: 'Anvar', username: 'anvar_u' },
      authDate: now - 30,
      queryId: 'AAHdF6IQAAAAAN0XohDhrOrc',
    });

    const tampered = initData.replace('Anvar', 'Malika');
    expect(verifyTelegramInitData(tampered, botToken, now)).toEqual({
      ok: false,
      error: 'invalid_init_data',
    });

    expect(verifyTelegramInitData(initData, '999999999:wrong_token_01234567890123456789012', now)).toEqual({
      ok: false,
      error: 'invalid_init_data',
    });

    const expired = signInitData({
      auth_date: String(now - 3601),
      user: JSON.stringify({ id: 5551234, first_name: 'Anvar' }),
    });
    expect(verifyTelegramInitData(expired, botToken, now)).toEqual({
      ok: false,
      error: 'expired_init_data',
    });
  });

  it('issues scoped tgm1 bearer tokens, rejects expired/tampered tokens, and revokes on unlink (401)', async () => {
    const issued = issueTelegramBearerToken({
      kind: 'linked',
      role: 'patient',
      workspaceId,
      actorId: patientId,
      chatId: 5551234,
      linkId,
      isDemo: false,
    });
    expect(issued?.token.startsWith('tgm1.')).toBe(true);
    expect(verifyTelegramBearerToken(issued!.token)?.actorId).toBe(patientId);
    expect(verifyTelegramBearerToken(issued!.token, Math.floor(Date.now() / 1000) + 3600)).toBeNull();
    const tamperedToken = `${issued!.token.slice(0, -1)}${issued!.token.endsWith('A') ? 'B' : 'A'}`;
    expect(verifyTelegramBearerToken(tamperedToken)).toBeNull();

    // Linked row active -> 200 on /api/clinical/view with Bearer token (no cookies)
    let linkedActive = true;
    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.telegram_patient_links') && sqlText.includes('link.link_id')) {
        return linkedActive
          ? [{
              workspaceId,
              patientId,
              doctorId,
              roleKind: 'patient',
              patientName: 'Anvar aka',
              isDemo: false,
              detailsEnabled: true,
              linkId,
              chatId: 5551234,
            }]
          : [];
      }
      if (sqlText.includes('FROM public.telegram_patient_links')) {
        return linkedActive ? [{ detailsEnabled: true }] : [];
      }
      return [];
    };

    const okRes = await clinicalViewGet(
      new NextRequest(`${origin}/api/clinical/view`, {
        headers: { authorization: `Bearer ${issued!.token}` },
      }),
    );
    expect(okRes.status).toBe(200);
    const okBody = await okRes.json();
    expect(okBody.telegram).toEqual({ connected: true, detailsEnabled: true });

    // Unlink revokes access immediately -> 401
    linkedActive = false;
    const revokedRes = await clinicalViewGet(
      new NextRequest(`${origin}/api/clinical/view`, {
        headers: { authorization: `Bearer ${issued!.token}` },
      }),
    );
    expect(revokedRes.status).toBe(401);
  });

  it('authenticates linked and demo Mini App sessions via POST /api/telegram/auth without cookies', async () => {
    const now = Math.floor(Date.now() / 1000);
    const initData = signInitData({
      auth_date: String(now),
      user: JSON.stringify({ id: 777001, first_name: 'Malika' }),
    });

    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.telegram_patient_links')) {
        return [{
          workspaceId,
          patientId,
          doctorId,
          roleKind: 'patient',
          patientName: 'Malika opa',
          isDemo: false,
          detailsEnabled: false,
          linkId,
          chatId: 777001,
        }];
      }
      return [];
    };

    const linkedAuth = await telegramAuthPost(
      new NextRequest(`${origin}/api/telegram/auth`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ initData }),
      }),
    );
    expect(linkedAuth.status).toBe(200);
    const linkedJson = await linkedAuth.json();
    expect(linkedJson).toMatchObject({
      authenticated: true,
      mode: 'linked',
      role: 'patient',
      patientName: 'Malika opa',
      isDemo: false,
      detailsEnabled: false,
    });
    expect(linkedJson.token).toMatch(/^tgm1\./);

    // Demo mode inside iframe
    const demoAuth = await telegramAuthPost(
      new NextRequest(`${origin}/api/telegram/auth`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin },
        body: JSON.stringify({ mode: 'demo', role: 'patient' }),
      }),
    );
    expect(demoAuth.status).toBe(200);
    const demoJson = await demoAuth.json();
    expect(demoJson).toMatchObject({
      authenticated: true,
      mode: 'demo',
      role: 'patient',
      isDemo: true,
    });
  });
});

describe('/api/telegram/bridge', () => {
  beforeEach(() => {
    state.sqlHandler = (sqlText) => {
      if (sqlText.includes('FROM public.telegram_patient_links')) {
        return [{
          workspaceId,
          patientId,
          doctorId,
          roleKind: 'patient',
          patientName: 'Anvar aka',
          isDemo: false,
          detailsEnabled: true,
          linkId,
          chatId: 888999,
        }];
      }
      return [];
    };
    state.clinicalView = {
      plan: {
        medicationName: 'Amlodipin',
        medicationStrengthMg: 5,
        medicationStrengthUnit: 'mg',
        medicationTime: '08:00',
        medications: [
          { name: 'Amlodipin', strength: 5, strengthUnit: 'mg', times: ['08:00'] },
          { name: 'Metformin', strength: 500, strengthUnit: 'mg', times: ['20:00'] },
        ],
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
        dailyStepGoal: 4000,
      },
      tasks: [
        {
          id: medTask1,
          type: 'medication',
          title: 'Amlodipin',
          date: tashkentToday,
          dueTime: '08:00',
          strength: 5,
          strengthUnit: 'mg',
          status: 'pending',
          evidence: null,
          boxEvidence: null,
        },
        {
          id: medTask2,
          type: 'medication',
          title: 'Metformin',
          date: tashkentToday,
          dueTime: '20:00',
          strength: 500,
          strengthUnit: 'mg',
          status: 'pending',
          evidence: null,
          boxEvidence: null,
        },
        {
          id: vitalsTaskId,
          type: 'vitals',
          title: 'Qon bosimi',
          date: tashkentToday,
          dueTime: '09:00',
          status: 'pending',
          evidence: null,
          boxEvidence: null,
        },
      ],
      flags: [],
      urgentSymptoms: [],
      caregiverAck: null,
    };
    state.activityDashboard = {
      localDate: tashkentToday,
      dailyStepGoal: 4000,
      adherence: {
        today: { scheduled: 3, completed: 0, answered: 0 },
        week: { scheduled: 6, completed: 3, answered: 4 },
      },
      steps: { count: 2500, level: 0, source: 'self_report', aiMode: 'manual', updatedAt: '2026-11-26T06:00:00.000Z' },
      dueUnits: [],
      stepTrend: [],
      medicationAdherence: [],
    };
    state.approvedBrief = {
      id: '44444444-4444-4444-8444-444444444444',
      briefDate: tashkentToday,
      level: 4,
      approvedReplyUz: 'Dorilarni o‘z vaqtida davom ettiring.',
      approvedAt: '2026-11-26T08:00:00.000Z',
    };
  });

  it('rejects missing/wrong bot secret with 401 and returns multi-dose summary + L4 brief when authorized', async () => {
    const unauthorized = await telegramBridgeGet(
      new Request(`${origin}/api/telegram/bridge`, {
        headers: { authorization: 'Bearer wrong-secret', 'x-telegram-chat-id': '888999' },
      }),
    );
    expect(unauthorized.status).toBe(401);

    const res = await telegramBridgeGet(
      new Request(`${origin}/api/telegram/bridge`, {
        headers: { authorization: `Bearer ${serviceSecret}`, 'x-telegram-chat-id': '888999' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.doses).toHaveLength(2);
    expect(body.doses[0].title).toBe('Amlodipin');
    expect(body.doses[1].title).toBe('Metformin');
    expect(body.approvedBrief.approvedReplyUz).toBe('Dorilarni o‘z vaqtida davom ettiring.');
    expect(JSON.stringify(body)).not.toMatch(/doctor_note|doctorNote|acknowledged_note|doctorDraftUz/);
  });

  it('records medication, high/low BP vitals, steps, and opt-in toggle via bridge POST', async () => {
    state.taskContext = {
      type: 'medication',
      title: 'Amlodipin',
      date: tashkentToday,
      plan: state.clinicalView!.plan!,
      previousMedication: null,
    };

    const medRes = await telegramBridgePost(
      new Request(`${origin}/api/telegram/bridge`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${serviceSecret}`,
          'x-telegram-chat-id': '888999',
        },
        body: JSON.stringify({ action: 'medication', taskId: medTask1, status: 'missed', reason: 'out_of_supply' }),
      }),
    );
    expect(medRes.status).toBe(200);
    const medBody = await medRes.json();
    expect(medBody).toMatchObject({ status: 'saved', flagColor: 'yellow' });

    // Low BP (hypotension) evaluation
    state.taskContext = {
      type: 'vitals',
      title: 'Qon bosimi',
      date: tashkentToday,
      plan: state.clinicalView!.plan!,
      previousMedication: null,
    };
    const bpRes = await telegramBridgePost(
      new Request(`${origin}/api/telegram/bridge`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${serviceSecret}`,
          'x-telegram-chat-id': '888999',
        },
        body: JSON.stringify({ action: 'vitals', systolic: 85, diastolic: 55 }),
      }),
    );
    expect(bpRes.status).toBe(200);
    const bpBody = await bpRes.json();
    expect(bpBody).toMatchObject({ status: 'saved', flagColor: 'red', zone: { tone: 'urgent', labelUz: 'Past chegara' } });

    // Invalid BP rejected cleanly
    const badBpRes = await telegramBridgePost(
      new Request(`${origin}/api/telegram/bridge`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${serviceSecret}`,
          'x-telegram-chat-id': '888999',
        },
        body: JSON.stringify({ action: 'vitals', systolic: 80, diastolic: 90 }),
      }),
    );
    expect(badBpRes.status).toBe(400);

    // Steps
    const stepsRes = await telegramBridgePost(
      new Request(`${origin}/api/telegram/bridge`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${serviceSecret}`,
          'x-telegram-chat-id': '888999',
        },
        body: JSON.stringify({ action: 'steps', count: 4500 }),
      }),
    );
    expect(stepsRes.status).toBe(200);
    expect(await stepsRes.json()).toMatchObject({ status: 'saved', count: 4500, achieved: true });
  });
});
