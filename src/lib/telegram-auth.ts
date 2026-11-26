import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getTelegramPatientLink } from './telegram-store';

const launchLifetime = 5 * 60;
const accessLifetime = 30 * 60;
const clockSkew = 30;
const tokenPrefix = 'tg1';
const accessPattern = /^tg1\.([A-Za-z0-9_-]{1,256})\.([A-Za-z0-9_-]{43})$/;
const chatIdSchema = z.int().min(1).max(4503599627370495);
const launchUserSchema = z.object({ id: chatIdSchema, is_bot: z.literal(false).optional() });
const accessSchema = z.strictObject({
  chatId: chatIdSchema,
  linkId: z.uuid(),
  expiresAt: z.int().positive(),
});

type VerifiedLaunch = { chatId: number; authDate: number };

export function verifyTelegramInitData(raw: string, botToken: string, now = Math.floor(Date.now() / 1000)): VerifiedLaunch | null {
  if (!raw || raw.length > 12000 || !botToken) return null;
  const fields = new Map<string, string>();
  for (const [name, value] of new URLSearchParams(raw)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name) || /[\r\n]/.test(value) || fields.has(name)) return null;
    fields.set(name, value);
  }
  const hash = fields.get('hash');
  const authDateField = fields.get('auth_date');
  const userField = fields.get('user');
  if (!hash || !/^[a-f0-9]{64}$/.test(hash) || !authDateField || !/^\d{1,12}$/.test(authDateField) || !userField) return null;
  const authDate = Number(authDateField);
  if (authDate < now - launchLifetime || authDate > now + clockSkew) return null;

  fields.delete('hash');
  const check = [...fields.keys()].sort().map((name) => `${name}=${fields.get(name)}`).join('\n');
  const key = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', key).update(check).digest();
  if (!timingSafeEqual(Buffer.from(hash, 'hex'), expected)) return null;

  try {
    const user = launchUserSchema.safeParse(JSON.parse(userField));
    return user.success ? { chatId: user.data.id, authDate } : null;
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(`shifohalqa-telegram-access.${tokenPrefix}.${payload}`).digest();
}

export function createTelegramAccessToken(launch: VerifiedLaunch, linkId: string, secret: string) {
  // Reopening the same signed launch never extends its lifetime.
  const expiresAt = launch.authDate + accessLifetime;
  const payload = Buffer.from(JSON.stringify({ chatId: launch.chatId, linkId, expiresAt })).toString('base64url');
  return { token: `${tokenPrefix}.${payload}.${sign(payload, secret).toString('base64url')}`, expiresAt };
}

export function verifyTelegramAccessToken(token: string, secret: string, now = Math.floor(Date.now() / 1000)) {
  const match = accessPattern.exec(token);
  if (!match) return null;
  const [, payload, signature] = match;
  const received = Buffer.from(signature, 'base64url');
  if (received.toString('base64url') !== signature || !timingSafeEqual(received, sign(payload, secret))) return null;
  const bytes = Buffer.from(payload, 'base64url');
  if (bytes.toString('base64url') !== payload) return null;
  try {
    const result = accessSchema.safeParse(JSON.parse(bytes.toString('utf8')));
    return result.success && result.data.expiresAt > now ? result.data : null;
  } catch {
    return null;
  }
}

export function getTelegramSigningSecret() {
  const configured = process.env.SESSION_SECRET?.trim();
  return configured && configured.length >= 32 ? configured : null;
}

export function isTelegramAccessToken(token: string) {
  return token.startsWith(`${tokenPrefix}.`);
}

export async function getTelegramPatientForToken(token: string) {
  const secret = getTelegramSigningSecret();
  if (!secret) return null;
  const claims = verifyTelegramAccessToken(token, secret);
  return claims ? getTelegramPatientLink(claims.chatId, claims.linkId) : null;
}
