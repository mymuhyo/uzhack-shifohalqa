import { z } from 'zod';
import { exerciseCatalog, formMetricsSchema } from './pose/diagnostics';
import { movementId } from './pose/engine';

function formInteger(min: number, max: number) {
  return z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.int().min(min).max(max));
}

export const exercisePlanForm = z.strictObject({
  movement: movementId.default('chair_stand'),
  targetAngle: formInteger(60, 170),
  targetReps: formInteger(1, 40),
  maxShallow: formInteger(0, 40),
  painColor: z.enum(['yellow', 'red']),
}).refine(({ movement, targetAngle }) => {
  const { min, max } = exerciseCatalog[movement].angleBounds;
  return targetAngle >= min && targetAngle <= max;
}, { path: ['targetAngle'] });

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
  movement: movementId.optional(),
  avgCycleSeconds: z.number().min(0).max(60).nullable().optional(),
  interruptedCycles: z.int().min(0).max(999).optional(),
  incompleteCycles: z.int().min(0).max(999).optional(),
  formMetrics: formMetricsSchema.strict().nullable().optional(),
};

const liveCamera = z.strictObject({ ...measuredFields, source: z.literal('live_camera'), fileSha256: z.null() });
const manual = z.strictObject({ source: z.literal('self_report'), reason: z.literal('manual'), reps, movement: movementId.optional() });
const pain = z.strictObject({ source: z.literal('self_report'), reason: z.literal('pain'), movement: movementId.optional() });

const uploadedVideo = z.strictObject({
  ...measuredFields, source: z.literal('uploaded_video'), fileSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});
export const exerciseInput = z.union([uploadedVideo, liveCamera, manual, pain]);

const confirmedMeasurement = {
  patientConfirmed: z.literal(true), analyzedFrames: z.int().min(5).max(20_000),
};
const countedARep = ({ validReps, shallowReps }: { validReps: number; shallowReps: number }) =>
  validReps + shallowReps > 0;

export const mobileExerciseInput = z.strictObject({
  clientAttemptId: z.uuid(),
  prescriptionId: z.uuid(),
  scheduledDate: z.iso.date(),
  evidence: z.union([
    liveCamera.extend(confirmedMeasurement).refine(countedARep),
    uploadedVideo.extend(confirmedMeasurement).refine(countedARep),
    manual, pain,
  ]),
});

export const exerciseReviewForm = z.strictObject({
  attemptId: z.uuid(),
  decision: z.enum(['reviewed', 'retake']),
  reply: z.string().trim().min(1).max(500),
});

export type MobileExerciseInput = z.infer<typeof mobileExerciseInput>;
export type ExerciseReview = z.infer<typeof exerciseReviewForm>;

export type ExercisePlan = z.infer<typeof exercisePlanForm>;
export type ExerciseInput = z.infer<typeof exerciseInput>;
