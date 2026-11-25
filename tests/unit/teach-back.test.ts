import { describe, expect, it, vi } from 'vitest';
import type { ClinicalActor } from '../../src/lib/clinical-types';
import type { SqlAdapter } from '../../src/lib/db';
import {
  buildTeachBackQuestions,
  getTeachBackStatus,
  gradeTeachBackSubmission,
  simplifyTeachBackQuestionsWithAi,
  submitTeachBackAttempt,
  toPublicTeachBackQuestions,
  type TeachBackPlanContext,
} from '../../src/lib/teach-back-store';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const doctorId = '22222222-2222-4222-8222-222222222222';
const patientId = '33333333-3333-4333-8333-333333333333';
const planId = '44444444-4444-4444-8444-444444444444';
const attemptId = '55555555-5555-4555-8555-555555555555';

const patientActor: ClinicalActor = {
  workspaceId,
  doctorId,
  patientId,
  role: 'patient',
  isDemo: false,
};

const doctorActor: ClinicalActor = {
  workspaceId,
  doctorId,
  patientId,
  role: 'doctor',
  isDemo: false,
};

const caregiverActor: ClinicalActor = {
  workspaceId,
  doctorId: null,
  patientId,
  role: 'caregiver',
  isDemo: false,
};

const samplePlan: TeachBackPlanContext = {
  planId,
  medications: [
    { title: 'Levotiroksin', dueTime: '08:00', strength: 50, strengthUnit: 'mcg' },
    { title: 'Levotiroksin', dueTime: '20:00', strength: 50, strengthUnit: 'mcg' },
    { title: 'Vitamin D3', dueTime: '13:00', strength: 2000, strengthUnit: 'iu' },
  ],
  targets: {
    warnSystolic: 140,
    warnDiastolic: 90,
    maxSystolic: 160,
    maxDiastolic: 100,
    minSystolic: 90,
    minDiastolic: 60,
  },
  supplyFollowUp: true,
};

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

describe('Compact Teach-Back', () => {
  it('generates 2 plan-grounded Uzbek questions with multi-dose times, units, and high+low BP targets', () => {
    const questions = buildTeachBackQuestions(samplePlan);
    expect(questions).toHaveLength(2);
    expect(questions[0].id).toBe('med_schedule');
    expect(questions[0].promptUz).toContain('Levotiroksin');
    expect(questions[0].promptUz).toContain('50 mkg');
    expect(questions[0].options.find((o) => o.id === questions[0].correctOptionId)?.labelUz).toContain('08:00 va 20:00');

    expect(questions[1].id).toBe('safety_target');
    expect(questions[1].promptUz).toContain('160/100');
    expect(questions[1].promptUz).toContain('90/60');

    const publicQuestions = toPublicTeachBackQuestions(questions);
    expect(publicQuestions).toHaveLength(2);
    for (const q of publicQuestions) {
      expect('correctOptionId' in q).toBe(false);
      expect('explanationUz' in q).toBe(false);
    }
  });

  it('uses AI simplification only when all clinical facts are preserved, else falls back cleanly', async () => {
    const questions = buildTeachBackQuestions(samplePlan);
    const { sql } = createMockSql((sqlText) => {
      if (sqlText.includes('ai_rate_limits')) return [{ requests: 1 }];
      return [];
    });

    const validAi = await simplifyTeachBackQuestionsWithAi(workspaceId, questions, {
      sql,
      targets: [{ provider: 'vercel', key: 'v-key' }],
      complete: vi.fn().mockResolvedValue({
        provider: 'vercel',
        model: 'openai/gpt-oss-20b',
        data: {
          prompts: [
            { id: 'med_schedule', promptUz: 'Levotiroksin 50 mkg dorisini har kuni qachon ichishingiz lozim?' },
            { id: 'safety_target', promptUz: 'Bosimingiz 160/100 mmHg ga chiqsa yoki 90/60 dan tushsa qanday yo‘l tutasiz?' },
          ],
        },
      }),
    });
    expect(validAi.sourceMode).toBe('ai');
    expect(validAi.questions[0].promptUz).toContain('Levotiroksin 50 mkg');

    // Drops required fact ("50") -> falls back to deterministic Uzbek
    const driftedAi = await simplifyTeachBackQuestionsWithAi(workspaceId, questions, {
      sql,
      targets: [{ provider: 'vercel', key: 'v-key' }],
      complete: vi.fn().mockResolvedValue({
        provider: 'vercel',
        model: 'openai/gpt-oss-20b',
        data: {
          prompts: [
            { id: 'med_schedule', promptUz: 'Dorini qachon ichasiz?' },
            { id: 'safety_target', promptUz: 'Bosim oshsa nima qilasiz?' },
          ],
        },
      }),
    });
    expect(driftedAi.sourceMode).toBe('deterministic_fallback');
    expect(driftedAi.questions[0].promptUz).toBe(questions[0].promptUz);
  });

  it('grades submissions deterministically and rejects duplicate or incomplete answers', () => {
    const questions = buildTeachBackQuestions(samplePlan);

    const passed = gradeTeachBackSubmission(questions, [
      { questionId: 'med_schedule', selectedOptionId: 'b' },
      { questionId: 'safety_target', selectedOptionId: 'a' },
    ]);
    expect(passed).toMatchObject({ ok: true, score: 2, totalQuestions: 2, passed: true });

    const partial = gradeTeachBackSubmission(questions, [
      { questionId: 'med_schedule', selectedOptionId: 'a' },
      { questionId: 'safety_target', selectedOptionId: 'a' },
    ]);
    expect(partial).toMatchObject({ ok: true, score: 1, totalQuestions: 2, passed: false });

    expect(
      gradeTeachBackSubmission(questions, [{ questionId: 'med_schedule', selectedOptionId: 'b' }]),
    ).toEqual({ ok: false, error: 'invalid' });

    expect(
      gradeTeachBackSubmission(questions, [
        { questionId: 'med_schedule', selectedOptionId: 'b' },
        { questionId: 'med_schedule', selectedOptionId: 'a' },
      ]),
    ).toEqual({ ok: false, error: 'invalid' });
  });

  it('persists graded attempts to teach_back_attempts and enforces patient-only submission', async () => {
    expect(
      await submitTeachBackAttempt(doctorActor, {
        answers: [{ questionId: 'med_schedule', selectedOptionId: 'b' }],
      }),
    ).toEqual({ ok: false, status: 403, error: 'forbidden' });

    expect(await getTeachBackStatus(caregiverActor)).toBeNull();

    const { sql, calls } = createMockSql((sqlText, values) => {
      if (sqlText.includes('FROM public.plans AS plan')) {
        return [{ planId, targets: samplePlan.targets, supplyFollowUp: true }];
      }
      if (sqlText.includes('FROM public.plan_items AS item')) {
        return samplePlan.medications;
      }
      if (sqlText.includes('INSERT INTO public.teach_back_attempts')) {
        return [
          {
            id: attemptId,
            planId,
            activityDate: '2026-11-25',
            score: values[4],
            totalQuestions: values[5],
            passed: values[6],
            createdAt: '2026-11-25T10:15:00.000Z',
          },
        ];
      }
      if (sqlText.includes('COUNT(*)::int')) {
        return [{ attemptsCount: 1 }];
      }
      if (sqlText.includes('FROM public.teach_back_attempts AS attempt')) {
        return [
          {
            id: attemptId,
            planId,
            activityDate: '2026-11-25',
            score: 2,
            totalQuestions: 2,
            passed: true,
            createdAt: '2026-11-25T10:15:00.000Z',
          },
        ];
      }
      return [];
    });

    const submitted = await submitTeachBackAttempt(
      patientActor,
      {
        answers: [
          { questionId: 'med_schedule', selectedOptionId: 'b' },
          { questionId: 'safety_target', selectedOptionId: 'a' },
        ],
      },
      { sql },
    );

    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.attempt).toMatchObject({ id: attemptId, score: 2, totalQuestions: 2, passed: true });
    expect(submitted.feedback.every((f) => f.correct)).toBe(true);
    const insertCall = calls.find((c) => c.sql.includes('INSERT INTO public.teach_back_attempts'));
    expect(insertCall?.values.some((v) => v && typeof v === 'object' && '__json' in v)).toBe(true);

    const status = await getTeachBackStatus(doctorActor, {}, { sql });
    expect(status).toMatchObject({
      hasPlan: true,
      planId,
      sourceMode: 'deterministic_fallback',
      attemptsCount: 1,
      latestAttempt: { id: attemptId, score: 2, totalQuestions: 2, passed: true },
    });
    expect(status?.questions).toHaveLength(2);
  });
});
