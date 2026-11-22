import { describe, expect, it } from 'vitest';
import { analyzeExerciseDiagnostics } from '../../src/lib/pose/diagnostics';

const base = {
  movement: 'chair_stand' as const,
  reason: 'measured' as const,
  targetAngle: 100,
  targetReps: 5,
  maxShallow: 1,
  painColor: 'yellow' as const,
  validReps: 5,
  shallowReps: 0,
  minAngle: 90,
  avgCycleSeconds: 2.5,
  interruptedCycles: 0,
  incompleteCycles: 0,
  similarMotion: false,
  sample: false,
};

describe('analyzeExerciseDiagnostics', () => {
  it('returns ok coaching when reps, range, and cadence match targets', () => {
    const diag = analyzeExerciseDiagnostics(base);
    expect(diag.errorCodes).toEqual([]);
    expect(diag.severity).toBe('ok');
    expect(diag.needsDoctorReview).toBe(false);
    expect(diag.patientCoachingUz).toContain('5 ta to‘liq harakat');
  });

  it('flags pain immediately with prescribed painColor and safety guidance', () => {
    const diag = analyzeExerciseDiagnostics({
      ...base,
      reason: 'pain',
      painColor: 'red',
      validReps: null,
      shallowReps: null,
      minAngle: null,
    });
    expect(diag.errorCodes).toEqual(['pain_reported']);
    expect(diag.severity).toBe('red');
    expect(diag.needsDoctorReview).toBe(true);
    expect(diag.patientCoachingUz).toContain('103');
  });

  it('flags shallow reps exceeding maxShallow and explains target angle', () => {
    const diag = analyzeExerciseDiagnostics({
      ...base,
      validReps: 3,
      shallowReps: 2,
      minAngle: 122,
    });
    expect(diag.errorCodes).toContain('shallow_range');
    expect(diag.errorCodes).toContain('below_target_reps');
    expect(diag.severity).toBe('yellow');
    expect(diag.needsDoctorReview).toBe(true);
    expect(diag.patientCoachingUz).toContain('100°');
    expect(diag.patientCoachingUz).toContain('122°');
  });

  it('detects too fast, too slow, and interrupted cycles', () => {
    const fast = analyzeExerciseDiagnostics({ ...base, avgCycleSeconds: 0.9, interruptedCycles: 1 });
    expect(fast.errorCodes).toContain('too_fast');
    expect(fast.errorCodes).toContain('interrupted_tracking');
    expect(fast.patientCoachingUz).toContain('juda tez');

    const slow = analyzeExerciseDiagnostics({ ...base, avgCycleSeconds: 7.2 });
    expect(slow.errorCodes).toContain('too_slow');
  });

  it('penalizes posture compensation errors and escalates to doctor review', () => {
    const diag = analyzeExerciseDiagnostics({
      ...base,
      movement: 'chair_stand',
      formMetrics: {
        trunkLeanMaxDeg: 42,
        compensationCycles: 2,
        tempoSpreadSeconds: 3.1,
      },
    });
    expect(diag.errorCodes).toContain('trunk_lean');
    expect(diag.errorCodes).toContain('tempo_irregular');
    expect(diag.severity).toBe('yellow');
    expect(diag.needsDoctorReview).toBe(true);
    expect(diag.formScore).toBeLessThan(80);
    expect(diag.focusCueUz).toContain('Gavdani tik tutib');

    const elbowDiag = analyzeExerciseDiagnostics({
      ...base,
      movement: 'elbow_bend',
      formMetrics: { elbowDriftMaxDeg: 44, compensationCycles: 1 },
    });
    expect(elbowDiag.errorCodes).toContain('elbow_drift');
    expect(elbowDiag.needsDoctorReview).toBe(true);

    const shoulderDiag = analyzeExerciseDiagnostics({
      ...base,
      movement: 'shoulder_raise',
      targetAngle: 90,
      minAngle: 95,
      formMetrics: { shoulderTiltMaxDeg: 18, compensationCycles: 1 },
    });
    expect(shoulderDiag.errorCodes).toContain('shoulder_asymmetry');
    expect(shoulderDiag.needsDoctorReview).toBe(true);
  });
});
