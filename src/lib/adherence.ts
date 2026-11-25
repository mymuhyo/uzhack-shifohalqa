import { z } from 'zod';
import type { StrengthUnit } from './clinical-types';

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

export type DueMedicationAdherenceUnit = DueAdherenceUnit & {
  title: string;
  dueTime: string;
  type?: 'medication' | 'vitals';
  strength?: number | null;
  strengthUnit?: StrengthUnit;
  sortOrder?: number;
};

export type MedicationAdherenceCounts = {
  scheduled: number;
  taken: number;
  missed: number;
  unanswered: number;
  answered: number;
};

export type MedicationAdherenceBreakdown = {
  medicationName: string;
  strength: number | null;
  strengthUnit: StrengthUnit;
  times: string[];
  today: MedicationAdherenceCounts;
  week: MedicationAdherenceCounts;
};

export const stepEntrySchema = z.object({
  date: z.iso.date(),
  count: stepCountSchema,
  level: z.literal(0),
  source: stepSourceSchema,
  aiMode: z.literal('manual'),
  updatedAt: z.iso.datetime(),
});
export type StepEntry = z.infer<typeof stepEntrySchema>;

export type DailyStepReading = {
  count: number;
  level: 0;
  source: StepSource;
  aiMode: 'manual';
  updatedAt: string;
};

export type DailyStepsBySource = {
  deviceSensor: DailyStepReading | null;
  selfReport: DailyStepReading | null;
  demoSim: DailyStepReading | null;
};

export type DailyStepTrendPoint = DailyStepsBySource & {
  date: string;
  effectiveCount: number | null;
  effectiveSource: StepSource | null;
};

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

function emptyMedicationCounts(): MedicationAdherenceCounts {
  return { scheduled: 0, taken: 0, missed: 0, unanswered: 0, answered: 0 };
}

function countMedicationUnit(counts: MedicationAdherenceCounts, status: DueAdherenceUnit['status']) {
  counts.scheduled += 1;
  if (status === 'taken') {
    counts.taken += 1;
    counts.answered += 1;
  } else if (status === 'missed') {
    counts.missed += 1;
    counts.answered += 1;
  } else {
    counts.unanswered += 1;
  }
}

export function calculateMedicationAdherence(
  units: readonly DueMedicationAdherenceUnit[],
  today: string,
): MedicationAdherenceBreakdown[] {
  const counted = new Set<string>();
  const groups = new Map<string, MedicationAdherenceBreakdown>();

  for (const unit of units) {
    if (unit.type !== 'medication') continue;
    const dedupeKey = `${unit.planItemId}/${unit.scheduledDate}`;
    if (counted.has(dedupeKey)) continue;
    counted.add(dedupeKey);

    const medKey = unit.title.trim().toLowerCase();
    let group = groups.get(medKey);
    if (!group) {
      group = {
        medicationName: unit.title,
        strength: unit.strength ?? null,
        strengthUnit: unit.strengthUnit ?? 'mg',
        times: [],
        today: emptyMedicationCounts(),
        week: emptyMedicationCounts(),
      };
      groups.set(medKey, group);
    }
    if (!group.times.includes(unit.dueTime)) {
      group.times.push(unit.dueTime);
      group.times.sort();
    }

    countMedicationUnit(group.week, unit.status);
    if (unit.scheduledDate === today) {
      countMedicationUnit(group.today, unit.status);
    }
  }

  return [...groups.values()];
}

function shiftIsoDate(isoDate: string, deltaDays: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day! + deltaDays));
  return utc.toISOString().slice(0, 10);
}

export function pickPreferredStepReading(
  bySource: DailyStepsBySource,
  isDemo = false,
): DailyStepReading | null {
  if (bySource.deviceSensor) return bySource.deviceSensor;
  if (bySource.selfReport) return bySource.selfReport;
  if (isDemo && bySource.demoSim) return bySource.demoSim;
  return null;
}

export function buildSevenDayStepTrend(
  entries: readonly StepEntry[],
  today: string,
  options?: { isDemo?: boolean },
): DailyStepTrendPoint[] {
  const isDemo = options?.isDemo === true;
  const byDate = new Map<string, DailyStepsBySource>();

  for (const entry of entries) {
    if (entry.source === 'demo_sim' && !isDemo) continue;
    let bucket = byDate.get(entry.date);
    if (!bucket) {
      bucket = { deviceSensor: null, selfReport: null, demoSim: null };
      byDate.set(entry.date, bucket);
    }
    const reading: DailyStepReading = {
      count: entry.count,
      level: entry.level,
      source: entry.source,
      aiMode: entry.aiMode,
      updatedAt: entry.updatedAt,
    };
    if (entry.source === 'device_sensor') bucket.deviceSensor = reading;
    else if (entry.source === 'self_report') bucket.selfReport = reading;
    else if (entry.source === 'demo_sim') bucket.demoSim = reading;
  }

  const trend: DailyStepTrendPoint[] = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const date = shiftIsoDate(today, offset);
    const bucket = byDate.get(date) ?? { deviceSensor: null, selfReport: null, demoSim: null };
    const preferred = pickPreferredStepReading(bucket, isDemo);
    trend.push({
      date,
      effectiveCount: preferred?.count ?? null,
      effectiveSource: preferred?.source ?? null,
      deviceSensor: bucket.deviceSensor,
      selfReport: bucket.selfReport,
      demoSim: isDemo ? bucket.demoSim : null,
    });
  }
  return trend;
}
