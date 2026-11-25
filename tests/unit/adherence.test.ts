import { describe, expect, it } from 'vitest';
import {
  buildSevenDayStepTrend,
  calculateAdherence,
  calculateMedicationAdherence,
  stepsForm,
} from '../../src/lib/adherence';

const today = '2026-11-21';
const yesterday = '2026-11-20';

describe('calculateAdherence', () => {
  it('keeps the denominator at zero when no tasks are due', () => {
    const empty = { scheduled: 0, completed: 0, answered: 0 };
    expect(calculateAdherence([], today)).toEqual({ today: empty, week: empty });
  });

  it('includes days without a materialized task instance as unanswered', () => {
    expect(calculateAdherence([
      { planItemId: 'medicine', scheduledDate: yesterday, status: null },
      { planItemId: 'medicine', scheduledDate: today, status: 'taken' },
      { planItemId: 'pressure', scheduledDate: today, status: 'pending' },
    ], today)).toEqual({
      today: { scheduled: 2, completed: 1, answered: 1 },
      week: { scheduled: 3, completed: 1, answered: 1 },
    });
  });

  it('counts missed as answered and recorded as completed', () => {
    expect(calculateAdherence([
      { planItemId: 'medicine', scheduledDate: today, status: 'missed' },
      { planItemId: 'pressure', scheduledDate: today, status: 'recorded' },
    ], today)).toEqual({
      today: { scheduled: 2, completed: 1, answered: 2 },
      week: { scheduled: 2, completed: 1, answered: 2 },
    });
  });

  it('does not count another attempt as a new scheduled unit', () => {
    const primary = { planItemId: 'medicine', scheduledDate: today, status: 'missed' } as const;
    const retry = { ...primary, status: 'taken' } as const;
    expect(calculateAdherence([primary, retry, primary], today)).toEqual({
      today: { scheduled: 1, completed: 0, answered: 1 },
      week: { scheduled: 1, completed: 0, answered: 1 },
    });
  });

  it('preserves a weekly ratio when no tasks are due yet today', () => {
    expect(calculateAdherence([
      { planItemId: 'pressure', scheduledDate: yesterday, status: 'recorded' },
    ], today)).toEqual({
      today: { scheduled: 0, completed: 0, answered: 0 },
      week: { scheduled: 1, completed: 1, answered: 1 },
    });
  });
});

describe('calculateMedicationAdherence', () => {
  it('breaks down per-medication due/taken/missed/unanswered separately from vitals', () => {
    const breakdown = calculateMedicationAdherence([
      {
        planItemId: 'aml-am',
        title: 'Amlodipin',
        dueTime: '08:00',
        type: 'medication',
        strength: 5,
        strengthUnit: 'mg',
        scheduledDate: yesterday,
        status: 'taken',
      },
      {
        planItemId: 'aml-pm',
        title: 'Amlodipin',
        dueTime: '20:00',
        type: 'medication',
        strength: 5,
        strengthUnit: 'mg',
        scheduledDate: yesterday,
        status: 'missed',
      },
      {
        planItemId: 'aml-am',
        title: 'Amlodipin',
        dueTime: '08:00',
        type: 'medication',
        strength: 5,
        strengthUnit: 'mg',
        scheduledDate: today,
        status: 'pending',
      },
      {
        planItemId: 'met-am',
        title: 'Metformin',
        dueTime: '09:00',
        type: 'medication',
        strength: 500,
        strengthUnit: 'mg',
        scheduledDate: today,
        status: 'taken',
      },
      {
        planItemId: 'bp',
        title: 'Qon bosimi',
        dueTime: '09:00',
        type: 'vitals',
        scheduledDate: today,
        status: 'recorded',
      },
    ], today);

    expect(breakdown).toEqual([
      {
        medicationName: 'Amlodipin',
        strength: 5,
        strengthUnit: 'mg',
        times: ['08:00', '20:00'],
        today: { scheduled: 1, taken: 0, missed: 0, unanswered: 1, answered: 0 },
        week: { scheduled: 3, taken: 1, missed: 1, unanswered: 1, answered: 2 },
      },
      {
        medicationName: 'Metformin',
        strength: 500,
        strengthUnit: 'mg',
        times: ['09:00'],
        today: { scheduled: 1, taken: 1, missed: 0, unanswered: 0, answered: 1 },
        week: { scheduled: 1, taken: 1, missed: 0, unanswered: 0, answered: 1 },
      },
    ]);
  });
});

describe('buildSevenDayStepTrend', () => {
  it('prefers device_sensor over self_report while exposing both values per day and restricting demo_sim to demo', () => {
    const entries = [
      {
        date: today,
        count: 3400,
        level: 0 as const,
        source: 'self_report' as const,
        aiMode: 'manual' as const,
        updatedAt: '2026-11-21T08:00:00.000Z',
      },
      {
        date: today,
        count: 4120,
        level: 0 as const,
        source: 'device_sensor' as const,
        aiMode: 'manual' as const,
        updatedAt: '2026-11-21T09:00:00.000Z',
      },
      {
        date: yesterday,
        count: 2800,
        level: 0 as const,
        source: 'self_report' as const,
        aiMode: 'manual' as const,
        updatedAt: '2026-11-20T18:00:00.000Z',
      },
      {
        date: '2026-11-19',
        count: 5000,
        level: 0 as const,
        source: 'demo_sim' as const,
        aiMode: 'manual' as const,
        updatedAt: '2026-11-19T12:00:00.000Z',
      },
    ];

    const clinicTrend = buildSevenDayStepTrend(entries, today, { isDemo: false });
    expect(clinicTrend).toHaveLength(7);
    expect(clinicTrend[0]?.date).toBe('2026-11-15');
    expect(clinicTrend[6]?.date).toBe(today);

    // Today has both sources; device_sensor wins effective total
    expect(clinicTrend[6]).toMatchObject({
      date: today,
      effectiveCount: 4120,
      effectiveSource: 'device_sensor',
      deviceSensor: { count: 4120, source: 'device_sensor' },
      selfReport: { count: 3400, source: 'self_report' },
      demoSim: null,
    });

    // Yesterday falls back to self_report
    expect(clinicTrend[5]).toMatchObject({
      date: yesterday,
      effectiveCount: 2800,
      effectiveSource: 'self_report',
      deviceSensor: null,
      selfReport: { count: 2800, source: 'self_report' },
    });

    // Non-demo ignores demo_sim
    expect(clinicTrend[4]).toMatchObject({
      date: '2026-11-19',
      effectiveCount: null,
      effectiveSource: null,
      demoSim: null,
    });

    // Demo workspace allows demo_sim fallback when neither real source exists
    const demoTrend = buildSevenDayStepTrend(entries, today, { isDemo: true });
    expect(demoTrend[4]).toMatchObject({
      date: '2026-11-19',
      effectiveCount: 5000,
      effectiveSource: 'demo_sim',
      demoSim: { count: 5000, source: 'demo_sim' },
    });
  });
});

describe('stepsForm', () => {
  it.each(['0', '3260', '999999'])('accepts a whole number of steps: %s', (steps) => {
    expect(stepsForm.parse({ steps })).toEqual({ steps: Number(steps) });
  });

  it.each(['', '-1', '3.5', '1e4', '1000000'])('rejects an invalid count: %s', (steps) => {
    expect(stepsForm.safeParse({ steps }).success).toBe(false);
  });

  it('rejects a date or evidence level supplied by the browser', () => {
    expect(stepsForm.safeParse({ steps: '500', date: yesterday }).success).toBe(false);
    expect(stepsForm.safeParse({ steps: '500', level: '4' }).success).toBe(false);
  });
});
