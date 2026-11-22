import { describe, expect, it } from 'vitest';
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

  it('rejects large and non-JSON request bodies', async () => {
    const http = (contentType: string, body: string) => new Request('https://example.test/', {
      method: 'POST', headers: { 'Content-Type': contentType }, body,
    });
    await expect(readMobileBody(http('text/plain', '{}'))).resolves.toEqual({ ok: false, status: 400 });
    await expect(readMobileBody(http('application/json', JSON.stringify('x'.repeat(3000))))).resolves.toEqual({ ok: false, status: 413 });
    await expect(readMobileBody(http('application/json; charset=utf-8', '{"value":1}'))).resolves.toEqual({ ok: true, body: { value: 1 } });
  });
});
