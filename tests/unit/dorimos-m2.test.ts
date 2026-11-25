import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalActor } from '../../src/lib/clinical-types';
import type { SqlAdapter } from '../../src/lib/db';
import { issueBoxConfirmation } from '../../src/lib/dorimos-confirmation';
import { dorimosInput, dorimosResponse, medicationBoxEvidenceSchema } from '../../src/lib/dorimos-contract';

const mockDb = vi.hoisted(() => ({
  getDatabase: vi.fn<() => SqlAdapter | null>(),
}));

vi.mock('../../src/lib/db', () => ({
  getDatabase: mockDb.getDatabase,
}));

import { handleDorimosRequest } from '../../src/lib/dorimos-server';
import { getDorimosMedicationTarget, saveDorimosEvidence } from '../../src/lib/dorimos-store';

const secret = 'dorimos-m2-test-secret-with-at-least-32-chars';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const doctorId = '22222222-2222-4222-8222-222222222222';
const patientId = '33333333-3333-4333-8333-333333333333';
const taskId = '44444444-4444-4444-8444-444444444444';
const planItemId = '55555555-5555-4555-8555-555555555555';

const patientActor: ClinicalActor = {
  workspaceId,
  doctorId,
  patientId,
  role: 'patient',
  isDemo: false,
};

const demoPatientActor: ClinicalActor = {
  workspaceId,
  doctorId,
  patientId,
  role: 'patient',
  isDemo: true,
};

const todayTashkent = new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'short',
  timeZone: 'Asia/Tashkent',
}).format(new Date());

function createMockSql(handler: (sqlText: string, values: unknown[]) => unknown[]) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const fn = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join('?');
    calls.push({ sql: sqlText, values });
    return Promise.resolve(handler(sqlText, values));
  }) as unknown as SqlAdapter;
  fn.json = ((value: unknown) => ({ __json: value })) as unknown as SqlAdapter['json'];
  fn.transaction = vi.fn();
  fn.end = vi.fn().mockResolvedValue(undefined);
  return { sql: fn, calls };
}

function jsonRequest(body: unknown) {
  return new Request('https://example.test/api/clinical/dorimos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('DoriMos M2 multi-unit matching and deferred state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SESSION_SECRET', secret);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('validates deferred contract shapes cleanly', () => {
    expect(dorimosInput.parse({ action: 'defer', taskId })).toEqual({ action: 'defer', taskId });
    expect(dorimosResponse.parse({ status: 'deferred' })).toEqual({ status: 'deferred' });
    expect(medicationBoxEvidenceSchema.parse({ kind: 'medication_box', result: 'deferred' })).toEqual({
      kind: 'medication_box',
      result: 'deferred',
    });
  });

  it('saves deferred state at L0 without raising a red mismatch flag and returns status deferred', async () => {
    const { sql, calls } = createMockSql(() => [{ result: 'saved' }]);
    mockDb.getDatabase.mockReturnValue(sql);

    const res = await handleDorimosRequest(patientActor, jsonRequest({ action: 'defer', taskId }));
    expect(res).toEqual({ data: { status: 'deferred' }, status: 200 });
    expect(calls).toHaveLength(1);
    const values = calls[0]!.values;
    // level = 0, source = 'self_report', ai_mode = 'manual', mismatch = false
    expect(values).toContain(0);
    expect(values).toContain('self_report');
    expect(values).toContain('manual');
    expect(values).toContain(false);
    expect(values).toContainEqual({ __json: { kind: 'medication_box', result: 'deferred' } });

    // Already deferred -> returns already_saved
    const already = createMockSql(() => [{ result: 'already_saved' }]);
    mockDb.getDatabase.mockReturnValue(already.sql);
    expect(await handleDorimosRequest(patientActor, jsonRequest({ action: 'defer', taskId }))).toEqual({
      data: { status: 'already_saved' },
      status: 200,
    });

    // Unowned task -> 404
    const missing = createMockSql(() => [{ result: 'not_found' }]);
    mockDb.getDatabase.mockReturnValue(missing.sql);
    expect(await handleDorimosRequest(patientActor, jsonRequest({ action: 'defer', taskId }))).toEqual({
      data: { status: 'not_found' },
      status: 404,
    });
  });

  it('reads selected plan_item strength_unit (mcg / iu) with safe fallback to mg', async () => {
    const { sql } = createMockSql(() => [
      {
        taskId,
        planItemId,
        drugName: 'Levotiroksin',
        strength: 50,
        strengthUnit: 'mcg',
        date: todayTashkent,
      },
    ]);
    mockDb.getDatabase.mockReturnValue(sql);
    expect(await getDorimosMedicationTarget(patientActor, taskId)).toEqual({
      taskId,
      planItemId,
      drugName: 'Levotiroksin',
      strength: 50,
      strengthUnit: 'mcg',
      date: todayTashkent,
    });

    // Unknown/legacy unit safely falls back to 'mg'
    const fallbackSql = createMockSql(() => [
      {
        taskId,
        planItemId,
        drugName: 'Amlodipin',
        strength: 5,
        strengthUnit: 'unknown_unit',
        date: todayTashkent,
      },
    ]);
    mockDb.getDatabase.mockReturnValue(fallbackSql.sql);
    expect(await getDorimosMedicationTarget(patientActor, taskId)).toMatchObject({
      drugName: 'Amlodipin',
      strength: 5,
      strengthUnit: 'mg',
    });
  });

  it('matches confirmed mcg and iu boxes against the selected medication item and flags unit mismatches', async () => {
    const confirmCases = [
      {
        target: { drugName: 'Levotiroksin', strength: 50, strengthUnit: 'mcg' },
        detected: { drugName: 'Levotiroksin', strength: 50, unit: 'mcg' as const },
        expectedResult: 'match',
        expectedMismatch: false,
      },
      {
        target: { drugName: 'Levotiroksin', strength: 50, strengthUnit: 'mcg' },
        detected: { drugName: 'Levotiroksin', strength: 50, unit: 'mg' as const },
        expectedResult: 'strength_mismatch',
        expectedMismatch: true,
      },
      {
        target: { drugName: 'Vitamin D3', strength: 2000, strengthUnit: 'iu' },
        detected: { drugName: 'Vitamin D3', strength: 2000, unit: 'iu' as const },
        expectedResult: 'match',
        expectedMismatch: false,
      },
      {
        target: { drugName: 'Vitamin D3', strength: 2000, strengthUnit: 'iu' },
        detected: { drugName: 'Vitamin D3', strength: 2000, unit: 'mg' as const },
        expectedResult: 'strength_mismatch',
        expectedMismatch: true,
      },
    ];

    for (const testCase of confirmCases) {
      const { sql, calls } = createMockSql((sqlText) => {
        if (sqlText.includes('FROM public.task_instances AS task') && sqlText.includes('strength_unit')) {
          if (sqlText.includes('INSERT INTO public.evidence_logs')) {
            return [{ result: 'saved' }];
          }
          return [
            {
              taskId,
              planItemId,
              drugName: testCase.target.drugName,
              strength: testCase.target.strength,
              strengthUnit: testCase.target.strengthUnit,
              date: todayTashkent,
            },
          ];
        }
        return [{ result: 'saved' }];
      });
      mockDb.getDatabase.mockReturnValue(sql);

      const token = issueBoxConfirmation(
        {
          workspaceId,
          taskId,
          sampleId: 'camera_photo',
          reading: {
            label: testCase.detected,
            model: '@cf/cloudflare/clairic-flash',
            decisionModel: '@cf/cloudflare/clef',
            confidence: 0.92,
          },
        },
        secret,
      );

      const outcome = await handleDorimosRequest(
        patientActor,
        jsonRequest({ action: 'confirm', taskId, token }),
      );
      expect(outcome).toEqual({ data: { status: 'saved' }, status: 200 });
      const insertCall = calls.find((c) => c.sql.includes('INSERT INTO public.evidence_logs'));
      expect(insertCall).toBeDefined();
      const jsonArg = insertCall!.values.find(
        (v): v is { __json: Record<string, unknown> } =>
          Boolean(v && typeof v === 'object' && '__json' in v),
      );
      expect(jsonArg?.__json.result).toBe(testCase.expectedResult);
      expect(jsonArg?.__json.expected).toEqual({
        drugName: testCase.target.drugName,
        strength: testCase.target.strength,
        unit: testCase.target.strengthUnit,
      });
      expect(insertCall!.values).toContain(testCase.expectedMismatch);
    }
  });

  it('keeps synthetic sample scans and confirmations scoped strictly to isDemo === true', async () => {
    const { sql } = createMockSql(() => [
      {
        taskId,
        planItemId,
        drugName: 'Namuna dori',
        strength: 5,
        strengthUnit: 'mg',
        date: todayTashkent,
      },
    ]);
    mockDb.getDatabase.mockReturnValue(sql);

    // Non-demo cannot scan synthetic sample
    expect(
      await handleDorimosRequest(patientActor, jsonRequest({ action: 'scan', taskId, sampleId: 'box-5mg' })),
    ).toEqual({ data: { status: 'invalid' }, status: 403 });

    // Non-demo cannot confirm a synthetic sample token
    const sampleToken = issueBoxConfirmation(
      {
        workspaceId,
        taskId,
        sampleId: 'box-5mg',
        reading: {
          label: { drugName: 'Namuna dori', strength: 5, unit: 'mg' },
          model: 'test-ocr',
          decisionModel: 'test-gate',
          confidence: 0.91,
        },
      },
      secret,
    );
    expect(
      await handleDorimosRequest(patientActor, jsonRequest({ action: 'confirm', taskId, token: sampleToken })),
    ).toEqual({ data: { status: 'invalid' }, status: 403 });

    // Demo session CAN confirm synthetic sample token
    const demoSql = createMockSql((sqlText) => {
      if (sqlText.includes('INSERT INTO public.evidence_logs')) return [{ result: 'saved' }];
      return [
        {
          taskId,
          planItemId,
          drugName: 'Namuna dori',
          strength: 5,
          strengthUnit: 'mg',
          date: todayTashkent,
        },
      ];
    });
    mockDb.getDatabase.mockReturnValue(demoSql.sql);
    expect(
      await handleDorimosRequest(demoPatientActor, jsonRequest({ action: 'confirm', taskId, token: sampleToken })),
    ).toEqual({ data: { status: 'saved' }, status: 200 });

    // Direct saveDorimosEvidence rejects non-patient roles
    expect(
      await saveDorimosEvidence({ ...patientActor, role: 'doctor' }, taskId, {
        kind: 'medication_box',
        result: 'deferred',
      }),
    ).toBe('not_found');
  });
});
