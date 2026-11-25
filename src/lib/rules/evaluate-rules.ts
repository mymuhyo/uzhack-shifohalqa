import { z } from 'zod';

export const BP_SYSTOLIC_MIN = 50;
export const BP_SYSTOLIC_MAX = 260;
export const BP_DIASTOLIC_MIN = 30;
export const BP_DIASTOLIC_MAX = 160;

const systolicPressure = z.number().min(BP_SYSTOLIC_MIN).max(BP_SYSTOLIC_MAX);
const diastolicPressure = z.number().min(BP_DIASTOLIC_MIN).max(BP_DIASTOLIC_MAX);

const bloodPressureTargets = z.strictObject({
  maxSystolic: systolicPressure,
  maxDiastolic: diastolicPressure,
  warnSystolic: systolicPressure,
  warnDiastolic: diastolicPressure,
  minSystolic: systolicPressure.optional(),
  minDiastolic: diastolicPressure.optional(),
}).refine((targets) => (
  targets.warnSystolic <= targets.maxSystolic && targets.warnDiastolic <= targets.maxDiastolic
), { message: 'Warning thresholds must be at or below their respective maximums' })
  .refine((targets) => (
    targets.minSystolic === undefined || targets.minSystolic < targets.warnSystolic
  ), { path: ['minSystolic'], message: 'Low systolic threshold must be below warning systolic threshold' })
  .refine((targets) => (
    targets.minDiastolic === undefined || targets.minDiastolic < targets.warnDiastolic
  ), { path: ['minDiastolic'], message: 'Low diastolic threshold must be below warning diastolic threshold' })
  .refine((targets) => (
    targets.minSystolic === undefined || targets.minDiastolic === undefined || targets.minSystolic > targets.minDiastolic
  ), { path: ['minSystolic'], message: 'Low systolic threshold must be greater than low diastolic threshold' });

const scheduledDay = z.strictObject({
  date: z.iso.date(),
  status: z.enum(['taken', 'missed', 'unanswered']),
});

const bpReading = z.strictObject({
  systolic: systolicPressure,
  diastolic: diastolicPressure,
  targets: bloodPressureTargets,
}).refine((reading) => reading.systolic > reading.diastolic, {
  path: ['systolic'],
  message: 'Systolic blood pressure must be greater than diastolic blood pressure',
});

const ruleInput = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('vitals'),
    chest_pain: z.boolean(),
    reading: bpReading.optional(),
  }),
  scheduledDay.extend({
    kind: z.literal('medication_adherence'),
    previous_scheduled_day: scheduledDay.optional(),
  }).refine((day) => (
    !day.previous_scheduled_day || day.previous_scheduled_day.date < day.date
  ), { path: ['previous_scheduled_day', 'date'], message: 'Expected an earlier scheduled date' }),
]);

export type RuleInput = z.infer<typeof ruleInput>;

export type RuleFlag =
  | { color: 'red'; rule_key: 'chest_pain' }
  | { color: 'yellow'; rule_key: 'medication_missed_consecutive_days' }
  | {
      color: 'red';
      rule_key: 'bp_low';
      metric: 'systolic' | 'diastolic';
      observed: number;
      threshold: number;
    }
  | {
      color: 'red' | 'yellow';
      rule_key: 'bp_max' | 'bp_warning';
      metric: 'systolic' | 'diastolic';
      observed: number;
      threshold: number;
    };

/** Evaluate a checked, server-assembled event against the patient's current plan. */
export function evaluateRules(input: unknown): RuleFlag | null {
  const event = ruleInput.parse(input);

  if (event.kind === 'medication_adherence') {
    if (event.status === 'missed' && event.previous_scheduled_day?.status === 'missed') {
      return { color: 'yellow', rule_key: 'medication_missed_consecutive_days' };
    }
    return null;
  }

  if (event.chest_pain) return { color: 'red', rule_key: 'chest_pain' };
  if (!event.reading) return null;

  const { systolic, diastolic, targets } = event.reading;

  // 1. Red high BP (severe hypertension)
  if (systolic >= targets.maxSystolic) {
    return { color: 'red', rule_key: 'bp_max', metric: 'systolic', observed: systolic, threshold: targets.maxSystolic };
  }
  if (diastolic >= targets.maxDiastolic) {
    return { color: 'red', rule_key: 'bp_max', metric: 'diastolic', observed: diastolic, threshold: targets.maxDiastolic };
  }

  // 2. Red low BP (severe hypotension)
  if (targets.minSystolic !== undefined && systolic < targets.minSystolic) {
    return { color: 'red', rule_key: 'bp_low', metric: 'systolic', observed: systolic, threshold: targets.minSystolic };
  }
  if (targets.minDiastolic !== undefined && diastolic < targets.minDiastolic) {
    return { color: 'red', rule_key: 'bp_low', metric: 'diastolic', observed: diastolic, threshold: targets.minDiastolic };
  }

  // 3. Yellow warning high BP
  if (systolic >= targets.warnSystolic) {
    return { color: 'yellow', rule_key: 'bp_warning', metric: 'systolic', observed: systolic, threshold: targets.warnSystolic };
  }
  if (diastolic >= targets.warnDiastolic) {
    return { color: 'yellow', rule_key: 'bp_warning', metric: 'diastolic', observed: diastolic, threshold: targets.warnDiastolic };
  }

  return null;
}
