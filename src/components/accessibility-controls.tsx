'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { Moon, PhoneCall, Sun, Type, WifiOff } from 'lucide-react';

const TEXT_SCALE_KEY = 'shifo_text_scale';
const COLOR_SCHEME_KEY = 'shifo_color_scheme';
let inMemoryTextScale = false;
let inMemoryColorScheme: 'light' | 'dark' | null = null;
const textScaleListeners = new Set<() => void>();
const colorSchemeListeners = new Set<() => void>();

function subscribeTextScale(callback: () => void) {
  textScaleListeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === TEXT_SCALE_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    textScaleListeners.delete(callback);
    window.removeEventListener('storage', onStorage);
  };
}

function getTextScaleSnapshot() {
  try {
    return window.localStorage.getItem(TEXT_SCALE_KEY) === 'large';
  } catch {
    return inMemoryTextScale;
  }
}

function getTextScaleServerSnapshot() {
  return false;
}

function readStoredScheme(): 'light' | 'dark' | null {
  try {
    const raw = window.localStorage.getItem(COLOR_SCHEME_KEY);
    return raw === 'light' || raw === 'dark' ? raw : null;
  } catch {
    return inMemoryColorScheme;
  }
}

function readSystemScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribeColorScheme(callback: () => void) {
  colorSchemeListeners.add(callback);
  const onStorage = (event: StorageEvent) => {
    if (event.key === COLOR_SCHEME_KEY) callback();
  };
  const media = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;
  const onMedia = () => callback();
  window.addEventListener('storage', onStorage);
  media?.addEventListener('change', onMedia);
  return () => {
    colorSchemeListeners.delete(callback);
    window.removeEventListener('storage', onStorage);
    media?.removeEventListener('change', onMedia);
  };
}

function getEffectiveSchemeSnapshot(): 'light' | 'dark' {
  return readStoredScheme() ?? readSystemScheme();
}

function getEffectiveSchemeServerSnapshot(): 'light' | 'dark' {
  return 'light';
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

export function ThemeToggle() {
  const effective = useSyncExternalStore(
    subscribeColorScheme,
    getEffectiveSchemeSnapshot,
    getEffectiveSchemeServerSnapshot,
  );

  useEffect(() => {
    const stored = readStoredScheme();
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      meta.setAttribute('content', stored ?? 'light dark');
    }
  }, [effective]);

  function toggle() {
    const current = getEffectiveSchemeSnapshot();
    const target: 'light' | 'dark' = current === 'dark' ? 'light' : 'dark';
    const system = readSystemScheme();
    const nextStored = target === system ? null : target;
    inMemoryColorScheme = nextStored;
    try {
      if (nextStored === null) {
        window.localStorage.removeItem(COLOR_SCHEME_KEY);
      } else {
        window.localStorage.setItem(COLOR_SCHEME_KEY, nextStored);
      }
    } catch {
      // Ignore storage errors in restricted browsing modes.
    }
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      meta.setAttribute('content', nextStored ?? 'light dark');
    }
    colorSchemeListeners.forEach((listener) => listener());
  }

  const isDark = effective === 'dark';
  return (
    <button
      type="button"
      className="text-scale-toggle no-print"
      aria-pressed={isDark}
      aria-label={isDark ? 'Yorug‘ rejimga o‘tish' : 'Tungi rejimga o‘tish'}
      onClick={toggle}
    >
      {isDark ? <Moon className="size-3.5" aria-hidden="true" /> : <Sun className="size-3.5" aria-hidden="true" />}
      <span>{isDark ? 'Tungi' : 'Yorug‘'}</span>
    </button>
  );
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
      window.localStorage.setItem(TEXT_SCALE_KEY, next ? 'large' : 'normal');
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
      <Type className="size-3.5" aria-hidden="true" />
      <span>A+ Katta shrift</span>
    </button>
  );
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getOnlineServerSnapshot);
  if (online) return null;

  return (
    <div className="offline-banner no-print" role="alert">
      <div className="frame offline-banner-inner">
        <span className="inline-flex items-center gap-2">
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Internet aloqasi uzildi. Ma’lumot yuborish uchun aloqa tiklanishini kuting; shoshilinch holatda 103 ga qo‘ng‘iroq qiling.
          </span>
        </span>
        <a className="emergency" href="tel:103">
          <PhoneCall className="size-4" aria-hidden="true" />
          <span>103</span>
        </a>
      </div>
    </div>
  );
}
