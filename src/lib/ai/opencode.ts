import { z } from 'zod';
import { configuredFallbackTargets, type FallbackTarget } from './provider-config';

export type AiCompletion =
  | { provider: 'openrouter' | 'opencode'; key: string }
  | { provider: 'auto'; targets: FallbackTarget[] };

export function configuredAiCompletion(): AiCompletion | null {
  const provider = process.env.AI_COMPLETION_PROVIDER?.trim() || 'openrouter';
  if (provider === 'auto') {
    const targets = configuredFallbackTargets();
    return targets.length ? { provider, targets } : null;
  }
  if (provider !== 'opencode' && provider !== 'openrouter') return null;
  const key = (provider === 'opencode' ? process.env.OPENCODE_API_KEY : process.env.OPENROUTER_API_KEY)?.trim();
  return key ? { provider, key } : null;
}

export const openCodeTextModel = 'gemini-3.5-flash-lite';
export const openCodeVideoModel = 'gemini-4-hydrogen';

const generatedContent = z.object({
  modelVersion: z.string().min(1).optional(),
  candidates: z.array(z.object({
    finishReason: z.literal('STOP'),
    content: z.object({
      parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })),
    }),
  })).min(1),
});

export type StructuredInput = {
  prompt: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  media?: { mimeType: 'image/jpeg' | 'image/png' | 'video/mp4'; data: string };
};

type Generation = StructuredInput & {
  model: string;
};

export async function requestOpenCodeCompletion(key: string, generation: Generation, signal: AbortSignal) {
  return requestGeminiFormat('https://opencode.ai/inference/google/v1beta', { Authorization: `Bearer ${key}` },
    generation, generation.model === openCodeVideoModel ? 'LOW' : 'MINIMAL', signal);
}

export async function requestGeminiFormat(
  baseUrl: string, headers: Record<string, string>, generation: Generation, thinkingLevel: 'LOW' | 'MINIMAL', signal: AbortSignal,
) {
  const { model, prompt, schema, maxOutputTokens, media } = generation;
  const response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    redirect: 'error',
    signal,
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }, ...(media ? [{ inlineData: media }] : [])] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
        maxOutputTokens,
        thinkingConfig: { thinkingLevel },
      },
    }),
  });
  if (!response.ok) throw new Error(`Model API returned HTTP ${response.status}`);
  const parsed = generatedContent.parse(await response.json());
  const content = parsed.candidates[0].content.parts.filter(part => !part.thought).map(part => part.text).join('');
  return { model: parsed.modelVersion ?? model, content };
}
