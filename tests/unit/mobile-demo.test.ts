import { describe, expect, it } from 'vitest';
import { mobileStepsInputSchema } from '../../src/lib/adherence';
import { mobileToday, readMobileBody } from '../../src/lib/mobile-demo';
import type { ClinicalView } from '../../src/lib/clinical-types';

const reviewed = { decision: 'approved', reply: 'Bemor uchun javob', reviewedAt: '2026-11-20T06:00:00Z' } as const;
const view: ClinicalView = {
  plan: null, flags: [],
  tasks: [
    { id: 'current', type: 'medication', date: '2026-11-20', dueTime: '08:00', title: 'Dori', status: 'pending', evidence: null, boxEvidence: null },
    { id: 'previous', type: 'medication', date: '2026-11-19', dueTime: '08:00', title: 'Dori', status: 'missed', boxEvidence: null,
      evidence: { id: 'reviewed', taskId: 'previous', payload: { kind: 'medication', status: 'missed', reason: 'out_of_supply' },
        level: 4, source: 'self_report', aiMode: 'none', createdAt: '2026-11-19T03:00:00Z', review: reviewed } },
    { id: 'vitals', type: 'vitals', date: '2026-11-20', dueTime: '10:00', title: 'Bosim', status: 'pending', evidence: null, boxEvidence: null },
  ],
};

describe('Android demo JSON', () => {
  it('returns current medicine and replies linked to the reviewed evidence only', () => {
    expect(mobileToday('Anvar aka', view, '2026-11-20')).toEqual({
      patientName: 'Anvar aka', date: '2026-11-20',
      tasks: [{ id: 'current', title: 'Dori', time: '08:00', record: null }],
      replies: [{ recordId: 'reviewed', taskTitle: 'Dori', date: '2026-11-19', body: reviewed.reply,
        decision: reviewed.decision, reviewedAt: reviewed.reviewedAt }],
    });
  });

  it('includes daily step progress when activity snapshot is provided and validates mobile step input', () => {
    expect(mobileToday('Anvar aka', view, '2026-11-20', {
      dailyStepGoal: 3000,
      steps: { count: 3250, source: 'device_sensor', updatedAt: '2026-11-20T06:00:00.000Z' },
    })).toMatchObject({
      steps: { count: 3250, goal: 3000, achieved: true, source: 'device_sensor' },
    });
    expect(mobileStepsInputSchema.parse({ count: 1200, source: 'demo_sim' })).toEqual({
      count: 1200, source: 'demo_sim',
    });
    expect(mobileStepsInputSchema.safeParse({ count: -1 }).success).toBe(false);
  });

  it('includes past blood pressure replies without exposing private review fields', () => {
    const bpView: ClinicalView = {
      ...view,
      tasks: [{
        id: 'bp', type: 'vitals', date: '2026-11-19', dueTime: '10:00', title: 'Qon bosimi',
        status: 'recorded', boxEvidence: null,
        evidence: {
          id: 'bp-reviewed', taskId: 'bp', payload: { kind: 'vitals', systolic: 155, diastolic: 95, chestPain: false },
          level: 4, source: 'self_report', aiMode: 'manual', createdAt: '2026-11-19T05:00:00Z',
          review: reviewed,
        },
      }],
    };
    expect(mobileToday('Bemor', bpView, '2026-11-20').replies).toEqual([{
      recordId: 'bp-reviewed', taskTitle: 'Qon bosimi', date: '2026-11-19',
      body: reviewed.reply, decision: reviewed.decision, reviewedAt: reviewed.reviewedAt,
    }]);
  });

  it('rejects large and non-JSON request bodies', async () => {
    const http = (contentType: string, body: string) => new Request('https://example.test/', {
      method: 'POST', headers: { 'Content-Type': contentType }, body,
    });
    await expect(readMobileBody(http('text/plain', '{}'))).resolves.toEqual({ ok: false, status: 400 });
    await expect(readMobileBody(http('application/json', JSON.stringify('x'.repeat(3000))))).resolves.toEqual({ ok: false, status: 413 });
    await expect(readMobileBody(http('application/json; charset=utf-8', '{"value":1}'))).resolves.toEqual({ ok: true, body: { value: 1 } });
  });
});
