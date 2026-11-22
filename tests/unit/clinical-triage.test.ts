import { describe, expect, it } from 'vitest';
import {
  caregiverAckMessage,
  countOpenClinicalAttention,
  describeRetakeVitalsFollowup,
  evaluateBpZone,
  evaluateFlagFollowupAttention,
  extractBpTrend,
  findLatestRealExerciseAttempt,
  isFollowupSuperseded,
} from '../../src/lib/clinical-triage';
import type { ClinicalFlag, ClinicalView, FlagFollowup } from '../../src/lib/clinical-types';

const targets = {
  warnSystolic: 135,
  warnDiastolic: 85,
  maxSystolic: 150,
  maxDiastolic: 95,
};

function makeReviewedFlag(followups: FlagFollowup[]): ClinicalFlag {
  return {
    id: 'flag-1',
    color: 'yellow',
    ruleKey: 'medication_out_of_supply',
    evidence: {
      id: 'ev-1',
      taskId: 'task-1',
      payload: { kind: 'medication', status: 'missed', reason: 'out_of_supply' },
      level: 4,
      source: 'self_report',
      aiMode: 'none',
      createdAt: '2026-11-21T04:00:00.000Z',
      flagId: 'flag-1',
      followups,
      review: {
        decision: 'approved',
        reply: 'Yangi dori oling.',
        reviewedAt: '2026-11-21T04:15:00.000Z',
      },
    },
  };
}

describe('evaluateBpZone', () => {
  it('classifies boundaries deterministically against doctor targets', () => {
    expect(evaluateBpZone({ systolic: '134', diastolic: '84', chestPain: false, targets })?.tone).toBe('ok');
    expect(evaluateBpZone({ systolic: '135', diastolic: '84', chestPain: false, targets })?.tone).toBe('warn');
    expect(evaluateBpZone({ systolic: '120', diastolic: '85', chestPain: false, targets })?.tone).toBe('warn');
    expect(evaluateBpZone({ systolic: '150', diastolic: '80', chestPain: false, targets })?.tone).toBe('urgent');
    expect(evaluateBpZone({ systolic: '120', diastolic: '95', chestPain: false, targets })?.tone).toBe('urgent');
  });

  it('prioritizes chest pain even with normal or empty readings or null targets', () => {
    const withNormal = evaluateBpZone({ systolic: 118, diastolic: 76, chestPain: true, targets });
    expect(withNormal?.tone).toBe('urgent');
    expect(withNormal?.textUz).toContain('103');

    const withNoNumbers = evaluateBpZone({ systolic: '', diastolic: '', chestPain: true, targets: null });
    expect(withNoNumbers?.tone).toBe('urgent');
  });

  it('returns null for incomplete, invalid, or missing-target inputs without chest pain', () => {
    expect(evaluateBpZone({ systolic: '', diastolic: '80', chestPain: false, targets })).toBeNull();
    expect(evaluateBpZone({ systolic: '0', diastolic: '80', chestPain: false, targets })).toBeNull();
    expect(evaluateBpZone({ systolic: '-10', diastolic: '80', chestPain: false, targets })).toBeNull();
    expect(evaluateBpZone({ systolic: 'abc', diastolic: '80', chestPain: false, targets })).toBeNull();
    expect(evaluateBpZone({ systolic: '120', diastolic: '80', chestPain: false, targets: null })).toBeNull();
  });
});

describe('evaluateFlagFollowupAttention', () => {
  it('escalates still_need_help until a later supply_resolved closes it', () => {
    const helpFlag = makeReviewedFlag([
      { id: 'fu-1', flagId: 'flag-1', kind: 'still_need_help', payload: {}, createdAt: '2026-11-21T05:00:00.000Z' },
    ]);
    const escalated = evaluateFlagFollowupAttention(helpFlag, targets);
    expect(escalated).toMatchObject({ severity: 'yellow', kind: 'still_need_help' });

    const closedFlag = makeReviewedFlag([
      { id: 'fu-1', flagId: 'flag-1', kind: 'still_need_help', payload: {}, createdAt: '2026-11-21T05:00:00.000Z' },
      { id: 'fu-2', flagId: 'flag-1', kind: 'supply_resolved', payload: {}, createdAt: '2026-11-21T06:00:00.000Z' },
    ]);
    expect(evaluateFlagFollowupAttention(closedFlag, targets)).toBeNull();
  });

  it('escalates abnormal retake vitals and clears once a later retake normalizes', () => {
    const highRetake = makeReviewedFlag([
      {
        id: 'fu-1',
        flagId: 'flag-1',
        kind: 'retake_vitals',
        payload: { systolic: 158, diastolic: 92, chestPain: false },
        createdAt: '2026-11-21T05:00:00.000Z',
      },
    ]);
    expect(evaluateFlagFollowupAttention(highRetake, targets)).toMatchObject({
      severity: 'red',
      kind: 'retake_vitals',
    });

    const warnRetake = makeReviewedFlag([
      {
        id: 'fu-2',
        flagId: 'flag-1',
        kind: 'retake_vitals',
        payload: { systolic: 138, diastolic: 82, chestPain: false },
        createdAt: '2026-11-21T05:00:00.000Z',
      },
    ]);
    expect(evaluateFlagFollowupAttention(warnRetake, targets)).toMatchObject({
      severity: 'yellow',
      kind: 'retake_vitals',
    });

    const normalizedLater = makeReviewedFlag([
      {
        id: 'fu-1',
        flagId: 'flag-1',
        kind: 'retake_vitals',
        payload: { systolic: 158, diastolic: 92, chestPain: false },
        createdAt: '2026-11-21T05:00:00.000Z',
      },
      {
        id: 'fu-3',
        flagId: 'flag-1',
        kind: 'retake_vitals',
        payload: { systolic: 126, diastolic: 80, chestPain: false },
        createdAt: '2026-11-21T06:00:00.000Z',
      },
    ]);
    expect(evaluateFlagFollowupAttention(normalizedLater, targets)).toBeNull();

    const chestPainNormalBp = makeReviewedFlag([
      {
        id: 'fu-4',
        flagId: 'flag-1',
        kind: 'retake_vitals',
        payload: { systolic: 120, diastolic: 80, chestPain: true },
        createdAt: '2026-11-21T07:00:00.000Z',
      },
    ]);
    const chestPainEscalation = evaluateFlagFollowupAttention(chestPainNormalBp, targets);
    expect(chestPainEscalation).toMatchObject({
      severity: 'red',
      kind: 'retake_vitals',
      titleUz: 'Qayta o‘lchovda ko‘krak og‘rig‘i bildirildi',
    });
  });

  it('escalates retake_medication missed but clears taken', () => {
    const missed = makeReviewedFlag([
      { id: 'fu-1', flagId: 'flag-1', kind: 'retake_medication', payload: { status: 'missed' }, createdAt: '2026-11-21T05:00:00.000Z' },
    ]);
    expect(evaluateFlagFollowupAttention(missed, targets)).toMatchObject({ severity: 'yellow', kind: 'retake_medication' });

    const taken = makeReviewedFlag([
      { id: 'fu-1', flagId: 'flag-1', kind: 'retake_medication', payload: { status: 'taken' }, createdAt: '2026-11-21T05:00:00.000Z' },
    ]);
    expect(evaluateFlagFollowupAttention(taken, targets)).toBeNull();
  });

  it('clears escalations when acknowledged by doctor and re-escalates if a newer unacknowledged followup arrives', () => {
    const ackedHelp = makeReviewedFlag([
      {
        id: 'fu-help-1',
        flagId: 'flag-1',
        kind: 'still_need_help',
        payload: {},
        createdAt: '2026-11-21T05:00:00.000Z',
        acknowledgedAt: '2026-11-21T05:15:00.000Z',
      },
    ]);
    expect(evaluateFlagFollowupAttention(ackedHelp, targets)).toBeNull();

    const reEscalatedHelp = makeReviewedFlag([
      {
        id: 'fu-help-1',
        flagId: 'flag-1',
        kind: 'still_need_help',
        payload: {},
        createdAt: '2026-11-21T05:00:00.000Z',
        acknowledgedAt: '2026-11-21T05:15:00.000Z',
      },
      {
        id: 'fu-help-2',
        flagId: 'flag-1',
        kind: 'still_need_help',
        payload: {},
        createdAt: '2026-11-21T06:00:00.000Z',
        acknowledgedAt: null,
      },
    ]);
    expect(evaluateFlagFollowupAttention(reEscalatedHelp, targets)).toMatchObject({
      followupId: 'fu-help-2',
      severity: 'yellow',
      kind: 'still_need_help',
    });

    const ackedRetakeBp = makeReviewedFlag([
      {
        id: 'fu-bp-1',
        flagId: 'flag-1',
        kind: 'retake_vitals',
        payload: { systolic: 158, diastolic: 94, chestPain: false },
        createdAt: '2026-11-21T05:00:00.000Z',
        acknowledgedAt: '2026-11-21T05:20:00.000Z',
      },
    ]);
    expect(evaluateFlagFollowupAttention(ackedRetakeBp, targets)).toBeNull();

    const ackedRetakeMed = makeReviewedFlag([
      {
        id: 'fu-med-1',
        flagId: 'flag-1',
        kind: 'retake_medication',
        payload: { status: 'missed' },
        createdAt: '2026-11-21T05:00:00.000Z',
        acknowledgedAt: '2026-11-21T05:25:00.000Z',
      },
    ]);
    expect(evaluateFlagFollowupAttention(ackedRetakeMed, targets)).toBeNull();
  });

  it('prioritizes red retake_vitals over yellow followups and breaks equal timestamps deterministically', () => {
    const mixedFlag = makeReviewedFlag([
      {
        id: 'fu-help',
        flagId: 'flag-1',
        kind: 'still_need_help',
        payload: {},
        createdAt: '2026-11-21T06:00:00.000Z',
      },
      {
        id: 'fu-bp-red',
        flagId: 'flag-1',
        kind: 'retake_vitals',
        payload: { systolic: 170, diastolic: 98, chestPain: true },
        createdAt: '2026-11-21T05:00:00.000Z',
      },
    ]);
    expect(evaluateFlagFollowupAttention(mixedFlag, targets)).toMatchObject({
      followupId: 'fu-bp-red',
      severity: 'red',
      kind: 'retake_vitals',
    });

    const sameTimestamp = makeReviewedFlag([
      {
        id: 'fu-b',
        flagId: 'flag-1',
        kind: 'supply_resolved',
        payload: {},
        createdAt: '2026-11-21T05:00:00.000Z',
      },
      {
        id: 'fu-a',
        flagId: 'flag-1',
        kind: 'still_need_help',
        payload: {},
        createdAt: '2026-11-21T05:00:00.000Z',
      },
    ]);
    expect(evaluateFlagFollowupAttention(sameTimestamp, targets)).toBeNull();
  });
});

describe('extractBpTrend & countOpenClinicalAttention', () => {
  it('merges initial vitals and retake_vitals chronologically and aggregates all open clinical attention sources', () => {
    const view: ClinicalView = {
      plan: {
        medicationName: 'Namuna dori',
        medicationStrengthMg: 5,
        medicationTime: '08:00',
        vitalsTime: '09:00',
        targets,
        supplyFollowUp: true,
      },
      tasks: [
        {
          id: 't-vitals',
          type: 'vitals',
          title: 'Qon bosimi',
          date: '2026-11-21',
          dueTime: '09:00',
          status: 'recorded',
          boxEvidence: null,
          evidence: {
            id: 'ev-vitals',
            taskId: 't-vitals',
            payload: { kind: 'vitals', systolic: 155, diastolic: 92, chestPain: false },
            level: 0,
            source: 'self_report',
            aiMode: 'manual',
            createdAt: '2026-11-21T04:00:00.000Z',
            flagId: 'f-vitals',
            followups: [
              {
                id: 'fu-bp',
                flagId: 'f-vitals',
                kind: 'retake_vitals',
                payload: { systolic: 128, diastolic: 80, chestPain: false },
                createdAt: '2026-11-21T05:00:00.000Z',
              },
            ],
            review: { decision: 'retake', reply: 'Qayta o‘lchang', reviewedAt: '2026-11-21T04:20:00.000Z' },
          },
        },
      ],
      flags: [
        makeReviewedFlag([
          { id: 'fu-help', flagId: 'flag-1', kind: 'still_need_help', payload: {}, createdAt: '2026-11-21T05:30:00.000Z' },
        ]),
      ],
      urgentSymptoms: [
        {
          id: 'sym-1',
          symptom: 'dizziness',
          note: 'Bosh aylandi',
          level: 0,
          createdAt: '2026-11-21T06:00:00.000Z',
          review: null,
        },
      ],
    };

    const trend = extractBpTrend(view);
    expect(trend).toHaveLength(2);
    expect(trend[0]).toMatchObject({ systolic: 155, diastolic: 92, tone: 'urgent', isRetake: false });
    expect(trend[1]).toMatchObject({ systolic: 128, diastolic: 80, tone: 'ok', isRetake: true });

    const attention = countOpenClinicalAttention({
      view,
      exerciseAttempts: [
        { id: 'ex-pain', flagColor: 'red', review: null },
        { id: 'ex-shallow', flagColor: 'yellow', review: null },
        { id: 'ex-reviewed', flagColor: 'red', review: { decision: 'reviewed', body: 'OK', reviewedAt: '2026-11-21T06:10:00.000Z' } },
      ],
    });
    expect(attention.openUrgent).toBe(2); // 1 urgent symptom + 1 unreviewed red exercise
    expect(attention.openWarning).toBe(2); // 1 still_need_help + 1 unreviewed yellow exercise
    expect(attention.openExerciseFlags).toBe(2);
    expect(attention.followupEscalations).toHaveLength(1);
    expect(attention.totalOpen).toBe(4);
  });
});

describe('caregiverAckMessage & describeRetakeVitalsFollowup', () => {
  it('distinguishes supply_on_the_way from checked_in across audiences', () => {
    const supply = { kind: 'supply_on_the_way', createdAt: '2026-11-21T06:00:00.000Z' } as const;
    const checkedIn = { kind: 'checked_in', createdAt: '2026-11-21T06:00:00.000Z' } as const;

    expect(caregiverAckMessage(supply, 'patient')).toContain('dori yetkazish');
    expect(caregiverAckMessage(checkedIn, 'patient')).not.toContain('dori yetkazish');
    expect(caregiverAckMessage(checkedIn, 'patient')).toContain('bog‘lanishini');
    expect(caregiverAckMessage(checkedIn, 'doctor')).not.toContain('dori');
    expect(caregiverAckMessage(checkedIn, 'brief')).toContain('bog‘lanishini');
  });

  it('describes retake vitals with evaluated clinical zone', () => {
    const detail = describeRetakeVitalsFollowup(
      {
        id: 'fu-1',
        flagId: 'flag-1',
        kind: 'retake_vitals',
        payload: { systolic: 126, diastolic: 80, chestPain: false },
        createdAt: '2026-11-21T06:00:00.000Z',
      },
      targets,
    );
    expect(detail.text).toContain('126/80 mm sim. ust.');
    expect(detail.tone).toBe('ok');
    expect(detail.labelUz).toBe('Me’yor');

    const doctorDetail = describeRetakeVitalsFollowup(
      {
        id: 'fu-2',
        flagId: 'flag-1',
        kind: 'retake_vitals',
        payload: { systolic: 158, diastolic: 94, chestPain: false },
        createdAt: '2026-11-21T06:05:00.000Z',
      },
      targets,
      'mmHg',
    );
    expect(doctorDetail.text).toBe('Qayta o‘lchov: 158/94 mmHg');
    expect(doctorDetail.tone).toBe('urgent');
    expect(doctorDetail.labelUz).toBe('Yuqori chegara');
  });
});

describe('findLatestRealExerciseAttempt', () => {
  it('picks chronologically latest non-sample attempt even when triage-sorted input puts older flagged attempt first', () => {
    const attempts = [
      { id: 'old-flagged', sample: false, createdAt: '2026-11-20T05:00:00.000Z' },
      { id: 'newest-sample', sample: true, createdAt: '2026-11-21T09:00:00.000Z' },
      { id: 'newest-real', sample: false, createdAt: '2026-11-21T08:00:00.000Z' },
    ];
    expect(findLatestRealExerciseAttempt(attempts)?.id).toBe('newest-real');
    expect(findLatestRealExerciseAttempt([{ id: 'only-sample', sample: true, createdAt: '2026-11-21T09:00:00.000Z' }])).toBeNull();
  });

});

describe('isFollowupSuperseded', () => {
  it('marks older still_need_help, missed retake_medication, and retake_vitals rows as superseded by newer loop updates', () => {
    const help1: FlagFollowup = {
      id: 'fu-help-1',
      flagId: 'flag-1',
      kind: 'still_need_help',
      payload: {},
      createdAt: '2026-11-21T05:00:00.000Z',
    };
    const help2: FlagFollowup = {
      id: 'fu-help-2',
      flagId: 'flag-1',
      kind: 'still_need_help',
      payload: {},
      createdAt: '2026-11-21T05:05:00.000Z',
    };
    const resolved: FlagFollowup = {
      id: 'fu-resolved',
      flagId: 'flag-1',
      kind: 'supply_resolved',
      payload: {},
      createdAt: '2026-11-21T05:10:00.000Z',
    };
    const bp1: FlagFollowup = {
      id: 'fu-bp-1',
      flagId: 'flag-1',
      kind: 'retake_vitals',
      payload: { systolic: 155, diastolic: 95, chestPain: false },
      createdAt: '2026-11-21T06:00:00.000Z',
    };
    const bp2: FlagFollowup = {
      id: 'fu-bp-2',
      flagId: 'flag-1',
      kind: 'retake_vitals',
      payload: { systolic: 125, diastolic: 78, chestPain: false },
      createdAt: '2026-11-21T06:10:00.000Z',
    };

    const list = [help1, help2, resolved, bp1, bp2];
    expect(isFollowupSuperseded(list, help1)).toBe(true);
    expect(isFollowupSuperseded(list, help2)).toBe(true);
    expect(isFollowupSuperseded(list, resolved)).toBe(false);
    expect(isFollowupSuperseded(list, bp1)).toBe(true);
    expect(isFollowupSuperseded(list, bp2)).toBe(false);
  });
});
