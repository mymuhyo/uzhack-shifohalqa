'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useCallback, useEffect, useState } from 'react';
import { TelegramPatient, type TelegramTarget } from './telegram-patient';
import { readTelegramWebApp } from './telegram-sdk';
import styles from './telegram-mini-app.module.css';

type Session = { token: string; expiresAt: number } | { error: string };

export function TelegramMiniApp({ demoEnabled, focus, target }: {
  demoEnabled: boolean;
  focus: 'doctor' | 'patient' | null;
  target: TelegramTarget;
}) {
  const [launch, setLaunch] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>();

  const start = useCallback(() => {
    const app = readTelegramWebApp();
    app?.ready?.();
    app?.expand?.();
    setTheme(app?.colorScheme);
    setLaunch(app?.initData ?? '');
  }, []);

  useEffect(() => {
    if (!launch || focus === 'doctor') return;
    const controller = new AbortController();
    void fetch('/api/telegram/auth', {
      method: 'POST', credentials: 'omit', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: launch }),
    }).then(async (response) => {
      const data = await response.json();
      if (!controller.signal.aborted) {
        setSession(response.ok && typeof data.token === 'string' && Number.isSafeInteger(data.expiresAt)
          ? { token: data.token, expiresAt: data.expiresAt } : { error: String(data.error ?? 'unavailable') });
      }
    }).catch(() => {
      if (!controller.signal.aborted) setSession({ error: 'unavailable' });
    });
    return () => controller.abort();
  }, [focus, launch]);

  useEffect(() => {
    if (!launch) return;
    const app = readTelegramWebApp();
    const syncTheme = () => setTheme(app?.colorScheme);
    app?.onEvent?.('themeChanged', syncTheme);
    return () => app?.offEvent?.('themeChanged', syncTheme);
  }, [launch]);

  return (
    <div className={styles.surface} data-telegram-theme={theme}>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive"
        onReady={start} onError={() => setLaunch('')} />
      {focus === 'doctor' ? (
        <section className={styles.entry}>
          <h1>Shifokor veb-paneli</h1>
          <p>Murojaatlar va bemor qaydlarini brauzerda ko‘ring.</p>
          <Link className="role-button" href="/doctor" target="_blank" rel="noreferrer">Shifokor panelini ochish</Link>
        </section>
      ) : launch === null || (launch && !session) ? (
        <p className={styles.feedback} role="status">ShifoHalqa ochilmoqda…</p>
      ) : session && 'token' in session ? (
        <TelegramPatient token={session.token} expiresAt={session.expiresAt} target={target} />
      ) : launch ? (
        <section className={styles.entry}>
          <h1>{session && 'error' in session && session.error === 'not_linked' ? 'Telegramni ulang' : 'Mini App ochilmadi'}</h1>
          <p>{session && 'error' in session && session.error === 'not_linked'
            ? 'Bemor sahifasidagi Telegramni ulash tugmasi orqali hisobingizni ulang.'
            : 'Telegram menyusidan Mini Appni qayta oching.'}</p>
          <Link className="text-action" href="/" target="_blank" rel="noreferrer">ShifoHalqani brauzerda ochish</Link>
        </section>
      ) : (
        <section className={styles.entry}>
          <h1>Telegram Mini App</h1>
          <p>Ulangan bemor hisobini ochish uchun Telegram botidagi Mini App tugmasidan foydalaning.</p>
          {demoEnabled ? (
            <form action="/api/demo/login" method="post">
              <input type="hidden" name="role" value="patient" />
              <button type="submit" className="text-action">Brauzerda demo ochish</button>
            </form>
          ) : <Link className="text-action" href="/">ShifoHalqa bosh sahifasi</Link>}
        </section>
      )}
    </div>
  );
}
