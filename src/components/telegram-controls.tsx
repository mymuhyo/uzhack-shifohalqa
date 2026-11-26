'use client';

import { useState, useTransition } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useClinicalClient, useHydrated } from '@/lib/clinical-client-fetch';
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

export function DoctorTelegramControls({
  connected,
  isDemo = true,
  isPatient = false,
  initialDetailsEnabled = false,
}: {
  connected: boolean;
  isDemo?: boolean;
  isPatient?: boolean;
  initialDetailsEnabled?: boolean;
}) {
  const client = useClinicalClient();
  const hydrated = useHydrated();
  const endpoint = client.bearerToken
    ? '/api/clinical/telegram'
    : (isDemo ? '/api/demo/telegram' : '/api/clinical/telegram');
  const [href, setHref] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [overrideDetails, setOverrideDetails] = useState<boolean | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [feedback, setFeedback] = useState('');
  const pairing = !connected && href;
  const detailsEnabled = connected ? (overrideDetails ?? initialDetailsEnabled) : false;

  function refresh() {
    startRefresh(() => client.refresh());
  }

  async function change(action: Action) {
    setPending(true);
    setFeedback('');
    try {
      const response = await client.fetchJson(endpoint, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      if (response.status === 409 && action === 'pair') {
        setHref(null);
        setFeedback('Ulanish holati yangilandi.');
        refresh();
      } else if (!response.ok) {
        client.hapticNotify('error');
        setFeedback('Amal bajarilmadi. Qayta urinib ko‘ring.');
      } else if (action === 'pair') {
        setHref(await readPairingLink(response));
        client.hapticNotify('success');
        setFeedback('Ulash havolasi tayyor.');
      } else {
        setHref(null);
        setOverrideDetails(false);
        client.hapticNotify('success');
        setFeedback('Telegram ulanishi bekor qilindi.');
        refresh();
      }
    } catch {
      client.hapticNotify('error');
      setFeedback('Amal bajarilmadi. Qayta urinib ko‘ring.');
    } finally {
      setPending(false);
    }
  }

  async function toggleDetails() {
    if (!isPatient || !connected) return;
    const next = !detailsEnabled;
    setPending(true);
    setFeedback('');
    try {
      const response = await client.fetchJson(endpoint, {
        method: 'POST',
        body: JSON.stringify({ action: 'set_details', detailsEnabled: next }),
      });
      if (!response.ok) {
        client.hapticNotify('error');
        setFeedback('Maxfiylik sozlamasini yangilab bo‘lmadi.');
        return;
      }
      const data = (await response.json()) as { detailsEnabled?: boolean };
      const saved = typeof data.detailsEnabled === 'boolean' ? data.detailsEnabled : next;
      setOverrideDetails(saved);
      client.hapticNotify('success');
      setFeedback(
        saved
          ? 'Chatda batafsil xabarlar yoqildi.'
          : 'Chat xabarlari maxfiy (umumiy) rejimga o‘tkazildi.',
      );
      refresh();
    } catch {
      client.hapticNotify('error');
      setFeedback('Maxfiylik sozlamasini yangilab bo‘lmadi.');
    } finally {
      setPending(false);
    }
  }

  const busy = !hydrated || pending || refreshing;
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
          <button
            className="text-action"
            type="button"
            disabled={busy}
            onClick={() => {
              setFeedback('');
              refresh();
            }}
          >
            Ulanishni tekshirish
          </button>
        )}
      </div>
      {isPatient && connected && (
        <div className="mt-2 rounded-[7.2px] border border-border bg-secondary p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-medium">
              {detailsEnabled ? (
                <ShieldCheck className="size-4 text-[var(--ok)]" aria-hidden="true" />
              ) : (
                <ShieldOff className="size-4 text-muted-foreground" aria-hidden="true" />
              )}
              <span>
                {detailsEnabled ? 'Chatda batafsil xabarlar: Yoqilgan' : 'Chatda batafsil xabarlar: O‘chiq (maxfiy)'}
              </span>
            </span>
            <button
              type="button"
              className="switch-chip"
              aria-pressed={detailsEnabled}
              disabled={busy}
              onClick={() => void toggleDetails()}
            >
              {detailsEnabled ? 'Maxfiy rejimga o‘tkazish' : 'Batafsil xabarlarni yoqish'}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {detailsEnabled
              ? 'Telegram bot chatida dori nomlari, 7 kunlik qisqa xulosa va L4 shifokor javoblari ko‘rsatiladi.'
              : 'Sukut bo‘yicha chatda dori nomi va javob matni yashiriladi; faqat umumiy xabar va Mini App havolasi yuboriladi.'}
          </p>
        </div>
      )}
    </div>
  );
}
