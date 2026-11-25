import { describe, expect, it } from 'vitest';
import type { BloodPressureTargets } from '../../src/lib/clinical-types';
import { evaluateRules } from '../../src/lib/rules/evaluate-rules';

const targets: BloodPressureTargets = { maxSystolic: 150, maxDiastolic: 95, warnSystolic: 135, warnDiastolic: 85 };
const targetsWithLow: BloodPressureTargets = { ...targets, minSystolic: 90, minDiastolic: 60 };

const vitals = (systolic: number, diastolic: number, customTargets: BloodPressureTargets = targets) => ({
  kind: 'vitals',
  chest_pain: false,
  reading: { systolic, diastolic, targets: customTargets },
});

describe('vitals rules', () => {
  it.each([
    { systolic: 150, diastolic: 70, color: 'red', metric: 'systolic', observed: 150, threshold: 150 },
    { systolic: 130, diastolic: 95, color: 'red', metric: 'diastolic', observed: 95, threshold: 95 },
    { systolic: 135, diastolic: 70, color: 'yellow', metric: 'systolic', observed: 135, threshold: 135 },
    { systolic: 130, diastolic: 85, color: 'yellow', metric: 'diastolic', observed: 85, threshold: 85 },
    { systolic: 140, diastolic: 96, color: 'red', metric: 'diastolic', observed: 96, threshold: 95 },
    { systolic: 152, diastolic: 96, color: 'red', metric: 'systolic', observed: 152, threshold: 150 },
  ])('flags $systolic/$diastolic as $color from $metric', (example) => {
    const { systolic, diastolic, color, metric, observed, threshold } = example;
    expect(evaluateRules(vitals(systolic, diastolic))).toEqual({
      color,
      rule_key: color === 'red' ? 'bp_max' : 'bp_warning',
      metric,
      observed,
      threshold,
    });
  });

  it('uses the lower warning boundary of the current plan', () => {
    expect(evaluateRules(vitals(134, 84))).toBeNull();
    expect(evaluateRules({
      ...vitals(134, 84),
      reading: { systolic: 134, diastolic: 84, targets: { ...targets, warnSystolic: 130 } },
    })).toMatchObject({ color: 'yellow', threshold: 130 });
  });

  it('flags severe low BP (hypotension) below clinician-configured minSystolic/minDiastolic as red bp_low', () => {
    expect(evaluateRules(vitals(90, 60, targetsWithLow))).toBeNull();
    expect(evaluateRules(vitals(89, 60, targetsWithLow))).toEqual({
      color: 'red',
      rule_key: 'bp_low',
      metric: 'systolic',
      observed: 89,
      threshold: 90,
    });
    expect(evaluateRules(vitals(100, 59, targetsWithLow))).toEqual({
      color: 'red',
      rule_key: 'bp_low',
      metric: 'diastolic',
      observed: 59,
      threshold: 60,
    });
    // Red low diastolic takes priority over yellow warning systolic
    expect(evaluateRules(vitals(138, 55, targetsWithLow))).toEqual({
      color: 'red',
      rule_key: 'bp_low',
      metric: 'diastolic',
      observed: 55,
      threshold: 60,
    });
  });

  it('enforces physiological blood pressure bounds and systolic > diastolic', () => {
    expect(() => evaluateRules(vitals(49, 35))).toThrow();
    expect(() => evaluateRules(vitals(261, 100))).toThrow();
    expect(() => evaluateRules(vitals(120, 29))).toThrow();
    expect(() => evaluateRules(vitals(200, 161))).toThrow();
    expect(() => evaluateRules(vitals(100, 100))).toThrow();
    expect(() => evaluateRules(vitals(90, 110))).toThrow();
    expect(evaluateRules(vitals(50, 30, targets))).toBeNull();
    expect(evaluateRules(vitals(260, 160, targets))).toMatchObject({ color: 'red', rule_key: 'bp_max' });
  });

  it('rejects invalid low BP target configurations', () => {
    expect(() => evaluateRules(vitals(120, 80, { ...targets, minSystolic: 135 }))).toThrow();
    expect(() => evaluateRules(vitals(120, 80, { ...targets, minDiastolic: 85 }))).toThrow();
    expect(() => evaluateRules(vitals(120, 80, { ...targets, minSystolic: 70, minDiastolic: 70 }))).toThrow();
  });

  it('flags reported chest pain without a measurement', () => {
    expect(evaluateRules({ kind: 'vitals', chest_pain: true })).toEqual({
      color: 'red', rule_key: 'chest_pain',
    });
  });

  it('prioritizes reported chest pain when the measurement also crosses a red threshold', () => {
    expect(evaluateRules({ ...vitals(190, 100), chest_pain: true })).toEqual({
      color: 'red', rule_key: 'chest_pain',
    });
    expect(evaluateRules({ ...vitals(82, 52, targetsWithLow), chest_pain: true })).toEqual({
      color: 'red', rule_key: 'chest_pain',
    });
  });

  it('keeps an absent measurement distinct from a symptom report', () => {
    expect(evaluateRules({ kind: 'vitals', chest_pain: false })).toBeNull();
  });

  it('rejects a warning threshold above the maximum', () => {
    expect(() => evaluateRules({
      ...vitals(150, 90),
      reading: { systolic: 150, diastolic: 90, targets: { ...targets, warnDiastolic: 100 } },
    })).toThrow();
  });

  it('rejects an incomplete measurement', () => {
    expect(() => evaluateRules({ ...vitals(150, 90), reading: { systolic: 150, targets } })).toThrow();
  });
});

describe('medication adherence rule', () => {
  const missed = { kind: 'medication_adherence', date: '2026-11-20', status: 'missed' };

  it.each(['2026-11-19', '2026-11-17'])('flags two consecutive scheduled days (%s)', (previousDate) => {
    expect(evaluateRules({ ...missed, previous_scheduled_day: { date: previousDate, status: 'missed' } })).toEqual({
      color: 'yellow', rule_key: 'medication_missed_consecutive_days',
    });
  });

  it.each(['unanswered', 'taken'])('breaks a missed streak after a %s scheduled day', (status) => {
    expect(evaluateRules({ ...missed, previous_scheduled_day: { date: '2026-11-19', status } })).toBeNull();
  });

  it('does not count one missed day as a streak', () => {
    expect(evaluateRules(missed)).toBeNull();
  });

  it.each(['taken', 'unanswered'])('does not count a current day with status %s', (status) => {
    expect(evaluateRules({ ...missed, status, previous_scheduled_day: { date: '2026-11-19', status: 'missed' } })).toBeNull();
  });

  it.each(['2026-11-20', '2026-11-21', '2026-11-31'])('rejects invalid history date %s', (date) => {
    expect(() => evaluateRules({ ...missed, previous_scheduled_day: { date, status: 'missed' } })).toThrow();
  });
});
