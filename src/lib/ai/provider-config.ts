import { headers } from 'next/headers';
import type { z } from 'zod';
import type { fallbackAiProvider } from '../ai-provider';

export type SupervisedAiProvider = 'vercel' | 'cloudflare';

export type SupervisedAiTarget =
  | { provider: 'vercel'; key: string }
  | { provider: 'cloudflare'; accountId: string; apiToken: string };

export type FallbackTarget = { provider: z.infer<typeof fallbackAiProvider>; key: string };

export type AnyCompletionTarget = FallbackTarget | SupervisedAiTarget;

async function supervisedVercelToken(): Promise<string | undefined> {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (apiKey) return apiKey;

  if (process.env.VERCEL === '1') {
    try {
      const token = (await headers()).get('x-vercel-oidc-token')?.trim();
      if (token) return token;
    } catch {
      // A caller outside a request can still use the local environment token.
    }
  }
  return process.env.VERCEL_OIDC_TOKEN?.trim();
}

/**
 * Primary Grand Final supervised AI order (ADR-006):
 * 1. Vercel AI Gateway (`AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`)
 * 2. Cloudflare Workers AI (`CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`)
 * Deterministic Uzbek templates serve as the offline/outage fallback in callers.
 */
export async function configuredSupervisedAiTargets(): Promise<SupervisedAiTarget[]> {
  const vercel = await supervisedVercelToken();
  const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const cfApiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  return [
    ...(vercel ? [{ provider: 'vercel' as const, key: vercel }] : []),
    ...(cfAccountId && cfApiToken
      ? [{ provider: 'cloudflare' as const, accountId: cfAccountId, apiToken: cfApiToken }]
      : []),
  ];
}

/**
 * Legacy auto-completion target list retained for existing exercise sample/explanation
 * endpoints and tests. Vercel AI Gateway remains first.
 */
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
