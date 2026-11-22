import { describe, expect, it } from 'vitest';
import { buildClinicalBrief } from '../../src/lib/clinical-brief';
import type { ClinicalView } from '../../src/lib/clinical-types';

const basePlan = {
  medicationName: 'Namuna dori',
  medicationStrengthMg: 5,
  medicationTime: '08:00',
  vitalsTime: '09:00',
  targets: {
    warnSystolic: 135,
    warnDiastolic: 85,
    maxSystolic: 150,
    maxDiastolic: 95,
  },
  supplyFollowUp: true,
};

describe('buildClinicalBrief', () => {
  it('handles an empty plan without inventing numbers or diagnosis', () => {
    const view: ClinicalView = { plan: null, tasks: [], flags: [] };
    const brief = buildClinicalBrief({
      patientName: 'Anvar aka',
      view,
      activity: null,
      exercisePlan: null,
      exerciseAttempts: [],
      generatedAt: '2026-11-21T08:00:00.000Z',
    });

    expect(brief.metrics.openUrgent).toBe(0);
    expect(brief.metrics.latestBp).toBeNull();
    expect(brief.metrics.adherencePercent).toBeNull();
    expect(brief.lines[0]).toContain('Uy rejasi hali biriktirilmagan');
    expect(brief.plainText).toContain('sintetik demo');
    expect(brief.plainText).not.toMatch(/tashxis qo‘yildi/i);
  });

  it('summarizes urgent BP, adherence, follow-up closure, exercise attempts, steps, and caregiver ack', () => {
    const view: ClinicalView = {
      plan: basePlan,
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
            id: 'e-vitals',
            taskId: 't-vitals',
            payload: { kind: 'vitals', systolic: 155, diastolic: 92, chestPain: false },
            level: 0,
            source: 'self_report',
            aiMode: 'manual',
            createdAt: '2026-11-21T04:30:00.000Z',
            review: null,
          },
        },
      ],
      flags: [
        {
          id: 'f-vitals',
          color: 'red',
          ruleKey: 'bp_max',
          metric: 'systolic',
          observed: 155,
          threshold: 150,
          evidence: {
            id: 'e-vitals',
            taskId: 't-vitals',
            payload: { kind: 'vitals', systolic: 155, diastolic: 92, chestPain: false },
            level: 0,
            source: 'self_report',
            aiMode: 'manual',
            createdAt: '2026-11-21T04:30:00.000Z',
            followups: [
              {
                id: 'fu-1',
                flagId: 'f-vitals',
                kind: 'supply_resolved',
                payload: {},
                createdAt: '2026-11-21T05:00:00.000Z',
              },
            ],
            review: null,
          },
        },
      ],
      urgentSymptoms: [],
      caregiverAck: { kind: 'supply_on_the_way', createdAt: '2026-11-21T05:10:00.000Z' },
    };

    const brief = buildClinicalBrief({
      patientName: 'Anvar aka',
      view,
      activity: {
        localDate: '2026-11-21',
        dueUnits: [],
        adherence: {
          today: { scheduled: 2, answered: 2, completed: 1 },
          week: { scheduled: 10, answered: 9, completed: 8 },
        },
        steps: {
          count: 4200,
          level: 0,
          source: 'self_report',
          aiMode: 'manual',
          updatedAt: '2026-11-21T06:00:00.000Z',
        },
      },
      exercisePlan: {
        id: 'ex-plan',
        targetAngle: 100,
        targetReps: 5,
        maxShallow: 1,
        painColor: 'yellow',
      },
      exerciseAttempts: [
        {
          id: 'ex-1',
          source: 'live_camera',
          aiMode: 'live',
          level: 3,
          reason: 'measured',
          validReps: 5,
          shallowReps: 0,
          minAngle: null,
          confidence: null,
          primary: true,
          sample: false,
          similarMotion: false,
          flagColor: null,
          review: null,
          android: false,
          scheduledDate: '2026-11-21',
          createdAt: '2026-11-21T05:30:00.000Z',
        },
      ],
      generatedAt: '2026-11-21T08:00:00.000Z',
    });

    expect(brief.metrics).toMatchObject({
      openUrgent: 1,
      openWarning: 0,
      reviewedCount: 0,
      latestBp: '155/92 mmHg',
      latestBpTone: 'urgent',
      adherencePercent: 80,
      stepsToday: 4200,
    });
    expect(brief.headline).toContain('1 ta shoshilinch qayd');
    expect(brief.plainText).toContain('4200');
    expect(brief.plainText).toContain('qo‘lda · L0');
    expect(brief.plainText).toContain('Yaqinim');
    expect(brief.plainText).toContain('dori ta’minoti tasdiqlangan');
    expect(brief.bpTrend).toHaveLength(1);
  });

  it('tracks open exercise flags, still_need_help escalation, retake BP normalization, and checked_in ack', () => {
    const view: ClinicalView = {
      plan: basePlan,
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
            id: 'e-vitals',
            taskId: 't-vitals',
            payload: { kind: 'vitals', systolic: 155, diastolic: 92, chestPain: false },
            level: 0,
            source: 'self_report',
            aiMode: 'manual',
            createdAt: '2026-11-21T04:30:00.000Z',
            flagId: 'f-vitals',
            followups: [
              {
                id: 'fu-retake',
                flagId: 'f-vitals',
                kind: 'retake_vitals',
                payload: { systolic: 126, diastolic: 80, chestPain: false },
                createdAt: '2026-11-21T05:15:00.000Z',
              },
            ],
            review: { decision: 'retake', reply: 'Qayta o‘lchang', reviewedAt: '2026-11-21T04:45:00.000Z' },
          },
        },
      ],
      flags: [
        {
          id: 'f-supply',
          color: 'yellow',
          ruleKey: 'medication_out_of_supply',
          evidence: {
            id: 'e-med',
            taskId: 't-med',
            payload: { kind: 'medication', status: 'missed', reason: 'out_of_supply' },
            level: 4,
            source: 'self_report',
            aiMode: 'none',
            createdAt: '2026-11-21T03:30:00.000Z',
            flagId: 'f-supply',
            followups: [
              {
                id: 'fu-help',
                flagId: 'f-supply',
                kind: 'still_need_help',
                payload: {},
                createdAt: '2026-11-21T05:00:00.000Z',
              },
            ],
            review: { decision: 'approved', reply: 'Dori oling', reviewedAt: '2026-11-21T03:45:00.000Z' },
          },
        },
      ],
      urgentSymptoms: [],
      caregiverAck: { kind: 'checked_in', createdAt: '2026-11-21T05:20:00.000Z' },
    };

    const brief = buildClinicalBrief({
      patientName: 'Anvar aka',
      view,
      activity: null,
      exercisePlan: {
        id: 'ex-plan',
        targetAngle: 100,
        targetReps: 5,
        maxShallow: 1,
        painColor: 'red',
      },
      exerciseAttempts: [
        {
          id: 'ex-pain',
          source: 'self_report',
          aiMode: 'none',
          level: 0,
          reason: 'pain',
          validReps: null,
          shallowReps: null,
          minAngle: null,
          confidence: null,
          primary: false,
          sample: false,
          similarMotion: false,
          flagColor: 'red',
          review: null,
          android: false,
          scheduledDate: '2026-11-21',
          createdAt: '2026-11-21T05:30:00.000Z',
        },
      ],
      generatedAt: '2026-11-21T08:00:00.000Z',
    });

    expect(brief.metrics.openUrgent).toBe(1); // unreviewed red exercise pain
    expect(brief.metrics.openWarning).toBe(1); // still_need_help escalation
    expect(brief.metrics.openExerciseFlags).toBe(1);
    expect(brief.metrics.latestBp).toBe('126/80 mmHg');
    expect(brief.metrics.latestBpTone).toBe('ok');
    expect(brief.bpTrend).toHaveLength(2);
    expect(brief.plainText).toContain('qayta nazorat talab qiladi');
    expect(brief.plainText).toContain('bog‘lanishini tasdiqlagan');
    expect(brief.plainText).not.toContain('dori yetkazishda yordam');
  });

  it('reports the chronologically latest non-sample exercise attempt even if an older unreviewed flagged attempt appears first', () => {
    const brief = buildClinicalBrief({
      patientName: 'Anvar aka',
      view: { plan: basePlan, tasks: [], flags: [], urgentSymptoms: [] },
      activity: null,
      exercisePlan: {
        id: 'ex-plan',
        targetAngle: 100,
        targetReps: 5,
        maxShallow: 1,
        painColor: 'red',
      },
      exerciseAttempts: [
        {
          id: 'old-pain',
          source: 'self_report',
          aiMode: 'none',
          level: 0,
          reason: 'pain',
          validReps: null,
          shallowReps: null,
          minAngle: null,
          confidence: null,
          primary: false,
          sample: false,
          similarMotion: false,
          flagColor: 'red',
          review: null,
          android: false,
          scheduledDate: '2026-11-21',
          createdAt: '2026-11-20T05:00:00.000Z',
        },
        {
          id: 'newer-measurement',
          source: 'live_camera',
          aiMode: 'live',
          level: 3,
          reason: 'measured',
          validReps: 5,
          shallowReps: 0,
          minAngle: null,
          confidence: null,
          primary: true,
          sample: false,
          similarMotion: false,
          flagColor: null,
          review: null,
          android: false,
          scheduledDate: '2026-11-21',
          createdAt: '2026-11-21T07:00:00.000Z',
        },
      ],
      generatedAt: '2026-11-21T08:00:00.000Z',
    });

    expect(brief.metrics.openUrgent).toBe(1);
    expect(brief.plainText).toContain('O‘tirib-turish mashqi: oxirgi qayd L3 · 5 to‘liq takror.');
    expect(brief.plainText).not.toContain('Eski og‘riq qaydi.');
  });

  it('clears open escalation counts and notes doctor acknowledgment in the brief once follow-ups are acknowledged', () => {
    const view: ClinicalView = {
      plan: basePlan,
      tasks: [],
      flags: [
        {
          id: 'f-supply',
          color: 'yellow',
          ruleKey: 'medication_out_of_supply',
          evidence: {
            id: 'e-med',
            taskId: 't-med',
            payload: { kind: 'medication', status: 'missed', reason: 'out_of_supply' },
            level: 4,
            source: 'self_report',
            aiMode: 'none',
            createdAt: '2026-11-21T03:30:00.000Z',
            flagId: 'f-supply',
            followups: [
              {
                id: 'fu-help',
                flagId: 'f-supply',
                kind: 'still_need_help',
                payload: {},
                createdAt: '2026-11-21T05:00:00.000Z',
                acknowledgedAt: '2026-11-21T05:15:00.000Z',
              },
            ],
            review: { decision: 'approved', reply: 'Dori oling', reviewedAt: '2026-11-21T03:45:00.000Z' },
          },
        },
      ],
      urgentSymptoms: [],
    };

    const brief = buildClinicalBrief({
      patientName: 'Anvar aka',
      view,
      activity: null,
      exercisePlan: null,
      exerciseAttempts: [],
      generatedAt: '2026-11-21T08:00:00.000Z',
    });

    expect(brief.metrics.openUrgent).toBe(0);
    expect(brief.metrics.openWarning).toBe(0);
    expect(brief.headline).toContain('ochiq ogohlantirishlar yo‘q');
    expect(brief.plainText).toContain('1 tasi shifokor tomonidan ko‘rilgan');
    expect(brief.plainText).not.toContain('qayta nazorat talab qiladi');
  });
});
