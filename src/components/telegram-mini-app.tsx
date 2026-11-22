'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  openLink?: (url: string) => void;
  initData?: string;
  platform?: string;
  initDataUnsafe?: {
    user?: {
      first_name?: string;
    };
  };
  HapticFeedback?: {
    impactOccurred?: (style: 'light' | 'medium' | 'heavy') => void;
  };
  MainButton?: {
    setText: (text: string) => void;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
};

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
};

const listeners = new Set<() => void>();
const subscribeTelegram = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const notifyTelegram = () => {
  listeners.forEach((listener) => listener());
};
const readWebApp = () => (window as TelegramWindow).Telegram?.WebApp;
const readInTelegram = () => Boolean(readWebApp()?.initData);
const readPlatform = () => readWebApp()?.platform ?? '';
const readFirstName = () => readWebApp()?.initDataUnsafe?.user?.first_name?.trim() ?? '';
const readFalse = () => false;
const readEmpty = () => '';

export function TelegramMiniApp({
  demoEnabled,
  focus = null,
}: {
  demoEnabled: boolean;
  focus?: 'doctor' | 'patient' | null;
}) {
  const inTelegram = useSyncExternalStore(subscribeTelegram, readInTelegram, readFalse);
  const platform = useSyncExternalStore(subscribeTelegram, readPlatform, readEmpty);
  const firstName = useSyncExternalStore(subscribeTelegram, readFirstName, readEmpty);
  const doctorFormRef = useRef<HTMLFormElement>(null);
  const patientFormRef = useRef<HTMLFormElement>(null);

  const primaryRole = focus === 'doctor' ? 'doctor' : 'patient';

  const triggerHaptic = useCallback(() => {
    readWebApp()?.HapticFeedback?.impactOccurred?.('light');
  }, []);

  const syncTelegramWebApp = useCallback(() => {
    const webApp = readWebApp();
    if (webApp) {
      webApp.ready?.();
      webApp.expand?.();
      notifyTelegram();
    }
  }, []);

  useEffect(() => {
    const webApp = readWebApp();
    webApp?.ready?.();
    webApp?.expand?.();
  }, []);

  useEffect(() => {
    if (!inTelegram || !demoEnabled) return;
    const mainButton = readWebApp()?.MainButton;
    if (!mainButton) return;

    const handleMainClick = () => {
      triggerHaptic();
      const targetForm = primaryRole === 'doctor' ? doctorFormRef.current : patientFormRef.current;
      targetForm?.requestSubmit();
    };

    mainButton.setText(primaryRole === 'doctor' ? 'Shifokor navbatini ochish' : 'Bemor vazifalarini ochish');
    mainButton.onClick(handleMainClick);
    mainButton.show();

    return () => {
      mainButton.offClick(handleMainClick);
      mainButton.hide();
    };
  }, [demoEnabled, inTelegram, primaryRole, triggerHaptic]);

  const patientCard = (
    <form key="patient" ref={patientFormRef} action="/api/demo/login" method="post" onSubmit={triggerHaptic}>
      <input type="hidden" name="role" value="patient" />
      <button className="role-button" type="submit">
        Bemor vazifalarini ochish <span aria-hidden="true">↗</span>
      </button>
      <p className="role-hint">Kunlik dori, bosim, mashq va Yaqinim havolasini boshqarish.</p>
    </form>
  );

  const doctorCard = (
    <form key="doctor" ref={doctorFormRef} action="/api/demo/login" method="post" onSubmit={triggerHaptic}>
      <input type="hidden" name="role" value="doctor" />
      <button className="role-button" type="submit">
        Shifokor navbatini ochish <span aria-hidden="true">↗</span>
      </button>
      <p className="role-hint">Ochiq bayroqlarga 1-klik javob berish va L4 tasdiqlash.</p>
    </form>
  );

  return (
    <div className="ledger">
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onReady={syncTelegramWebApp}
      />
      <section aria-labelledby="tg-intro-heading">
        <span className="status-pill status-ok">
          {inTelegram
            ? `Telegram Mini App${platform ? ` · ${platform}` : ''}`
            : 'Mini App ko‘rinishi'}
        </span>
        <h2 id="tg-intro-heading">
          {inTelegram && firstName ? `Assalomu alaykum, ${firstName}` : 'Tezkor kirish'}
        </h2>
        <p>
          Telegram ichidan chiqmasdan kunlik dori, qon bosimi, mashq tahlili va shifokor javoblarini oching.
        </p>
        {demoEnabled ? (
          <div className="role-picker">
            {focus === 'doctor' ? [doctorCard, patientCard] : [patientCard, doctorCard]}
          </div>
        ) : (
          <p className="notice">Demo kirishi hozir mavjud emas.</p>
        )}
      </section>
      <section aria-labelledby="tg-camera-heading">
        <h2 id="tg-camera-heading">Kamera va mashq tahlili</h2>
        <p>
          Ayrim telefonlarda Telegram ichki oynasi kamera ruxsatini cheklashi mumkin. Agar kamera ochilmasa, mashq sahifasini tashqi brauzerda yoki Android ilovaning jonli kamera CV bo‘limida oching.
        </p>
        <div className="role-actions">
          <Link className="text-action" href="/demo/mashq">Mashq demosini ochish</Link>
          {inTelegram ? (
            <>
              <button
                type="button"
                className="text-action"
                onClick={() => readWebApp()?.openLink?.(`${window.location.origin}/`)}
              >
                Tashqi brauzerda ochish
              </button>
              <button
                type="button"
                className="text-action"
                onClick={() => readWebApp()?.close?.()}
              >
                Mini Appni yopish
              </button>
            </>
          ) : (
            <Link className="text-action" href="/">Tashqi brauzerda ochish</Link>
          )}
        </div>
      </section>
    </div>
  );
}
