import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { exerciseAnalysisRequest } from '../../src/lib/exercise-analysis';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock('@google/genai');
  vi.resetModules();
});

function enableFreeRouter() {
  vi.stubEnv('EXERCISE_GEMINI_DEMO', 'false');
  vi.stubEnv('EXERCISE_OPENROUTER_DEMO', 'true');
  vi.stubEnv('OPENROUTER_API_KEY', 'test-token');
  vi.stubEnv('OPENROUTER_EXERCISE_MODEL', '');
}

it('accepts a provider choice without accepting caller-supplied media or models', () => {
  expect(exerciseAnalysisRequest.parse({})).toEqual({ provider: 'gemini' });
  expect(exerciseAnalysisRequest.parse({ provider: 'openrouter' })).toEqual({ provider: 'openrouter' });
  expect(exerciseAnalysisRequest.safeParse({ provider: 'unknown' }).success).toBe(false);
  expect(exerciseAnalysisRequest.safeParse({ provider: 'openrouter', model: 'other' }).success).toBe(false);
  expect(exerciseAnalysisRequest.safeParse({ provider: 'openrouter', video: 'other' }).success).toBe(false);
});

it('sends only the bundled cropped clip and shares concurrent OpenRouter calls', async () => {
  enableFreeRouter();
  const model = 'google/gemma-4-26b-a4b-it:free';
  const observation = { view: 'side_visible', seatedAtSeconds: [2, 6] };
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
    model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(observation) } }],
  }));
  vi.stubGlobal('fetch', fetch);
  const { availableExerciseProviders, reviewExerciseSample } = await import('../../src/lib/ai/exercise-video');
  expect(availableExerciseProviders()).toEqual(['openrouter']);
  const expected = { status: 'observed', model, observation };
  expect(await Promise.all([reviewExerciseSample('openrouter'), reviewExerciseSample('openrouter')])).toEqual([expected, expected]);
  expect(await reviewExerciseSample('openrouter')).toEqual(expected);
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
  const clip = await readFile('public/demo/pose-cdc-lower-body.mp4');
  expect(JSON.parse(String(options?.body))).toMatchObject({
    model, messages: [{ content: [expect.any(Object), {
      type: 'video_url', video_url: { url: `data:video/mp4;base64,${clip.toString('base64')}` },
    }] }],
  });
});

it('does not run a paid model and rejects a malformed observation from a free model', async () => {
  enableFreeRouter();
  vi.stubEnv('OPENROUTER_EXERCISE_MODEL', 'google/gemma-4-26b-a4b-it');
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
    model: 'google/gemma-4-26b-a4b-it:free', choices: [{ finish_reason: 'stop', message: {
      content: JSON.stringify({ view: 'side_visible', seatedAtSeconds: [6, 2] }),
    } }],
  }));
  vi.stubGlobal('fetch', fetch);
  const { availableExerciseProviders, reviewExerciseSample } = await import('../../src/lib/ai/exercise-video');
  expect(availableExerciseProviders()).toEqual([]);
  expect(await reviewExerciseSample('openrouter')).toEqual({ status: 'unavailable' });
  expect(fetch).not.toHaveBeenCalled();
  vi.stubEnv('OPENROUTER_EXERCISE_MODEL', '');
  expect(await reviewExerciseSample('openrouter')).toEqual({ status: 'unavailable' });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('tries a second Gemini model when the primary returns a temporary error', async () => {
  vi.stubEnv('EXERCISE_GEMINI_DEMO', 'true');
  vi.stubEnv('GEMINI_API_KEY', 'test-token');
  vi.stubEnv('GEMINI_EXERCISE_MODEL', '');
  vi.stubEnv('GEMINI_EXERCISE_FALLBACK_MODEL', '');
  const observation = { view: 'side_visible', seatedAtSeconds: [2, 6] };
  const create = vi.fn()
    .mockRejectedValueOnce({ status: 503 })
    .mockResolvedValueOnce({ status: 'completed', output_text: JSON.stringify(observation) });
  vi.doMock('@google/genai', () => ({
    GoogleGenAI: class { interactions = { create }; },
  }));
  const { reviewExerciseSample } = await import('../../src/lib/ai/exercise-video');
  expect(await reviewExerciseSample('gemini')).toEqual({ status: 'observed', model: 'gemini-3.1-flash-lite', observation });
  expect(create.mock.calls.map(([request]) => [request.model, request.store])).toEqual([
    ['gemini-3.5-flash-lite', false], ['gemini-3.1-flash-lite', false],
  ]);
});
