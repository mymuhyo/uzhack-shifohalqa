'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Activity,
  AlertOctagon,
  ArrowRightLeft,
  ClipboardList,
  ExternalLink,
  FileBarChart2,
  Loader2,
  LogOut,
  PhoneCall,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Stethoscope,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import type { PatientClinicalBriefView } from '@/lib/ai/clinical-brief-schema';
import type {
  AdherenceCounts,
  DailyStepReading,
  DailyStepTrendPoint,
  MedicationAdherenceBreakdown,
} from '@/lib/adherence';
import { ClinicalClientProvider, useHydrated } from '@/lib/clinical-client-fetch';
import { countOpenClinicalAttention } from '@/lib/clinical-triage';
import type { AppRole, ClinicalView } from '@/lib/clinical-types';
import type { ExerciseAttempt, readExercisePlan } from '@/lib/exercise-store';
import { exerciseCatalog } from '@/lib/pose/diagnostics';
import type { PoseMovement } from '@/lib/pose/engine';
import type { TeachBackStatus } from '@/lib/teach-back-store';
import {
  getTelegramWebApp,
  readTelegramSafeAreas,
  syncTelegramColors,
} from '@/lib/telegram-sdk';
import { CaregiverSharingControls } from './caregiver-sharing-controls';
import { ExerciseClient } from './exercise-client';
import { PatientAdherenceView } from './patient-adherence-view';
import { PatientClinical } from './patient-clinical';
import { PatientExerciseCard } from './patient-exercise-card';

type MiniAppTab = 'today' | 'exercise' | 'report' | 'privacy';

type AuthSession = {
  token: string;
  expiresAt: string;
  mode: 'linked' | 'demo';
  role: AppRole;
  workspaceId: string;
  patientName: string | null;
  doctorName: string | null;
  isDemo: boolean;
  detailsEnabled: boolean;
};

type ActivitySnapshot = {
  localDate: string;
  dailyStepGoal: number;
  adherence: { today: AdherenceCounts; week: AdherenceCounts };
  steps: DailyStepReading | null;
  stepTrend?: DailyStepTrendPoint[];
  medicationAdherence?: MedicationAdherenceBreakdown[];
} | null;

type ClinicalViewSnapshot = {
  role: AppRole;
  isDemo: boolean;
  workspaceId: string;
  patientId: string | null;
  patientName?: string | null;
  patients?: Array<{ id: string; name: string; roleKind: 'patient' | 'individual' }>;
  view: ClinicalView | null;
  activity: ActivitySnapshot;
  exercisePlan: NonNullable<Awaited<ReturnType<typeof readExercisePlan>>> | null;
  exerciseAttempts: ExerciseAttempt[];
  brief?: PatientClinicalBriefView | Record<string, unknown> | null;
  teachBack?: TeachBackStatus | null;
  telegram?: { connected: boolean; detailsEnabled: boolean } | null;
};

const POLISHED_MOVEMENTS: PoseMovement[] = ['chair_stand', 'elbow_bend', 'seated_knee_ext'];

const TAB_ITEMS: Array<{
  id: MiniAppTab;
  label: string;
  icon: typeof ClipboardList;
}> = [
  { id: 'today', label: 'Bugun', icon: ClipboardList },
  { id: 'exercise', label: 'Mashq', icon: Activity },
  { id: 'report', label: 'Hisobot', icon: FileBarChart2 },
  { id: 'privacy', label: 'Maxfiylik', icon: ShieldCheck },
];

const sdkListeners = new Set<() => void>();
const subscribeSdk = (cb: () => void) => {
  sdkListeners.add(cb);
  return () => sdkListeners.delete(cb);
};
const notifySdk = () => {
  sdkListeners.forEach((cb) => cb());
};
const readInTelegram = () => {
  const webApp = getTelegramWebApp();
  return Boolean((webApp?.initData && webApp.initData.trim().length > 0) || webApp?.platform);
};
const readPlatform = () => getTelegramWebApp()?.platform ?? '';
const readTgFirstName = () => getTelegramWebApp()?.initDataUnsafe?.user?.first_name?.trim() ?? '';
const readSafeAreaString = () => {
  const s = readTelegramSafeAreas(getTelegramWebApp());
  return `${s.top}:${s.bottom}:${s.left}:${s.right}`;
};
const readFalse = () => false;
const readEmpty = () => '';
const readZeroAreas = () => '0:0:0:0';

export function TelegramMiniApp({
  demoEnabled,
  botUsername = null,
  focus = null,
  initialTab = 'today',
}: {
  demoEnabled: boolean;
  botUsername?: string | null;
  focus?: 'doctor' | 'patient' | null;
  initialTab?: MiniAppTab;
}) {
  const hydrated = useHydrated();
  const inTelegram = useSyncExternalStore(subscribeSdk, readInTelegram, readFalse);
  const platform = useSyncExternalStore(subscribeSdk, readPlatform, readEmpty);
  const tgFirstName = useSyncExternalStore(subscribeSdk, readTgFirstName, readEmpty);
  const safeAreasKey = useSyncExternalStore(subscribeSdk, readSafeAreaString, readZeroAreas);
  const [fallbackFirstName, setFallbackFirstName] = useState('');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authStatus, setAuthStatus] = useState<'checking' | 'ready' | 'unlinked' | 'revoked' | 'error'>('unlinked');
  const [authMessage, setAuthMessage] = useState('');
  const [snapshot, setSnapshot] = useState<ClinicalViewSnapshot | null>(null);
  const [caregiverExpiresAt, setCaregiverExpiresAt] = useState<string | null>(null);
  const [doctorPatients, setDoctorPatients] = useState<Array<{ id: string; name: string; roleKind: 'patient' | 'individual' }>>([]);
  const [selectedDoctorPatientId, setSelectedDoctorPatientId] = useState<string | null>(null);
  const [loadingView, setLoadingView] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<MiniAppTab>(initialTab);
  const [selectedMovement, setSelectedMovement] = useState<PoseMovement>('chair_stand');
  const [uploadBusy, setUploadBusy] = useState(false);
  const initAttemptedRef = useRef<string | null>(null);

  const primaryRole = focus === 'doctor' ? 'doctor' : 'patient';

  const hapticImpact = useCallback((style: 'light' | 'medium' | 'heavy' = 'light') => {
    getTelegramWebApp()?.HapticFeedback?.impactOccurred?.(style);
  }, []);

  const hapticNotify = useCallback((type: 'success' | 'warning' | 'error') => {
    getTelegramWebApp()?.HapticFeedback?.notificationOccurred?.(type);
  }, []);

  const hapticSelect = useCallback(() => {
    getTelegramWebApp()?.HapticFeedback?.selectionChanged?.();
  }, []);

  const handleUnauthorized = useCallback(() => {
    setSession(null);
    setSnapshot(null);
    setCaregiverExpiresAt(null);
    setAuthStatus('revoked');
    setAuthMessage(
      'Telegram ulanishi uzilgan yoki sessiya muddati tugagan. ShifoHalqa veb-sahifasidan qayta ulang yoki Demo rejimini oching.',
    );
    hapticNotify('error');
  }, [hapticNotify]);

  const loadPatientData = useCallback(
    async (activeSession: AuthSession, explicitPatientId?: string | null) => {
      setLoadingView(true);
      try {
        const query = explicitPatientId ? `?patientId=${encodeURIComponent(explicitPatientId)}` : '';
        const viewRes = await fetch(`/api/clinical/view${query}`, {
          headers: { Authorization: `Bearer ${activeSession.token}` },
        });
        if (viewRes.status === 401) {
          handleUnauthorized();
          return;
        }
        if (viewRes.status === 400) {
          const errBody = (await viewRes.json().catch(() => ({}))) as {
            error?: string;
            patients?: Array<{ id: string; name: string; roleKind: 'patient' | 'individual' }>;
          };
          if (errBody.error === 'patient_required' && Array.isArray(errBody.patients) && errBody.patients.length > 0) {
            setDoctorPatients(errBody.patients);
            const firstId = errBody.patients[0]!.id;
            setSelectedDoctorPatientId(firstId);
            const retryRes = await fetch(`/api/clinical/view?patientId=${encodeURIComponent(firstId)}`, {
              headers: { Authorization: `Bearer ${activeSession.token}` },
            });
            if (retryRes.status === 401) {
              handleUnauthorized();
              return;
            }
            if (retryRes.ok) {
              const data = (await retryRes.json()) as ClinicalViewSnapshot;
              setSnapshot(data);
              if (data.patients) setDoctorPatients(data.patients);
            }
          }
          return;
        }
        if (!viewRes.ok) {
          setAuthMessage('Ma’lumotlarni yuklab bo‘lmadi. Qayta urinib ko‘ring.');
          return;
        }

        const data = (await viewRes.json()) as ClinicalViewSnapshot;
        setSnapshot(data);
        if (data.patients) {
          setDoctorPatients(data.patients);
          if (data.patientId) setSelectedDoctorPatientId(data.patientId);
        }
        if (data.exercisePlan?.movement) {
          setSelectedMovement((prev) =>
            prev === 'chair_stand' && data.exercisePlan ? data.exercisePlan.movement : prev,
          );
        }
        if (data.telegram) {
          setSession((prev) =>
            prev ? { ...prev, detailsEnabled: data.telegram!.detailsEnabled } : prev,
          );
        }

        if (activeSession.role !== 'doctor') {
          const cgRes = await fetch('/api/clinical/caregiver', {
            headers: { Authorization: `Bearer ${activeSession.token}` },
          }).catch(() => null);
          if (cgRes && cgRes.ok) {
            const cgData = (await cgRes.json()) as { expiresAt?: string | null };
            setCaregiverExpiresAt(cgData.expiresAt ?? null);
          }
        }
      } finally {
        setLoadingView(false);
      }
    },
    [handleUnauthorized],
  );

  const authenticateInitData = useCallback(
    async (initData: string) => {
      if (!initData || initAttemptedRef.current === initData) return;
      initAttemptedRef.current = initData;
      setAuthStatus('checking');
      setAuthMessage('');
      try {
        const res = await fetch('/api/telegram/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'initData',
            initData,
            ...(focus ? { focus } : {}),
          }),
        });
        if (res.status === 401) {
          setAuthStatus('error');
          setAuthMessage('Telegram sessiya imzosi eskirgan yoki noto‘g‘ri. Mini App’ni qayta oching.');
          return;
        }
        if (!res.ok) {
          setAuthStatus('error');
          setAuthMessage('Telegram autentifikatsiyasida vaqtinchalik xatolik yuz berdi.');
          return;
        }
        const payload = (await res.json()) as
          | ({ authenticated: true } & AuthSession)
          | { authenticated: false; linked: false; telegramUser?: { firstName?: string | null } };
        if (payload.authenticated) {
          setSession(payload);
          setAuthStatus('ready');
          await loadPatientData(payload);
        } else {
          if (payload.telegramUser?.firstName) {
            setFallbackFirstName(payload.telegramUser.firstName);
          }
          setAuthStatus('unlinked');
        }
      } catch {
        setAuthStatus('error');
        setAuthMessage('Aloqa uzildi. Tarmoqni tekshirib qayta urinib ko‘ring.');
      }
    },
    [focus, loadPatientData],
  );

  const startDemoSession = useCallback(
    async (role: 'patient' | 'doctor') => {
      if (!demoEnabled) return;
      hapticImpact('light');
      setBusyAction(`demo:${role}`);
      setAuthMessage('');
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (session?.mode === 'demo') {
          headers.Authorization = `Bearer ${session.token}`;
        }
        const res = await fetch('/api/telegram/auth', {
          method: 'POST',
          headers,
          body: JSON.stringify({ mode: 'demo', role }),
        });
        if (!res.ok) {
          hapticNotify('error');
          setAuthMessage('Demo sessiyasini ochib bo‘lmadi.');
          return;
        }
        const payload = (await res.json()) as { authenticated: true } & AuthSession;
        setSession(payload);
        setAuthStatus('ready');
        setActiveTab(initialTab);
        hapticNotify('success');
        await loadPatientData(payload);
      } catch {
        hapticNotify('error');
        setAuthMessage('Aloqa uzildi. Qayta urinib ko‘ring.');
      } finally {
        setBusyAction(null);
      }
    },
    [demoEnabled, hapticImpact, hapticNotify, initialTab, loadPatientData, session],
  );

  const syncTelegramSdk = useCallback(() => {
    const webApp = getTelegramWebApp();
    if (!webApp) return undefined;

    webApp.ready?.();
    webApp.expand?.();

    const applyThemeFromTelegram = () => {
      const scheme = webApp.colorScheme;
      if (scheme === 'dark' || scheme === 'light') {
        document.documentElement.dataset.tgColorScheme = scheme;
        const meta = document.querySelector('meta[name="color-scheme"]');
        let userOverrode = false;
        try {
          userOverrode = Boolean(window.localStorage.getItem('shifo_color_scheme'));
        } catch {
          userOverrode = false;
        }
        if (!userOverrode) {
          meta?.setAttribute('content', scheme);
          document.documentElement.classList.toggle('dark', scheme === 'dark');
        }
        syncTelegramColors(webApp, scheme);
      }
      notifySdk();
    };

    const updateInsets = () => {
      notifySdk();
    };

    applyThemeFromTelegram();
    webApp.onEvent?.('themeChanged', applyThemeFromTelegram);
    webApp.onEvent?.('safeAreaChanged', updateInsets);
    webApp.onEvent?.('contentSafeAreaChanged', updateInsets);

    if (webApp.initData && webApp.initData.trim().length > 0) {
      const initData = webApp.initData;
      queueMicrotask(() => {
        void authenticateInitData(initData);
      });
    }

    return () => {
      webApp.offEvent?.('themeChanged', applyThemeFromTelegram);
      webApp.offEvent?.('safeAreaChanged', updateInsets);
      webApp.offEvent?.('contentSafeAreaChanged', updateInsets);
    };
  }, [authenticateInitData]);

  useEffect(() => {
    const cleanup = syncTelegramSdk();
    return () => {
      cleanup?.();
    };
  }, [syncTelegramSdk]);

  // Closing confirmation while an exercise video upload is in flight
  useEffect(() => {
    const webApp = getTelegramWebApp();
    if (!webApp) return;
    if (uploadBusy) webApp.enableClosingConfirmation?.();
    else webApp.disableClosingConfirmation?.();
    return () => {
      webApp.disableClosingConfirmation?.();
    };
  }, [uploadBusy]);

  // Telegram BackButton integration
  useEffect(() => {
    const back = getTelegramWebApp()?.BackButton;
    if (!back) return;
    if (!session || session.role === 'doctor' || activeTab === 'today') {
      back.hide();
      return;
    }
    const handleBack = () => {
      hapticSelect();
      setActiveTab('today');
    };
    back.onClick(handleBack);
    back.show();
    return () => {
      back.offClick(handleBack);
      back.hide();
    };
  }, [activeTab, hapticSelect, session]);

  // Telegram MainButton + SecondaryButton integration
  useEffect(() => {
    const webApp = getTelegramWebApp();
    const main = webApp?.MainButton;
    if (!main || !inTelegram) return;

    const secondary = webApp?.SecondaryButton;
    let handleMain: (() => void) | null = null;
    let handleSecondary: (() => void) | null = null;

    if (!session) {
      if (demoEnabled) {
        main.setText(primaryRole === 'doctor' ? 'Shifokor navbatini ochish' : 'Bemor vazifalarini ochish');
        handleMain = () => {
          void startDemoSession(primaryRole);
        };
        main.onClick(handleMain);
        main.show();

        if (secondary) {
          const altRole = primaryRole === 'doctor' ? 'patient' : 'doctor';
          secondary.setText(altRole === 'doctor' ? 'Shifokor demosi' : 'Bemor demosi');
          handleSecondary = () => {
            void startDemoSession(altRole);
          };
          secondary.onClick(handleSecondary);
          secondary.show();
        }
      } else {
        main.hide();
        secondary?.hide();
      }
    } else if (session.role === 'doctor') {
      main.setText('To‘liq shifokor paneli ↗');
      handleMain = () => {
        hapticImpact('light');
        webApp?.openLink?.(`${window.location.origin}/doctor`);
      };
      main.onClick(handleMain);
      main.show();
      secondary?.hide();
    } else {
      const label =
        activeTab === 'today'
          ? 'Mashqlar (3 ta harakat) →'
          : activeTab === 'exercise'
            ? '7 kunlik hisobot →'
            : 'Bugungi vazifalarga qaytish';
      main.setText(label);
      handleMain = () => {
        hapticSelect();
        setActiveTab((prev) =>
          prev === 'today' ? 'exercise' : prev === 'exercise' ? 'report' : 'today',
        );
      };
      main.onClick(handleMain);
      main.show();
      secondary?.hide();
    }

    return () => {
      if (handleMain) main.offClick(handleMain);
      if (handleSecondary && secondary) secondary.offClick(handleSecondary);
      main.hide();
      secondary?.hide();
    };
  }, [
    activeTab,
    demoEnabled,
    hapticImpact,
    hapticSelect,
    inTelegram,
    primaryRole,
    session,
    startDemoSession,
  ]);

  const handleRefresh = useCallback(() => {
    if (session) {
      void loadPatientData(session, selectedDoctorPatientId);
    }
  }, [loadPatientData, selectedDoctorPatientId, session]);

  async function toggleLinkedPrivacy() {
    if (!session || session.mode !== 'linked') return;
    const next = !session.detailsEnabled;
    setBusyAction('privacy');
    try {
      const res = await fetch('/api/clinical/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ action: 'set_details', detailsEnabled: next }),
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (!res.ok) {
        hapticNotify('error');
        toast.error('Sozlamani saqlab bo‘lmadi.');
        return;
      }
      const data = (await res.json()) as { detailsEnabled?: boolean };
      const saved = typeof data.detailsEnabled === 'boolean' ? data.detailsEnabled : next;
      setSession((prev) => (prev ? { ...prev, detailsEnabled: saved } : prev));
      hapticNotify('success');
      toast.success(
        saved
          ? 'Chatda batafsil xabarlar yoqildi.'
          : 'Chat xabarlari maxfiy (umumiy) rejimga o‘tkazildi.',
      );
      handleRefresh();
    } catch {
      hapticNotify('error');
      toast.error('Aloqa uzildi.');
    } finally {
      setBusyAction(null);
    }
  }

  async function unlinkTelegramFromMiniApp() {
    if (!session || session.mode !== 'linked') return;
    setBusyAction('unlink');
    try {
      const res = await fetch('/api/clinical/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      if (!res.ok && res.status !== 204 && res.status !== 401) {
        hapticNotify('error');
        toast.error('Telegram ulanishini uzib bo‘lmadi.');
        return;
      }
      hapticNotify('success');
      setSession(null);
      setSnapshot(null);
      setAuthStatus('unlinked');
      toast.success('Telegram ulanishi uzildi.');
    } finally {
      setBusyAction(null);
    }
  }

  const clientWrapperStyle = useMemo(() => {
    const [top = 0, bottom = 0, left = 0, right = 0] = safeAreasKey.split(':').map(Number);
    return {
      '--tg-safe-top': `${top}px`,
      '--tg-safe-bottom': `${bottom}px`,
      '--tg-safe-left': `${left}px`,
      '--tg-safe-right': `${right}px`,
    } as React.CSSProperties;
  }, [safeAreasKey]);
  const displayFirstName = fallbackFirstName || tgFirstName;

  const patientBrief = useMemo<PatientClinicalBriefView | null>(() => {
    const raw = snapshot?.brief;
    if (!raw || typeof raw !== 'object') return null;
    if ('doctorDraftUz' in raw) return null;
    if ('approvedReplyUz' in raw && typeof raw.approvedReplyUz === 'string') {
      return raw as PatientClinicalBriefView;
    }
    return null;
  }, [snapshot]);

  const todayCounts = snapshot?.activity?.adherence.today;
  const openDoctorAttention = useMemo(() => {
    if (!snapshot?.view || snapshot.role !== 'doctor') return null;
    return countOpenClinicalAttention({
      view: snapshot.view,
      exerciseAttempts: snapshot.exerciseAttempts,
    });
  }, [snapshot]);

  return (
    <ClinicalClientProvider
      bearerToken={session?.token ?? null}
      isMiniApp
      onRefresh={handleRefresh}
      onUnauthorized={handleUnauthorized}
      onHapticImpact={hapticImpact}
      onHapticNotify={hapticNotify}
      onUploadBusyChange={setUploadBusy}
    >
      <div className="tg-mini-shell mx-auto flex max-w-2xl flex-col gap-4" style={clientWrapperStyle}>
        {hydrated && !getTelegramWebApp() && (
          <Script
            src="https://telegram.org/js/telegram-web-app.js"
            strategy="afterInteractive"
            onReady={() => {
              syncTelegramSdk();
            }}
          />
        )}

        {/* Compact Native-Like Mini App Header */}
        <section className="rounded-[7.2px] border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="status-pill status-ok">
                  {inTelegram ? `Telegram Mini App${platform ? ` · ${platform}` : ''}` : 'Telegram Mini App'}
                </span>
                {session && (
                  <Badge variant={session.isDemo ? 'secondary' : 'ok'}>
                    {session.isDemo ? 'Judge Demo' : 'Klinika ulanishi'}
                  </Badge>
                )}
              </div>
              <h1 className="mt-2 !text-2xl !leading-tight tracking-[-0.03em]">
                {session
                  ? session.role === 'doctor'
                    ? session.doctorName ?? 'Shifokor navbati'
                    : snapshot?.patientName ?? session.patientName ?? 'Bemor kunligi'
                  : displayFirstName
                    ? `Assalomu alaykum, ${displayFirstName}`
                    : 'ShifoHalqa · Telegram'}
              </h1>
              {session && session.role !== 'doctor' && todayCounts && (
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  Bugungi ijro: {todayCounts.completed}/{todayCounts.scheduled} bajarildi · {todayCounts.answered}/{todayCounts.scheduled} javob berildi
                </p>
              )}
            </div>

            {session && (
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loadingView}
                  aria-label="Ma’lumotlarni yangilash"
                  onClick={() => {
                    hapticImpact('light');
                    handleRefresh();
                  }}
                >
                  <RefreshCw className={`size-3.5 ${loadingView ? 'animate-spin' : ''}`} aria-hidden="true" />
                </Button>
                {session.mode === 'demo' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyAction !== null}
                    aria-label="Demodan chiqish"
                    onClick={() => {
                      hapticImpact('light');
                      setSession(null);
                      setSnapshot(null);
                      setAuthStatus('unlinked');
                    }}
                  >
                    <LogOut className="size-3.5" aria-hidden="true" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Always-reachable Emergency Strip for Patient */}
          {(!session || session.role !== 'doctor') && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <a className="emergency" href="tel:103">
                <PhoneCall className="size-3.5" aria-hidden="true" />
                <span>Tez yordam · 103</span>
              </a>
              {session && (
                <button
                  type="button"
                  className="emergency"
                  onClick={() => {
                    hapticImpact('medium');
                    setActiveTab('today');
                    window.setTimeout(() => {
                      const el = document.getElementById('urgent-report-section');
                      const details = el?.querySelector('details');
                      if (details) details.open = true;
                      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 80);
                  }}
                >
                  <AlertOctagon className="size-3.5" aria-hidden="true" />
                  <span>Og‘riq bor</span>
                </button>
              )}
            </div>
          )}
        </section>

        {/* Unauthenticated / Unlinked / Revoked Entry */}
        {!session && (
          <section className="rounded-[7.2px] border border-border bg-card p-4">
            {authStatus === 'checking' && inTelegram ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                <span>Telegram sessiyasi tekshirilmoqda…</span>
              </div>
            ) : (
              <>
                {authMessage && (
                  <p className="notice !mt-0 mb-3" role="alert">
                    {authMessage}
                  </p>
                )}

                {authStatus === 'unlinked' && (
                  <p className="text-sm text-muted-foreground">
                    {inTelegram
                      ? 'Bu Telegram chat hali bemor yoki shifokor profiliga ulanmagan. Veb-paneldagi «Telegramni ulash» tugmasidan foydalaning yoki quyida tezkor Demo oynasini oching.'
                      : 'Iframe-xavfsiz Bearer sessiyasi orqali Telegram Mini App’da dori, qon bosimi, 7 kunlik hisobot va 3 ta reabilitatsiya mashqini sinang.'}
                  </p>
                )}

                {demoEnabled ? (
                  <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                    <button
                      type="button"
                      className={`role-button ${primaryRole === 'patient' ? '' : 'role-button-secondary'}`}
                      disabled={!hydrated || busyAction !== null}
                      onClick={() => void startDemoSession('patient')}
                    >
                      <span>Bemor vazifalarini ochish</span>
                      <span aria-hidden="true">{busyAction === 'demo:patient' ? '…' : '↗'}</span>
                    </button>
                    <button
                      type="button"
                      className={`role-button ${primaryRole === 'doctor' ? '' : 'role-button-secondary'}`}
                      disabled={!hydrated || busyAction !== null}
                      onClick={() => void startDemoSession('doctor')}
                    >
                      <span>Shifokor navbatini ochish</span>
                      <span aria-hidden="true">{busyAction === 'demo:doctor' ? '…' : '↗'}</span>
                    </button>
                  </div>
                ) : (
                  <p className="notice">Demo kirishi hozir o‘chirilgan. Ulangan klinika Telegram chati orqali kiring.</p>
                )}

                <div className="mt-4 flex flex-wrap gap-3 border-t border-border pt-3 text-sm">
                  <Link className="text-action" href="/demo/mashq">
                    Mashq demosini ochish
                  </Link>
                  {botUsername && (
                    <a
                      className="text-action"
                      href={`https://t.me/${botUsername}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                    >
                      Botga o‘tish
                    </a>
                  )}
                  <Link className="text-action" href="/">
                    Asosiy sahifa
                  </Link>
                </div>
              </>
            )}
          </section>
        )}

        {/* Doctor Mini App Summary */}
        {session && session.role === 'doctor' && (
          <section className="rounded-[7.2px] border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="inline-flex items-center gap-2 !text-xl">
                <Stethoscope className="size-5 text-primary" aria-hidden="true" />
                <span>Shifokor tezkor ko‘rinishi</span>
              </h2>
              {openDoctorAttention && (
                <Badge variant={openDoctorAttention.totalOpen > 0 ? 'warn' : 'ok'}>
                  Ochiq murojaatlar: {openDoctorAttention.totalOpen}
                </Badge>
              )}
            </div>

            {doctorPatients.length > 1 && (
              <div className="mt-3 flex flex-col gap-1">
                <label htmlFor="tg-doctor-patient-select" className="text-xs font-semibold text-muted-foreground">
                  Bemor tanlang
                </label>
                <NativeSelect
                  id="tg-doctor-patient-select"
                  value={selectedDoctorPatientId ?? ''}
                  onChange={(e) => {
                    const pid = e.currentTarget.value;
                    setSelectedDoctorPatientId(pid);
                    void loadPatientData(session, pid);
                  }}
                >
                  {doctorPatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            )}

            {snapshot?.view ? (
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <div className="kpi-card">
                  <span className="kpi-label">Shoshilinch (qizil)</span>
                  <strong className="kpi-value">{openDoctorAttention?.openUrgent ?? 0}</strong>
                </div>
                <div className="kpi-card">
                  <span className="kpi-label">Kuzatuv (sariq)</span>
                  <strong className="kpi-value">{openDoctorAttention?.openWarning ?? 0}</strong>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {loadingView ? 'Navbat yuklanmoqda…' : 'Hozircha biriktirilgan bemor topilmadi.'}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2.5">
              {inTelegram ? (
                <Button
                  type="button"
                  onClick={() => getTelegramWebApp()?.openLink?.(`${window.location.origin}/doctor`)}
                >
                  <ExternalLink data-icon="inline-start" aria-hidden="true" />
                  <span>To‘liq shifokor panelini ochish</span>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/doctor">
                    <ExternalLink data-icon="inline-start" aria-hidden="true" />
                    <span>To‘liq shifokor panelini ochish</span>
                  </Link>
                </Button>
              )}

              {session.mode === 'demo' && demoEnabled && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyAction !== null}
                  onClick={() => void startDemoSession('patient')}
                >
                  <ArrowRightLeft data-icon="inline-start" aria-hidden="true" />
                  <span>Bemor ko‘rinishiga o‘tish</span>
                </Button>
              )}
            </div>
          </section>
        )}

        {/* Patient Mini App Tabs & Content */}
        {session && session.role !== 'doctor' && (
          <>
            <nav
              aria-label="Mini App bo‘limlari"
              className="grid grid-cols-4 gap-1.5 rounded-[7.2px] border border-border bg-secondary p-1"
            >
              {TAB_ITEMS.map(({ id, label, icon: Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-[5.4px] px-1.5 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground hover:bg-card'
                    }`}
                    onClick={() => {
                      hapticSelect();
                      setActiveTab(id);
                    }}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>

            {loadingView && !snapshot && (
              <div className="flex items-center gap-2 rounded-[7.2px] border border-border bg-card p-4 text-sm text-muted-foreground" role="status">
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                <span>Klinik reja yuklanmoqda…</span>
              </div>
            )}

            {snapshot && (
              <AnimatePresence mode="wait">
                {activeTab === 'today' && (
                  <motion.div
                    key="tab-today"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                    className="flex flex-col gap-3"
                  >
                    {snapshot.view ? (
                      <PatientClinical
                        view={snapshot.view}
                        isDemo={snapshot.isDemo}
                        patientBrief={patientBrief}
                        teachBackStatus={snapshot.teachBack ?? null}
                      />
                    ) : (
                      <p className="notice">Klinik ma’lumotlar topilmadi.</p>
                    )}

                    {snapshot.exercisePlan && (
                      <div className="rounded-[7.2px] border border-border bg-card p-3.5">
                        <PatientExerciseCard
                          plan={snapshot.exercisePlan}
                          attempts={snapshot.exerciseAttempts}
                        />
                        <div className="mt-2">
                          <Button
                            type="button"
                            className="w-full"
                            onClick={() => {
                              hapticSelect();
                              setSelectedMovement(snapshot.exercisePlan!.movement);
                              setActiveTab('exercise');
                            }}
                          >
                            <Activity data-icon="inline-start" aria-hidden="true" />
                            <span>Mini App ichida mashqni boshlash</span>
                          </Button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {activeTab === 'exercise' && (
                  <motion.div
                    key="tab-exercise"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                    className="flex flex-col gap-3"
                  >
                    <section className="rounded-[7.2px] border border-border bg-card p-4">
                      <h2 className="!text-xl">Reabilitatsiya mashqlari (3 ta harakat)</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Avval tayyor namuna videosini sinang yoki qurilmangizdan video tanlang. Telegram ichki oynasida kamera cheklansa, tashqi brauzerdan foydalanishingiz mumkin.
                      </p>

                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Mashq turini tanlash">
                        {POLISHED_MOVEMENTS.map((mv) => {
                          const meta = exerciseCatalog[mv];
                          const isSelected = selectedMovement === mv;
                          const isPrescribed = snapshot.exercisePlan?.movement === mv;
                          return (
                            <button
                              key={mv}
                              type="button"
                              aria-pressed={isSelected}
                              className={`flex min-h-11 flex-col items-start justify-center rounded-[5.4px] border px-3 py-2 text-start text-sm transition-colors ${
                                isSelected
                                  ? 'border-primary bg-accent text-foreground font-medium'
                                  : 'border-border bg-secondary text-foreground hover:bg-card'
                              }`}
                              onClick={() => {
                                hapticSelect();
                                setSelectedMovement(mv);
                              }}
                            >
                              <span>{meta.title}</span>
                              {isPrescribed && (
                                <span className="text-[11px] font-medium text-primary">Shifokor rejasi</span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4">
                        <ExerciseClient
                          key={selectedMovement}
                          movement={selectedMovement}
                          targetAngle={
                            snapshot.exercisePlan?.movement === selectedMovement
                              ? snapshot.exercisePlan.targetAngle
                              : exerciseCatalog[selectedMovement].defaultTargetAngle
                          }
                          targetReps={
                            snapshot.exercisePlan?.movement === selectedMovement
                              ? snapshot.exercisePlan.targetReps
                              : 5
                          }
                          maxShallow={
                            snapshot.exercisePlan?.movement === selectedMovement
                              ? snapshot.exercisePlan.maxShallow
                              : 1
                          }
                          painColor={
                            snapshot.exercisePlan?.movement === selectedMovement
                              ? snapshot.exercisePlan.painColor
                              : 'yellow'
                          }
                          isDemo={snapshot.isDemo}
                        />
                      </div>

                      {inTelegram && (
                        <div className="mt-3 border-t border-border pt-3">
                          <button
                            type="button"
                            className="text-action"
                            onClick={() => getTelegramWebApp()?.openLink?.(`${window.location.origin}/patient/exercise`)}
                          >
                            <ExternalLink className="size-3.5" aria-hidden="true" />
                            <span>Jonli kamera uchun tashqi brauzerda ochish</span>
                          </button>
                        </div>
                      )}
                    </section>
                  </motion.div>
                )}

                {activeTab === 'report' && (
                  <motion.div
                    key="tab-report"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                    className="flex flex-col gap-3"
                  >
                    <section className="rounded-[7.2px] border border-border bg-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="!text-xl">Shifokor tasdiqlagan 7 kunlik xulosa</h2>
                        <Badge variant={patientBrief ? 'ok' : 'secondary'}>
                          {patientBrief ? 'L4 · Tasdiqlandi' : 'Kutilmoqda'}
                        </Badge>
                      </div>
                      {patientBrief ? (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                          {patientBrief.approvedReplyUz}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Shifokor 7 kunlik xulosani L4 tasdiqlagach, yakuniy javob shu yerda va Telegram xabarida ko‘rinadi.
                        </p>
                      )}
                    </section>

                    {snapshot.activity && (
                      <PatientAdherenceView
                        adherence={snapshot.activity.adherence}
                        steps={snapshot.activity.steps}
                        stepGoal={snapshot.activity.dailyStepGoal}
                        medicationAdherence={snapshot.activity.medicationAdherence}
                        stepTrend={snapshot.activity.stepTrend}
                        isDemo={snapshot.isDemo}
                      />
                    )}
                  </motion.div>
                )}

                {activeTab === 'privacy' && (
                  <motion.div
                    key="tab-privacy"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
                    className="flex flex-col gap-3"
                  >
                    <section className="rounded-[7.2px] border border-border bg-card p-4">
                      <h2 className="!text-xl">Telegram chat maxfiyligi</h2>
                      {session.mode === 'linked' ? (
                        <div className="mt-2 flex flex-col gap-3">
                          <div className="flex items-start gap-2.5 rounded-[7.2px] border border-border bg-secondary p-3 text-sm">
                            {session.detailsEnabled ? (
                              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--ok)]" aria-hidden="true" />
                            ) : (
                              <ShieldOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            )}
                            <div>
                              <p className="font-medium">
                                {session.detailsEnabled
                                  ? 'Batafsil xabarlar yoqilgan (opt-in)'
                                  : 'Maxfiy rejim faol (sukut)'}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {session.detailsEnabled
                                  ? 'Bot chatida dori nomlari, 7 kunlik qisqa xulosa va L4 shifokor javoblari matni ko‘rsatiladi.'
                                  : 'Chatda dori nomlari va javob matni yashiriladi — faqat umumiy xabar va xavfsiz Mini App havolasi yuboriladi.'}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant={session.detailsEnabled ? 'outline' : 'default'}
                              disabled={busyAction !== null}
                              onClick={() => void toggleLinkedPrivacy()}
                            >
                              {session.detailsEnabled
                                ? 'Maxfiy rejimga o‘tkazish'
                                : 'Chatda batafsil xabarlarni yoqish'}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              disabled={busyAction !== null}
                              onClick={() => void unlinkTelegramFromMiniApp()}
                            >
                              Telegramni uzish
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">
                          Hozir siz izolyatsiyalangan Demo sessiyasidasiz (Bearer token orqali). Telegram botini bog‘laganingizda bu bo‘limda chat maxfiyligi (opt-in/opt-out) boshqaruvi faol bo‘ladi.
                        </p>
                      )}
                    </section>

                    <section className="rounded-[7.2px] border border-border bg-card p-4" aria-labelledby="tg-caregiver-title">
                      <h2 id="tg-caregiver-title" className="!text-xl">Yaqinim · 24 soatlik havola</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Havolani olgan oila a’zosi faqat bugun nechta vazifa muddati kelgani va bajarilganini ko‘radi; shifokor izohlari yashirin qoladi.
                      </p>
                      <div className="mt-3">
                        <CaregiverSharingControls
                          initialExpiresAt={caregiverExpiresAt}
                          isDemo={snapshot.isDemo}
                        />
                      </div>
                    </section>

                    {session.mode === 'demo' && demoEnabled && (
                      <section className="rounded-[7.2px] border border-border bg-card p-4">
                        <h2 className="!text-lg">Hakamlar uchun tezkor almashtirish</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Shu demo ish joyining shifokor ko‘rinishiga o‘tib, yuborilgan qaydlarga L4 javob bering.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busyAction !== null}
                            onClick={() => void startDemoSession('doctor')}
                          >
                            <ArrowRightLeft data-icon="inline-start" aria-hidden="true" />
                            <span>Shifokor ko‘rinishi (Mini App)</span>
                          </Button>
                          <Button asChild variant="outline">
                            <Link href="/">Asosiy veb sahifa</Link>
                          </Button>
                        </div>
                      </section>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </>
        )}
      </div>
    </ClinicalClientProvider>
  );
}
