'use client';

import { useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'shifo_text_scale';
let inMemoryTextScale = false;
const textScaleListeners = new Set<() => void>();

function subscribeTextScale(callback: () => void) {
  textScaleListeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    textScaleListeners.delete(callback);
    window.removeEventListener('storage', onStorage);
  };
}

function getTextScaleSnapshot() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'large';
  } catch {
    return inMemoryTextScale;
  }
}

function getTextScaleServerSnapshot() {
  return false;
}

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getOnlineSnapshot() {
  return navigator.onLine;
}

function getOnlineServerSnapshot() {
  return true;
}

export function TextScaleToggle() {
  const large = useSyncExternalStore(
    subscribeTextScale,
    getTextScaleSnapshot,
    getTextScaleServerSnapshot,
  );

  useEffect(() => {
    if (large) {
      document.documentElement.dataset.textScale = 'large';
    } else {
      delete document.documentElement.dataset.textScale;
    }
  }, [large]);

  function toggle() {
    const next = !large;
    inMemoryTextScale = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'large' : 'normal');
    } catch {
      // Ignore storage failures in restricted modes.
    }
    textScaleListeners.forEach((listener) => listener());
  }

  return (
    <button
      type="button"
      className="text-scale-toggle no-print"
      aria-pressed={large}
      onClick={toggle}
    >
      A+ Katta shrift
    </button>
  );
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getOnlineServerSnapshot);
  if (online) return null;

  return (
    <div className="offline-banner no-print" role="alert">
      <div className="frame offline-banner-inner">
        <span>
          Internet aloqasi uzildi. Ma’lumot yuborish uchun aloqa tiklanishini kuting; shoshilinch holatda 103 ga qo‘ng‘iroq qiling.
        </span>
        <a className="emergency" href="tel:103">103</a>
      </div>
    </div>
  );
}
