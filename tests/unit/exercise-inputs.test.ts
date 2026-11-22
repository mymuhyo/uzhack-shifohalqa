import { describe, expect, it } from 'vitest';
import { exerciseInput, exercisePlanForm, mobileExerciseInput } from '../../src/lib/exercise-inputs';

const plan = { targetAngle: '100', targetReps: '5', maxShallow: '1', painColor: 'yellow' };
const legacy = {
  clientAttemptId: 'db4279bf-66dc-4e27-b322-b9b2323fc7cb',
  prescriptionId: '5be470ca-6ef0-4903-a573-aaede875d22d',
  scheduledDate: '2026-11-22',
  evidence: { source: 'self_report', reason: 'pain' },
};

describe('exercise extensions', () => {
  it('adds the requested movement to the plan and defaults older prescriptions to chair stand', () => {
    expect(exercisePlanForm.parse(plan)).toMatchObject({ movement: 'chair_stand' });
    expect(exercisePlanForm.parse({ ...plan, movement: 'seated_knee_ext', targetAngle: '160' })).toMatchObject({ movement: 'seated_knee_ext' });
    expect(exercisePlanForm.safeParse({ ...plan, targetAngle: '160' }).success).toBe(false);
  });

  it('preserves the serialized legacy mobile receipt and only accepts declared movement and fields', () => {
    expect(JSON.stringify(mobileExerciseInput.parse(legacy))).toBe(JSON.stringify(legacy));
    expect(mobileExerciseInput.parse({ ...legacy, evidence: { ...legacy.evidence, movement: 'elbow_bend' } }).evidence).toMatchObject({ movement: 'elbow_bend' });
    expect(exerciseInput.safeParse({ ...legacy.evidence, movement: 'unsupported' }).success).toBe(false);
    expect(exerciseInput.safeParse({ ...legacy.evidence, video: 'private' }).success).toBe(false);
  });
});
