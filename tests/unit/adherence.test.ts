import { describe, expect, it } from 'vitest';
import { calculateAdherence, stepsForm } from '../../src/lib/adherence';

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
