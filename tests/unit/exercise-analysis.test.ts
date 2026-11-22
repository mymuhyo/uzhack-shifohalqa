import { readFile } from 'node:fs/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { exerciseAnalysisRequest } from '../../src/lib/exercise-analysis';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
}

it('accepts a provider choice without accepting caller-supplied media or models', () => {
  expect(exerciseAnalysisRequest.parse({})).toEqual({});
  expect(exerciseAnalysisRequest.parse({ provider: 'openrouter' })).toEqual({ provider: 'openrouter' });
  expect(exerciseAnalysisRequest.parse({ provider: 'opencode' })).toEqual({ provider: 'opencode' });
  expect(exerciseAnalysisRequest.safeParse({ provider: 'unknown' }).success).toBe(false);
  expect(exerciseAnalysisRequest.safeParse({ provider: 'openrouter', model: 'other' }).success).toBe(false);
  expect(exerciseAnalysisRequest.safeParse({ provider: 'openrouter', video: 'other' }).success).toBe(false);
});

it('keeps the Gemini key scoped to Decisions, even with a legacy exercise flag', async () => {
  enableGemini();
  vi.stubEnv('EXERCISE_OPENROUTER_DEMO', 'false');
  const { availableExerciseProviders, reviewExerciseSample } = await import('../../src/lib/ai/exercise-video');
  expect(availableExerciseProviders()).toEqual([]);
  await expect(reviewExerciseSample('gemini')).resolves.toEqual({ status: 'unavailable' });
});

it('routes the bundled clip to Console only with explicit provider and public demo opt-ins', async () => {
  enableFreeRouter();
  vi.stubEnv('AI_COMPLETION_PROVIDER', 'opencode');
  vi.stubEnv('OPENCODE_API_KEY', 'console-test-key');
  vi.stubEnv('EXERCISE_OPENCODE_DEMO', 'false');
  const observation = { view: 'side_visible', seatedAtSeconds: [2, 6] };
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
    modelVersion: 'gemini-4-hydrogen',
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(observation) }] } }],
  }));
  vi.stubGlobal('fetch', fetch);
  const { availableExerciseProviders, reviewExerciseSample } = await import('../../src/lib/ai/exercise-video');
  expect(availableExerciseProviders()).toEqual([]);
  vi.stubEnv('EXERCISE_OPENCODE_DEMO', 'true');
  expect(availableExerciseProviders()).toEqual(['opencode']);
  await expect(reviewExerciseSample('opencode')).resolves.toEqual({
    status: 'observed', model: 'gemini-4-hydrogen', observation, input: 'video',
  });
  expect(fetch).toHaveBeenCalledOnce();
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('https://opencode.ai/inference/google/v1beta/models/gemini-4-hydrogen:generateContent');
  expect(options?.headers).toMatchObject({ Authorization: 'Bearer console-test-key' });
  const clip = await readFile('public/demo/pose-cdc-lower-body.mp4');
  expect(JSON.parse(String(options?.body))).toMatchObject({
    contents: [{ parts: [expect.any(Object), { inlineData: { mimeType: 'video/mp4', data: clip.toString('base64') } }] }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: { required: ['view', 'seatedAtSeconds'] } },
  });
});

it('falls back from Vercel to Go and then Gemini with the correct media and credentials', async () => {
  vi.stubEnv('AI_COMPLETION_PROVIDER', 'auto');
  vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-test-key');
  vi.stubEnv('OPENCODE_GO_API_KEY', 'go-test-key');
  vi.stubEnv('GEMINI_API_KEY', 'gemini-test-key');
  vi.stubEnv('EXERCISE_AI_DEMO', 'true');
  const observation = { view: 'side_visible', seatedAtSeconds: [2, 6] };
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 403 }))
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(new Response(null, { status: 429 }))
    .mockResolvedValueOnce(Response.json({
      modelVersion: 'gemini-3.5-flash-lite',
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(observation) }] } }],
    }));
  vi.stubGlobal('fetch', fetch);
  const { availableExerciseProviders, reviewExerciseSample } = await import('../../src/lib/ai/exercise-video');
  expect(availableExerciseProviders()).toEqual(['auto']);
  await expect(reviewExerciseSample('auto')).resolves.toMatchObject({
    status: 'observed', provider: 'gemini', observation, input: 'video',
  });
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    'https://ai-gateway.vercel.sh/v1/chat/completions',
    'https://opencode.ai/inference/go/google/v1beta/models/gemini-4-argon:generateContent',
    'https://opencode.ai/inference/go/openai/v1/chat/completions',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent',
  ]);
  const [vercel, goVideo, goFrames, gemini] = fetch.mock.calls.map(([, options]) => options);
  expect(vercel?.headers).toMatchObject({ Authorization: 'Bearer gateway-test-key' });
  expect(goVideo?.headers).toMatchObject({ Authorization: 'Bearer go-test-key', 'User-Agent': 'ShifoHalqa/0.1' });
  expect((goFrames?.headers as Record<string, string>)['x-opencode-session'])
    .toBe((goVideo?.headers as Record<string, string>)['x-opencode-session']);
  expect(gemini?.headers).toMatchObject({ 'x-goog-api-key': 'gemini-test-key' });
  const clip = (await readFile('public/demo/pose-cdc-lower-body.mp4')).toString('base64');
  const frames = (await readFile('public/demo/pose-cdc-contact-sheet.jpg')).toString('base64');
  expect(JSON.parse(String(vercel?.body)).messages[0].content[1]).toEqual({
    type: 'file', file: { filename: 'sample.mp4', file_data: `data:video/mp4;base64,${clip}` },
  });
  expect(JSON.parse(String(goFrames?.body)).messages[0].content[1]).toEqual({
    type: 'image_url', image_url: { url: `data:image/jpeg;base64,${frames}` },
  });
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
  const expected = { status: 'observed', model, observation, input: 'video' };
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
    expect(await reviewExerciseSample('openrouter')).toEqual({ status: 'observed', model, observation, input: 'video' });
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

it('uses only the bundled contact sheet when OpenRouter requires credits for video', async () => {
  enableFreeRouter();
  const model = 'nvidia/nemotron-3.5-super-vl:free';
  const observation = { view: 'side_visible', seatedAtSeconds: [2, 6] };
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 402 }))
    .mockResolvedValueOnce(Response.json({ model, choices: [
      { finish_reason: 'stop', message: { content: JSON.stringify(observation) } },
    ] }));
  vi.stubGlobal('fetch', fetch);
  const { reviewExerciseSample } = await import('../../src/lib/ai/exercise-video');
  await expect(reviewExerciseSample('openrouter')).resolves.toEqual({
    status: 'observed', model, input: 'frames', observation,
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  const sheet = (await readFile('public/demo/pose-cdc-contact-sheet.jpg')).toString('base64');
  expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toMatchObject({
    reasoning: { enabled: false },
    messages: [{ content: [expect.any(Object), { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${sheet}` } }] }],
    response_format: { type: 'json_object' },
  });
});

it('does not send frames if a video request fails for another reason', async () => {
  enableFreeRouter();
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 429 }));
  vi.stubGlobal('fetch', fetch);
  const { reviewExerciseSample } = await import('../../src/lib/ai/exercise-video');
  await expect(reviewExerciseSample('openrouter')).resolves.toEqual({ status: 'unavailable' });
  expect(fetch).toHaveBeenCalledOnce();
});
