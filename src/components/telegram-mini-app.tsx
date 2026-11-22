'use client';

import Link from 'next/link';
import { useEffect, useSyncExternalStore } from 'react';

type TelegramWindow = Window & {
  Telegram?: {
    WebApp?: {
      ready?: () => void;
      expand?: () => void;
      initData?: string;
    };
  };
};

const subscribeNoop = () => () => {};
const readInTelegram = () => Boolean((window as TelegramWindow).Telegram?.WebApp?.initData);
const readInTelegramServer = () => false;

export function TelegramMiniApp({ demoEnabled }: { demoEnabled: boolean }) {
  const inTelegram = useSyncExternalStore(subscribeNoop, readInTelegram, readInTelegramServer);

  useEffect(() => {
    const webApp = (window as TelegramWindow).Telegram?.WebApp;
    if (webApp) {
      webApp.ready?.();
      webApp.expand?.();
    }
  }, []);

  return (
    <div className="ledger">
      <section aria-labelledby="tg-intro-heading">
        <span className="status-pill status-ok">
          {inTelegram ? 'Telegram Mini App muhiti' : 'Mini App ko‘rinishi'}
        </span>
        <h2 id="tg-intro-heading">Tezkor kirish</h2>
        <p>
          Telegram ichidan chiqmasdan kunlik dori, qon bosimi, mashq tahlili va shifokor javoblarini oching.
        </p>
        {demoEnabled ? (
          <form className="role-picker" action="/api/demo/login" method="post">
            <button className="role-button" type="submit" name="role" value="patient">
              Bemor vazifalarini ochish <span aria-hidden="true">↗</span>
            </button>
            <p className="role-hint">Kunlik dori, bosim, mashq va Yaqinim havolasini boshqarish.</p>
            <button className="role-button" type="submit" name="role" value="doctor">
              Shifokor navbatini ochish <span aria-hidden="true">↗</span>
            </button>
            <p className="role-hint">Ochiq bayroqlarga 1-klik javob berish va L4 tasdiqlash.</p>
          </form>
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
          <Link className="text-action" href="/">Tashqi brauzerda ochish</Link>
        </div>
      </section>
    </div>
  );
}
