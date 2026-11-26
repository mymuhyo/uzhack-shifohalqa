import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createTelegramAccessToken, verifyTelegramAccessToken, verifyTelegramInitData } from '../../src/lib/telegram-auth';

const botToken = '123456:example-telegram-bot-token-for-unit-test';
const key = 'telegram-access-test-secret-at-least-32-characters';
const now = 1_800_000_000;
const linkId = '10000000-0000-4000-8000-000000000001';

function signedLaunch(authDate: number) {
  const data = new URLSearchParams({
    user: JSON.stringify({ id: 42, first_name: 'Dilnoza' }),
    auth_date: String(authDate),
    query_id: 'sample',
  });
  const key = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', key)
    .update([...data].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n'))
    .digest('hex');
  data.set('hash', hash);
  return data.toString();
}

describe('Telegram Mini App credentials', () => {
  it('accepts a recent signed launch and rejects tampered, duplicate, expired and future data', () => {
    const launch = signedLaunch(now - 10);
    expect(verifyTelegramInitData(launch, botToken, now)).toEqual({ chatId: 42, authDate: now - 10 });
    expect(verifyTelegramInitData(launch.replace('Dilnoza', 'Other'), botToken, now)).toBeNull();
    expect(verifyTelegramInitData(`${launch}&auth_date=${now - 10}`, botToken, now)).toBeNull();
    expect(verifyTelegramInitData(signedLaunch(now - 301), botToken, now)).toBeNull();
    expect(verifyTelegramInitData(signedLaunch(now + 31), botToken, now)).toBeNull();
  });

  it('binds access to one link and gives a repeated exchange the same deadline', () => {
    const launch = { chatId: 42, authDate: now - 10 };
    const session = createTelegramAccessToken(launch, linkId, key);
    expect(createTelegramAccessToken(launch, linkId, key)).toEqual(session);
    expect(verifyTelegramAccessToken(session.token, key, now)).toEqual({
      chatId: 42, linkId, expiresAt: launch.authDate + 1800,
    });
    expect(verifyTelegramAccessToken(session.token, key, session.expiresAt)).toBeNull();
    expect(verifyTelegramAccessToken(session.token, 'a different key', now)).toBeNull();
    expect(verifyTelegramAccessToken(`${session.token}a`, key, now)).toBeNull();
  });
});
