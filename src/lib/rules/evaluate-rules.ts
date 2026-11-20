import { z } from 'zod';

const bloodPressure = z.number().positive();
const bloodPressureTargets = z.strictObject({
  maxSystolic: bloodPressure,
  maxDiastolic: bloodPressure,
  warnSystolic: bloodPressure,
  warnDiastolic: bloodPressure,
}).refine((targets) => (
  targets.warnSystolic <= targets.maxSystolic && targets.warnDiastolic <= targets.maxDiastolic
), { message: 'Warning thresholds must be at or below their respective maximums' });

const scheduledDay = z.strictObject({
  date: z.iso.date(),
  status: z.enum(['taken', 'missed', 'unanswered']),
});

const ruleInput = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('vitals'),
    chest_pain: z.boolean(),
    reading: z.strictObject({
      systolic: bloodPressure,
      diastolic: bloodPressure,
      targets: bloodPressureTargets,
    }).optional(),
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
  const comparisons = [
    { color: 'red', rule_key: 'bp_max', metric: 'systolic', observed: systolic, threshold: targets.maxSystolic },
    { color: 'red', rule_key: 'bp_max', metric: 'diastolic', observed: diastolic, threshold: targets.maxDiastolic },
    { color: 'yellow', rule_key: 'bp_warning', metric: 'systolic', observed: systolic, threshold: targets.warnSystolic },
    { color: 'yellow', rule_key: 'bp_warning', metric: 'diastolic', observed: diastolic, threshold: targets.warnDiastolic },
  ] as const;

  return comparisons.find(({ observed, threshold }) => observed >= threshold) ?? null;
}
