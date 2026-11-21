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

function enableGemini() {
  vi.stubEnv('EXERCISE_GEMINI_DEMO', 'true');
  vi.stubEnv('GEMINI_API_KEY', 'test-token');
  vi.stubEnv('GEMINI_EXERCISE_MODEL', '');
  vi.stubEnv('GEMINI_EXERCISE_FALLBACK_MODEL', '');
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
  const model = 'nvidia/nemotron-3.5-super-vl:free';
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
    model,
    provider: { require_parameters: true },
    response_format: { type: 'json_schema', json_schema: { strict: true } },
    messages: [{ content: [expect.any(Object), {
      type: 'video_url', video_url: { url: `data:video/mp4;base64,${clip.toString('base64')}` },
    }] }],
  });
});

it.each(['google/gemma-4-26b-a4b-it:free', 'google/gemma-4-31b-it:free'])(
  'uses JSON mode with explicit fields for %s',
  async (model) => {
    enableFreeRouter();
    vi.stubEnv('OPENROUTER_EXERCISE_MODEL', model);
    const observation = { view: 'side_visible', seatedAtSeconds: [2, 6] };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(observation) } }],
    }));
    vi.stubGlobal('fetch', fetch);
    const { reviewExerciseSample } = await import('../../src/lib/ai/exercise-video');
    expect(await reviewExerciseSample('openrouter')).toEqual({ status: 'observed', model, observation });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toMatchObject({
      model,
      response_format: { type: 'json_object' },
      messages: [{ content: [
        { type: 'text', text: expect.stringContaining('"required":["view","seatedAtSeconds"]') },
        { type: 'video_url' },
      ] }],
    });
  },
);

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

it.each([408, 429, 503])('tries a second Gemini model when the primary returns HTTP %i', async (status) => {
  enableGemini();
  const observation = { view: 'side_visible', seatedAtSeconds: [2, 6] };
  const create = vi.fn()
    .mockRejectedValueOnce({ status })
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

it.each([
  ['empty text', null],
  ['invalid JSON', '{'],
  ['out-of-order timestamps', '{"view":"side_visible","seatedAtSeconds":[6,2]}'],
])('tries a second Gemini model when a completed response contains %s', async (_label, outputText) => {
  enableGemini();
  const observation = { view: 'side_visible', seatedAtSeconds: [2, 6] };
  const create = vi.fn()
    .mockResolvedValueOnce({ status: 'completed', output_text: outputText })
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

it('does not retry an unfinished interaction or a non-transient provider error', async () => {
  enableGemini();
  const create = vi.fn()
    .mockResolvedValueOnce({ status: 'failed', output_text: null })
    .mockRejectedValueOnce({ status: 403 });
  vi.doMock('@google/genai', () => ({
    GoogleGenAI: class { interactions = { create }; },
  }));

  let { reviewExerciseSample } = await import('../../src/lib/ai/exercise-video');
  expect(await reviewExerciseSample('gemini')).toEqual({ status: 'unavailable' });
  expect(create).toHaveBeenCalledTimes(1);

  vi.resetModules();
  ({ reviewExerciseSample } = await import('../../src/lib/ai/exercise-video'));
  expect(await reviewExerciseSample('gemini')).toEqual({ status: 'unavailable' });
  expect(create).toHaveBeenCalledTimes(2);
});
