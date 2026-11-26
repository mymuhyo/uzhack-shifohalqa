import type { Metadata } from 'next';
import { TelegramMiniApp } from '@/components/telegram-mini-app';
import { isDemoEnabled } from '@/lib/demo-session';
import { getTelegramBotUsername } from '@/lib/telegram-web';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Telegram Mini App',
  robots: { index: false, follow: false },
};

type MiniAppTab = 'today' | 'exercise' | 'report' | 'privacy';

function parseTab(raw: string | undefined): MiniAppTab {
  if (raw === 'exercise' || raw === 'report' || raw === 'privacy') return raw;
  return 'today';
}

export default async function TelegramPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string | string[]; tab?: string | string[] }>;
}) {
  const demoEnabled = isDemoEnabled();
  const botUsername = getTelegramBotUsername();
  const params = await searchParams;
  const rawFocus = Array.isArray(params.focus) ? params.focus[0] : params.focus;
  const rawTab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const focus = rawFocus === 'doctor' || rawFocus === 'patient' ? rawFocus : null;
  const initialTab = parseTab(rawTab);

  return (
    <main className="frame content !pt-4 !pb-8" id="content" tabIndex={-1}>
      <TelegramMiniApp
        demoEnabled={demoEnabled}
        botUsername={botUsername}
        focus={focus}
        initialTab={initialTab}
      />
    </main>
  );
}
