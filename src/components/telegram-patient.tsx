'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Footprints, HeartPulse, PhoneCall, ShieldCheck } from 'lucide-react';
import { DorimosCheck } from './dorimos-check';
import { PatientApiProvider } from './patient-api';
import { PatientBpForm } from './patient-bp-form';
import { PatientMedicationActions } from './patient-medication-actions';
import { PatientStepsForm } from './patient-steps-form';
import { PatientUrgentSymptomForm } from './patient-urgent-symptom-form';
import { readTelegramWebApp } from './telegram-sdk';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { exerciseCatalog } from '@/lib/pose/diagnostics';
import type { PoseMovement } from '@/lib/pose/engine';
import type { TelegramDashboard } from '@/lib/telegram-patient';
import styles from './telegram-mini-app.module.css';

const Exercise = dynamic(() => import('./exercise-client').then(({ ExerciseClient }) => ExerciseClient), {
  loading: () => <p role="status">Mashq ochilmoqda…</p>,
});
const movements = ['chair_stand', 'elbow_bend', 'seated_knee_ext'] as const;
const tabs = [
  ['today', 'Bugun'], ['report', 'Hisobot'], ['exercise', 'Mashqlar'], ['privacy', 'Maxfiylik'],
] as const;
type Tab = typeof tabs[number][0];

export type TelegramTarget = {
  tab?: 'bp' | 'steps' | 'report' | 'exercise' | 'privacy';
  task?: string;
  reply?: string;
  kind?: 'doctor_reply' | 'exercise_reply' | 'brief_reply';
};

export function TelegramPatient({ token, expiresAt, target }: { token: string; expiresAt: number; target: TelegramTarget }) {
  const [data, setData] = useState<TelegramDashboard | null>(null);
  const [tab, setTab] = useState<Tab>(target.reply ? 'report'
    : target.tab === 'bp' || target.tab === 'steps' || !target.tab ? 'today' : target.tab);
  const [movement, selectMovement] = useState<PoseMovement | null>(null);
  const [loadError, setLoadError] = useState('');
  const [expired, setExpired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [privacyError, setPrivacyError] = useState('');
  const [reply, setReply] = useState<{ body?: string } | null>(null);
  const reloadSequence = useRef(0);
  const focusedLaunch = useRef(false);

  const apiFetch = useCallback((path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(path, { ...init, headers, credentials: 'omit', cache: 'no-store', redirect: 'error' });
  }, [token]);

  const refresh = useCallback(() => {
    const sequence = ++reloadSequence.current;
    void apiFetch('/api/telegram/patient').then(async (response) => {
      if (response.status === 401) {
        setExpired(true);
        return;
      }
      if (!response.ok) throw new Error();
      const next = await response.json() as TelegramDashboard;
      if (sequence !== reloadSequence.current) return;
      setData(next);
      setLoadError('');
    }).catch(() => {
      if (sequence === reloadSequence.current) setLoadError('Ma’lumot ochilmadi. Qayta urinib ko‘ring.');
    });
  }, [apiFetch]);
  const api = useMemo(() => ({ apiFetch, refresh }), [apiFetch, refresh]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setTimeout(() => setExpired(true), Math.max(0, expiresAt * 1000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  useEffect(() => {
    if (!target.reply || !target.kind) return;
    const controller = new AbortController();
    const search = new URLSearchParams({ reply: target.reply, kind: target.kind });
    void apiFetch(`/api/telegram/patient?${search}`, { signal: controller.signal }).then(async (response) => {
      const payload = response.ok ? await response.json() : {};
      if (!controller.signal.aborted) setReply(payload.reply ?? {});
    }).catch(() => {
      if (!controller.signal.aborted) setReply({});
    });
    return () => controller.abort();
  }, [apiFetch, target.kind, target.reply]);

  useEffect(() => {
    if (!data || focusedLaunch.current) return;
    const id = target.task ? `tg-task-${target.task}` : target.tab ? `tg-${target.tab}` : null;
    if (!id) return;
    focusedLaunch.current = true;
    document.getElementById(id)?.focus();
  }, [data, target.tab, target.task]);

  const pendingDose = data?.tasks.find((task) => task.type === 'medication' && task.status === 'pending')?.id;
  useEffect(() => {
    if (!data || expired) return;
    const app = readTelegramWebApp();
    const back = app?.BackButton;
    const action = app?.MainButton;
    const returnToday = () => setTab('today');
    const openDose = () => {
      app?.HapticFeedback?.impactOccurred?.('light');
      document.getElementById(`tg-task-${pendingDose}`)?.focus();
    };
    if (tab !== 'today' && back) {
      back.onClick(returnToday);
      back.show();
    } else if (pendingDose && action) {
      action.setText('Navbatdagi dozani ochish');
      action.onClick(openDose);
      action.show();
    }
    return () => {
      back?.offClick(returnToday);
      back?.hide();
      action?.offClick(openDose);
      action?.hide();
    };
  }, [data, expired, pendingDose, tab]);

  async function toggleDetails() {
    if (!data || saving) return;
    setSaving(true);
    setPrivacyError('');
    try {
      const response = await apiFetch('/api/telegram/patient', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detailsEnabled: !data.detailsEnabled }),
      });
      if (!response.ok) throw new Error();
      refresh();
    } catch {
      setPrivacyError('Sozlama saqlanmadi. Qayta urinib ko‘ring.');
    } finally {
      setSaving(false);
    }
  }

  if (expired) return <p className={styles.feedback} role="alert">Telegram menyusidan Mini Appni qayta oching.</p>;
  if (!data) return <div className={styles.entry}>
    <p role="status">{loadError || 'Vazifalar ochilmoqda…'}</p>
    {loadError && <Button type="button" onClick={refresh}>Qayta urinish</Button>}
  </div>;

  const bp = data.tasks.find((task) => task.type === 'vitals');
  const medications = data.tasks.filter((task) => task.type === 'medication');
  const selected = movement ?? data.plan?.movement ?? movements[0];
  const assigned = data.plan?.movement === selected ? data.plan : null;

  return (
    <PatientApiProvider value={api}>
      <div className={styles.dashboard}>
        <header className="flex flex-wrap justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" /> {data.today}</p>
            <h1>{data.patientName}</h1>
          </div>
          <div className="flex items-start gap-2">
            {data.isDemo && <Badge variant="secondary">Demo</Badge>}
            <a className="emergency" href="tel:103"><PhoneCall className="size-4" aria-hidden="true" /> 103</a>
          </div>
        </header>
        <nav aria-label="Bemor bo‘limlari">
          {tabs.map(([id, title]) => <Button key={id} type="button" variant={tab === id ? 'default' : 'outline'}
            aria-current={tab === id ? 'page' : undefined} onClick={() => {
              readTelegramWebApp()?.HapticFeedback?.impactOccurred?.('light');
              setTab(id);
            }}>{title}</Button>)}
        </nav>
        {loadError && <p role="alert">{loadError} <button type="button" className="text-action" onClick={refresh}>Qayta urinish</button></p>}

        {tab === 'today' && <>
          <section className="grid gap-2" aria-labelledby="tg-doses">
            <h2 id="tg-doses">Bugungi dozalar</h2>
            {medications.length === 0 && <p>Bugun dori vazifasi yo‘q.</p>}
            {target.task && !medications.some((task) => task.id === target.task) && <p role="status">Bu doza bugungi rejangizda yo‘q.</p>}
            {medications.map((task) => <Card key={task.id} id={`tg-task-${task.id}`} tabIndex={-1}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{task.title}{task.strength ? ` · ${task.strength} ${task.strengthUnit ?? 'mg'}` : ''}</CardTitle>
                  <Badge variant={task.status === 'taken' ? 'ok' : 'secondary'}>{task.dueTime} · {
                    task.status === 'taken' ? 'Ichilgan' : task.status === 'missed' ? 'Qoldirilgan' : 'Kutilmoqda'
                  }</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {task.status === 'pending' && <PatientMedicationActions taskId={task.id} taskTitle={task.title} isDemo={false} />}
                {task.strength != null && !task.boxEvidence && <DorimosCheck taskId={task.id} available isDemo={data.isDemo} />}
              </CardContent>
            </Card>)}
          </section>
          <Card id="tg-bp" tabIndex={-1}>
            <CardHeader><CardTitle className="flex items-center gap-2"><HeartPulse className="size-4" aria-hidden="true" /> Qon bosimi</CardTitle></CardHeader>
            <CardContent>
              {bp?.evidence?.payload.kind === 'vitals'
                ? <p>{bp.evidence.payload.systolic ?? '—'} / {bp.evidence.payload.diastolic ?? '—'} mmHg · Saqlandi</p>
                : bp ? <PatientBpForm taskId={bp.id} targets={data.targets} isDemo={false} /> : <p>Bugun qon bosimi vazifasi yo‘q.</p>}
            </CardContent>
          </Card>
          <Card id="tg-steps" tabIndex={-1}>
            <CardHeader><CardTitle className="flex items-center gap-2"><Footprints className="size-4" aria-hidden="true" /> Qadamlar</CardTitle></CardHeader>
            <CardContent>
              {data.activity?.steps && <p>{data.activity.steps.count} / {data.activity.dailyStepGoal}</p>}
              <PatientStepsForm defaultSteps={data.activity?.todayStepsBySource?.selfReport?.count} isDemo={false} />
            </CardContent>
          </Card>
          <details className="rounded-md border border-border bg-card p-3">
            <summary className="min-h-11 cursor-pointer font-medium">Yordam kerak</summary>
            <PatientUrgentSymptomForm isDemo={false} />
          </details>
        </>}

        {tab === 'report' && <section className="grid gap-3" id="tg-report" tabIndex={-1}>
          <h2>7 kunlik hisobot</h2>
          {target.reply && <Card><CardHeader><CardTitle>Shifokor javobi</CardTitle></CardHeader>
            <CardContent><p role="status">{reply?.body ?? (reply ? 'Bu javob topilmadi.' : 'Javob ochilmoqda…')}</p></CardContent>
          </Card>}
          {data.activity?.medicationAdherence?.map((item) => (
            <Card key={JSON.stringify([item.medicationName, item.strength, item.strengthUnit])}>
              <CardHeader><CardTitle>{item.medicationName}</CardTitle></CardHeader>
              <CardContent><p>Ichilgan {item.week.taken} · Qoldirilgan {item.week.missed} · Javobsiz {item.week.unanswered}</p></CardContent>
            </Card>
          ))}
          {data.activity?.stepTrend && <Card>
            <CardHeader><CardTitle>7 kunlik qadamlar</CardTitle></CardHeader>
            <CardContent><ul className="grid gap-1">{data.activity.stepTrend.map((day) => <li key={day.date}>
              {day.date} · {day.effectiveCount ?? '—'} {day.effectiveSource === 'self_report' ? '· Qo‘lda' :
                day.effectiveSource === 'device_sensor' ? '· Telefon sensori' : day.effectiveSource === 'demo_sim' ? '· Demo' : ''}
            </li>)}</ul></CardContent>
          </Card>}
          {data.brief && data.brief.id !== target.reply && <Card>
            <CardHeader><CardTitle>Shifokor tasdiqlagan javob</CardTitle></CardHeader>
            <CardContent><p>{data.brief.approvedReplyUz}</p></CardContent>
          </Card>}
          {data.replies.map((item) => <Card key={item.id}>
            <CardHeader><CardTitle>{item.title} · {item.date}</CardTitle></CardHeader>
            <CardContent><p>{item.body}</p></CardContent>
          </Card>)}
          {data.attempts.filter((attempt) => attempt.review).map((attempt) => <Card key={attempt.id}>
            <CardHeader><CardTitle>{exerciseCatalog[attempt.movement].shortTitle} · {attempt.scheduledDate}</CardTitle></CardHeader>
            <CardContent><p>{attempt.review?.body}</p></CardContent>
          </Card>)}
        </section>}

        {tab === 'exercise' && <section className="grid gap-3" id="tg-exercise" tabIndex={-1}>
          <h2>Reabilitatsiya mashqlari</h2>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mashqni tanlang">
            {movements.map((item) => <Button key={item} type="button" variant={selected === item ? 'default' : 'outline'}
              aria-pressed={selected === item} onClick={() => selectMovement(item)}>{exerciseCatalog[item].shortTitle}</Button>)}
          </div>
          <p>{assigned ? 'Shifokor rejasi' : 'Namuna mashqi'}. Kamera ochilmasa, namuna yoki qurilmadagi videoni tanlang.</p>
          <Exercise key={selected} movement={selected} targetAngle={assigned?.targetAngle ?? exerciseCatalog[selected].defaultTargetAngle}
            targetReps={assigned?.targetReps} maxShallow={assigned?.maxShallow} painColor={assigned?.painColor}
            preview={!assigned} isDemo={data.isDemo} />
        </section>}

        {tab === 'privacy' && <Card id="tg-privacy" tabIndex={-1}>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4" aria-hidden="true" /> Chat tafsilotlari</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <p>{data.detailsEnabled ? 'Yoqilgan' : 'O‘chirilgan'}. Yoqilganda Telegram chatida dori nomlari, qisqa hisobot va shifokor javoblari ko‘rinadi.</p>
            <Button type="button" variant="outline" aria-pressed={data.detailsEnabled} disabled={saving} onClick={() => void toggleDetails()}>
              {data.detailsEnabled ? 'Tafsilotlarni o‘chirish' : 'Tafsilotlarni yoqish'}
            </Button>
            {privacyError && <p role="alert">{privacyError}</p>}
          </CardContent>
        </Card>}
      </div>
    </PatientApiProvider>
  );
}
