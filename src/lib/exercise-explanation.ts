import { z } from 'zod';
import { fallbackAiProvider } from './ai-provider';
import type { videoObservation } from './exercise-analysis';
import type { MeasuredCycle } from './pose/engine';

const exerciseComparison = z.enum(['pose_only', 'video_unclear', 'no_cycles', 'count_differs', 'time_differs', 'match']);
export type ExerciseComparison = z.infer<typeof exerciseComparison>;
export const exerciseExplanationRequest = z.strictObject({ comparison: exerciseComparison });

export const exerciseExplanationText = z.strictObject({ summary: z.string().trim().min(1).max(360) });
export const exerciseExplanation = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('explained'), model: z.string().min(1), provider: fallbackAiProvider.optional(), ...exerciseExplanationText.shape }),
  z.strictObject({ status: z.literal('unavailable') }),
]);
export type ExerciseExplanation = z.infer<typeof exerciseExplanation>;

export function compareExerciseObservations(
  cycles: readonly Pick<MeasuredCycle, 'fromMs' | 'toMs'>[],
  observation?: z.infer<typeof videoObservation>,
): { comparison: ExerciseComparison; alignedCycles: number } {
  if (!observation) return { comparison: 'pose_only', alignedCycles: 0 };
  if (observation.view === 'unclear') return { comparison: 'video_unclear', alignedCycles: 0 };
  const { seatedAtSeconds } = observation;
  const alignedCycles = cycles.filter(({ fromMs, toMs }) =>
    seatedAtSeconds.some(time => time * 1000 >= fromMs && time * 1000 <= toMs),
  ).length;
  if (cycles.length !== seatedAtSeconds.length) return { comparison: 'count_differs', alignedCycles };
  if (cycles.length === 0) return { comparison: 'no_cycles', alignedCycles };
  return { comparison: alignedCycles === cycles.length ? 'match' : 'time_differs', alignedCycles };
}
