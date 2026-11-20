import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as login } from '../../src/app/api/demo/login/route';
import { POST as logout } from '../../src/app/api/demo/logout/route';
import { getDemoSession, isDemoEnabled } from '../../src/lib/demo-session';

const cookieName = 'shifohalqa_demo';
const secureOrigin = 'https://demo.example.test';
const testSecret = 'demo-session-key-used-only-for-tests';
const currentCookie = vi.hoisted(() => ({ value: undefined as string | undefined }));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => name === cookieName && currentCookie.value
      ? { value: currentCookie.value }
      : undefined,
  }),
}));

function loginRequest(
  role: string,
  { base = secureOrigin, origin = base, cookie }: { base?: string; origin?: string; cookie?: string } = {},
) {
  const headers = new Headers({ origin, host: new URL(base).host });
  if (cookie) headers.set('cookie', `${cookieName}=${cookie}`);
  return new NextRequest(`${base}/api/demo/login`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ role }),
  });
}

function readIssuedCookie(response: Response) {
  const header = response.headers.get('set-cookie') ?? '';
  expect(header).toMatch(/^shifohalqa_demo=[^;]+;/);
  return header.slice(cookieName.length + 1, header.indexOf(';'));
}

beforeEach(() => {
  currentCookie.value = undefined;
  vi.stubEnv('DEMO_MODE', 'true');
  vi.stubEnv('SESSION_SECRET', testSecret);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('demo session', () => {
  it('requires demo mode and a nonblank signing secret of sufficient length', async () => {
    expect(isDemoEnabled()).toBe(true);
    vi.stubEnv('SESSION_SECRET', ' '.repeat(40));
    expect(isDemoEnabled()).toBe(false);
    vi.stubEnv('SESSION_SECRET', 'a'.repeat(31));
    expect(isDemoEnabled()).toBe(false);
    vi.stubEnv('SESSION_SECRET', testSecret);
    vi.stubEnv('DEMO_MODE', 'false');
    expect(isDemoEnabled()).toBe(false);
    const response = await login(loginRequest('doctor'));
    expect(response.status).toBe(404);
    expect(response.headers.has('set-cookie')).toBe(false);
  });

  it('issues a signed patient session with a scoped cookie and a GET redirect', async () => {
    const response = await login(loginRequest('patient'));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/patient');
    const header = response.headers.get('set-cookie') ?? '';
    expect(header).toMatch(/; Path=\//i);
    expect(header).toMatch(/; Max-Age=28800/i);
    expect(header).toMatch(/; HttpOnly/i);
    expect(header).toMatch(/; Secure/i);
    expect(header).toMatch(/; SameSite=Lax/i);
    currentCookie.value = readIssuedCookie(response);
    expect(await getDemoSession()).toEqual({ role: 'patient', workspaceId: expect.any(String) });
  });

  it('retains the workspace when the same browser chooses the other role', async () => {
    const patient = await login(loginRequest('patient'));
    currentCookie.value = readIssuedCookie(patient);
    const before = await getDemoSession();
    const doctor = await login(loginRequest('doctor', { cookie: currentCookie.value }));
    expect(doctor.headers.get('location')).toBe('/doctor');
    currentCookie.value = readIssuedCookie(doctor);
    expect(await getDemoSession()).toEqual({ role: 'doctor', workspaceId: before?.workspaceId });
  });

  it('issues separate workspaces to two first-time browsers', async () => {
    currentCookie.value = readIssuedCookie(await login(loginRequest('patient')));
    const first = await getDemoSession();
    currentCookie.value = readIssuedCookie(await login(loginRequest('patient')));
    const second = await getDemoSession();
    expect(first?.workspaceId).toBeDefined();
    expect(second?.workspaceId).toBeDefined();
    expect(second?.workspaceId).not.toBe(first?.workspaceId);
  });

  it('accepts HTTP on the browser smoke test loopback address', async () => {
    const response = await login(loginRequest('doctor', { base: 'http://127.0.0.1:3000' }));
    expect(response.status).toBe(303);
    expect(response.headers.get('set-cookie')).not.toMatch(/; Secure/i);
  });

  it('rejects roles outside the two demo choices', async () => {
    const response = await login(loginRequest('admin'));
    expect(response.status).toBe(400);
    expect(response.headers.has('set-cookie')).toBe(false);
  });

  it('rejects login from a different origin', async () => {
    const response = await login(loginRequest('doctor', { origin: 'https://other.example.test' }));
    expect(response.status).toBe(403);
    expect(response.headers.has('set-cookie')).toBe(false);
  });

  it('rejects a submission with ambiguous role input', async () => {
    const response = await login(new NextRequest(`${secureOrigin}/api/demo/login`, {
      method: 'POST',
      headers: { origin: secureOrigin },
      body: new URLSearchParams([['role', 'doctor'], ['role', 'patient']]),
    }));
    expect(response.status).toBe(400);
    expect(response.headers.has('set-cookie')).toBe(false);
  });

  it('ignores damaged signing data', async () => {
    const cookie = readIssuedCookie(await login(loginRequest('patient')));
    currentCookie.value = `${cookie[0] === 'A' ? 'B' : 'A'}${cookie.slice(1)}`;
    expect(await getDemoSession()).toBeNull();
  });

  it('rejects a token when its session expires', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    currentCookie.value = readIssuedCookie(await login(loginRequest('doctor')));
    clock.mockReturnValue(1_800_028_800_000);
    expect(await getDemoSession()).toBeNull();
  });

  it('clears the browser session on same-origin logout', async () => {
    const response = await logout(new NextRequest(`${secureOrigin}/api/demo/logout`, {
      method: 'POST',
      headers: { origin: secureOrigin },
    }));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(response.headers.get('set-cookie')).toMatch(/^shifohalqa_demo=;/);
    expect(response.headers.get('set-cookie')).toMatch(/; Max-Age=0/i);
  });

  it('rejects logout without a same-origin POST', async () => {
    const response = await logout(new NextRequest(`${secureOrigin}/api/demo/logout`, { method: 'POST' }));
    expect(response.status).toBe(403);
    expect(response.headers.has('set-cookie')).toBe(false);
  });
});
