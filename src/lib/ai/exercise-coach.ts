import { z } from 'zod';
import {
  analyzeExerciseDiagnostics,
  exerciseErrorCodeSchema,
  formMetricsSchema,
} from '../pose/diagnostics';
import { movementId } from '../pose/engine';

export const exerciseCoachRequestSchema = z.strictObject({
  movement: movementId,
  targetAngle: z.number().min(60).max(170),
  targetReps: z.int().min(1).max(40),
  maxShallow: z.int().min(0).max(40).optional().default(1),
  validReps: z.int().min(0).max(999),
  shallowReps: z.int().min(0).max(999),
  minAngle: z.number().min(0).max(180).nullable(),
  avgCycleSeconds: z.number().min(0).max(60).nullable().optional().default(null),
  interruptedCycles: z.int().min(0).max(999).optional().default(0),
  incompleteCycles: z.int().min(0).max(999).optional().default(0),
  formMetrics: formMetricsSchema.nullable().optional().default(null),
});

export type ExerciseCoachRequest = z.infer<typeof exerciseCoachRequestSchema>;

export const aiCoachPayloadSchema = z.object({
  patientAdviceUz: z.string().trim().min(10).max(600),
  focusCueUz: z.string().trim().min(5).max(200),
  doctorInsightUz: z.string().trim().min(10).max(400),
});

export const exerciseCoachResponseSchema = z.object({
  source: z.enum(['openrouter', 'deterministic_coach']),
  model: z.string(),
  formScore: z.number().int().min(0).max(100),
  severity: z.enum(['ok', 'yellow', 'red']),
  needsDoctorReview: z.boolean(),
  errorCodes: z.array(exerciseErrorCodeSchema),
  patientAdviceUz: z.string(),
  focusCueUz: z.string(),
  doctorInsightUz: z.string(),
});

export type ExerciseCoachResponse = z.infer<typeof exerciseCoachResponseSchema>;

export const publicCoachRequestSchema = z.strictObject({ sample: z.enum(['chair_stand', 'elbow_bend']) });
export const exerciseCoachInputSchema = z.union([publicCoachRequestSchema, exerciseCoachRequestSchema]);
export type PublicCoachSample = z.infer<typeof publicCoachRequestSchema>['sample'];

export function exerciseCoachAdvice(input: ExerciseCoachRequest): ExerciseCoachResponse {
  const diagnostics = analyzeExerciseDiagnostics({ ...input, reason: 'measured', painColor: 'yellow' });
  return {
    source: 'deterministic_coach', model: 'shifo-biomechanics-v2', formScore: diagnostics.formScore,
    severity: diagnostics.severity, needsDoctorReview: diagnostics.needsDoctorReview, errorCodes: diagnostics.errorCodes,
    patientAdviceUz: diagnostics.patientCoachingUz, focusCueUz: diagnostics.focusCueUz,
    doctorInsightUz: diagnostics.doctorSummaryUz,
  };
}
