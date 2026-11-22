import { expect, it, vi } from 'vitest';
import { exerciseCoachInputSchema } from '../../src/lib/ai/exercise-coach';
import { publicExerciseCoach } from '../../src/lib/ai/public-exercise-coach';
import { requestOpenRouterCompletion } from '../../src/lib/ai/openrouter';

vi.mock(import('../../src/lib/ai/openrouter'), async (load) => ({
  ...await load(),
  requestOpenRouterCompletion: vi.fn(),
}));

it('rejects extra data in a public sample request and submits only server-owned sample metrics', async () => {
  expect(exerciseCoachInputSchema.safeParse({ sample: 'chair_stand', video: 'private' }).success).toBe(false);
  vi.stubEnv('EXERCISE_COACH_OPENROUTER_DEMO', 'true');
  vi.stubEnv('OPENROUTER_API_KEY', 'unit-key');
  try {
    const completion = vi.mocked(requestOpenRouterCompletion);
    completion.mockResolvedValue({ model: 'test-provider', content: JSON.stringify({
      patientAdviceUz: 'Kadrda tizza va to‘piq ko‘rinadi.', focusCueUz: 'Kadrni barqaror tuting.',
      doctorInsightUz: 'Ommaviy namuna ikki takrordan iborat.',
    }) });
    const results = await Promise.all([publicExerciseCoach('chair_stand'), publicExerciseCoach('chair_stand')]);
    expect(results[0]).toMatchObject({ source: 'openrouter' });
    expect(results[1]).toEqual(results[0]);
    expect(completion).toHaveBeenCalledOnce();
    expect(completion.mock.calls[0][1]).toMatchObject({
      messages: [{ content: expect.stringContaining('"validReps":2') }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          strict: true,
          schema: { required: ['patientAdviceUz', 'focusCueUz', 'doctorInsightUz'], additionalProperties: false },
        },
      },
    });
  } finally { vi.unstubAllEnvs(); }
});
