import { z } from 'zod';
import type { EvidenceFlag, EvidencePayload, EvidenceWrite, PlanInput, TaskContext } from './clinical-types';
import { deriveEvidenceLevel } from './rules/evidence-level';
import { evaluateRules, type RuleFlag } from './rules/evaluate-rules';

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const positiveReading = z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.number().int().positive());
const optionalReading = z.union([z.literal('').transform(() => null), positiveReading]);
const checked = z.literal('yes').optional().transform(value => value === 'yes');
const id = z.uuid();

const dailyStepGoalField = z.string().regex(/^\d{3,5}$/).transform(Number).pipe(z.number().int().min(100).max(50000));

export const planForm = z.strictObject({
  medicationName: z.string().trim().min(1).max(80),
  medicationStrengthMg: z.string().regex(/^\d{1,6}(?:\.\d{1,3})?$/)
    .transform(Number).pipe(z.number().positive()).optional(),
  medicationTime: time,
  vitalsTime: time,
  maxSystolic: positiveReading,
  maxDiastolic: positiveReading,
  warnSystolic: positiveReading,
  warnDiastolic: positiveReading,
  supplyFollowUp: checked,
  dailyStepGoal: dailyStepGoalField.optional().default(3000),
}).refine(({ medicationName, medicationStrengthMg }) => medicationStrengthMg === undefined || /\p{L}/u.test(medicationName), {
  path: ['medicationName'],
}).refine(value => value.warnSystolic <= value.maxSystolic, { path: ['warnSystolic'] })
  .refine(value => value.warnDiastolic <= value.maxDiastolic, { path: ['warnDiastolic'] })
  .transform(({ medicationName, medicationStrengthMg, medicationTime, vitalsTime, supplyFollowUp, dailyStepGoal, ...targets }): PlanInput => ({
    medicationName, medicationStrengthMg: medicationStrengthMg ?? null, medicationTime, vitalsTime, supplyFollowUp, dailyStepGoal, targets,
  }));

type EvidenceCommand = { taskId: string; payload: EvidencePayload };

export const evidenceForm = z.union([
  z.strictObject({ taskId: id, medicationStatus: z.literal('taken') })
    .transform(({ taskId }): EvidenceCommand => ({ taskId, payload: { kind: 'medication', status: 'taken' } })),
  z.strictObject({
    taskId: id,
    medicationStatus: z.literal('missed'),
    reason: z.enum(['out_of_supply', 'side_effects', 'forgot', 'other']),
  }).transform(({ taskId, reason }): EvidenceCommand => ({
    taskId, payload: { kind: 'medication', status: 'missed', reason },
  })),
  z.strictObject({ taskId: id, systolic: optionalReading, diastolic: optionalReading, chestPain: checked })
    .refine(({ systolic, diastolic, chestPain }) => (
      (systolic !== null && diastolic !== null) || (chestPain && systolic === null && diastolic === null)
    ))
    .transform(({ taskId, ...readings }): EvidenceCommand => ({ taskId, payload: { kind: 'vitals', ...readings } })),
]);

export const reviewForm = z.strictObject({
  flagId: id,
  decision: z.enum(['approved', 'retake']),
  reply: z.string().trim().min(1).max(500),
  note: z.string().trim().max(500).optional().default(''),
});

export const followupForm = z.union([
  z.strictObject({
    flagId: id,
    kind: z.enum(['supply_resolved', 'still_need_help']),
  }).transform(({ flagId, kind }) => ({
    flagId,
    kind,
    payload: {} as Record<string, unknown>,
  })),
  z.strictObject({
    flagId: id,
    kind: z.literal('retake_vitals'),
    systolic: positiveReading,
    diastolic: positiveReading,
    chestPain: checked,
  }).transform(({ flagId, kind, systolic, diastolic, chestPain }) => ({
    flagId,
    kind,
    payload: { systolic, diastolic, chestPain } as Record<string, unknown>,
  })),
  z.strictObject({
    flagId: id,
    kind: z.literal('retake_medication'),
    medicationStatus: z.enum(['taken', 'missed']),
  }).transform(({ flagId, kind, medicationStatus }) => ({
    flagId,
    kind,
    payload: { status: medicationStatus } as Record<string, unknown>,
  })),
]);

export type FollowupInput = z.infer<typeof followupForm>;

export const followupAckForm = z.strictObject({
  followupId: id,
  note: z.string().trim().max(500).optional().default(''),
});

export type FollowupAckInput = z.infer<typeof followupAckForm>;

export const urgentSymptomForm = z.strictObject({
  symptom: z.enum(['chest_pain', 'dizziness', 'shortness_of_breath', 'severe_headache']),
  note: z.string().trim().max(300).optional().default(''),
});

export type UrgentSymptomInput = z.infer<typeof urgentSymptomForm>;

export const symptomReviewForm = z.strictObject({
  symptomId: id,
  decision: z.enum(['approved', 'retake']),
  reply: z.string().trim().min(1).max(500),
  note: z.string().trim().max(500).optional().default(''),
});

export type SymptomReviewInput = z.infer<typeof symptomReviewForm>;

const jsonPositiveReading = z.number().int().min(1).max(999);
const jsonDailyStepGoal = z.number().int().min(100).max(50000);

export const planJsonInput = z.strictObject({
  patientId: id.optional(),
  medicationName: z.string().trim().min(1).max(80),
  medicationStrengthMg: z.number().positive().max(999999).nullable().optional(),
  medicationTime: time,
  vitalsTime: time,
  maxSystolic: jsonPositiveReading,
  maxDiastolic: jsonPositiveReading,
  warnSystolic: jsonPositiveReading,
  warnDiastolic: jsonPositiveReading,
  supplyFollowUp: z.boolean().optional().default(false),
  dailyStepGoal: jsonDailyStepGoal.optional().default(3000),
}).refine(({ medicationName, medicationStrengthMg }) => medicationStrengthMg === undefined || medicationStrengthMg === null || /\p{L}/u.test(medicationName), {
  path: ['medicationName'],
}).refine(value => value.warnSystolic <= value.maxSystolic, { path: ['warnSystolic'] })
  .refine(value => value.warnDiastolic <= value.maxDiastolic, { path: ['warnDiastolic'] })
  .transform(({ patientId, medicationName, medicationStrengthMg, medicationTime, vitalsTime, supplyFollowUp, dailyStepGoal, ...targets }) => ({
    patientId,
    plan: {
      medicationName,
      medicationStrengthMg: medicationStrengthMg ?? null,
      medicationTime,
      vitalsTime,
      supplyFollowUp,
      dailyStepGoal,
      targets,
    } satisfies PlanInput,
  }));

export const evidenceJsonInput = z.union([
  z.strictObject({
    patientId: id.optional(),
    taskId: id,
    medicationStatus: z.literal('taken'),
  }).transform(({ patientId, taskId }) => ({
    patientId,
    command: { taskId, payload: { kind: 'medication', status: 'taken' } } satisfies EvidenceCommand,
  })),
  z.strictObject({
    patientId: id.optional(),
    taskId: id,
    medicationStatus: z.literal('missed'),
    reason: z.enum(['out_of_supply', 'side_effects', 'forgot', 'other']),
  }).transform(({ patientId, taskId, reason }) => ({
    patientId,
    command: { taskId, payload: { kind: 'medication', status: 'missed', reason } } satisfies EvidenceCommand,
  })),
  z.strictObject({
    patientId: id.optional(),
    taskId: id,
    systolic: jsonPositiveReading.nullable().optional().default(null),
    diastolic: jsonPositiveReading.nullable().optional().default(null),
    chestPain: z.boolean().optional().default(false),
  }).refine(({ systolic, diastolic, chestPain }) => (
    (systolic !== null && diastolic !== null) || (chestPain && systolic === null && diastolic === null)
  )).transform(({ patientId, taskId, systolic, diastolic, chestPain }) => ({
    patientId,
    command: { taskId, payload: { kind: 'vitals', systolic, diastolic, chestPain } } satisfies EvidenceCommand,
  })),
]);

export const reviewJsonInput = z.strictObject({
  patientId: id.optional(),
  flagId: id,
  decision: z.enum(['approved', 'retake']),
  reply: z.string().trim().min(1).max(500),
  note: z.string().trim().max(500).optional().default(''),
});

export const followupJsonInput = z.union([
  z.strictObject({
    patientId: id.optional(),
    flagId: id,
    kind: z.enum(['supply_resolved', 'still_need_help']),
  }).transform(({ patientId, flagId, kind }) => ({
    patientId,
    followup: {
      flagId,
      kind,
      payload: {} as Record<string, unknown>,
    } satisfies FollowupInput,
  })),
  z.strictObject({
    patientId: id.optional(),
    flagId: id,
    kind: z.literal('retake_vitals'),
    systolic: jsonPositiveReading,
    diastolic: jsonPositiveReading,
    chestPain: z.boolean().optional().default(false),
  }).transform(({ patientId, flagId, kind, systolic, diastolic, chestPain }) => ({
    patientId,
    followup: {
      flagId,
      kind,
      payload: { systolic, diastolic, chestPain } as Record<string, unknown>,
    } satisfies FollowupInput,
  })),
  z.strictObject({
    patientId: id.optional(),
    flagId: id,
    kind: z.literal('retake_medication'),
    medicationStatus: z.enum(['taken', 'missed']),
  }).transform(({ patientId, flagId, kind, medicationStatus }) => ({
    patientId,
    followup: {
      flagId,
      kind,
      payload: { status: medicationStatus } as Record<string, unknown>,
    } satisfies FollowupInput,
  })),
]);

export const followupAckJsonInput = z.strictObject({
  patientId: id.optional(),
  followupId: id,
  note: z.string().trim().max(500).optional().default(''),
});

export const urgentSymptomJsonInput = z.strictObject({
  patientId: id.optional(),
  symptom: z.enum(['chest_pain', 'dizziness', 'shortness_of_breath', 'severe_headache']),
  note: z.string().trim().max(300).optional().default(''),
});

export const symptomReviewJsonInput = z.strictObject({
  patientId: id.optional(),
  symptomId: id,
  decision: z.enum(['approved', 'retake']),
  reply: z.string().trim().min(1).max(500),
  note: z.string().trim().max(500).optional().default(''),
});

function asEvidenceFlag(rule: RuleFlag | null): EvidenceFlag | null {
  if (!rule) return null;
  const { rule_key: ruleKey, ...details } = rule;
  return { ruleKey, ...details };
}

export function prepareEvidence(command: EvidenceCommand, task: TaskContext): EvidenceWrite | null {
  const { taskId, payload } = command;
  if (payload.kind !== task.type) return null;

  const source = 'self_report';
  const aiMode = payload.kind === 'medication' ? 'none' : 'manual';
  const assessment = deriveEvidenceLevel({ source, ai_mode: aiMode });
  if (assessment.status !== 'accepted' || assessment.level !== 0) return null;

  if (payload.kind === 'medication') {
    const supplyReport = payload.status === 'missed' && payload.reason === 'out_of_supply' && task.plan.supplyFollowUp;
    const flag = supplyReport ? { color: 'yellow', ruleKey: 'medication_out_of_supply' } as const : asEvidenceFlag(evaluateRules({
      kind: 'medication_adherence', date: task.date, status: payload.status,
      previous_scheduled_day: task.previousMedication ?? undefined,
    }));
    return { taskId, payload, level: assessment.level, source, aiMode, flag };
  }

  const { systolic, diastolic, chestPain } = payload;
  const reading = systolic !== null && diastolic !== null
    ? { systolic, diastolic, targets: task.plan.targets }
    : undefined;
  const flag = asEvidenceFlag(evaluateRules({ kind: 'vitals', chest_pain: chestPain, reading }));
  return { taskId, payload, level: assessment.level, source, aiMode, flag };
}
