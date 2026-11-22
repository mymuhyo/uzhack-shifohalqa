import type { z } from 'zod';
import type { fallbackAiProvider } from '../ai-provider';

export type FallbackTarget = { provider: z.infer<typeof fallbackAiProvider>; key: string };

export function configuredFallbackTargets(): FallbackTarget[] {
  const vercel = process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim();
  const go = process.env.OPENCODE_GO_API_KEY?.trim() || process.env.OPENCODE_API_KEY?.trim();
  const gemini = process.env.GEMINI_API_KEY?.trim();
  return [
    ...(vercel ? [{ provider: 'vercel' as const, key: vercel }] : []),
    ...(go ? [{ provider: 'opencode_go' as const, key: go }] : []),
    ...(gemini ? [{ provider: 'gemini' as const, key: gemini }] : []),
  ];
}
