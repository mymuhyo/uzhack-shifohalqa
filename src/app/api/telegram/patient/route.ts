import { z } from 'zod';
import { mobileJson, readMobileBody } from '../../../../lib/mobile-demo';
import { getTelegramPatientForToken } from '../../../../lib/telegram-auth';
import { readTelegramDashboard } from '../../../../lib/telegram-patient';
import { readTelegramNoticeReply, setTelegramPatientDetails, telegramNoticeKind } from '../../../../lib/telegram-store';

async function session(request: Request) {
  const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  return token ? getTelegramPatientForToken(token) : null;
}

export async function GET(request: Request) {
  try {
    const link = await session(request);
    if (!link) return mobileJson({ error: 'unauthorized' }, 401);
    const params = new URL(request.url).searchParams;
    if (params.has('reply')) {
      const input = z.object({ kind: telegramNoticeKind, reply: z.uuid() }).safeParse({
        kind: params.get('kind'), reply: params.get('reply'),
      });
      if (!input.success) return mobileJson({ error: 'invalid' }, 400);
      const reply = await readTelegramNoticeReply(link, input.data.kind, input.data.reply);
      return reply ? mobileJson({ reply }) : mobileJson({ error: 'not_found' }, 404);
    }
    return mobileJson(await readTelegramDashboard(link));
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const link = await session(request);
    if (!link) return mobileJson({ error: 'unauthorized' }, 401);
    const body = await readMobileBody(request);
    if (!body.ok) return mobileJson({ error: 'invalid' }, body.status);
    const input = z.strictObject({ detailsEnabled: z.boolean() }).safeParse(body.body);
    if (!input.success) return mobileJson({ error: 'invalid' }, 400);
    return await setTelegramPatientDetails(link, input.data.detailsEnabled)
      ? mobileJson(input.data) : mobileJson({ error: 'not_found' }, 404);
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
