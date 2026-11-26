'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';

const subscribeNoop = () => () => {};

/**
 * Returns `false` during SSR and initial hydration pass, then `true` once interactive.
 * Prevents lost clicks on `type="button"` or JSON-intercepted forms during SSR hydration.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNoop, () => true, () => false);
}

export type ClinicalClientContextValue = {
  bearerToken: string | null;
  isMiniApp: boolean;
  fetchJson: (url: string, init?: RequestInit) => Promise<Response>;
  refresh: () => void;
  hapticImpact: (style?: 'light' | 'medium' | 'heavy') => void;
  hapticNotify: (type: 'success' | 'warning' | 'error') => void;
  setUploadBusy: (busy: boolean) => void;
};

async function performClinicalFetch(
  options: {
    bearerToken: string | null;
    onUnauthorized?: () => void;
  },
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (options.bearerToken) {
    headers.set('Authorization', `Bearer ${options.bearerToken}`);
  }
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (response.status === 401 && options.bearerToken) {
    options.onUnauthorized?.();
  }
  return response;
}

const defaultContextValue: ClinicalClientContextValue = {
  bearerToken: null,
  isMiniApp: false,
  fetchJson: (url, init) => performClinicalFetch({ bearerToken: null }, url, init),
  refresh: () => {},
  hapticImpact: () => {},
  hapticNotify: () => {},
  setUploadBusy: () => {},
};

const ClinicalClientContext = createContext<ClinicalClientContextValue | null>(null);

export function ClinicalClientProvider({
  bearerToken,
  isMiniApp = false,
  onRefresh,
  onUnauthorized,
  onHapticImpact,
  onHapticNotify,
  onUploadBusyChange,
  children,
}: {
  bearerToken: string | null;
  isMiniApp?: boolean;
  onRefresh?: () => void;
  onUnauthorized?: () => void;
  onHapticImpact?: (style?: 'light' | 'medium' | 'heavy') => void;
  onHapticNotify?: (type: 'success' | 'warning' | 'error') => void;
  onUploadBusyChange?: (busy: boolean) => void;
  children: ReactNode;
}) {
  const router = useRouter();

  const value = useMemo<ClinicalClientContextValue>(() => {
    return {
      bearerToken,
      isMiniApp,
      fetchJson: (url, init) =>
        performClinicalFetch({ bearerToken, onUnauthorized }, url, init),
      refresh: () => {
        if (onRefresh) onRefresh();
        else router.refresh();
      },
      hapticImpact: (style = 'light') => onHapticImpact?.(style),
      hapticNotify: (type) => onHapticNotify?.(type),
      setUploadBusy: (busy) => onUploadBusyChange?.(busy),
    };
  }, [
    bearerToken,
    isMiniApp,
    onHapticImpact,
    onHapticNotify,
    onRefresh,
    onUnauthorized,
    onUploadBusyChange,
    router,
  ]);

  return <ClinicalClientContext.Provider value={value}>{children}</ClinicalClientContext.Provider>;
}

export function useClinicalClient(): ClinicalClientContextValue {
  const ctx = useContext(ClinicalClientContext);
  const router = useRouter();
  return useMemo(
    () =>
      ctx ?? {
        ...defaultContextValue,
        refresh: () => router.refresh(),
      },
    [ctx, router],
  );
}
