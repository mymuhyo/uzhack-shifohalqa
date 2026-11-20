import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const cookieName = 'shifohalqa_demo';
const sessionLifetimeSeconds = 8 * 60 * 60;
const signedTokenPattern = /^[A-Za-z0-9_-]{1,192}\.[A-Za-z0-9_-]{43}$/;

export const demoRoleSchema = z.enum(['doctor', 'patient']);
type DemoRole = z.infer<typeof demoRoleSchema>;

const sessionSchema = z.strictObject({
  workspaceId: z.uuidv4(),
  role: demoRoleSchema,
  expiresAt: z.int().positive(),
});

type DemoSession = Pick<z.infer<typeof sessionSchema>, 'workspaceId' | 'role'>;

function getSigningSecret(): string | undefined {
  const secret = process.env.SESSION_SECRET?.trim();
  return process.env.DEMO_MODE === 'true' && secret && secret.length >= 32 ? secret : undefined;
}

export function isDemoEnabled(): boolean {
  return getSigningSecret() !== undefined;
}

function sign(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`shifohalqa-demo-v1.${payload}`).digest();
}

function readSignedSession(token: string | undefined, secret: string): DemoSession | null {
  if (!token || !signedTokenPattern.test(token)) return null;

  const [payload = '', signature = ''] = token.split('.');
  const received = Buffer.from(signature, 'base64url');
  const expected = sign(payload, secret);
  if (received.length !== expected.length || received.toString('base64url') !== signature) return null;
  if (!timingSafeEqual(received, expected)) return null;

  const payloadBytes = Buffer.from(payload, 'base64url');
  if (payloadBytes.toString('base64url') !== payload) return null;

  try {
    const parsed = sessionSchema.safeParse(JSON.parse(payloadBytes.toString('utf8')));
    if (!parsed.success || parsed.data.expiresAt <= Math.floor(Date.now() / 1000)) return null;
    const { workspaceId, role } = parsed.data;
    return { workspaceId, role };
  } catch {
    return null;
  }
}

export async function getDemoSession(): Promise<DemoSession | null> {
  const secret = getSigningSecret();
  if (!secret) return null;

  const store = await cookies();
  return readSignedSession(store.get(cookieName)?.value, secret);
}

export function isSameOriginDemoPost(request: NextRequest): boolean {
  // The App Router can use its internal listen address in nextUrl on self-hosted Node.
  const host = request.headers.get('host') ?? request.nextUrl.host;
  return request.headers.get('origin') === `${request.nextUrl.protocol}//${host.toLowerCase()}`;
}

function setCookie(response: NextResponse, request: NextRequest, value: string, maxAge: number) {
  response.cookies.set(cookieName, value, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function issueDemoSession(request: NextRequest, response: NextResponse, role: DemoRole): boolean {
  const secret = getSigningSecret();
  if (!secret) return false;

  const previous = readSignedSession(request.cookies.get(cookieName)?.value, secret);
  const payload = Buffer.from(JSON.stringify({
    workspaceId: previous?.workspaceId ?? randomUUID(),
    role,
    expiresAt: Math.floor(Date.now() / 1000) + sessionLifetimeSeconds,
  })).toString('base64url');
  setCookie(response, request, `${payload}.${sign(payload, secret).toString('base64url')}`, sessionLifetimeSeconds);
  return true;
}

export function clearDemoSession(request: NextRequest, response: NextResponse): void {
  setCookie(response, request, '', 0);
}
