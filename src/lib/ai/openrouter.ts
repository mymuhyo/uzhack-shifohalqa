import { z } from 'zod';

const routerReply = z.object({
  model: z.string().min(1),
  choices: z.array(z.object({ finish_reason: z.literal('stop'), message: z.object({ content: z.string() }) })).min(1),
});

export async function requestOpenRouterCompletion(key: string, body: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({ ...body, provider: { require_parameters: true } }),
  });
  if (!response.ok) throw new Error(`OpenRouter returned HTTP ${response.status}`);
  const { model, choices } = routerReply.parse(await response.json());
  return { model, content: choices[0].message.content };
}
