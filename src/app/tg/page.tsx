import type { Metadata } from 'next';
import { TelegramMiniApp } from '@/components/telegram-mini-app';
import { isDemoEnabled } from '@/lib/demo-session';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Telegram Mini App',
  robots: { index: false, follow: false },
};

export default async function TelegramPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demoEnabled = isDemoEnabled();
  const params = await searchParams;
  const param = (name: string) => typeof params[name] === 'string' ? params[name] : undefined;
  const rawFocus = param('focus');
  const focus = rawFocus === 'doctor' || rawFocus === 'patient' ? rawFocus : null;
  const target = z.object({
    tab: z.enum(['bp', 'steps', 'report', 'exercise', 'privacy']).optional(),
    task: z.uuid().optional(),
    reply: z.uuid().optional(),
    kind: z.enum(['doctor_reply', 'exercise_reply', 'brief_reply']).optional(),
  }).refine(({ reply, kind }) => Boolean(reply) === Boolean(kind))
    .safeParse({ tab: param('tab'), task: param('task'), reply: param('reply'), kind: param('kind') });

  return (
    <main id="content" tabIndex={-1}>
      <TelegramMiniApp demoEnabled={demoEnabled} focus={focus} target={target.success ? target.data : {}} />
    </main>
  );
}
