import { NextRequest, NextResponse } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const queryCalls: Array<{ strings: TemplateStringsArray; values: unknown[] }> = [];
  const beginCalls: Array<{ mode?: string }> = [];
  const endCalls: Array<unknown> = [];
  const executionOrder: string[] = [];

  const createPendingQuery = (label: string, result: unknown[]) => ({
    then: (onFulfilled?: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) => {
      executionOrder.push(label);
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  });

  const jsonFn = vi.fn((value: unknown) => ({ type: 3802, value, raw: value }));

  const txFn = Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      queryCalls.push({ strings, values });
      const label = strings.join('?').trim();
      return createPendingQuery(label, [{ ok: true, label }]);
    }),
    { json: jsonFn },
  );

  const beginFn = vi.fn(async (modeOrCb: unknown, maybeCb?: unknown) => {
    const mode = typeof modeOrCb === 'string' ? modeOrCb : undefined;
    const cb = (typeof modeOrCb === 'function' ? modeOrCb : maybeCb) as (tx: typeof txFn) => Promise<unknown>;
    beginCalls.push({ mode });
    return cb(txFn);
  });

  const endFn = vi.fn(async (options?: unknown) => {
    endCalls.push(options);
  });

  const sqlClient = Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
      queryCalls.push({ strings, values });
      const sqlText = strings.join('?');
      if (sqlText.includes('public.environment_identity')) {
        return Promise.resolve([{ envId: 'final-preview' }]);
      }
      return Promise.resolve([{ id: 'row-1' }]);
    }),
    {
      begin: beginFn,
      end: endFn,
      json: jsonFn,
    },
  );

  const postgresFactory = vi.fn(() => sqlClient);

  const browserClientMock = { kind: 'browser-client' };
  const createBrowserClient = vi.fn(() => browserClientMock);

  const serverGetClaims = vi.fn(async () => ({ data: { claims: { sub: 'user-1' } }, error: null }));
  const serverClientMock = {
    kind: 'server-client',
    auth: {
      getClaims: serverGetClaims,
    },
  };
  let serverCookieHandlers: {
    getAll?: () => unknown;
    setAll?: (
      cookies: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      headers: Record<string, string>,
    ) => Promise<void> | void;
  } | null = null;

  const createServerClient = vi.fn((_url: string, _key: string, options: { cookies: typeof serverCookieHandlers }) => {
    serverCookieHandlers = options.cookies;
    return serverClientMock;
  });

  const adminClientMock = { kind: 'admin-client' };
  const createClient = vi.fn(() => adminClientMock);

  const cookieStore = {
    getAll: vi.fn(() => [{ name: 'sb-token', value: 'abc' }]),
    set: vi.fn(),
  };

  return {
    queryCalls,
    beginCalls,
    endCalls,
    executionOrder,
    jsonFn,
    txFn,
    beginFn,
    endFn,
    sqlClient,
    postgresFactory,
    browserClientMock,
    createBrowserClient,
    serverClientMock,
    serverGetClaims,
    getServerCookieHandlers: () => serverCookieHandlers,
    resetServerCookieHandlers: () => {
      serverCookieHandlers = null;
    },
    createServerClient,
    adminClientMock,
    createClient,
    cookieStore,
  };
});

vi.mock('postgres', () => ({
  default: mocks.postgresFactory,
}));

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: mocks.createBrowserClient,
  createServerClient: mocks.createServerClient,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

vi.mock('next/headers', () => ({
  cookies: async () => mocks.cookieStore,
}));

import nextConfig from '../../next.config';
import { assertDatabaseEnvironment, createDatabase, EnvironmentIdentityError, getDatabase } from '../../src/lib/db';
import { createSupabaseAdminClient } from '../../src/lib/supabase/admin';
import { createSupabaseBrowserClient } from '../../src/lib/supabase/client';
import { updateSession } from '../../src/lib/supabase/middleware';
import { createSupabaseServerClient } from '../../src/lib/supabase/server';
import { config as proxyConfig, proxy } from '../../src/proxy';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryCalls.length = 0;
  mocks.beginCalls.length = 0;
  mocks.endCalls.length = 0;
  mocks.executionOrder.length = 0;
  mocks.resetServerCookieHandlers();
  mocks.serverGetClaims.mockResolvedValue({ data: { claims: { sub: 'user-1' } }, error: null });
  mocks.cookieStore.set.mockImplementation(() => {});
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.stubEnv('DATABASE_URL', '');
  getDatabase();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('src/lib/db.ts postgres.js adapter', () => {
  it('returns null from getDatabase when DATABASE_URL is missing or whitespace', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(getDatabase()).toBeNull();

    vi.stubEnv('DATABASE_URL', '   \t\n  ');
    expect(getDatabase()).toBeNull();
    expect(mocks.postgresFactory).not.toHaveBeenCalled();
  });

  it('configures postgres with Supavisor-safe pooler options in createDatabase', () => {
    const db = createDatabase('postgres://user:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres');
    expect(db).toBeDefined();
    expect(mocks.postgresFactory).toHaveBeenCalledWith(
      'postgres://user:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
      {
        prepare: false,
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
        max_pipeline: 1,
        transform: { undefined: null },
      },
    );
  });

  it('throws a clear error when createDatabase receives an empty string', () => {
    expect(() => createDatabase('   ')).toThrow(/DATABASE_URL/i);
  });

  it('caches getDatabase per URL and closes the previous pool when DATABASE_URL changes', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://localhost:5432/db_one');
    const first = getDatabase();
    const second = getDatabase();
    expect(first).toBe(second);
    expect(mocks.postgresFactory).toHaveBeenCalledTimes(1);

    vi.stubEnv('DATABASE_URL', 'postgres://localhost:5432/db_two');
    const third = getDatabase();
    expect(third).not.toBe(first);
    expect(mocks.postgresFactory).toHaveBeenCalledTimes(2);
    expect(mocks.endFn).toHaveBeenCalledWith({ timeout: 5 });
  });

  it('executes transaction queries sequentially with ReadCommitted isolation mode', async () => {
    vi.stubEnv('SHIFO_ENV_ID', 'final-preview');
    const db = createDatabase('postgres://localhost:5432/db_tx');

    const results = await db.transaction(
      (tx) => [tx`SELECT 1`, tx`SELECT 2`],
      { isolationLevel: 'ReadCommitted' },
    );

    expect(mocks.beginCalls).toEqual([{ mode: 'isolation level read committed' }]);
    expect(mocks.executionOrder).toEqual(['SELECT 1', 'SELECT 2']);
    expect(results).toEqual([[{ ok: true, label: 'SELECT 1' }], [{ ok: true, label: 'SELECT 2' }]]);
  });

  it('executes transaction without isolation options and delegates end()', async () => {
    vi.stubEnv('SHIFO_ENV_ID', 'final-preview');
    const db = createDatabase('postgres://localhost:5432/db_default');

    await db.transaction((tx) => [tx`SELECT 'a'`]);
    expect(mocks.beginCalls).toEqual([{ mode: undefined }]);

    await db.end({ timeout: 3 });
    expect(mocks.endFn).toHaveBeenCalledWith({ timeout: 3 });
  });

  it('exposes json() on db and tx inside ReadCommitted transactions without pre-stringifying', async () => {
    vi.stubEnv('SHIFO_ENV_ID', 'final-preview');
    const db = createDatabase('postgres://localhost:5432/db_json');
    const payload = { maxSystolic: 140, warnSystolic: 130 };

    const param = db.json(payload);
    expect(mocks.jsonFn).toHaveBeenCalledWith(payload);
    expect(param).toEqual({ type: 3802, value: payload, raw: payload });

    await db.transaction(
      (tx) => [tx`INSERT INTO t (v) VALUES (${tx.json(payload)}::jsonb)`],
      { isolationLevel: 'ReadCommitted' },
    );

    expect(mocks.beginCalls).toEqual([{ mode: 'isolation level read committed' }]);
    expect(mocks.queryCalls.at(-1)?.values[0]).toEqual({ type: 3802, value: payload, raw: payload });
  });

  it('blocks writes and transactions when SHIFO_ENV_ID is missing or environment_identity mismatches', async () => {
    vi.stubEnv('SHIFO_ENV_ID', '');
    const dbNoEnv = createDatabase('postgres://localhost:5432/db_guard_missing');
    await expect(dbNoEnv`INSERT INTO public.patients (name) VALUES ('Test')`).rejects.toBeInstanceOf(
      EnvironmentIdentityError,
    );
    await expect(dbNoEnv.transaction((tx) => [tx`SELECT 1`])).rejects.toBeInstanceOf(EnvironmentIdentityError);

    vi.stubEnv('SHIFO_ENV_ID', 'wrong-env');
    const dbMismatch = createDatabase('postgres://localhost:5432/db_guard_mismatch');
    await expect(assertDatabaseEnvironment(dbMismatch)).rejects.toBeInstanceOf(EnvironmentIdentityError);

    vi.stubEnv('SHIFO_ENV_ID', 'final-preview');
    await expect(assertDatabaseEnvironment(dbMismatch)).resolves.toBe('final-preview');
    await expect(dbMismatch`INSERT INTO public.patients (name) VALUES ('Test')`).resolves.toEqual([{ id: 'row-1' }]);
  });

  it('verifies real postgres client.json(obj) produces OID 3802 with raw value and PostgresError exposes .code', async () => {
    const actual = await vi.importActual<typeof import('postgres')>('postgres');
    const realClient = actual.default('postgres://user:pass@localhost:5432/test_db', { prepare: false });
    try {
      const obj = { kind: 'vitals', systolic: 135, diastolic: 85, chestPain: false };
      const param = realClient.json(obj);
      expect(param.type).toBe(3802);
      expect(param.value).toEqual(obj);
      expect(typeof param.value).toBe('object');

      const err = new actual.default.PostgresError('duplicate key value violates unique constraint');
      err.code = '23505';
      expect(err.code).toBe('23505');
    } finally {
      await realClient.end({ timeout: 0 });
    }
  });
});

describe('src/lib/supabase client helpers', () => {
  it('createSupabaseBrowserClient supports publishable key fallback and throws when env missing', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');
    expect(() => createSupabaseBrowserClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/i);

    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '   ');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_123');
    const client = createSupabaseBrowserClient();
    expect(client).toBe(mocks.browserClientMock);
    expect(mocks.createBrowserClient).toHaveBeenCalledWith('https://proj.supabase.co', 'sb_publishable_123');
  });

  it('createSupabaseServerClient awaits cookies() and swallows Server Component cookie.set errors', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-123');
    mocks.cookieStore.set.mockImplementation(() => {
      throw new Error('Cookies can only be modified in a Server Action or Route Handler');
    });

    const client = await createSupabaseServerClient();
    expect(client).toBe(mocks.serverClientMock);
    expect(mocks.createServerClient).toHaveBeenCalledWith(
      'https://proj.supabase.co',
      'anon-key-123',
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      }),
    );

    const handlers = mocks.getServerCookieHandlers();
    expect(handlers?.getAll?.()).toEqual([{ name: 'sb-token', value: 'abc' }]);
    expect(() =>
      handlers?.setAll?.([{ name: 'sb-token', value: 'xyz', options: { path: '/' } }], {}),
    ).not.toThrow();
  });

  it('createSupabaseAdminClient blocks browser execution, returns null when env missing, and disables session persistence', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-secret');

    const admin = createSupabaseAdminClient();
    expect(admin).toBe(mocks.adminClientMock);
    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://proj.supabase.co',
      'service-role-secret',
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );

    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '  ');
    expect(createSupabaseAdminClient()).toBeNull();

    vi.stubGlobal('window', {});
    expect(() => createSupabaseAdminClient()).toThrow(/server-only/i);
  });
});

describe('src/lib/supabase/middleware.ts and src/proxy.ts', () => {
  it('updateSession passes through without calling createServerClient when Supabase env vars are missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '');

    const request = new NextRequest('https://app.example.test/doctor');
    const response = await updateSession(request);

    expect(response).toBeInstanceOf(NextResponse);
    expect(response.status).toBe(200);
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it('updateSession forwards cookies AND accumulated Cache-Control/Expires/Pragma headers across multiple setAll calls', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-123');

    mocks.serverGetClaims.mockImplementation(async () => {
      const handlers = mocks.getServerCookieHandlers();
      await handlers?.setAll?.(
        [{ name: 'sb-access', value: 'token-1', options: { path: '/', httpOnly: true } }],
        {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
          Expires: '0',
          Pragma: 'no-cache',
        },
      );
      await handlers?.setAll?.(
        [{ name: 'sb-refresh', value: 'token-2', options: { path: '/', httpOnly: true } }],
        {},
      );
      return { data: { claims: { sub: 'user-1' } }, error: null };
    });

    const request = new NextRequest('https://app.example.test/doctor');
    const response = await updateSession(request);

    expect(response.headers.get('Cache-Control')).toBe(
      'private, no-cache, no-store, must-revalidate, max-age=0',
    );
    expect(response.headers.get('Expires')).toBe('0');
    expect(response.headers.get('Pragma')).toBe('no-cache');
    expect(response.cookies.get('sb-access')?.value).toBe('token-1');
    expect(response.cookies.get('sb-refresh')?.value).toBe('token-2');
    expect(request.cookies.get('sb-access')?.value).toBe('token-1');
    expect(request.cookies.get('sb-refresh')?.value).toBe('token-2');
  });

  it('updateSession preserves distinct (name, domain, path) cookies when setAll emits host-only and domain-scoped entries for the same name', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-123');

    mocks.serverGetClaims.mockImplementation(async () => {
      const handlers = mocks.getServerCookieHandlers();
      await handlers?.setAll?.(
        [
          { name: 'sb-auth', value: '', options: { path: '/', maxAge: 0 } },
          { name: 'sb-auth', value: '', options: { path: '/', domain: '.example.test', maxAge: 0 } },
        ],
        {
          'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
        },
      );
      await handlers?.setAll?.(
        [{ name: 'sb-auth', value: 'fresh-subpath', options: { path: '/doctor', httpOnly: true } }],
        {},
      );
      return { data: { claims: { sub: 'user-1' } }, error: null };
    });

    const response = await updateSession(new NextRequest('https://app.example.test/doctor'));
    const setCookies = response.headers.getSetCookie();

    expect(setCookies).toHaveLength(3);
    expect(setCookies.some((c) => c.startsWith('sb-auth=;') && c.includes('Path=/') && !c.includes('Domain='))).toBe(
      true,
    );
    expect(
      setCookies.some(
        (c) => c.startsWith('sb-auth=;') && c.includes('Path=/') && c.includes('Domain=.example.test'),
      ),
    ).toBe(true);
    expect(setCookies.some((c) => c.startsWith('sb-auth=fresh-subpath;') && c.includes('Path=/doctor'))).toBe(true);
  });

  it('updateSession tolerates unreachable auth / getClaims failures in offline mode', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-123');
    mocks.serverGetClaims.mockRejectedValue(new Error('network unreachable'));

    const response = await updateSession(new NextRequest('https://app.example.test/patient'));
    expect(response.status).toBe(200);
  });

  it('proxy short-circuits /caregiver and /caregiver/:path* with 405 on POST and NextResponse.next on GET/HEAD without invoking Supabase', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-123');

    for (const path of ['/caregiver', '/caregiver/secret-token-123']) {
      const postResp = await proxy(new NextRequest(`https://app.example.test${path}`, { method: 'POST' }));
      expect(postResp.status).toBe(405);
      expect(postResp.headers.get('Allow')).toBe('GET, HEAD');
      expect(postResp.headers.get('Cache-Control')).toBe('private, no-store');

      const getResp = await proxy(new NextRequest(`https://app.example.test${path}`, { method: 'GET' }));
      expect(getResp.status).toBe(200);

      const headResp = await proxy(new NextRequest(`https://app.example.test${path}`, { method: 'HEAD' }));
      expect(headResp.status).toBe(200);
    }

    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });

  it('proxy forwards /api/caregiver/ack POST and app routes to updateSession', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-123');

    const ackResp = await proxy(
      new NextRequest('https://app.example.test/api/caregiver/ack', { method: 'POST' }),
    );
    expect(ackResp.status).toBe(200);
    expect(mocks.createServerClient).toHaveBeenCalledTimes(1);
    expect(mocks.serverGetClaims).toHaveBeenCalledTimes(1);
  });

  it('proxy config.matcher matches app/caregiver/API routes and excludes static assets and ML model files', () => {
    const shouldMatch = [
      '/',
      '/login',
      '/caregiver',
      '/caregiver/tok_123',
      '/api/caregiver/ack',
      '/api/clinical/plan',
      '/doctor',
      '/models-something',
    ];
    for (const url of shouldMatch) {
      expect(
        unstable_doesMiddlewareMatch({ config: proxyConfig, nextConfig, url }),
        `expected ${url} to match proxy`,
      ).toBe(true);
    }

    const shouldExclude = [
      '/_next/static/chunks/app.js',
      '/_next/image?url=%2Fdemo%2Fbox-1.png&w=640&q=75',
      '/favicon.ico',
      '/demo/pose-cdc-lower-body.mp4',
      '/models',
      '/models/pose_landmarker_lite.task',
      '/models/LICENSE.txt',
      '/models/wasm/ort.wasm',
      '/models/wasm/vision_wasm_internal.wasm',
      '/models/wasm/vision_wasm_internal.js',
      '/models/wasm/vision_wasm_module_internal.wasm',
      '/models/wasm/vision_wasm_module_internal.js',
      '/assets/custom.wasm',
      '/audio/uz/rep_1.mp3',
      '/demo/box-1.png',
    ];
    for (const url of shouldExclude) {
      expect(
        unstable_doesMiddlewareMatch({ config: proxyConfig, nextConfig, url }),
        `expected ${url} to be excluded from proxy`,
      ).toBe(false);
    }
  });
});

describe('next.config.ts CSP and caregiver headers', () => {
  it('extends connect-src for Supabase HTTPS/WSS while preserving /caregiver/:path* security headers', async () => {
    const headerRules = await nextConfig.headers?.();
    expect(headerRules).toBeDefined();

    const rootRule = headerRules?.find((rule) => rule.source === '/:path*');
    const csp = rootRule?.headers.find((h) => h.key === 'Content-Security-Policy')?.value;
    expect(csp).toBe("connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co");

    const caregiverRule = headerRules?.find((rule) => rule.source === '/caregiver/:path*');
    expect(caregiverRule?.headers).toEqual([
      { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'X-Frame-Options', value: 'DENY' },
    ]);

    expect(nextConfig.outputFileTracingIncludes).toEqual({
      '/api/demo/dorimos': ['./public/demo/box-*.png'],
      '/api/clinical/dorimos': ['./public/demo/box-*.png'],
      '/api/mobile/v1/dorimos': ['./public/demo/box-*.png'],
      '/api/demo/exercise-analysis': [
        './public/demo/pose-cdc-lower-body.mp4',
        './public/demo/pose-cdc-contact-sheet.jpg',
      ],
      '/api/mobile/v1/exercise/sample-ai': [
        './public/demo/pose-cdc-lower-body.mp4',
        './public/demo/pose-cdc-contact-sheet.jpg',
      ],
    });
  });
});
