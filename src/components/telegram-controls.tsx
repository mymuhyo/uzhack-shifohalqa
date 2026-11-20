'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import styles from './telegram-panel.module.css';

type Action = 'pair' | 'disconnect';

async function readPairingLink(response: Response) {
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || !('href' in payload) || typeof payload.href !== 'string') {
    throw new Error('Invalid pairing link');
  }
  const url = new URL(payload.href);
  if (url.origin !== 'https://t.me' || !url.searchParams.has('start')) throw new Error('Invalid pairing link');
  return url.href;
}

export function DoctorTelegramControls({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [href, setHref] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [feedback, setFeedback] = useState('');
  const pairing = !connected && href;

  function refresh() {
    startRefresh(() => router.refresh());
  }

  async function change(action: Action) {
    setPending(true);
    setFeedback('');
    try {
      const response = await fetch('/api/demo/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (response.status === 409 && action === 'pair') {
        setHref(null);
        setFeedback('Ulanish holati yangilandi.');
        refresh();
      } else if (!response.ok) {
        setFeedback('Amal bajarilmadi. Qayta urinib ko‘ring.');
      } else if (action === 'pair') {
        setHref(await readPairingLink(response));
        setFeedback('Ulash havolasi tayyor.');
      } else {
        setHref(null);
        setFeedback('Telegram ulanishi bekor qilindi.');
        refresh();
      }
    } catch {
      setFeedback('Amal bajarilmadi. Qayta urinib ko‘ring.');
    } finally {
      setPending(false);
    }
  }

  const busy = pending || refreshing;
  return (
    <div className={styles.controls}>
      <p role="status">
        {refreshing ? 'Ulanish tekshirilmoqda…' : connected ? 'Telegram ulangan.' : 'Telegram ulanmagan.'}
        {feedback && ` ${feedback}`}
      </p>
      {pairing && (
        <>
          <p>Havola 10 daqiqa amal qiladi. Telegramda Start tugmasini bosing, so‘ng ulanish holatini tekshiring.</p>
          <a className="text-action" href={pairing} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
            Telegramda ulashni yakunlash
          </a>
        </>
      )}
      <div className={styles.actions}>
        {!connected && (
          <button className="text-action" type="button" disabled={busy} onClick={() => void change('pair')}>
            {pairing ? 'Yangi ulash havolasi' : 'Telegramni ulash'}
          </button>
        )}
        {(connected || pairing) && (
          <button className="text-action" type="button" disabled={busy} onClick={() => void change('disconnect')}>
            {connected ? 'Telegramni uzish' : 'Ulashni bekor qilish'}
          </button>
        )}
        {pairing && (
          <button className="text-action" type="button" disabled={busy} onClick={() => {
            setFeedback('');
            refresh();
          }}>
            Ulanishni tekshirish
          </button>
        )}
      </div>
    </div>
  );
}
