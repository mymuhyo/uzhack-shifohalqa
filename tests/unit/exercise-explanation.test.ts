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

it('uses Console for both text features and sends only the public sample or the comparison category', async () => {
  vi.stubEnv('AI_COMPLETION_PROVIDER', 'opencode');
  vi.stubEnv('OPENCODE_API_KEY', 'console-test-key');
  vi.stubEnv('EXERCISE_COACH_OPENROUTER_DEMO', 'true');
  const summary = 'Ikki tahlilda sanoq va o‘tirish vaqtlari mos keldi.';
  const advice = {
    patientAdviceUz: 'Kadrda tizza va to‘piq ko‘rinadi.', focusCueUz: 'Kadrni barqaror tuting.',
    doctorInsightUz: 'Ommaviy namuna ikki takrordan iborat.',
  };
  const response = (value: object) => Response.json({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
  });
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(response({ summary }))
    .mockResolvedValueOnce(response(advice));
  vi.stubGlobal('fetch', fetch);
  const { explainExerciseComparison } = await import('../../src/lib/ai/exercise-explanation');
  const { publicExerciseCoach } = await import('../../src/lib/ai/public-exercise-coach');
  await expect(explainExerciseComparison('match')).resolves.toMatchObject({ status: 'explained', summary });
  await expect(publicExerciseCoach('chair_stand')).resolves.toMatchObject({ source: 'deterministic_coach' });
  vi.stubEnv('EXERCISE_COACH_OPENCODE_DEMO', 'true');
  await expect(publicExerciseCoach('chair_stand')).resolves.toMatchObject({ source: 'opencode', ...advice });
  expect(fetch).toHaveBeenCalledTimes(2);
  for (const [url, options] of fetch.mock.calls) {
    expect(url).toBe('https://opencode.ai/inference/google/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(JSON.parse(String(options?.body)).contents).toEqual([{ role: 'user', parts: [{ text: expect.any(String) }] }]);
  }
});

it('uses only Vercel when the first configured provider returns valid structured text', async () => {
  vi.stubEnv('AI_COMPLETION_PROVIDER', 'auto');
  vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-test-key');
  vi.stubEnv('OPENCODE_GO_API_KEY', 'go-test-key');
  vi.stubEnv('GEMINI_API_KEY', 'gemini-test-key');
  const summary = 'Ikki kuzatuvdagi to‘liq sikllar soni mos keldi.';
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
    model: 'openai/gpt-oss-20b',
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ summary }) } }],
  }));
  vi.stubGlobal('fetch', fetch);
  const { explainExerciseComparison } = await import('../../src/lib/ai/exercise-explanation');
  await expect(explainExerciseComparison('match')).resolves.toMatchObject({ status: 'explained', provider: 'vercel', summary });
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][0]).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
});

it('tries Go when Vercel returns HTTP 200 with invalid structured text', async () => {
  vi.stubEnv('AI_COMPLETION_PROVIDER', 'auto');
  vi.stubEnv('AI_GATEWAY_API_KEY', 'gateway-test-key');
  vi.stubEnv('OPENCODE_API_KEY', 'shared-go-test-key');
  vi.stubEnv('OPENCODE_GO_API_KEY', '');
  vi.stubEnv('GEMINI_API_KEY', 'gemini-test-key');
  const summary = 'MediaPipe va video kuzatuvi bir-biriga mos keldi.';
  const chat = (content: string) => Response.json({
    choices: [{ finish_reason: 'stop', message: { content } }],
  });
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(chat('{"summary":" "}'))
    .mockResolvedValueOnce(chat('```json\n' + JSON.stringify({ summary }) + '\n```'));
  vi.stubGlobal('fetch', fetch);
  const { explainExerciseComparison } = await import('../../src/lib/ai/exercise-explanation');
  await expect(explainExerciseComparison('match')).resolves.toMatchObject({
    status: 'explained', provider: 'opencode_go', model: 'hy4-flash-free', summary,
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer shared-go-test-key' });
});
