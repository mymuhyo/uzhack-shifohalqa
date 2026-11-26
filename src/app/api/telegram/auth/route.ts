import { z } from 'zod';
import { mobileJson } from '../../../../lib/mobile-demo';
import { readRequestJson } from '../../../../lib/request-body';
import { createTelegramAccessToken, getTelegramSigningSecret, verifyTelegramInitData } from '../../../../lib/telegram-auth';
import { getTelegramPatientLink } from '../../../../lib/telegram-store';

const launchInput = z.strictObject({ initData: z.string().min(1).max(12000) });

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = getTelegramSigningSecret();
  if (!botToken || !secret) return mobileJson({ error: 'unavailable' }, 503);

  const body = await readRequestJson(request, 16 * 1024);
  if (!body.ok) return mobileJson({ error: 'invalid' }, body.status);
  const input = launchInput.safeParse(body.body);
  if (!input.success) return mobileJson({ error: 'invalid' }, 400);
  const launch = verifyTelegramInitData(input.data.initData, botToken);
  if (!launch) return mobileJson({ error: 'unauthorized' }, 401);

  try {
    const link = await getTelegramPatientLink(launch.chatId);
    if (!link) return mobileJson({ error: 'not_linked' }, 403);
    if (link.connectedAt > launch.authDate) return mobileJson({ error: 'reopen' }, 401);
    return mobileJson(createTelegramAccessToken(launch, link.linkId, secret));
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
