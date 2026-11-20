import { z } from 'zod';

function formInteger(min: number, max: number) {
  return z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.int().min(min).max(max));
}

export const exercisePlanForm = z.strictObject({
  targetAngle: formInteger(60, 130),
  targetReps: formInteger(1, 40),
  maxShallow: formInteger(0, 40),
  painColor: z.enum(['yellow', 'red']),
});

const degree = z.number().min(0).max(180);
const reps = z.int().min(0).max(999);
const measuredFields = {
  validReps: reps,
  shallowReps: reps,
  minAngle: degree.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  motionSignature: z.array(degree).length(20).nullable(),
  analyzedFrames: z.int().min(0).max(20000),
  patientConfirmed: z.boolean(),
};

export const exerciseInput = z.union([
  z.strictObject({ ...measuredFields, source: z.literal('uploaded_video'), fileSha256: z.string().regex(/^[a-f0-9]{64}$/i) }),
  z.strictObject({ ...measuredFields, source: z.literal('live_camera'), fileSha256: z.null() }),
  z.strictObject({ source: z.literal('self_report'), reason: z.literal('manual'), reps }),
  z.strictObject({ source: z.literal('self_report'), reason: z.literal('pain') }),
]);

export type ExercisePlan = z.infer<typeof exercisePlanForm>;
export type ExerciseInput = z.infer<typeof exerciseInput>;
