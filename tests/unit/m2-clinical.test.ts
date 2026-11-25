import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalActor } from '../../src/lib/clinical-types';
import type { SqlAdapter, TransactionSqlAdapter } from '../../src/lib/db';

const realClient = postgres('postgres://user:pass@localhost:5432/test_db', { prepare: false });

type CapturedCall = {
  sqlText: string;
  values: unknown[];
};

const state = vi.hoisted(() => ({
  capturedCalls: [] as CapturedCall[],
  sqlHandler: null as null | ((sqlText: string, values: unknown[]) => unknown[]),
  txHandler: null as null | (() => Promise<unknown[][]>),
  mobileAuth: null as null | {
    ok: true;
    actor: ClinicalActor;
    patientName: string;
  },
}));

const mockTx = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join('?');
    state.capturedCalls.push({ sqlText, values });
    return Promise.resolve([]);
  },
  {
    json: (value: postgres.JSONValue) => realClient.json(value),
  },
) as unknown as TransactionSqlAdapter;

const mockSql = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join('?');
    state.capturedCalls.push({ sqlText, values });
    return Promise.resolve(state.sqlHandler ? state.sqlHandler(sqlText, values) : []);
  },
  {
    json: (value: postgres.JSONValue) => realClient.json(value),
    transaction: async (fn: (tx: TransactionSqlAdapter) => readonly Promise<unknown[]>[]) => {
      fn(mockTx);
      if (state.txHandler) return state.txHandler();
      return [];
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

vi.mock('../../src/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/auth')>();
  return {
    ...actual,
    resolveMobilePatientActor: async () => state.mobileAuth ?? { ok: false, status: 401, error: 'unauthorized' },
  };
});

import { GET as mobileTodayGet } from '../../src/app/api/mobile/v1/today/route';
import { getActivityDashboard, saveStepCount } from '../../src/lib/activity-store';
import { planJsonInput, prepareEvidence } from '../../src/lib/clinical-inputs';
import { assignPlan, getClinicalView, getTaskContext, saveEvidence } from '../../src/lib/clinical-store';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const doctorId = '22222222-2222-4222-8222-222222222222';
const patientId = '33333333-3333-4333-8333-333333333333';
const planItemAmlAm = '44444444-4444-4444-8444-444444444441';
const planItemAmlPm = '44444444-4444-4444-8444-444444444442';
const planItemMet = '44444444-4444-4444-8444-444444444443';
const planItemVitals = '44444444-4444-4444-8444-444444444444';
const taskAmlAm = '55555555-5555-4555-8555-555555555551';
const taskAmlPm = '55555555-5555-4555-8555-555555555552';
const taskMet = '55555555-5555-4555-8555-555555555553';
const taskVitals = '55555555-5555-4555-8555-555555555554';
const prevVitalsEvidenceId = '66666666-6666-4666-8666-666666666661';

const doctorActor: ClinicalActor = { workspaceId, doctorId, patientId, role: 'doctor', isDemo: false };
const patientActor: ClinicalActor = { workspaceId, doctorId, patientId, role: 'patient', isDemo: false };
const demoPatientActor: ClinicalActor = { workspaceId, doctorId, patientId, role: 'patient', isDemo: true };

function findJsonParam(values: unknown[], predicate: (val: unknown) => boolean): unknown {
  for (const v of values) {
    if (v && typeof v === 'object' && 'type' in v && 'value' in v && (v as { type: unknown }).type === 3802) {
      const inner = (v as { value: unknown }).value;
      if (predicate(inner)) return inner;
    }
  }
  return undefined;
}

beforeEach(() => {
  state.capturedCalls.length = 0;
  state.sqlHandler = null;
  state.txHandler = null;
  state.mobileAuth = null;
});

afterAll(async () => {
  await realClient.end({ timeout: 0 });
});

describe('M2 unified schema migration (20261125000300_m2_clinical_extensions.sql)', () => {
  it('defines all required M2 DDL invariants and locks down ai_rate_limits', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20261125000300_m2_clinical_extensions.sql'),
      'utf8',
    );
    expect(sql).toContain("CHECK (strength_unit IN ('mg', 'mcg', 'g', 'iu'))");
    expect(sql).toContain('sort_order smallint NOT NULL DEFAULT 0');
    expect(sql).toContain('plan_items_vitals_unique_idx');
    expect(sql).toContain('plan_items_med_slot_unique_idx');
    expect(sql).toContain('PRIMARY KEY (workspace_id, patient_id, activity_date, source)');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.ai_rate_limits');
    expect(sql).toContain('REVOKE ALL ON TABLE public.ai_rate_limits FROM anon, authenticated');
    expect(sql).toContain('ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ai_rate_limits_deny_authenticated');
    expect(sql).toContain('cited_record_ids jsonb NOT NULL');
    expect(sql).toContain('doctor_draft_uz text NOT NULL');
    expect(sql).toContain('approved_reply_uz text');
    expect(sql).toContain('ai_clinical_briefs_cache_idx');
    expect(sql).toContain('video_duration_sec integer');
    expect(sql).toContain('BETWEEN 1 AND 20971520');
    expect(sql).toContain("IN ('video/mp4', 'video/webm')");
    expect(sql).toContain('video_consented boolean NOT NULL DEFAULT false');
    expect(sql).toContain('exercise_attempts_video_path_idx');
  });
});

describe('M2.1 multi-medication plans, units, and clinical store', () => {
  it('assignPlan writes 1-3 drugs x 1-2 times with strength_unit, sort_order, and high+low BP targets in one query', async () => {
    state.sqlHandler = () => [{ result: 'saved' }];
    const parsed = planJsonInput.parse({
      medications: [
        { name: 'Amlodipin', strength: 5, strengthUnit: 'mg', times: ['08:00', '20:00'] },
        { name: 'Levotiroksin', strength: 50, strengthUnit: 'mcg', times: ['07:00'] },
        { name: 'Vitamin D3', strength: 1000, strengthUnit: 'iu', times: ['13:00'] },
      ],
      vitalsTime: '09:00',
      warnSystolic: 135,
      warnDiastolic: 85,
      maxSystolic: 150,
      maxDiastolic: 95,
      minSystolic: 90,
      minDiastolic: 60,
      supplyFollowUp: true,
      dailyStepGoal: 4000,
    });

    const result = await assignPlan(doctorActor, parsed.plan);
    expect(result).toBe('saved');
    expect(state.capturedCalls).toHaveLength(1);
    const call = state.capturedCalls[0]!;
    expect(call.sqlText).toContain('strength_unit, sort_order');

    const targetsParam = findJsonParam(call.values, (v) => Boolean(v && typeof v === 'object' && 'minSystolic' in v));
    expect(targetsParam).toEqual({
      maxSystolic: 150,
      maxDiastolic: 95,
      warnSystolic: 135,
      warnDiastolic: 85,
      minSystolic: 90,
      minDiastolic: 60,
    });

    const itemsParam = findJsonParam(call.values, (v) => Array.isArray(v));
    expect(itemsParam).toEqual([
      { type: 'medication', title: 'Amlodipin', due_time: '08:00', box_strength_mg: 5, strength_unit: 'mg', sort_order: 0 },
      { type: 'medication', title: 'Amlodipin', due_time: '20:00', box_strength_mg: 5, strength_unit: 'mg', sort_order: 1 },
      { type: 'medication', title: 'Levotiroksin', due_time: '07:00', box_strength_mg: 50, strength_unit: 'mcg', sort_order: 2 },
      { type: 'medication', title: 'Vitamin D3', due_time: '13:00', box_strength_mg: 1000, strength_unit: 'iu', sort_order: 3 },
      { type: 'vitals', title: 'Qon bosimi', due_time: '09:00', box_strength_mg: null, strength_unit: 'mg', sort_order: 4 },
    ]);
  });

  it('getClinicalView and getTaskContext hydrate multi-medication schedules and per-task units without leaking notes', async () => {
    state.txHandler = async () => [
      [{
        medicationName: 'Amlodipin',
        medicationStrengthMg: 5,
        medicationStrengthUnit: 'mg',
        medicationTime: '08:00',
        vitalsTime: '09:00',
        targets: { maxSystolic: 150, maxDiastolic: 95, warnSystolic: 135, warnDiastolic: 85, minSystolic: 90, minDiastolic: 60 },
        supplyFollowUp: true,
        dailyStepGoal: 4000,
        medicationItems: [
          { id: planItemAmlAm, title: 'Amlodipin', strength: 5, strengthUnit: 'mg', dueTime: '08:00', sortOrder: 0 },
          { id: planItemAmlPm, title: 'Amlodipin', strength: 5, strengthUnit: 'mg', dueTime: '20:00', sortOrder: 1 },
          { id: planItemMet, title: 'Levotiroksin', strength: 50, strengthUnit: 'mcg', dueTime: '07:00', sortOrder: 2 },
        ],
      }],
      [],
      [
        {
          taskId: taskAmlAm,
          planItemId: planItemAmlAm,
          type: 'medication',
          title: 'Amlodipin',
          date: '2026-11-25',
          dueTime: '08:00',
          strength: 5,
          strengthUnit: 'mg',
          sortOrder: 0,
          status: 'taken',
          recent: true,
          evidenceId: null,
          flagId: null,
          decision: null,
        },
        {
          taskId: taskMet,
          planItemId: planItemMet,
          type: 'medication',
          title: 'Levotiroksin',
          date: '2026-11-25',
          dueTime: '07:00',
          strength: 50,
          strengthUnit: 'mcg',
          sortOrder: 2,
          status: 'pending',
          recent: true,
          evidenceId: null,
          flagId: null,
          decision: null,
        },
      ],
      [],
      [],
      [],
    ];

    const view = await getClinicalView(patientActor);
    expect(view.plan?.medications).toEqual([
      { name: 'Amlodipin', strength: 5, strengthUnit: 'mg', times: ['08:00', '20:00'] },
      { name: 'Levotiroksin', strength: 50, strengthUnit: 'mcg', times: ['07:00'] },
    ]);
    expect(view.plan?.targets).toMatchObject({ minSystolic: 90, minDiastolic: 60 });
    expect(view.tasks[1]).toMatchObject({
      id: taskMet,
      planItemId: planItemMet,
      strength: 50,
      strengthUnit: 'mcg',
    });
    for (const call of state.capturedCalls) {
      expect(call.sqlText).not.toMatch(/doctor_note|acknowledged_note/);
    }

    state.sqlHandler = () => [{
      planItemId: planItemMet,
      type: 'medication',
      title: 'Levotiroksin',
      strength: 50,
      strengthUnit: 'mcg',
      date: '2026-11-25',
      medicationName: 'Amlodipin',
      medicationStrengthMg: 5,
      medicationStrengthUnit: 'mg',
      medicationTime: '08:00',
      vitalsTime: '09:00',
      targets: { maxSystolic: 150, maxDiastolic: 95, warnSystolic: 135, warnDiastolic: 85, minSystolic: 90, minDiastolic: 60 },
      supplyFollowUp: true,
      dailyStepGoal: 4000,
      medicationItems: [
        { id: planItemAmlAm, title: 'Amlodipin', strength: 5, strengthUnit: 'mg', dueTime: '08:00', sortOrder: 0 },
        { id: planItemMet, title: 'Levotiroksin', strength: 50, strengthUnit: 'mcg', dueTime: '07:00', sortOrder: 1 },
      ],
      previousDate: '2026-11-24',
      previousStatus: 'missed',
    }];

    const ctx = await getTaskContext(patientActor, taskMet);
    expect(ctx).toMatchObject({
      planItemId: planItemMet,
      title: 'Levotiroksin',
      strength: 50,
      strengthUnit: 'mcg',
      previousMedication: { date: '2026-11-24', status: 'missed' },
    });
  });

  it('saveEvidence persists low-BP bp_low flag and scoped repeatOfEvidenceId', async () => {
    state.sqlHandler = () => [{ result: 'saved' }];
    const evidence = prepareEvidence(
      {
        taskId: taskVitals,
        payload: {
          kind: 'vitals',
          systolic: 84,
          diastolic: 56,
          chestPain: false,
          repeatOfEvidenceId: prevVitalsEvidenceId,
        },
      },
      {
        type: 'vitals',
        date: '2026-11-25',
        previousMedication: null,
        plan: {
          medicationName: 'Amlodipin',
          medicationStrengthMg: 5,
          medicationTime: '08:00',
          vitalsTime: '09:00',
          supplyFollowUp: false,
          targets: { maxSystolic: 150, maxDiastolic: 95, warnSystolic: 135, warnDiastolic: 85, minSystolic: 90, minDiastolic: 60 },
        },
      },
    );
    expect(evidence?.flag).toEqual({
      color: 'red',
      ruleKey: 'bp_low',
      metric: 'systolic',
      observed: 84,
      threshold: 90,
    });

    const saved = await saveEvidence(patientActor, evidence!);
    expect(saved).toBe('saved');
    expect(state.capturedCalls[0]?.values).toContain(prevVitalsEvidenceId);
    expect(state.capturedCalls[0]?.sqlText).toContain('prev_ev.id =');
  });
});

describe('M2.2 dual-source steps, 7-day trend, and /api/mobile/v1/today', () => {
  it('saveStepCount targets (workspace_id, patient_id, activity_date, source) and restricts demo_sim to demo', async () => {
    expect(await saveStepCount(patientActor, { count: 3500, source: 'demo_sim' })).toBe('not_found');
    expect(state.capturedCalls).toHaveLength(0);

    state.sqlHandler = () => [{ result: 'saved' }];
    expect(await saveStepCount(patientActor, { count: 4200, source: 'device_sensor' })).toBe('saved');
    expect(state.capturedCalls[0]?.sqlText).toContain('ON CONFLICT (workspace_id, patient_id, activity_date, source)');

    expect(await saveStepCount(demoPatientActor, { count: 3100, source: 'demo_sim' })).toBe('saved');
  });

  it('getActivityDashboard exposes dual-source steps, 7-day preference trend, and per-medication adherence', async () => {
    state.sqlHandler = () => [{
      today: '2026-11-25',
      isDemo: false,
      dailyStepGoal: 4000,
      units: [
        {
          planItemId: planItemAmlAm,
          type: 'medication',
          title: 'Amlodipin',
          dueTime: '08:00',
          strength: 5,
          strengthUnit: 'mg',
          sortOrder: 0,
          scheduledDate: '2026-11-25',
          status: 'taken',
        },
        {
          planItemId: planItemAmlPm,
          type: 'medication',
          title: 'Amlodipin',
          dueTime: '20:00',
          strength: 5,
          strengthUnit: 'mg',
          sortOrder: 1,
          scheduledDate: '2026-11-24',
          status: 'missed',
        },
        {
          planItemId: planItemVitals,
          type: 'vitals',
          title: 'Qon bosimi',
          dueTime: '09:00',
          strength: null,
          strengthUnit: 'mg',
          sortOrder: 2,
          scheduledDate: '2026-11-25',
          status: 'recorded',
        },
      ],
      stepEntries: [
        { date: '2026-11-25', count: 3100, level: 0, source: 'self_report', aiMode: 'manual', updatedAt: '2026-11-25T07:00:00.000Z' },
        { date: '2026-11-25', count: 4350, level: 0, source: 'device_sensor', aiMode: 'manual', updatedAt: '2026-11-25T09:00:00.000Z' },
        { date: '2026-11-24', count: 2900, level: 0, source: 'self_report', aiMode: 'manual', updatedAt: '2026-11-24T18:00:00.000Z' },
      ],
    }];

    const dashboard = await getActivityDashboard(doctorActor);
    expect(dashboard).not.toBeNull();
    expect(dashboard?.steps).toMatchObject({ count: 4350, source: 'device_sensor' });
    expect(dashboard?.todayStepsBySource).toMatchObject({
      deviceSensor: { count: 4350, source: 'device_sensor' },
      selfReport: { count: 3100, source: 'self_report' },
      demoSim: null,
    });
    expect(dashboard?.stepTrend).toHaveLength(7);
    expect(dashboard?.stepTrend?.[6]).toMatchObject({
      date: '2026-11-25',
      effectiveCount: 4350,
      effectiveSource: 'device_sensor',
      deviceSensor: { count: 4350 },
      selfReport: { count: 3100 },
    });
    expect(dashboard?.stepTrend?.[5]).toMatchObject({
      date: '2026-11-24',
      effectiveCount: 2900,
      effectiveSource: 'self_report',
    });
    expect(dashboard?.medicationAdherence).toEqual([
      {
        medicationName: 'Amlodipin',
        strength: 5,
        strengthUnit: 'mg',
        times: ['08:00', '20:00'],
        today: { scheduled: 1, taken: 1, missed: 0, unanswered: 0, answered: 1 },
        week: { scheduled: 2, taken: 1, missed: 1, unanswered: 0, answered: 2 },
      },
    ]);
  });

  it('GET /api/mobile/v1/today exposes multi-medication tasks, high+low BP targets, and dual-source steps + 7-day trend', async () => {
    const today = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'Asia/Tashkent' }).format(new Date());
    state.mobileAuth = { ok: true, actor: patientActor, patientName: 'Anvar aka' };

    state.txHandler = async () => [
      [{
        medicationName: 'Amlodipin',
        medicationStrengthMg: 5,
        medicationStrengthUnit: 'mg',
        medicationTime: '08:00',
        vitalsTime: '09:00',
        targets: { maxSystolic: 150, maxDiastolic: 95, warnSystolic: 135, warnDiastolic: 85, minSystolic: 90, minDiastolic: 60 },
        supplyFollowUp: true,
        dailyStepGoal: 4000,
        medicationItems: [
          { id: planItemAmlAm, title: 'Amlodipin', strength: 5, strengthUnit: 'mg', dueTime: '08:00', sortOrder: 0 },
          { id: planItemAmlPm, title: 'Amlodipin', strength: 5, strengthUnit: 'mg', dueTime: '20:00', sortOrder: 1 },
          { id: planItemMet, title: 'Levotiroksin', strength: 50, strengthUnit: 'mcg', dueTime: '07:00', sortOrder: 2 },
        ],
      }],
      [],
      [
        {
          taskId: taskAmlAm,
          planItemId: planItemAmlAm,
          type: 'medication',
          title: 'Amlodipin',
          date: today,
          dueTime: '08:00',
          strength: 5,
          strengthUnit: 'mg',
          sortOrder: 0,
          status: 'pending',
          recent: true,
          evidenceId: null,
          flagId: null,
          decision: null,
        },
        {
          taskId: taskAmlPm,
          planItemId: planItemAmlPm,
          type: 'medication',
          title: 'Amlodipin',
          date: today,
          dueTime: '20:00',
          strength: 5,
          strengthUnit: 'mg',
          sortOrder: 1,
          status: 'pending',
          recent: true,
          evidenceId: null,
          flagId: null,
          decision: null,
        },
        {
          taskId: taskMet,
          planItemId: planItemMet,
          type: 'medication',
          title: 'Levotiroksin',
          date: today,
          dueTime: '07:00',
          strength: 50,
          strengthUnit: 'mcg',
          sortOrder: 2,
          status: 'pending',
          recent: true,
          evidenceId: null,
          flagId: null,
          decision: null,
        },
        {
          taskId: taskVitals,
          planItemId: planItemVitals,
          type: 'vitals',
          title: 'Qon bosimi',
          date: today,
          dueTime: '09:00',
          strength: null,
          strengthUnit: 'mg',
          sortOrder: 3,
          status: 'pending',
          recent: true,
          evidenceId: null,
          flagId: null,
          decision: null,
        },
      ],
      [],
      [],
      [],
    ];

    state.sqlHandler = () => [{
      today,
      isDemo: false,
      dailyStepGoal: 4000,
      units: [
        {
          planItemId: planItemAmlAm,
          type: 'medication',
          title: 'Amlodipin',
          dueTime: '08:00',
          strength: 5,
          strengthUnit: 'mg',
          sortOrder: 0,
          scheduledDate: today,
          status: 'pending',
        },
      ],
      stepEntries: [
        { date: today, count: 2500, level: 0, source: 'self_report', aiMode: 'manual', updatedAt: `${today}T06:00:00.000Z` },
        { date: today, count: 4100, level: 0, source: 'device_sensor', aiMode: 'manual', updatedAt: `${today}T08:00:00.000Z` },
      ],
    }];

    const res = await mobileTodayGet(new Request('https://example.test/api/mobile/v1/today'));
    expect(res.status).toBe(200);
    const bodyText = await res.text();
    expect(bodyText).not.toMatch(/doctor_note|doctorNote|acknowledged_note|acknowledgedNote/);
    const json = JSON.parse(bodyText);

    expect(json.patientName).toBe('Anvar aka');
    expect(json.tasks).toHaveLength(3);
    expect(json.tasks[2]).toMatchObject({
      id: taskMet,
      planItemId: planItemMet,
      title: 'Levotiroksin',
      strength: 50,
      strengthUnit: 'mcg',
      boxAvailable: true,
    });
    expect(json.medications).toHaveLength(2);
    expect(json.bpTargets).toEqual({
      maxSystolic: 150,
      maxDiastolic: 95,
      warnSystolic: 135,
      warnDiastolic: 85,
      minSystolic: 90,
      minDiastolic: 60,
    });
    expect(json.vitalsTask).toMatchObject({ id: taskVitals, title: 'Qon bosimi', time: '09:00' });
    expect(json.steps).toMatchObject({
      count: 4100,
      goal: 4000,
      achieved: true,
      source: 'device_sensor',
      bySource: {
        deviceSensor: { count: 4100, source: 'device_sensor' },
        selfReport: { count: 2500, source: 'self_report' },
        demoSim: null,
      },
    });
    expect(json.steps.trend).toHaveLength(7);
  });
});
