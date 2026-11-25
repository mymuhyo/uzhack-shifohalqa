import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requestGeminiFormat, type StructuredInput } from './opencode';
import type {
  AnyCompletionTarget,
  FallbackTarget,
  SupervisedAiProvider,
  SupervisedAiTarget,
} from './provider-config';

const chatReply = z.object({
  model: z.string().min(1).optional(),
  choices: z.array(z.object({
    finish_reason: z.literal('stop'),
    message: z.object({ content: z.string() }),
  })).min(1),
});

const cloudflareReply = z.union([
  z.object({
    success: z.literal(true),
    result: z.object({
      response: z.union([z.string(), z.record(z.string(), z.unknown())]),
    }),
  }),
  z.object({
    success: z.literal(true),
    result: z.object({
      choices: z.array(z.object({
        message: z.object({ content: z.string() }),
      })).min(1),
    }),
  }),
  chatReply,
]);

const videoAttemptMs: Record<AnyCompletionTarget['provider'], number> = {
  vercel: 6_000,
  cloudflare: 6_000,
  opencode_go: 13_000,
  gemini: 6_000,
};

const defaultVercelTextModel = 'openai/gpt-oss-20b';
const defaultVercelVisionModel = 'alibaba/qwen3.6-35b-a3b';
const defaultVercelVideoModel = 'google/gemini-3.6-flash';
const defaultCloudflareTextModel = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const defaultCloudflareVisionModel = '@cf/meta/llama-3.2-11b-vision-instruct';
const safeCloudflareModelPattern = /^@cf\/[a-z0-9._-]+\/[a-z0-9._-]+$/i;

export type FallbackInput = StructuredInput & {
  name: string;
  frames?: () => Promise<{ mimeType: 'image/jpeg'; data: string; prompt: string }>;
};

export type SupervisedCompletionInput = Omit<FallbackInput, 'frames'>;

export type SupervisedCompletionResult<T> = {
  provider: SupervisedAiProvider;
  model: string;
  data: T;
};

function unwrapJsonFence(content: string): string {
  return content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1').trim();
}

function resolveVercelModel(input: FallbackInput): string {
  if (input.media?.mimeType === 'video/mp4') {
    return process.env.VERCEL_AI_VIDEO_MODEL?.trim() || defaultVercelVideoModel;
  }
  if (input.media) {
    return process.env.VERCEL_AI_VISION_MODEL?.trim() || defaultVercelVisionModel;
  }
  return process.env.VERCEL_AI_TEXT_MODEL?.trim() || defaultVercelTextModel;
}

function resolveCloudflareModel(hasImage: boolean): string {
  const candidate = hasImage
    ? (process.env.CLOUDFLARE_VISION_MODEL?.trim() || defaultCloudflareVisionModel)
    : (process.env.CLOUDFLARE_TEXT_MODEL?.trim() || defaultCloudflareTextModel);
  if (!safeCloudflareModelPattern.test(candidate)) {
    throw new Error('Invalid Cloudflare Workers AI model path');
  }
  return candidate;
}

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

async function completeCloudflareWorkersAi<T>(
  accountId: string,
  apiToken: string,
  input: FallbackInput,
  output: z.ZodType<T>,
  signal: AbortSignal,
): Promise<{ model: string; data: T }> {
  if (input.media?.mimeType === 'video/mp4') {
    throw new Error('Cloudflare Workers AI does not accept raw video payloads');
  }
  const hasImage = Boolean(input.media);
  const model = resolveCloudflareModel(hasImage);
  const prompt = `${input.prompt}\nReturn only a valid JSON object matching this schema: ${JSON.stringify(input.schema)}`;
  const content = input.media
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${input.media.mimeType};base64,${input.media.data}` } },
      ]
    : prompt;

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
    {
      method: 'POST',
      redirect: 'error',
      signal,
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content }],
        max_tokens: input.maxOutputTokens,
        response_format: { type: 'json_schema', json_schema: input.schema },
      }),
    },
  );
  if (!response.ok) throw new Error(`Cloudflare Workers AI returned HTTP ${response.status}`);

  const parsedEnvelope = cloudflareReply.parse(await response.json());
  let rawPayload: unknown;
  if ('choices' in parsedEnvelope) {
    rawPayload = JSON.parse(unwrapJsonFence(parsedEnvelope.choices[0].message.content));
  } else if ('response' in parsedEnvelope.result) {
    rawPayload = typeof parsedEnvelope.result.response === 'string'
      ? JSON.parse(unwrapJsonFence(parsedEnvelope.result.response))
      : parsedEnvelope.result.response;
  } else {
    rawPayload = JSON.parse(unwrapJsonFence(parsedEnvelope.result.choices[0].message.content));
  }

  return { model, data: output.parse(rawPayload) };
}

export async function requestSupervisedCompletion<T>(
  targets: readonly SupervisedAiTarget[],
  input: SupervisedCompletionInput,
  output: z.ZodType<T>,
  signal: AbortSignal,
): Promise<SupervisedCompletionResult<T> | null> {
  const result = await requestFallbackCompletion(targets, input, output, signal);
  if (!result) return null;
  return { provider: result.provider, model: result.model, data: result.data };
}

export async function requestFallbackCompletion<T>(
  targets: readonly FallbackTarget[],
  input: FallbackInput,
  output: z.ZodType<T>,
  signal: AbortSignal,
): Promise<{ provider: FallbackTarget['provider']; model: string; data: T; usedFrames: boolean } | null>;
export async function requestFallbackCompletion<T>(
  targets: readonly SupervisedAiTarget[],
  input: FallbackInput,
  output: z.ZodType<T>,
  signal: AbortSignal,
): Promise<{ provider: SupervisedAiProvider; model: string; data: T; usedFrames: boolean } | null>;
export async function requestFallbackCompletion<T>(
  targets: readonly AnyCompletionTarget[],
  input: FallbackInput,
  output: z.ZodType<T>,
  signal: AbortSignal,
): Promise<{ provider: AnyCompletionTarget['provider']; model: string; data: T; usedFrames: boolean } | null>;
export async function requestFallbackCompletion<T>(
  targets: readonly AnyCompletionTarget[],
  input: FallbackInput,
  output: z.ZodType<T>,
  signal: AbortSignal,
): Promise<{ provider: AnyCompletionTarget['provider']; model: string; data: T; usedFrames: boolean } | null> {
  const isVideo = input.media?.mimeType === 'video/mp4';
  const session = randomUUID();
  for (const target of targets) {
    signal.throwIfAborted();
    const attempt = targets.length === 1
      ? signal
      : AbortSignal.any([signal, AbortSignal.timeout(isVideo ? videoAttemptMs[target.provider] : 5_000)]);
    try {
      if (target.provider === 'vercel') {
        const model = resolveVercelModel(input);
        const result = await completeChat(
          'https://ai-gateway.vercel.sh/v1/chat/completions',
          { Authorization: `Bearer ${target.key}` },
          model,
          input,
          true,
          attempt,
        );
        return {
          provider: 'vercel',
          model: result.model,
          data: output.parse(JSON.parse(unwrapJsonFence(result.content))),
          usedFrames: false,
        };
      }
      if (target.provider === 'cloudflare') {
        const frames = isVideo && input.frames ? await input.frames() : undefined;
        const cfInput = frames ? { ...input, prompt: frames.prompt, media: frames } : input;
        const result = await completeCloudflareWorkersAi(
          target.accountId,
          target.apiToken,
          cfInput,
          output,
          attempt,
        );
        return {
          provider: 'cloudflare',
          model: result.model,
          data: result.data,
          usedFrames: Boolean(frames),
        };
      }
      if (target.provider === 'gemini') {
        const result = await requestGeminiFormat(
          'https://generativelanguage.googleapis.com/v1beta',
          { 'x-goog-api-key': target.key },
          { ...input, model: 'gemini-3.5-flash-lite' },
          'MINIMAL',
          attempt,
        );
        return {
          provider: 'gemini',
          model: result.model,
          data: output.parse(JSON.parse(result.content)),
          usedFrames: false,
        };
      }
      const headers = { Authorization: `Bearer ${target.key}`, 'User-Agent': 'ShifoHalqa/0.1', 'x-opencode-session': session };
      if (isVideo) {
        try {
          const videoAttempt = AbortSignal.any([attempt, AbortSignal.timeout(3_000)]);
          const result = await requestGeminiFormat(
            'https://opencode.ai/inference/go/google/v1beta',
            headers,
            { ...input, model: 'gemini-4-argon' },
            'LOW',
            videoAttempt,
          );
          return {
            provider: 'opencode_go',
            model: result.model,
            data: output.parse(JSON.parse(result.content)),
            usedFrames: false,
          };
        } catch {
          if (attempt.aborted || !input.frames) continue;
        }
      }
      const frames = isVideo && input.frames ? await input.frames() : undefined;
      const result = await completeChat(
        'https://opencode.ai/inference/go/openai/v1/chat/completions',
        headers,
        'hy4-flash-free',
        frames ? { ...input, prompt: frames.prompt, media: frames } : input,
        false,
        attempt,
      );
      const content = unwrapJsonFence(result.content);
      return {
        provider: 'opencode_go',
        model: result.model,
        data: output.parse(JSON.parse(content)),
        usedFrames: Boolean(frames),
      };
    } catch {
      // The next configured provider gets its own attempt within the overall deadline.
    }
  }
  signal.throwIfAborted();
  return null;
}
