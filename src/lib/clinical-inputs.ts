import { z } from 'zod';
import type { EvidenceFlag, EvidencePayload, EvidenceWrite, PlanInput, TaskContext } from './clinical-types';
import { deriveEvidenceLevel } from './rules/evidence-level';
import { evaluateRules, type RuleFlag } from './rules/evaluate-rules';

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const positiveReading = z.string().regex(/^\d{1,3}$/).transform(Number).pipe(z.number().int().positive());
const optionalReading = z.union([z.literal('').transform(() => null), positiveReading]);
const checked = z.literal('yes').optional().transform(value => value === 'yes');
const id = z.uuid();

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
}).refine(({ medicationName, medicationStrengthMg }) => medicationStrengthMg === undefined || /\p{L}/u.test(medicationName), {
  path: ['medicationName'],
}).refine(value => value.warnSystolic <= value.maxSystolic, { path: ['warnSystolic'] })
  .refine(value => value.warnDiastolic <= value.maxDiastolic, { path: ['warnDiastolic'] })
  .transform(({ medicationName, medicationStrengthMg, medicationTime, vitalsTime, supplyFollowUp, ...targets }): PlanInput => ({
    medicationName, medicationStrengthMg: medicationStrengthMg ?? null, medicationTime, vitalsTime, supplyFollowUp, targets,
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
