import { z } from 'zod';
import type {
  BloodPressureTargets,
  EvidenceFlag,
  EvidencePayload,
  EvidenceWrite,
  MedicationScheduleItem,
  PlanInput,
  StrengthUnit,
  TaskContext,
} from './clinical-types';
import { deriveEvidenceLevel } from './rules/evidence-level';
import {
  BP_DIASTOLIC_MAX,
  BP_DIASTOLIC_MIN,
  BP_SYSTOLIC_MAX,
  BP_SYSTOLIC_MIN,
  evaluateRules,
  type RuleFlag,
} from './rules/evaluate-rules';

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const checked = z.literal('yes').optional().transform(value => value === 'yes');
const id = z.uuid();

export const strengthUnitSchema = z.enum(['mg', 'mcg', 'g', 'iu']);

const systolicBoundMessage = `Yuqori (sistolik) bosim ${BP_SYSTOLIC_MIN} dan ${BP_SYSTOLIC_MAX} mmHg oralig‘ida bo‘lishi kerak`;
const diastolicBoundMessage = `Pastki (diastolik) bosim ${BP_DIASTOLIC_MIN} dan ${BP_DIASTOLIC_MAX} mmHg oralig‘ida bo‘lishi kerak`;
const systolicGreaterMessage = 'Yuqori bosim pastki bosimdan katta bo‘lishi kerak';

const jsonSystolicReading = z.number().int()
  .min(BP_SYSTOLIC_MIN, { message: systolicBoundMessage })
  .max(BP_SYSTOLIC_MAX, { message: systolicBoundMessage });
const jsonDiastolicReading = z.number().int()
  .min(BP_DIASTOLIC_MIN, { message: diastolicBoundMessage })
  .max(BP_DIASTOLIC_MAX, { message: diastolicBoundMessage });

const formSystolicReading = z.string().regex(/^\d{2,3}$/, { message: systolicBoundMessage })
  .transform(Number).pipe(jsonSystolicReading);
const formDiastolicReading = z.string().regex(/^\d{2,3}$/, { message: diastolicBoundMessage })
  .transform(Number).pipe(jsonDiastolicReading);

const optionalFormSystolic = z.union([z.literal('').transform(() => null), formSystolicReading]);
const optionalFormDiastolic = z.union([z.literal('').transform(() => null), formDiastolicReading]);
const optionalFormMinSystolic = z.union([z.literal('').transform(() => undefined), formSystolicReading]).optional();
const optionalFormMinDiastolic = z.union([z.literal('').transform(() => undefined), formDiastolicReading]).optional();
const optionalFormUuid = z.union([z.literal('').transform(() => undefined), id]).optional();

const dailyStepGoalField = z.string().regex(/^\d{3,5}$/).transform(Number).pipe(z.number().int().min(100).max(50000));
const jsonDailyStepGoal = z.number().int().min(100).max(50000);

export const medicationScheduleItemSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  strength: z.number().positive().max(999999).nullable().optional().default(null),
  strengthUnit: strengthUnitSchema.optional().default('mg'),
  times: z.array(time).min(1).max(2),
})
  .refine(({ name, strength }) => strength === null || /\p{L}/u.test(name), {
    path: ['name'],
    message: 'Dori kuchi ko‘rsatilganda nomida harf bo‘lishi kerak',
  })
  .refine(({ times }) => new Set(times).size === times.length, {
    path: ['times'],
    message: 'Bir xil dori uchun bir xil vaqt takrorlanmasin',
  })
  .transform(({ name, strength, strengthUnit, times }): MedicationScheduleItem => ({
    name,
    strength,
    strengthUnit,
    times: [...times].sort(),
  }));

export const medicationsScheduleSchema = z.array(medicationScheduleItemSchema)
  .min(1)
  .max(3)
  .refine((items) => {
    const names = items.map((item) => item.name.toLowerCase());
    return new Set(names).size === names.length;
  }, { message: 'Har bir dori nomi takrorlanmas bo‘lishi kerak' });

function validateTargetsOrdering(
  value: {
    maxSystolic: number;
    maxDiastolic: number;
    warnSystolic: number;
    warnDiastolic: number;
    minSystolic?: number | null;
    minDiastolic?: number | null;
  },
  ctx: z.RefinementCtx,
) {
  if (value.warnSystolic > value.maxSystolic) {
    ctx.addIssue({ code: 'custom', path: ['warnSystolic'], message: 'Kuzatuv chegarasi yuqori chegaradan oshmasligi kerak' });
  }
  if (value.warnDiastolic > value.maxDiastolic) {
    ctx.addIssue({ code: 'custom', path: ['warnDiastolic'], message: 'Kuzatuv chegarasi yuqori chegaradan oshmasligi kerak' });
  }
  if (value.maxSystolic <= value.maxDiastolic) {
    ctx.addIssue({ code: 'custom', path: ['maxSystolic'], message: systolicGreaterMessage });
  }
  if (value.warnSystolic <= value.warnDiastolic) {
    ctx.addIssue({ code: 'custom', path: ['warnSystolic'], message: systolicGreaterMessage });
  }
  const minSys = value.minSystolic ?? undefined;
  const minDia = value.minDiastolic ?? undefined;
  if (minSys !== undefined && minSys >= value.warnSystolic) {
    ctx.addIssue({ code: 'custom', path: ['minSystolic'], message: 'Past bosim chegarasi kuzatuv chegarasidan kichik bo‘lishi kerak' });
  }
  if (minDia !== undefined && minDia >= value.warnDiastolic) {
    ctx.addIssue({ code: 'custom', path: ['minDiastolic'], message: 'Past bosim chegarasi kuzatuv chegarasidan kichik bo‘lishi kerak' });
  }
  if (minSys !== undefined && minDia !== undefined && minSys <= minDia) {
    ctx.addIssue({ code: 'custom', path: ['minSystolic'], message: systolicGreaterMessage });
  }
}

function buildTargets(input: {
  maxSystolic: number;
  maxDiastolic: number;
  warnSystolic: number;
  warnDiastolic: number;
  minSystolic?: number | null;
  minDiastolic?: number | null;
}): BloodPressureTargets {
  return {
    maxSystolic: input.maxSystolic,
    maxDiastolic: input.maxDiastolic,
    warnSystolic: input.warnSystolic,
    warnDiastolic: input.warnDiastolic,
    ...(input.minSystolic !== undefined && input.minSystolic !== null ? { minSystolic: input.minSystolic } : {}),
    ...(input.minDiastolic !== undefined && input.minDiastolic !== null ? { minDiastolic: input.minDiastolic } : {}),
  };
}

function buildPlanInput({
  medications,
  vitalsTime,
  supplyFollowUp,
  dailyStepGoal,
  targets,
}: {
  medications: MedicationScheduleItem[];
  vitalsTime: string;
  supplyFollowUp: boolean;
  dailyStepGoal: number;
  targets: BloodPressureTargets;
}): PlanInput {
  const primary = medications[0]!;
  return {
    medicationName: primary.name,
    medicationStrengthMg: primary.strength,
    medicationStrengthUnit: primary.strengthUnit,
    medicationTime: primary.times[0]!,
    medications,
    vitalsTime,
    supplyFollowUp,
    dailyStepGoal,
    targets,
  };
}

export const planForm = z.strictObject({
  medicationName: z.string().trim().min(1).max(80).optional(),
  medicationStrengthMg: z.string().regex(/^\d{1,6}(?:\.\d{1,3})?$/)
    .transform(Number).pipe(z.number().positive()).optional(),
  medicationStrengthUnit: strengthUnitSchema.optional().default('mg'),
  medicationTime: time.optional(),
  medicationsJson: z.string().optional(),
  vitalsTime: time,
  maxSystolic: formSystolicReading,
  maxDiastolic: formDiastolicReading,
  warnSystolic: formSystolicReading,
  warnDiastolic: formDiastolicReading,
  minSystolic: optionalFormMinSystolic,
  minDiastolic: optionalFormMinDiastolic,
  supplyFollowUp: checked,
  dailyStepGoal: dailyStepGoalField.optional().default(3000),
}).superRefine((value, ctx) => {
  validateTargetsOrdering(value, ctx);

  if (value.medicationsJson !== undefined && value.medicationsJson.trim() !== '') {
    let raw: unknown;
    try {
      raw = JSON.parse(value.medicationsJson);
    } catch {
      ctx.addIssue({ code: 'custom', path: ['medicationsJson'], message: 'Dorilar ro‘yxati noto‘g‘ri formatda' });
      return;
    }
    const parsed = medicationsScheduleSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ code: 'custom', path: ['medicationsJson', ...issue.path], message: issue.message });
      }
    }
    return;
  }

  if (!value.medicationName) {
    ctx.addIssue({ code: 'custom', path: ['medicationName'], message: 'Dori nomi talab qilinadi' });
  } else if (value.medicationStrengthMg !== undefined && !/\p{L}/u.test(value.medicationName)) {
    ctx.addIssue({ code: 'custom', path: ['medicationName'], message: 'Dori kuchi ko‘rsatilganda nomida harf bo‘lishi kerak' });
  }
  if (!value.medicationTime) {
    ctx.addIssue({ code: 'custom', path: ['medicationTime'], message: 'Dori vaqti talab qilinadi' });
  }
}).transform((value): PlanInput => {
  const medications: MedicationScheduleItem[] =
    value.medicationsJson !== undefined && value.medicationsJson.trim() !== ''
      ? medicationsScheduleSchema.parse(JSON.parse(value.medicationsJson))
      : [{
          name: value.medicationName!,
          strength: value.medicationStrengthMg ?? null,
          strengthUnit: value.medicationStrengthUnit,
          times: [value.medicationTime!],
        }];

  return buildPlanInput({
    medications,
    vitalsTime: value.vitalsTime,
    supplyFollowUp: value.supplyFollowUp,
    dailyStepGoal: value.dailyStepGoal,
    targets: buildTargets(value),
  });
});

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
  z.strictObject({
    taskId: id,
    systolic: optionalFormSystolic,
    diastolic: optionalFormDiastolic,
    chestPain: checked,
    repeatOfEvidenceId: optionalFormUuid,
  })
    .refine(({ systolic, diastolic, chestPain }) => (
      (systolic !== null && diastolic !== null) || (chestPain && systolic === null && diastolic === null)
    ), { message: 'Qon bosimi qiymatlarini kiriting yoki ko‘krak og‘rig‘ini belgilang' })
    .refine(({ systolic, diastolic }) => (
      systolic === null || diastolic === null || systolic > diastolic
    ), { path: ['systolic'], message: systolicGreaterMessage })
    .transform(({ taskId, systolic, diastolic, chestPain, repeatOfEvidenceId }): EvidenceCommand => ({
      taskId,
      payload: {
        kind: 'vitals',
        systolic,
        diastolic,
        chestPain,
        ...(repeatOfEvidenceId ? { repeatOfEvidenceId } : {}),
      },
    })),
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
    systolic: formSystolicReading,
    diastolic: formDiastolicReading,
    chestPain: checked,
  })
    .refine(({ systolic, diastolic }) => systolic > diastolic, {
      path: ['systolic'],
      message: systolicGreaterMessage,
    })
    .transform(({ flagId, kind, systolic, diastolic, chestPain }) => ({
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

export const planJsonInput = z.strictObject({
  patientId: id.optional(),
  medications: medicationsScheduleSchema.optional(),
  medicationName: z.string().trim().min(1).max(80).optional(),
  medicationStrengthMg: z.number().positive().max(999999).nullable().optional(),
  medicationStrengthUnit: strengthUnitSchema.optional().default('mg'),
  medicationTime: time.optional(),
  vitalsTime: time,
  maxSystolic: jsonSystolicReading,
  maxDiastolic: jsonDiastolicReading,
  warnSystolic: jsonSystolicReading,
  warnDiastolic: jsonDiastolicReading,
  minSystolic: jsonSystolicReading.nullable().optional(),
  minDiastolic: jsonDiastolicReading.nullable().optional(),
  supplyFollowUp: z.boolean().optional().default(false),
  dailyStepGoal: jsonDailyStepGoal.optional().default(3000),
}).superRefine((value, ctx) => {
  validateTargetsOrdering(value, ctx);

  if (value.medications !== undefined) return;

  if (!value.medicationName) {
    ctx.addIssue({ code: 'custom', path: ['medicationName'], message: 'Dori nomi talab qilinadi' });
  } else if (
    value.medicationStrengthMg !== undefined
    && value.medicationStrengthMg !== null
    && !/\p{L}/u.test(value.medicationName)
  ) {
    ctx.addIssue({ code: 'custom', path: ['medicationName'], message: 'Dori kuchi ko‘rsatilganda nomida harf bo‘lishi kerak' });
  }
  if (!value.medicationTime) {
    ctx.addIssue({ code: 'custom', path: ['medicationTime'], message: 'Dori vaqti talab qilinadi' });
  }
}).transform((value) => {
  const medications: MedicationScheduleItem[] = value.medications ?? [{
    name: value.medicationName!,
    strength: value.medicationStrengthMg ?? null,
    strengthUnit: value.medicationStrengthUnit as StrengthUnit,
    times: [value.medicationTime!],
  }];

  return {
    patientId: value.patientId,
    plan: buildPlanInput({
      medications,
      vitalsTime: value.vitalsTime,
      supplyFollowUp: value.supplyFollowUp,
      dailyStepGoal: value.dailyStepGoal,
      targets: buildTargets(value),
    }),
  };
});

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
    systolic: jsonSystolicReading.nullable().optional().default(null),
    diastolic: jsonDiastolicReading.nullable().optional().default(null),
    chestPain: z.boolean().optional().default(false),
    repeatOfEvidenceId: id.nullable().optional(),
  })
    .refine(({ systolic, diastolic, chestPain }) => (
      (systolic !== null && diastolic !== null) || (chestPain && systolic === null && diastolic === null)
    ), { message: 'Qon bosimi qiymatlarini kiriting yoki ko‘krak og‘rig‘ini belgilang' })
    .refine(({ systolic, diastolic }) => (
      systolic === null || diastolic === null || systolic > diastolic
    ), { path: ['systolic'], message: systolicGreaterMessage })
    .transform(({ patientId, taskId, systolic, diastolic, chestPain, repeatOfEvidenceId }) => ({
      patientId,
      command: {
        taskId,
        payload: {
          kind: 'vitals',
          systolic,
          diastolic,
          chestPain,
          ...(repeatOfEvidenceId ? { repeatOfEvidenceId } : {}),
        },
      } satisfies EvidenceCommand,
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
    systolic: jsonSystolicReading,
    diastolic: jsonDiastolicReading,
    chestPain: z.boolean().optional().default(false),
  })
    .refine(({ systolic, diastolic }) => systolic > diastolic, {
      path: ['systolic'],
      message: systolicGreaterMessage,
    })
    .transform(({ patientId, flagId, kind, systolic, diastolic, chestPain }) => ({
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
