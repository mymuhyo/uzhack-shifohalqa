'use client';

import { createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';

type PatientApi = {
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  refresh: () => void;
};

const PatientApiContext = createContext<PatientApi | null>(null);
export const PatientApiProvider = PatientApiContext.Provider;

// The same clinical forms can run in a web session or inside the signed Telegram session.
const webFetch: PatientApi['apiFetch'] = (path, init) => fetch(path, init);
export function usePatientApi() {
  const api = useContext(PatientApiContext);
  const router = useRouter();
  return { apiFetch: api?.apiFetch ?? webFetch, refresh: api?.refresh ?? router.refresh, linked: api !== null };
}
