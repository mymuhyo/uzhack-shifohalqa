import { afterEach, expect, it, vi } from 'vitest';
import { compareExerciseObservations, exerciseExplanationRequest } from '../../src/lib/exercise-explanation';

const model = 'baidu/ernie-5.5-flash-preview:free';
const cycles = [{ fromMs: 1_200, toMs: 4_200 }, { fromMs: 5_300, toMs: 8_500 }];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('only accepts the comparison category', () => {
  expect(exerciseExplanationRequest.parse({ comparison: 'match' })).toEqual({ comparison: 'match' });
  expect(exerciseExplanationRequest.safeParse({ comparison: 'other' }).success).toBe(false);
  for (const field of ['prompt', 'video', 'model', 'cycles']) {
    expect(exerciseExplanationRequest.safeParse({ comparison: 'match', [field]: 'extra' }).success).toBe(false);
  }
});

it('compares counts and time ranges before requesting text from the model', () => {
  expect(compareExerciseObservations(cycles).comparison).toBe('pose_only');
  expect(compareExerciseObservations(cycles, { view: 'unclear', seatedAtSeconds: [] }).comparison).toBe('video_unclear');
  expect(compareExerciseObservations([], { view: 'side_visible', seatedAtSeconds: [] }).comparison).toBe('no_cycles');
  expect(compareExerciseObservations(cycles, { view: 'partly_visible', seatedAtSeconds: [2] }).comparison).toBe('count_differs');
  expect(compareExerciseObservations(cycles, { view: 'side_visible', seatedAtSeconds: [2, 5] })).toEqual({
    comparison: 'time_differs', alignedCycles: 1,
  });
  expect(compareExerciseObservations(cycles, { view: 'side_visible', seatedAtSeconds: [1.2, 8.5] })).toEqual({
    comparison: 'match', alignedCycles: 2,
  });
});

it('uses the free Baidu model for text and shares requests for the same comparison', async () => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-token');
  const summary = 'Ikki tahlilda sanoq va o‘tirish vaqtlari mos keldi.';
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
    model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ summary }) } }],
  }));
  vi.stubGlobal('fetch', fetch);
  const { explainExerciseComparison } = await import('../../src/lib/ai/exercise-explanation');
  const expected = { status: 'explained', model, summary };
  expect(await Promise.all([explainExerciseComparison('match'), explainExerciseComparison('match')])).toEqual([expected, expected]);
  expect(await explainExerciseComparison('match')).toEqual(expected);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
  expect(JSON.parse(String(options?.body))).toMatchObject({
    model,
    response_format: { type: 'json_schema', json_schema: { strict: true } },
    messages: [{ role: 'user', content: expect.stringContaining('sikllar soni') }],
  });
});

it('returns unavailable for invalid provider output and makes no request without a key', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
    model, choices: [{ finish_reason: 'stop', message: { content: '{"summary":" "}' } }],
  }));
  vi.stubGlobal('fetch', fetch);
  const { explainExerciseComparison } = await import('../../src/lib/ai/exercise-explanation');
  vi.stubEnv('OPENROUTER_API_KEY', '');
  expect(await explainExerciseComparison('match')).toEqual({ status: 'unavailable' });
  expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv('OPENROUTER_API_KEY', 'test-token');
  expect(await explainExerciseComparison('match')).toEqual({ status: 'unavailable' });
  expect(fetch).toHaveBeenCalledTimes(1);
});
