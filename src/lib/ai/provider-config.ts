import type { z } from 'zod';
import type { fallbackAiProvider } from '../ai-provider';

export type SupervisedAiProvider = 'vercel' | 'cloudflare';

export type SupervisedAiTarget =
  | { provider: 'vercel'; key: string }
  | { provider: 'cloudflare'; accountId: string; apiToken: string };

export type FallbackTarget = { provider: z.infer<typeof fallbackAiProvider>; key: string };

export type AnyCompletionTarget = FallbackTarget | SupervisedAiTarget;

export function readVercelOidcTokenFromRequest(request: Request): string | undefined {
  const token = request.headers.get('x-vercel-oidc-token')?.trim();
  return token || undefined;
}

export function resolveVercelAiGatewayKey(oidcToken?: string | null): string | undefined {
  return process.env.AI_GATEWAY_API_KEY?.trim()
    || oidcToken?.trim()
    || process.env.VERCEL_OIDC_TOKEN?.trim()
    || undefined;
}

/**
 * Primary Grand Final supervised AI order (ADR-006):
 * 1. Vercel AI Gateway (`AI_GATEWAY_API_KEY`, per-request `x-vercel-oidc-token`, or `VERCEL_OIDC_TOKEN`)
 * 2. Cloudflare Workers AI (`CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`)
 * Deterministic Uzbek templates serve as the offline/outage fallback in callers.
 */
export function configuredSupervisedAiTargets(options?: { oidcToken?: string | null }): SupervisedAiTarget[] {
  const vercel = resolveVercelAiGatewayKey(options?.oidcToken);
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
export function configuredFallbackTargets(options?: { oidcToken?: string | null }): FallbackTarget[] {
  const vercel = resolveVercelAiGatewayKey(options?.oidcToken);
  const go = process.env.OPENCODE_GO_API_KEY?.trim() || process.env.OPENCODE_API_KEY?.trim();
  const gemini = process.env.GEMINI_API_KEY?.trim();
  return [
    ...(vercel ? [{ provider: 'vercel' as const, key: vercel }] : []),
    ...(go ? [{ provider: 'opencode_go' as const, key: go }] : []),
    ...(gemini ? [{ provider: 'gemini' as const, key: gemini }] : []),
  ];
}
