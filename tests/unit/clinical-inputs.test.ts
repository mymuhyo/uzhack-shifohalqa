import { describe, expect, it } from 'vitest';
import {
  evidenceForm,
  evidenceJsonInput,
  followupForm,
  planForm,
  planJsonInput,
  prepareEvidence,
  reviewForm,
} from '../../src/lib/clinical-inputs';
import type { TaskContext } from '../../src/lib/clinical-types';

const taskId = 'dd258aab-cb21-403d-a4d0-4b8799e35673';
const repeatEvidenceId = 'ee258aab-cb21-403d-a4d0-4b8799e35674';
const values = {
  medicationName: 'Namuna dori', medicationTime: '08:00', vitalsTime: '09:00',
  warnSystolic: '135', warnDiastolic: '85', maxSystolic: '150', maxDiastolic: '95',
};

function task(type: TaskContext['type'], supplyFollowUp = false, extra?: Record<string, string>): TaskContext {
  return {
    type, date: '2026-11-20', previousMedication: null,
    plan: planForm.parse({ ...values, ...(supplyFollowUp ? { supplyFollowUp: 'yes' } : {}), ...extra }),
  };
}

describe('clinical forms', () => {
  it('parses the actual plan targets and explicitly selected follow-up', () => {
    expect(planForm.parse({ ...values, supplyFollowUp: 'yes' })).toMatchObject({
      medicationTime: '08:00', supplyFollowUp: true, dailyStepGoal: 3000, targets: { warnDiastolic: 85, maxSystolic: 150 },
    });
    expect(planForm.parse({ ...values, dailyStepGoal: '4500' }).dailyStepGoal).toBe(4500);
    expect(planForm.safeParse({ ...values, dailyStepGoal: '50' }).success).toBe(false);
    expect(planForm.parse(values).supplyFollowUp).toBe(false);
  });

  it('requires a medication name with a letter for new box-strength plans', () => {
    expect(planForm.safeParse({ ...values, medicationName: '123', medicationStrengthMg: '5' }).success).toBe(false);
    expect(planForm.parse({ ...values, medicationName: '123' }).medicationStrengthMg).toBeNull();
    expect(planForm.parse({ ...values, medicationStrengthMg: '2.5' }).medicationStrengthMg).toBe(2.5);
  });

  it('supports multi-drug schedules (1-3 distinct drugs, 1-2 times, mg/mcg/g/iu) and low BP targets', () => {
    const parsed = planJsonInput.parse({
      medications: [
        { name: 'Amlodipin', strength: 5, strengthUnit: 'mg', times: ['20:00', '08:00'] },
        { name: 'Levotiroksin', strength: 50, strengthUnit: 'mcg', times: ['07:00'] },
        { name: 'Vitamin D3', strength: 2000, strengthUnit: 'iu', times: ['13:00'] },
      ],
      vitalsTime: '09:00',
      warnSystolic: 135,
      warnDiastolic: 85,
      maxSystolic: 150,
      maxDiastolic: 95,
      minSystolic: 90,
      minDiastolic: 60,
      supplyFollowUp: true,
    });

    expect(parsed.plan).toMatchObject({
      medicationName: 'Amlodipin',
      medicationStrengthMg: 5,
      medicationStrengthUnit: 'mg',
      medicationTime: '08:00',
      targets: { maxSystolic: 150, maxDiastolic: 95, warnSystolic: 135, warnDiastolic: 85, minSystolic: 90, minDiastolic: 60 },
    });
    expect(parsed.plan.medications).toEqual([
      { name: 'Amlodipin', strength: 5, strengthUnit: 'mg', times: ['08:00', '20:00'] },
      { name: 'Levotiroksin', strength: 50, strengthUnit: 'mcg', times: ['07:00'] },
      { name: 'Vitamin D3', strength: 2000, strengthUnit: 'iu', times: ['13:00'] },
    ]);

    // Rejects >3 drugs, >2 times, duplicate drug names (case-insensitive), duplicate times, invalid unit
    expect(planJsonInput.safeParse({
      medications: [
        { name: 'Dori A', times: ['08:00'] },
        { name: 'Dori B', times: ['09:00'] },
        { name: 'Dori C', times: ['10:00'] },
        { name: 'Dori D', times: ['11:00'] },
      ],
      vitalsTime: '09:00', warnSystolic: 135, warnDiastolic: 85, maxSystolic: 150, maxDiastolic: 95,
    }).success).toBe(false);

    expect(planJsonInput.safeParse({
      medications: [{ name: 'Amlodipin', strength: 5, strengthUnit: 'mg', times: ['08:00', '14:00', '20:00'] }],
      vitalsTime: '09:00', warnSystolic: 135, warnDiastolic: 85, maxSystolic: 150, maxDiastolic: 95,
    }).success).toBe(false);

    expect(planJsonInput.safeParse({
      medications: [
        { name: 'Amlodipin', times: ['08:00'] },
        { name: 'amlodipin', times: ['20:00'] },
      ],
      vitalsTime: '09:00', warnSystolic: 135, warnDiastolic: 85, maxSystolic: 150, maxDiastolic: 95,
    }).success).toBe(false);

    expect(planJsonInput.safeParse({
      medications: [{ name: 'Amlodipin', times: ['08:00', '08:00'] }],
      vitalsTime: '09:00', warnSystolic: 135, warnDiastolic: 85, maxSystolic: 150, maxDiastolic: 95,
    }).success).toBe(false);

    expect(planJsonInput.safeParse({
      medications: [{ name: 'Amlodipin', strength: 5, strengthUnit: 'ml', times: ['08:00'] }],
      vitalsTime: '09:00', warnSystolic: 135, warnDiastolic: 85, maxSystolic: 150, maxDiastolic: 95,
    }).success).toBe(false);
  });

  it.each([{ vitalsTime: '24:00' }, { warnDiastolic: '100' }, { maxSystolic: '' }, { minSystolic: '135' }])(
    'rejects invalid plan fields %o', (entry) => {
      expect(planForm.safeParse({ ...values, ...entry }).success).toBe(false);
    },
  );

  it('requires a reason for a missed medication and rejects a caller-supplied level', () => {
    expect(evidenceForm.safeParse({ taskId, medicationStatus: 'missed' }).success).toBe(false);
    expect(evidenceForm.safeParse({ taskId, medicationStatus: 'taken', level: '4' }).success).toBe(false);
  });

  it('requires a usable BP reading or a specific chest pain report and rejects non-physiological BP', () => {
    expect(evidenceForm.safeParse({ taskId, systolic: '', diastolic: '' }).success).toBe(false);
    expect(evidenceForm.safeParse({ taskId, systolic: '150', diastolic: '', chestPain: 'yes' }).success).toBe(false);
    expect(evidenceForm.safeParse({ taskId, systolic: '80', diastolic: '90' }).success).toBe(false);
    expect(evidenceForm.safeParse({ taskId, systolic: '45', diastolic: '35' }).success).toBe(false);
    expect(evidenceForm.safeParse({ taskId, systolic: '270', diastolic: '110' }).success).toBe(false);
    expect(evidenceForm.safeParse({ taskId, systolic: '120', diastolic: '25' }).success).toBe(false);
    expect(followupForm.safeParse({ flagId: taskId, kind: 'retake_vitals', systolic: '90', diastolic: '95' }).success).toBe(false);

    expect(evidenceForm.parse({ taskId, systolic: '', diastolic: '', chestPain: 'yes' }).payload).toEqual({
      kind: 'vitals', systolic: null, diastolic: null, chestPain: true,
    });
    expect(evidenceJsonInput.parse({
      taskId, systolic: 128, diastolic: 82, chestPain: false, repeatOfEvidenceId: repeatEvidenceId,
    }).command.payload).toEqual({
      kind: 'vitals', systolic: 128, diastolic: 82, chestPain: false, repeatOfEvidenceId: repeatEvidenceId,
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

  it('flags high and low BP from the plan and keeps the actual values', () => {
    const highCommand = evidenceForm.parse({ taskId, systolic: '150', diastolic: '80' });
    expect(prepareEvidence(highCommand, task('vitals'))).toMatchObject({
      level: 0, source: 'self_report', aiMode: 'manual',
      flag: { color: 'red', ruleKey: 'bp_max', metric: 'systolic', observed: 150, threshold: 150 },
    });
    expect(prepareEvidence(highCommand, task('medication'))).toBeNull();

    const lowCommand = evidenceForm.parse({ taskId, systolic: '84', diastolic: '56' });
    expect(prepareEvidence(lowCommand, task('vitals', false, { minSystolic: '90', minDiastolic: '60' }))).toMatchObject({
      level: 0, source: 'self_report', aiMode: 'manual',
      flag: { color: 'red', ruleKey: 'bp_low', metric: 'systolic', observed: 84, threshold: 90 },
    });
  });
});
