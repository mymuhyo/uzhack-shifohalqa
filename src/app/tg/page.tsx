import type { Metadata } from 'next';
import { TelegramMiniApp } from '@/components/telegram-mini-app';
import { isDemoEnabled } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Telegram Mini App',
  robots: { index: false, follow: false },
};

export default function TelegramPage() {
  const demoEnabled = isDemoEnabled();
  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <h1>ShifoHalqa · Telegram</h1>
      <p className="lede">Bemor, shifokor va mashq tahlili uchun ixcham tezkor kirish oynasi.</p>
      <TelegramMiniApp demoEnabled={demoEnabled} />
    </main>
  );
}
