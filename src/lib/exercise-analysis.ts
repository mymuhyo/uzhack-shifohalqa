import { z } from 'zod';

export const exerciseProvider = z.enum(['gemini', 'openrouter', 'opencode']);
export type ExerciseProvider = z.infer<typeof exerciseProvider>;
export const exerciseAnalysisRequest = z.strictObject({ provider: exerciseProvider.optional() });

export const videoObservation = z.strictObject({
  view: z.enum(['side_visible', 'partly_visible', 'unclear']),
  seatedAtSeconds: z.array(z.number().min(0).max(8.792)).max(8),
}).refine(({ view, seatedAtSeconds }) =>
  (view !== 'unclear' || seatedAtSeconds.length === 0) &&
  seatedAtSeconds.every((time, index) => index === 0 || time > seatedAtSeconds[index - 1]),
);

export const exerciseAnalysis = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('observed'), model: z.string(), observation: videoObservation, input: z.enum(['video', 'frames']) }),
  z.strictObject({ status: z.literal('unavailable') }),
]);

export type ExerciseAnalysis = z.infer<typeof exerciseAnalysis>;
