import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalActor } from '../../src/lib/clinical-types';
import type { SqlAdapter, TransactionSqlAdapter } from '../../src/lib/db';

const realClient = postgres('postgres://user:pass@localhost:5432/test_db', { prepare: false });

type CapturedCall = {
  sqlText: string;
  values: unknown[];
};

const capturedCalls: CapturedCall[] = [];
let queuedResults: unknown[][] = [];

function nextResult(): unknown[] {
  return queuedResults.shift() ?? [];
}

const mockTx = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => {
    capturedCalls.push({ sqlText: strings.join('?'), values });
    return Promise.resolve(nextResult());
  },
  {
    json: (value: postgres.JSONValue) => realClient.json(value),
  },
) as unknown as TransactionSqlAdapter;

const mockSql = Object.assign(
  (strings: TemplateStringsArray, ...values: unknown[]) => {
    capturedCalls.push({ sqlText: strings.join('?'), values });
    return Promise.resolve(nextResult());
  },
  {
    json: (value: postgres.JSONValue) => realClient.json(value),
    transaction: async (
      fn: (tx: TransactionSqlAdapter) => readonly Promise<unknown[]>[],
    ) => {
      const queries = fn(mockTx);
      const results = [];
      for (const q of queries) {
        results.push(await q);
      }
      return results;
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

import { assignPlan, saveEvidence, saveFlagFollowup } from '../../src/lib/clinical-store';
import { saveDorimosEvidence } from '../../src/lib/dorimos-store';
import { readExerciseAttempts, saveExercise } from '../../src/lib/exercise-store';
import { analyzeExerciseDiagnostics } from '../../src/lib/pose/diagnostics';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const doctorId = '22222222-2222-4222-8222-222222222222';
const patientId = '33333333-3333-4333-8333-333333333333';
const taskId = '44444444-4444-4444-8444-444444444444';
const flagId = '55555555-5555-4555-8555-555555555555';
const prescriptionId = '66666666-6666-4666-8666-666666666666';

const doctorActor: ClinicalActor = { workspaceId, doctorId, patientId, role: 'doctor' };
const patientActor: ClinicalActor = { workspaceId, doctorId, patientId, role: 'patient' };

function isJsonbParam(value: unknown, expected: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const param = value as { type?: unknown; value?: unknown };
  return param.type === 3802 && JSON.stringify(param.value) === JSON.stringify(expected);
}

beforeEach(() => {
  capturedCalls.length = 0;
  queuedResults = [];
});

afterAll(async () => {
  await realClient.end({ timeout: 0 });
});

describe('JSONB parameter encoding across clinical, dorimos, and exercise stores', () => {
  it('assignPlan passes targets via sql.json() (OID 3802) without JSON.stringify', async () => {
    const targets = { maxSystolic: 140, maxDiastolic: 90, warnSystolic: 135, warnDiastolic: 85 };
    queuedResults = [[{ result: 'saved' }]];

    const res = await assignPlan(doctorActor, {
      medicationName: 'Amlodipin',
      medicationStrengthMg: 5,
      medicationTime: '08:00',
      vitalsTime: '09:00',
      targets,
      supplyFollowUp: true,
      dailyStepGoal: 3000,
    });

    expect(res).toBe('saved');
    expect(capturedCalls).toHaveLength(1);
    const values = capturedCalls[0]!.values;
    expect(values.some((v) => isJsonbParam(v, targets))).toBe(true);
    expect(values.some((v) => v === JSON.stringify(targets))).toBe(false);
  });

  it('saveEvidence passes payload and flag detail via sql.json() without JSON.stringify', async () => {
    const payload = { kind: 'vitals' as const, systolic: 150, diastolic: 95, chestPain: false };
    const detail = { metric: 'systolic' as const, observed: 150, threshold: 140 };
    queuedResults = [[{ result: 'saved' }]];

    const res = await saveEvidence(patientActor, {
      taskId,
      payload,
      level: 0,
      source: 'self_report',
      aiMode: 'manual',
      flag: { color: 'red', ruleKey: 'bp_high', ...detail },
    });

    expect(res).toBe('saved');
    expect(capturedCalls).toHaveLength(1);
    const values = capturedCalls[0]!.values;
    expect(values.some((v) => isJsonbParam(v, payload))).toBe(true);
    expect(values.some((v) => isJsonbParam(v, detail))).toBe(true);
    expect(values.some((v) => v === JSON.stringify(payload))).toBe(false);
    expect(values.some((v) => v === JSON.stringify(detail))).toBe(false);
  });

  it('saveFlagFollowup passes payload via sql.json() without JSON.stringify', async () => {
    const payload = { systolic: 132, diastolic: 82, chestPain: false };
    queuedResults = [[{ result: 'saved' }]];

    const res = await saveFlagFollowup(patientActor, {
      flagId,
      kind: 'retake_vitals',
      payload,
    });

    expect(res).toBe('saved');
    expect(capturedCalls).toHaveLength(1);
    const values = capturedCalls[0]!.values;
    expect(values.some((v) => isJsonbParam(v, payload))).toBe(true);
    expect(values.some((v) => v === JSON.stringify(payload))).toBe(false);
  });

  it('saveDorimosEvidence passes medication_box payload via sql.json() without JSON.stringify', async () => {
    const payload = {
      kind: 'medication_box' as const,
      result: 'match' as const,
      sampleId: 'camera_photo' as const,
      expected: { drugName: 'Amlodipin', strength: 5, unit: 'mg' as const },
      reading: {
        label: { drugName: 'Amlodipin', strength: 5, unit: 'mg' as const },
        model: 'test-ocr',
        decisionModel: 'test-decision',
        confidence: 0.94,
      },
    };
    queuedResults = [[{ result: 'saved' }]];

    const res = await saveDorimosEvidence(patientActor, taskId, payload);

    expect(res).toBe('saved');
    expect(capturedCalls).toHaveLength(1);
    const values = capturedCalls[0]!.values;
    expect(values.some((v) => isJsonbParam(v, payload))).toBe(true);
    expect(values.some((v) => v === JSON.stringify(payload))).toBe(false);
  });

  it('saveExercise passes motionSignature and diagnostics via tx.json(), and null when motionSignature is null', async () => {
    const planRow = {
      id: prescriptionId,
      movement: 'chair_stand',
      targetAngle: 100,
      targetReps: 5,
      maxShallow: 1,
      painColor: 'yellow',
    };
    const motionSignature = [165, 140, 98, 138, 166];
    const expectedDiagnostics = analyzeExerciseDiagnostics({
      movement: 'chair_stand',
      reason: 'measured',
      targetAngle: 100,
      targetReps: 5,
      maxShallow: 1,
      painColor: 'yellow',
      validReps: 5,
      shallowReps: 0,
      minAngle: 95,
      similarMotion: false,
      sample: false,
    });

    // 1. Uploaded video with motionSignature
    queuedResults = [
      [planRow], // readExercisePlan
      [], // previous fingerprints
      [{ is_primary: true }], // primary tx insert
      [], // retry tx insert
    ];

    const uploadedResult = await saveExercise(patientActor, {
      source: 'uploaded_video',
      movement: 'chair_stand',
      validReps: 5,
      shallowReps: 0,
      minAngle: 95,
      confidence: 0.92,
      analyzedFrames: 30,
      patientConfirmed: true,
      fileSha256: 'a'.repeat(64),
      motionSignature,
    });

    expect(uploadedResult.status).toBe('saved');
    const insertCall = capturedCalls[2]!;
    expect(insertCall.values.some((v) => isJsonbParam(v, motionSignature))).toBe(true);
    expect(insertCall.values.some((v) => isJsonbParam(v, expectedDiagnostics))).toBe(true);
    expect(insertCall.values.some((v) => v === JSON.stringify(motionSignature))).toBe(false);
    expect(insertCall.values.some((v) => v === JSON.stringify(expectedDiagnostics))).toBe(false);

    // 2. Pain self-report with motionSignature === null
    capturedCalls.length = 0;
    const painDiagnostics = analyzeExerciseDiagnostics({
      movement: 'chair_stand',
      reason: 'pain',
      targetAngle: 100,
      targetReps: 5,
      maxShallow: 1,
      painColor: 'yellow',
      validReps: null,
      shallowReps: null,
      minAngle: null,
      similarMotion: false,
      sample: false,
    });

    queuedResults = [
      [planRow], // readExercisePlan
      [], // primary tx insert (filtered by WHERE NOT (primary AND pain))
      [{ is_primary: false }], // retry tx insert
    ];

    const painResult = await saveExercise(patientActor, {
      source: 'self_report',
      reason: 'pain',
      movement: 'chair_stand',
    });

    expect(painResult).toMatchObject({ status: 'saved', level: 0, primary: false });
    const painInsertCall = capturedCalls[1]!;
    expect(painInsertCall.values).toContain(null);
    expect(painInsertCall.values.some((v) => isJsonbParam(v, painDiagnostics))).toBe(true);
    expect(painInsertCall.values.some((v) => v === JSON.stringify(painDiagnostics))).toBe(false);
  });

  it('saveExercise returns duplicate when ON CONFLICT DO NOTHING inserts zero rows and readExerciseAttempts parses object diagnostics', async () => {
    const planRow = {
      id: prescriptionId,
      movement: 'chair_stand',
      targetAngle: 100,
      targetReps: 5,
      maxShallow: 1,
      painColor: 'yellow',
    };

    queuedResults = [
      [planRow], // readExercisePlan
      [], // previous fingerprints
      [], // primary tx insert (ON CONFLICT DO NOTHING)
      [], // retry tx insert (ON CONFLICT DO NOTHING)
    ];

    const dup = await saveExercise(patientActor, {
      source: 'uploaded_video',
      movement: 'chair_stand',
      validReps: 5,
      shallowReps: 0,
      minAngle: 95,
      confidence: 0.92,
      analyzedFrames: 30,
      patientConfirmed: true,
      fileSha256: 'b'.repeat(64),
      motionSignature: [160, 100, 160],
    });
    expect(dup).toEqual({ status: 'duplicate' });

    const diagnosticsObj = analyzeExerciseDiagnostics({
      movement: 'chair_stand',
      reason: 'measured',
      targetAngle: 100,
      targetReps: 5,
      maxShallow: 1,
      painColor: 'yellow',
      validReps: 5,
      shallowReps: 0,
      minAngle: 95,
    });

    queuedResults = [[{
      id: '77777777-7777-4777-8777-777777777777',
      source: 'uploaded_video',
      aiMode: 'live',
      level: 2,
      reason: 'measured',
      validReps: 5,
      shallowReps: 0,
      minAngle: 95,
      confidence: 0.92,
      primary: true,
      sample: false,
      similarMotion: false,
      flagColor: null,
      createdAt: '2026-11-24T09:00:00.000Z',
      scheduledDate: '2026-11-24',
      android: false,
      movement: 'chair_stand',
      diagnostics: diagnosticsObj,
      review: null,
    }]];

    const attempts = await readExerciseAttempts(doctorActor);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.diagnostics).toEqual(diagnosticsObj);
  });
});
