import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { headers } from 'next/headers';
import {
  computePromptHash,
  reserveAiRequestQuota,
} from '../../src/lib/ai/ai-quota-cache';
import {
  approveClinicalBriefReply,
  buildDeterministicSevenDayBrief,
  generateClinicalBrief,
  readLatestClinicalBrief,
  validateBriefCitations,
  type SevenDayClinicalContext,
} from '../../src/lib/ai/clinical-brief-ai';
import { requestSupervisedCompletion } from '../../src/lib/ai/completion-fallback';
import { configuredSupervisedAiTargets } from '../../src/lib/ai/provider-config';
import type { ClinicalActor } from '../../src/lib/clinical-types';
import type { SqlAdapter } from '../../src/lib/db';
import { z } from 'zod';

vi.mock('next/headers', () => ({ headers: vi.fn() }));

const workspaceId = '11111111-1111-4111-8111-111111111111';
const doctorId = '22222222-2222-4222-8222-222222222222';
const patientId = '33333333-3333-4333-8333-333333333333';
const briefId = '44444444-4444-4444-8444-444444444444';
const evidenceId = '55555555-5555-4555-8555-555555555555';
const flagId = '66666666-6666-4666-8666-666666666666';
const symptomId = '77777777-7777-4777-8777-777777777777';
const attemptId = '88888888-8888-4888-8888-888888888888';
const forgedId = '99999999-9999-4999-8999-999999999999';
const planItemId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const doctorActor: ClinicalActor = {
  workspaceId,
  doctorId,
  patientId,
  role: 'doctor',
  isDemo: false,
};

const patientActor: ClinicalActor = {
  workspaceId,
  doctorId,
  patientId,
  role: 'patient',
  isDemo: false,
};

const caregiverActor: ClinicalActor = {
  workspaceId,
  doctorId: null,
  patientId,
  role: 'caregiver',
  isDemo: false,
};

type CapturedQuery = { sql: string; values: unknown[] };

function createMockSql(handler: (sqlText: string, values: unknown[], index: number) => unknown[]) {
  const calls: CapturedQuery[] = [];
  const fn = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    const sqlText = strings.join('?');
    const index = calls.length;
    calls.push({ sql: sqlText, values });
    return Promise.resolve(handler(sqlText, values, index));
  }) as unknown as SqlAdapter;
  fn.json = ((value: unknown) => ({ __json: value })) as unknown as SqlAdapter['json'];
  fn.transaction = vi.fn();
  fn.end = vi.fn().mockResolvedValue(undefined);
  return { sql: fn, calls };
}

function buildBriefContextSql(options: {
  cachedRow?: Record<string, unknown> | null;
  quotaAllowed?: boolean;
  insertedRowOverride?: Partial<Record<string, unknown>>;
}) {
  return createMockSql((sqlText, values) => {
    if (sqlText.includes('FROM public.patients AS p')) {
      return [{ id: patientId, name: 'Aziza Karimova', briefDate: '2026-11-25', dailyStepGoal: 3000 }];
    }
    if (sqlText.includes('FROM public.plans AS plan') && sqlText.includes('generate_series')) {
      return [
        {
          planItemId,
          title: 'Levotiroksin',
          strength: 50,
          strengthUnit: 'mcg',
          status: 'taken',
          missedReason: null,
        },
        {
          planItemId,
          title: 'Levotiroksin',
          strength: 50,
          strengthUnit: 'mcg',
          status: 'missed',
          missedReason: 'out_of_supply',
        },
      ];
    }
    if (sqlText.includes('FROM public.plans AS plan') && sqlText.includes('JOIN public.evidence_logs')) {
      return [
        {
          evidenceId,
          date: '2026-11-25',
          entryKind: 'task',
          itemType: 'vitals',
          itemTitle: 'Qon bosimi',
          level: 0,
          payload: { kind: 'vitals', systolic: 162, diastolic: 98, chestPain: false },
          flagId,
          flagColor: 'red',
          ruleKey: 'bp_max',
          flagDecision: null,
        },
      ];
    }
    if (sqlText.includes('FROM public.urgent_symptoms')) {
      return [
        {
          id: symptomId,
          date: '2026-11-25',
          symptom: 'dizziness',
          reviewDecision: null,
        },
      ];
    }
    if (sqlText.includes('FROM public.daily_step_counts')) {
      return [
        { date: '2026-11-25', stepCount: 4100, source: 'device_sensor' },
        { date: '2026-11-25', stepCount: 3800, source: 'self_report' },
      ];
    }
    if (sqlText.includes('FROM public.exercise_attempts')) {
      return [
        {
          id: attemptId,
          date: '2026-11-25',
          movement: 'chair_stand',
          level: 2,
          validReps: 6,
          flagColor: 'yellow',
          reviewDecision: null,
        },
      ];
    }
    if (sqlText.includes('FROM public.ai_clinical_briefs') && sqlText.includes('prompt_hash')) {
      return options.cachedRow ? [options.cachedRow] : [];
    }
    if (sqlText.includes('INSERT INTO public.ai_rate_limits')) {
      return options.quotaAllowed === false ? [] : [{ requests: 1 }];
    }
    if (sqlText.includes('INSERT INTO public.ai_clinical_briefs')) {
      const jsonParam = (v: unknown) =>
        v && typeof v === 'object' && '__json' in v ? (v as { __json: unknown }).__json : v;
      return [
        {
          id: briefId,
          briefDate: '2026-11-25',
          sourceMode: values[4],
          provider: values[5],
          model: values[6],
          deterministicMetrics: jsonParam(values[7]),
          narrativeUz: values[8],
          highlights: jsonParam(values[9]),
          citedRecordIds: jsonParam(values[10]),
          doctorDraftUz: values[11],
          approvedReplyUz: null,
          approvedAt: null,
          approvedByDoctorId: null,
          level: 0,
          promptHash: values[12],
          createdAt: '2026-11-25T10:00:00.000Z',
          ...options.insertedRowOverride,
        },
      ];
    }
    return [];
  });
}

describe('Supervised AI provider order & completion fallback', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.mocked(headers).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('orders Vercel AI Gateway primary and Cloudflare Workers AI fallback', async () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('AI_GATEWAY_API_KEY', 'vercel-key');
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'cf-acct');
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'cf-token');
    expect(await configuredSupervisedAiTargets()).toEqual([
      { provider: 'vercel', key: 'vercel-key' },
      { provider: 'cloudflare', accountId: 'cf-acct', apiToken: 'cf-token' },
    ]);

    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'oidc-token');
    expect((await configuredSupervisedAiTargets())[0]).toEqual({ provider: 'vercel', key: 'oidc-token' });
  });

  it('uses the Vercel function invocation token for supervised requests', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    vi.stubEnv('VERCEL_OIDC_TOKEN', 'local-token');
    vi.mocked(headers).mockResolvedValue(new Headers({ 'x-vercel-oidc-token': 'invocation-token' }));
    expect((await configuredSupervisedAiTargets())[0]).toEqual({ provider: 'vercel', key: 'invocation-token' });

    vi.stubEnv('VERCEL', '');
    expect((await configuredSupervisedAiTargets())[0]).toEqual({ provider: 'vercel', key: 'local-token' });
    expect(headers).toHaveBeenCalledTimes(1);
  });

  it('falls back from Vercel AI Gateway to Cloudflare Workers AI and returns null on total outage', async () => {
    const targets = [
      { provider: 'vercel' as const, key: 'v-key' },
      { provider: 'cloudflare' as const, accountId: 'cf-acct', apiToken: 'cf-tok' },
    ];
    const outSchema = z.strictObject({ summary: z.string().min(3) });
    const fetchMock = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 503 }))
      .mockResolvedValueOnce(Response.json({
        success: true,
        result: { response: JSON.stringify({ summary: 'Cloudflare xulosasi' }) },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await requestSupervisedCompletion(
      targets,
      { name: 'test_schema', prompt: 'Salom', schema: { type: 'object' }, maxOutputTokens: 200 },
      outSchema,
      AbortSignal.timeout(5_000),
    );
    expect(res).toEqual({
      provider: 'cloudflare',
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      data: { summary: 'Cloudflare xulosasi' },
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/accounts/cf-acct/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast');

    const failFetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response('err', { status: 500 }))
      .mockResolvedValueOnce(new Response('err', { status: 502 }));
    vi.stubGlobal('fetch', failFetch);
    const failed = await requestSupervisedCompletion(
      targets,
      { name: 'test_schema', prompt: 'Salom', schema: { type: 'object' }, maxOutputTokens: 200 },
      outSchema,
      AbortSignal.timeout(5_000),
    );
    expect(failed).toBeNull();
  });
});

describe('Citation validation & deterministic 7-day clinical brief', () => {
  it('validates allowlisted DB IDs and rejects forged IDs in arrays or text', () => {
    const allowlist = new Set([evidenceId, flagId]);

    expect(validateBriefCitations([evidenceId, flagId, evidenceId], allowlist)).toEqual({
      valid: true,
      validIds: [evidenceId, flagId],
      rejectedIds: [],
    });

    expect(validateBriefCitations([evidenceId, forgedId], allowlist)).toEqual({
      valid: false,
      validIds: [evidenceId],
      rejectedIds: [forgedId],
    });

    // Forged UUID smuggled into narrative text must also be rejected
    expect(
      validateBriefCitations([evidenceId], allowlist, [`Qayd ${forgedId} bo‘yicha natija.`]),
    ).toEqual({
      valid: false,
      validIds: [evidenceId],
      rejectedIds: [forgedId],
    });

    // Empty citations when allowlist has records is rejected; empty allowlist allows []
    expect(validateBriefCitations([], allowlist).valid).toBe(false);
    expect(validateBriefCitations([], new Set()).valid).toBe(true);
    expect(validateBriefCitations([forgedId], new Set()).valid).toBe(false);
  });

  it('computes canonical SHA-256 prompt hashes independent of key order', () => {
    const a = computePromptHash({ b: 2, a: { y: 1, x: 2 } });
    const b = computePromptHash({ a: { x: 2, y: 1 }, b: 2 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails closed on AI rate limiter when DB is unavailable or quota exceeded', async () => {
    expect(await reserveAiRequestQuota({ workspaceId, feature: 'clinical_brief', sql: null })).toEqual({
      allowed: false,
      reason: 'db_unavailable',
    });

    const limited = createMockSql(() => []);
    expect(await reserveAiRequestQuota({ workspaceId, feature: 'clinical_brief', sql: limited.sql })).toEqual({
      allowed: false,
      reason: 'rate_limited',
      scope: `ws:${workspaceId}:clinical_brief`,
    });
  });

  it('builds a complete Uzbek deterministic brief citing only real allowlisted IDs', () => {
    const ctx: SevenDayClinicalContext = {
      briefDate: '2026-11-25',
      patientName: 'Aziza Karimova',
      metrics: {
        briefDate: '2026-11-25',
        patientName: 'Aziza Karimova',
        medications: [
          {
            title: 'Levotiroksin',
            strength: 50,
            strengthUnit: 'mcg',
            dueCount: 2,
            takenCount: 1,
            missedCount: 1,
            unansweredCount: 0,
            outOfSupplyCount: 1,
          },
        ],
        totalDue: 2,
        totalTaken: 1,
        totalMissed: 1,
        totalUnanswered: 0,
        adherencePercent: 50,
        bpReadings: [
          {
            evidenceId,
            date: '2026-11-25',
            systolic: 162,
            diastolic: 98,
            chestPain: false,
            flagId,
            flagColor: 'red',
            ruleKey: 'bp_max',
          },
        ],
        openUrgentCount: 1,
        openWarningCount: 0,
        openUrgentSymptomsCount: 1,
        steps7d: [
          {
            date: '2026-11-25',
            preferredCount: 4100,
            preferredSource: 'device_sensor',
            sensorSteps: 4100,
            manualSteps: 3800,
          },
        ],
        avgDailySteps: 4100,
        dailyStepGoal: 3000,
        exercise: {
          totalAttempts: 1,
          openFlaggedAttempts: 1,
          latestMovement: 'chair_stand',
          latestLevel: 2,
          latestValidReps: 6,
        },
      },
      allowlist: new Map([
        [flagId, { id: flagId, kind: 'flag', date: '2026-11-25', labelUz: 'Shoshilinch bayroq' }],
        [evidenceId, { id: evidenceId, kind: 'evidence_log', date: '2026-11-25', labelUz: 'Qon bosimi' }],
      ]),
      priorityRecordIds: [flagId, evidenceId],
    };

    const output = buildDeterministicSevenDayBrief(ctx);
    expect(output.narrativeUz).toContain('Levotiroksin');
    expect(output.narrativeUz).toContain('50 mkg');
    expect(output.doctorDraftUz).toContain('103');
    expect(output.citedRecordIds).toEqual([flagId, evidenceId]);
  });
});

describe('7-day clinical brief generation, caching, L4 approval, and privacy', () => {
  it('reuses cached brief on prompt_hash hit without calling AI or burning quota', async () => {
    const cachedRow = {
      id: briefId,
      briefDate: '2026-11-25',
      sourceMode: 'ai',
      provider: 'vercel',
      model: 'openai/gpt-oss-20b',
      deterministicMetrics: { totalDue: 2, totalTaken: 1 },
      narrativeUz: 'Keshlangan 7 kunlik klinik xulosa matni.',
      highlights: ['Dori ijrosi 50%'],
      citedRecordIds: [flagId],
      doctorDraftUz: 'Assalomu alaykum, qaydlar ko‘rib chiqildi.',
      approvedReplyUz: null,
      approvedAt: null,
      approvedByDoctorId: null,
      level: 0,
      promptHash: 'a'.repeat(64),
      createdAt: '2026-11-25T09:00:00.000Z',
    };
    const { sql, calls } = buildBriefContextSql({ cachedRow });
    const complete = vi.fn();

    const result = await generateClinicalBrief(
      doctorActor,
      { forceRefresh: false },
      { sql, targets: [{ provider: 'vercel', key: 'v-key' }], complete },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cached).toBe(true);
    expect(result.brief.id).toBe(briefId);
    expect(result.brief.citedRecords.map((r) => r.id)).toEqual([flagId]);
    expect(complete).not.toHaveBeenCalled();
    expect(calls.some((c) => c.sql.includes('ai_rate_limits'))).toBe(false);
    // Security invariant: NEVER query doctor_note or acknowledged_note
    for (const c of calls) {
      expect(c.sql).not.toContain('doctor_note');
      expect(c.sql).not.toContain('acknowledged_note');
    }
  });

  it('rejects AI response with forged citation IDs and falls back to deterministic Uzbek brief', async () => {
    const { sql } = buildBriefContextSql({ quotaAllowed: true });
    const complete = vi.fn().mockResolvedValue({
      provider: 'vercel',
      model: 'openai/gpt-oss-20b',
      data: {
        narrativeUz: 'Oxirgi 7 kunda bemor qon bosimi yuqori bo‘lgan va qaydlar tahlil qilingan.',
        highlights: ['Qon bosimi 162/98 mmHg'],
        doctorDraftUz: 'Assalomu alaykum, qon bosimingizni qayta tekshiring va menga xabar bering.',
        citedRecordIds: [flagId, forgedId],
      },
    });

    const result = await generateClinicalBrief(
      doctorActor,
      { forceRefresh: true },
      { sql, targets: [{ provider: 'vercel', key: 'v-key' }], complete },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cached).toBe(false);
    expect(result.fallbackReason).toBe('invalid_citations');
    expect(result.rejectedCitationIds).toEqual([forgedId]);
    expect(result.brief.sourceMode).toBe('deterministic_fallback');
    expect(result.brief.level).toBe(0);
    expect(result.brief.citedRecordIds).not.toContain(forgedId);
    expect(result.brief.citedRecordIds).toContain(flagId);
  });

  it('falls back to deterministic Uzbek brief when rate-limited', async () => {
    const { sql } = buildBriefContextSql({ quotaAllowed: false });
    const complete = vi.fn();

    const result = await generateClinicalBrief(
      doctorActor,
      {},
      { sql, targets: [{ provider: 'vercel', key: 'v-key' }], complete },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fallbackReason).toBe('rate_limited');
    expect(result.brief.sourceMode).toBe('deterministic_fallback');
    expect(complete).not.toHaveBeenCalled();
  });

  it('persists AI-generated brief when citations are strictly valid (Vercel -> Cloudflare)', async () => {
    const { sql } = buildBriefContextSql({ quotaAllowed: true });
    const complete = vi.fn().mockResolvedValue({
      provider: 'cloudflare',
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      data: {
        narrativeUz: 'Oxirgi 7 kunda Levotiroksin 50 mkg qisman ichilgan va bosim 162/98 mmHg qayd etilgan.',
        highlights: ['Bosim 162/98 mmHg', 'Qadamlar 4100 (sensor)'],
        doctorDraftUz: 'Assalomu alaykum, bosimingizni tinch holatda qayta o‘lchang va dorini vaqtida oling.',
        citedRecordIds: [flagId, evidenceId, symptomId, attemptId],
      },
    });

    const result = await generateClinicalBrief(
      doctorActor,
      {},
      {
        sql,
        targets: [
          { provider: 'vercel', key: 'v-key' },
          { provider: 'cloudflare', accountId: 'cf-acct', apiToken: 'cf-tok' },
        ],
        complete,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.brief.sourceMode).toBe('ai');
    expect(result.brief.provider).toBe('cloudflare');
    expect(result.brief.level).toBe(0);
    expect(result.brief.approvedReplyUz).toBeNull();
    expect(result.brief.citedRecordIds).toEqual([flagId, evidenceId, symptomId, attemptId]);
  });

  it('enforces doctor-only L4 approval and prevents draft/note leakage to patients & caregivers', async () => {
    // Non-doctors cannot generate or approve
    expect(await generateClinicalBrief(patientActor)).toEqual({ ok: false, status: 403, error: 'forbidden' });
    expect(await approveClinicalBriefReply(patientActor, { briefId, replyUz: 'Tasdiqlangan javob' })).toEqual({
      ok: false,
      status: 403,
      error: 'forbidden',
    });
    expect(await approveClinicalBriefReply(caregiverActor, { briefId, replyUz: 'Tasdiqlangan javob' })).toEqual({
      ok: false,
      status: 403,
      error: 'forbidden',
    });

    // Doctor approves -> level 4
    const approveMock = createMockSql(() => [
      {
        id: briefId,
        briefDate: '2026-11-25',
        sourceMode: 'ai',
        provider: 'vercel',
        model: 'openai/gpt-oss-20b',
        deterministicMetrics: { totalDue: 2 },
        narrativeUz: 'Shifokor uchun ichki 7 kunlik xulosa.',
        highlights: ['Ichki punkt'],
        citedRecordIds: [flagId],
        doctorDraftUz: 'Tahrirlanmagan qoralama.',
        approvedReplyUz: 'Assalomu alaykum, shifokor tasdiqlagan yakuniy javob.',
        approvedAt: '2026-11-25T11:30:00.000Z',
        approvedByDoctorId: doctorId,
        level: 4,
        promptHash: 'b'.repeat(64),
        createdAt: '2026-11-25T10:00:00.000Z',
      },
    ]);
    const approved = await approveClinicalBriefReply(
      doctorActor,
      { briefId, replyUz: 'Assalomu alaykum, shifokor tasdiqlagan yakuniy javob.' },
      { sql: approveMock.sql },
    );
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.brief.level).toBe(4);
    expect(approved.brief.approvedReplyUz).toBe('Assalomu alaykum, shifokor tasdiqlagan yakuniy javob.');
    expect(approved.brief.approvedByDoctorId).toBe(doctorId);
    expect(approveMock.calls[0]?.sql).toContain('INSERT INTO public.audit_events');
    expect(approveMock.calls[0]?.sql).toContain("'approve_clinical_brief'");

    // Patient reads before approval (DB returns no level=4 rows) -> null (no draft leaked)
    const unapprovedPatientSql = createMockSql((sqlText) => {
      expect(sqlText).toContain('brief.level = 4');
      expect(sqlText).toContain('brief.approved_reply_uz IS NOT NULL');
      expect(sqlText).not.toContain('doctor_draft_uz');
      expect(sqlText).not.toContain('doctor_note');
      expect(sqlText).not.toContain('acknowledged_note');
      return [];
    });
    expect(await readLatestClinicalBrief(patientActor, { sql: unapprovedPatientSql.sql })).toBeNull();

    // Patient reads after approval -> strictly L4 approvedReplyUz ONLY
    const approvedPatientSql = createMockSql(() => [
      {
        id: briefId,
        briefDate: '2026-11-25',
        level: 4,
        approvedReplyUz: 'Assalomu alaykum, shifokor tasdiqlagan yakuniy javob.',
        approvedAt: '2026-11-25T11:30:00.000Z',
      },
    ]);
    const patientView = await readLatestClinicalBrief(patientActor, { sql: approvedPatientSql.sql });
    expect(patientView).toEqual({
      id: briefId,
      briefDate: '2026-11-25',
      level: 4,
      approvedReplyUz: 'Assalomu alaykum, shifokor tasdiqlagan yakuniy javob.',
      approvedAt: '2026-11-25T11:30:00.000Z',
    });
    expect(Object.keys(patientView ?? {}).sort()).toEqual([
      'approvedAt',
      'approvedReplyUz',
      'briefDate',
      'id',
      'level',
    ]);

    // Caregiver gets null
    expect(await readLatestClinicalBrief(caregiverActor, { sql: approvedPatientSql.sql })).toBeNull();
  });
});
