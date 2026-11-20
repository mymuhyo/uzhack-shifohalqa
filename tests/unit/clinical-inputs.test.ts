import { describe, expect, it } from 'vitest';
import { evidenceForm, planForm, prepareEvidence, reviewForm } from '../../src/lib/clinical-inputs';
import type { TaskContext } from '../../src/lib/clinical-types';

const taskId = 'dd258aab-cb21-403d-a4d0-4b8799e35673';
const values = {
  medicationName: 'Namuna dori', medicationTime: '08:00', vitalsTime: '09:00',
  warnSystolic: '135', warnDiastolic: '85', maxSystolic: '150', maxDiastolic: '95',
};

function task(type: TaskContext['type'], supplyFollowUp = false): TaskContext {
  return {
    type, date: '2026-11-20', previousMedication: null,
    plan: planForm.parse({ ...values, ...(supplyFollowUp ? { supplyFollowUp: 'yes' } : {}) }),
  };
}

describe('clinical forms', () => {
  it('parses the actual plan targets and explicitly selected follow-up', () => {
    expect(planForm.parse({ ...values, supplyFollowUp: 'yes' })).toMatchObject({
      medicationTime: '08:00', supplyFollowUp: true, targets: { warnDiastolic: 85, maxSystolic: 150 },
    });
    expect(planForm.parse(values).supplyFollowUp).toBe(false);
  });

  it('requires a medication name with a letter for new box-strength plans', () => {
    expect(planForm.safeParse({ ...values, medicationName: '123', medicationStrengthMg: '5' }).success).toBe(false);
    expect(planForm.parse({ ...values, medicationName: '123' }).medicationStrengthMg).toBeNull();
    expect(planForm.parse({ ...values, medicationStrengthMg: '2.5' }).medicationStrengthMg).toBe(2.5);
  });

  it.each([{ vitalsTime: '24:00' }, { warnDiastolic: '100' }, { maxSystolic: '' }])(
    'rejects invalid plan fields %o', (entry) => {
      expect(planForm.safeParse({ ...values, ...entry }).success).toBe(false);
    },
  );

  it('requires a reason for a missed medication and rejects a caller-supplied level', () => {
    expect(evidenceForm.safeParse({ taskId, medicationStatus: 'missed' }).success).toBe(false);
    expect(evidenceForm.safeParse({ taskId, medicationStatus: 'taken', level: '4' }).success).toBe(false);
  });

  it('requires a usable BP reading or a specific chest pain report', () => {
    expect(evidenceForm.safeParse({ taskId, systolic: '', diastolic: '' }).success).toBe(false);
    expect(evidenceForm.safeParse({ taskId, systolic: '150', diastolic: '', chestPain: 'yes' }).success).toBe(false);
    expect(evidenceForm.parse({ taskId, systolic: '', diastolic: '', chestPain: 'yes' }).payload).toEqual({
      kind: 'vitals', systolic: null, diastolic: null, chestPain: true,
    });
  });

  it('requires a patient-facing reply and an exact flag UUID', () => {
    expect(reviewForm.safeParse({ flagId: taskId, decision: 'approved', reply: '  ' }).success).toBe(false);
    expect(reviewForm.safeParse({ flagId: 'latest', decision: 'approved', reply: 'Qabul qilindi' }).success).toBe(false);
    expect(reviewForm.parse({ flagId: taskId, decision: 'retake', reply: ' Qayta qayd qiling. ' })).toEqual({
      flagId: taskId, decision: 'retake', reply: 'Qayta qayd qiling.', note: '',
    });
  });
});

describe('prepareEvidence', () => {
  it('adds the supply flag only if the plan explicitly requests follow-up', () => {
    const command = evidenceForm.parse({ taskId, medicationStatus: 'missed', reason: 'out_of_supply' });
    expect(prepareEvidence(command, task('medication', true))).toMatchObject({
      level: 0, source: 'self_report', aiMode: 'none', flag: { color: 'yellow', ruleKey: 'medication_out_of_supply' },
    });
    expect(prepareEvidence(command, task('medication'))?.flag).toBeNull();
  });

  it('reuses the existing medication adherence rule and respects unanswered days', () => {
    const command = evidenceForm.parse({ taskId, medicationStatus: 'missed', reason: 'forgot' });
    expect(prepareEvidence(command, {
      ...task('medication'), previousMedication: { date: '2026-11-19', status: 'missed' },
    })?.flag).toEqual({ color: 'yellow', ruleKey: 'medication_missed_consecutive_days' });
    expect(prepareEvidence(command, {
      ...task('medication'), previousMedication: { date: '2026-11-19', status: 'unanswered' },
    })?.flag).toBeNull();
  });

  it('flags BP from the plan and keeps the actual values', () => {
    const command = evidenceForm.parse({ taskId, systolic: '150', diastolic: '80' });
    expect(prepareEvidence(command, task('vitals'))).toMatchObject({
      level: 0, source: 'self_report', aiMode: 'manual',
      flag: { color: 'red', ruleKey: 'bp_max', metric: 'systolic', observed: 150, threshold: 150 },
    });
    expect(prepareEvidence(command, task('medication'))).toBeNull();
  });
});
