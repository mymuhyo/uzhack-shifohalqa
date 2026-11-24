import { z } from 'zod';

export const maximumDailySteps = 999_999;
export const defaultDailyStepGoal = 3000;
export const stepCountSchema = z.int().min(0).max(maximumDailySteps);
export const stepSourceSchema = z.enum(['self_report', 'device_sensor', 'demo_sim']);
export type StepSource = z.infer<typeof stepSourceSchema>;

export const stepsForm = z.strictObject({
  steps: z.string().regex(/^\d{1,6}$/).transform(Number).pipe(stepCountSchema),
});

export const mobileStepsInputSchema = z.strictObject({
  count: stepCountSchema,
  source: stepSourceSchema.default('device_sensor'),
});
export type MobileStepsInput = z.infer<typeof mobileStepsInputSchema>;

export const stepsJsonInput = z.strictObject({
  steps: stepCountSchema.optional(),
  count: stepCountSchema.optional(),
  source: stepSourceSchema.optional(),
}).refine((value) => value.steps !== undefined || value.count !== undefined, {
  path: ['count'],
}).transform((value) => ({
  count: (value.count ?? value.steps)!,
  source: value.source ?? ('self_report' as const),
}));

export const dueAdherenceUnitSchema = z.object({
  planItemId: z.string(),
  scheduledDate: z.iso.date(),
  status: z.enum(['pending', 'taken', 'missed', 'recorded']).nullable(),
});

export type DueAdherenceUnit = z.infer<typeof dueAdherenceUnitSchema>;
export type AdherenceCounts = { scheduled: number; completed: number; answered: number };

function countUnit(counts: AdherenceCounts, status: DueAdherenceUnit['status']) {
  counts.scheduled += 1;
  if (status === 'taken' || status === 'recorded') counts.completed += 1;
  if (status !== null && status !== 'pending') counts.answered += 1;
}

export function calculateAdherence(units: readonly DueAdherenceUnit[], today: string) {
  const todayCounts = { scheduled: 0, completed: 0, answered: 0 };
  const week = { scheduled: 0, completed: 0, answered: 0 };
  const counted = new Set<string>();

  for (const unit of units) {
    const key = `${unit.planItemId}/${unit.scheduledDate}`;
    if (counted.has(key)) continue;
    counted.add(key);

    countUnit(week, unit.status);
    if (unit.scheduledDate === today) countUnit(todayCounts, unit.status);
  }

  return { today: todayCounts, week };
}
