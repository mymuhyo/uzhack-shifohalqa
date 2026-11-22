import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requestGeminiFormat, type StructuredInput } from './opencode';
import type { FallbackTarget } from './provider-config';

const chatReply = z.object({
  model: z.string().min(1).optional(),
  choices: z.array(z.object({
    finish_reason: z.literal('stop'),
    message: z.object({ content: z.string() }),
  })).min(1),
});

const videoAttemptMs = { vercel: 6_000, opencode_go: 13_000, gemini: 6_000 };

type FallbackInput = StructuredInput & {
  name: string;
  frames?: () => Promise<{ mimeType: 'image/jpeg'; data: string; prompt: string }>;
};

async function completeChat(
  url: string, headers: Record<string, string>, model: string, input: FallbackInput,
  structured: boolean, signal: AbortSignal,
) {
  const { name, schema, media, maxOutputTokens } = input;
  const prompt = structured ? input.prompt : `${input.prompt}\nReturn only a JSON object matching this schema: ${JSON.stringify(schema)}`;
  const dataUrl = media && `data:${media.mimeType};base64,${media.data}`;
  const attachment = media?.mimeType === 'video/mp4'
    ? { type: 'file', file: { filename: 'sample.mp4', file_data: dataUrl } }
    : { type: 'image_url', image_url: { url: dataUrl } };
  const response = await fetch(url, {
    method: 'POST', redirect: 'error', signal,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: media ? [{ type: 'text', text: prompt }, attachment] : prompt }],
      max_tokens: !structured ? Math.max(2048, maxOutputTokens) : maxOutputTokens,
      ...(structured ? { response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } } }
        : { thinking: { type: 'disabled' } }),
    }),
  });
  if (!response.ok) throw new Error(`Model API returned HTTP ${response.status}`);
  const reply = chatReply.parse(await response.json());
  return { model: reply.model ?? model, content: reply.choices[0].message.content };
}

export async function requestFallbackCompletion<T>(
  targets: readonly FallbackTarget[],
  input: FallbackInput,
  output: z.ZodType<T>,
  signal: AbortSignal,
) {
  const isVideo = input.media?.mimeType === 'video/mp4';
  const session = randomUUID();
  for (const { provider, key } of targets) {
    signal.throwIfAborted();
    const attempt = targets.length === 1
      ? signal
      : AbortSignal.any([signal, AbortSignal.timeout(isVideo ? videoAttemptMs[provider] : 4_500)]);
    const auth = { Authorization: `Bearer ${key}` };
    try {
      if (provider === 'vercel') {
        const model = isVideo ? 'google/gemini-3.6-flash'
          : input.media ? 'alibaba/qwen3.6-35b-a3b' : 'openai/gpt-oss-20b';
        const result = await completeChat('https://ai-gateway.vercel.sh/v1/chat/completions',
          auth, model, input, true, attempt);
        return { provider, model: result.model, data: output.parse(JSON.parse(result.content)), usedFrames: false };
      }
      if (provider === 'gemini') {
        const result = await requestGeminiFormat('https://generativelanguage.googleapis.com/v1beta', { 'x-goog-api-key': key },
          { ...input, model: 'gemini-3.5-flash-lite' }, 'MINIMAL', attempt);
        return { provider, model: result.model, data: output.parse(JSON.parse(result.content)), usedFrames: false };
      }
      const headers = { ...auth, 'User-Agent': 'ShifoHalqa/0.1', 'x-opencode-session': session };
      if (isVideo) {
        try {
          const videoAttempt = AbortSignal.any([attempt, AbortSignal.timeout(3_000)]);
          const result = await requestGeminiFormat('https://opencode.ai/inference/go/google/v1beta', headers,
            { ...input, model: 'gemini-4-argon' }, 'LOW', videoAttempt);
          return { provider, model: result.model, data: output.parse(JSON.parse(result.content)), usedFrames: false };
        } catch {
          if (attempt.aborted || !input.frames) continue;
        }
      }
      const frames = isVideo && input.frames ? await input.frames() : undefined;
      const result = await completeChat('https://opencode.ai/inference/go/openai/v1/chat/completions',
        headers, 'hy4-flash-free', frames ? { ...input, prompt: frames.prompt, media: frames } : input, false, attempt);
      const content = result.content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
      return { provider, model: result.model, data: output.parse(JSON.parse(content)), usedFrames: Boolean(frames) };
    } catch {
      // The next configured provider gets its own attempt within the overall deadline.
    }
  }
  signal.throwIfAborted();
  return null;
}
