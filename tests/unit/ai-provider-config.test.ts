import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configuredFallbackTargets,
  configuredSupervisedAiTargets,
  readVercelOidcTokenFromRequest,
  resolveVercelAiGatewayKey,
} from '../../src/lib/ai/provider-config';
import { configuredAiCompletion } from '../../src/lib/ai/opencode';

const trackedEnv = [
  'AI_GATEWAY_API_KEY',
  'VERCEL_OIDC_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'OPENCODE_GO_API_KEY',
  'OPENCODE_API_KEY',
  'GEMINI_API_KEY',
  'AI_COMPLETION_PROVIDER',
] as const;

const backup = new Map<string, string | undefined>();

beforeEach(() => {
  backup.clear();
  for (const key of trackedEnv) {
    backup.set(key, process.env[key]);
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of trackedEnv) {
    const previous = backup.get(key);
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

describe('AI provider config & per-request x-vercel-oidc-token', () => {
  it('reads trimmed x-vercel-oidc-token headers from incoming requests', () => {
    const withToken = new Request('https://example.test/api/clinical/brief', {
      headers: { 'x-vercel-oidc-token': '  oidc-req-token-123  ' },
    });
    const emptyToken = new Request('https://example.test/api/clinical/brief', {
      headers: { 'x-vercel-oidc-token': '   ' },
    });

    expect(readVercelOidcTokenFromRequest(withToken)).toBe('oidc-req-token-123');
    expect(readVercelOidcTokenFromRequest(emptyToken)).toBeUndefined();
    expect(readVercelOidcTokenFromRequest(new Request('https://example.test'))).toBeUndefined();
  });

  it('prefers AI_GATEWAY_API_KEY > per-request oidcToken > VERCEL_OIDC_TOKEN', () => {
    process.env.VERCEL_OIDC_TOKEN = 'env-oidc-token';
    expect(resolveVercelAiGatewayKey()).toBe('env-oidc-token');
    expect(resolveVercelAiGatewayKey('req-oidc-token')).toBe('req-oidc-token');

    process.env.AI_GATEWAY_API_KEY = 'explicit-gateway-key';
    expect(resolveVercelAiGatewayKey('req-oidc-token')).toBe('explicit-gateway-key');
  });

  it('orders supervised targets Vercel first (via per-request OIDC) then Cloudflare', () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = 'cf-acc';
    process.env.CLOUDFLARE_API_TOKEN = 'cf-tok';

    expect(configuredSupervisedAiTargets({ oidcToken: 'oidc-live-1' })).toEqual([
      { provider: 'vercel', key: 'oidc-live-1' },
      { provider: 'cloudflare', accountId: 'cf-acc', apiToken: 'cf-tok' },
    ]);

    expect(configuredSupervisedAiTargets()).toEqual([
      { provider: 'cloudflare', accountId: 'cf-acc', apiToken: 'cf-tok' },
    ]);
  });

  it('wires per-request oidcToken through configuredFallbackTargets and configuredAiCompletion', () => {
    process.env.AI_COMPLETION_PROVIDER = 'auto';
    process.env.GEMINI_API_KEY = 'gem-key';

    expect(configuredFallbackTargets({ oidcToken: 'oidc-fallback-9' })).toEqual([
      { provider: 'vercel', key: 'oidc-fallback-9' },
      { provider: 'gemini', key: 'gem-key' },
    ]);

    expect(configuredAiCompletion('oidc-fallback-9')).toEqual({
      provider: 'auto',
      targets: [
        { provider: 'vercel', key: 'oidc-fallback-9' },
        { provider: 'gemini', key: 'gem-key' },
      ],
    });
  });
});
