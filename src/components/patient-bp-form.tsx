'use client';

import { useState, type FormEvent } from 'react';
import { AlertTriangle, HeartPulse, Loader2, PhoneCall } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useClinicalClient, useHydrated } from '@/lib/clinical-client-fetch';
import { evaluateBpZone } from '@/lib/clinical-triage';
import type { BloodPressureTargets } from '@/lib/clinical-types';
import styles from './patient-clinical.module.css';

export type PriorBpReference = {
  id: string;
  label: string;
};

function BpZoneBanner({
  systolic,
  diastolic,
  chestPain,
  targets,
}: {
  systolic: string;
  diastolic: string;
  chestPain: boolean;
  targets: BloodPressureTargets | null;
}) {
  const zone = evaluateBpZone({ systolic, diastolic, chestPain, targets });
  if (!zone) return null;

  return (
    <p
      role="status"
      className={`bp-zone ${zone.tone === 'urgent' ? 'bp-zone-urgent' : zone.tone === 'warn' ? 'bp-zone-warn' : 'bp-zone-ok'}`}
    >
      {zone.textUz}
    </p>
  );
}

export function PatientBpForm({
  taskId,
  targets,
  isDemo = true,
  priorReadings = [],
}: {
  taskId: string;
  targets: BloodPressureTargets | null;
  isDemo?: boolean;
  priorReadings?: readonly PriorBpReference[];
}) {
  const client = useClinicalClient();
  const hydrated = useHydrated();
  const useJsonApi = !isDemo || client.bearerToken !== null;
  const hintId = `pressure-hint-${taskId}`;
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [chestPain, setChestPain] = useState(false);
  const [repeatOfEvidenceId, setRepeatOfEvidenceId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const zone = evaluateBpZone({ systolic, diastolic, chestPain, targets });
  const hasInvalidReading = Boolean(zone?.invalid);

  async function handleClinicSubmit(event: FormEvent<HTMLFormElement>) {
    if (!useJsonApi) return;
    event.preventDefault();
    if (pending || hasInvalidReading) return;

    const sysTrim = systolic.trim();
    const diaTrim = diastolic.trim();
    if ((!sysTrim || !diaTrim) && !chestPain) {
      setError('Qon bosimi qiymatlarini kiriting yoki ko‘krak og‘rig‘ini belgilang.');
      return;
    }

    setPending(true);
    setError('');
    try {
      const response = await client.fetchJson('/api/clinical/evidence', {
        method: 'POST',
        body: JSON.stringify({
          taskId,
          systolic: sysTrim ? Number(sysTrim) : null,
          diastolic: diaTrim ? Number(diaTrim) : null,
          chestPain,
          ...(repeatOfEvidenceId ? { repeatOfEvidenceId } : {}),
        }),
      });
      if (!response.ok) {
        client.hapticNotify('error');
        setError('Bosim qiymatlarini tekshiring (sistolik 50–260, diastolik 30–160, sistolik > diastolik).');
        return;
      }
      client.hapticNotify(zone?.tone === 'urgent' ? 'warning' : 'success');
      toast.success('Qon bosimi qaydi saqlandi.');
      client.refresh();
    } catch {
      client.hapticNotify('error');
      setError('Aloqa uzildi. Qayta urinib ko‘ring.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className={styles.controls}
      action="/api/demo/evidence"
      method="post"
      onSubmit={(event) => void handleClinicSubmit(event)}
      aria-labelledby={`pressure-${taskId}`}
    >
      <input type="hidden" name="taskId" value={taskId} />
      <fieldset aria-describedby={hintId} className="flex flex-col gap-2">
        <legend id={`pressure-${taskId}`} className="flex items-center gap-1.5 text-sm font-semibold">
          <HeartPulse className="size-4 text-primary" aria-hidden="true" />
          <span>Qon bosimi (mm sim. ust.)</span>
        </legend>
        <div className={styles.readings}>
          <label htmlFor={`systolic-${taskId}`} className="flex flex-col gap-1 text-sm font-medium">
            <span>Sistolik bosim</span>
            <Input
              id={`systolic-${taskId}`}
              name="systolic"
              type="number"
              inputMode="numeric"
              min={50}
              max={260}
              step={1}
              value={systolic}
              aria-invalid={hasInvalidReading ? true : undefined}
              onChange={(event) => setSystolic(event.currentTarget.value)}
            />
          </label>
          <label htmlFor={`diastolic-${taskId}`} className="flex flex-col gap-1 text-sm font-medium">
            <span>Diastolik bosim</span>
            <Input
              id={`diastolic-${taskId}`}
              name="diastolic"
              type="number"
              inputMode="numeric"
              min={30}
              max={160}
              step={1}
              value={diastolic}
              aria-invalid={hasInvalidReading ? true : undefined}
              onChange={(event) => setDiastolic(event.currentTarget.value)}
            />
          </label>
        </div>
        <p id={hintId} className="text-xs text-muted-foreground">
          Bosimni qayd etish uchun ikkala qiymatni kiriting. Faqat og‘riq haqida xabar bersangiz, ularni bo‘sh qoldiring.
        </p>
      </fieldset>

      {priorReadings.length > 0 && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`repeat-${taskId}`} className="text-xs font-semibold text-muted-foreground">
            Takroriy o‘lchov bo‘lsa oldingi qaydga bog‘lang (ixtiyoriy)
          </label>
          <NativeSelect
            id={`repeat-${taskId}`}
            name="repeatOfEvidenceId"
            value={repeatOfEvidenceId}
            onChange={(e) => setRepeatOfEvidenceId(e.currentTarget.value)}
          >
            <option value="">Yangi o‘lchov (bog‘lanmagan)</option>
            {priorReadings.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <label className={styles.symptom}>
        <input
          type="checkbox"
          name="chestPain"
          value="yes"
          checked={chestPain}
          onChange={(event) => setChestPain(event.currentTarget.checked)}
        />
        <span>Ko‘krak og‘rig‘i bor</span>
      </label>

      <BpZoneBanner systolic={systolic} diastolic={diastolic} chestPain={chestPain} targets={targets} />

      {zone?.tone === 'urgent' && !zone.invalid && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--urgent)] bg-[var(--urgent-bg)] px-3 py-2 text-xs font-semibold text-[var(--urgent)]">
          <span className="inline-flex items-center gap-1.5">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            <span>Kuchli bosh aylanishi yoki ko‘krak og‘rig‘ida darhol 103 ga qo‘ng‘iroq qiling.</span>
          </span>
          <a className="emergency min-h-8" href="tel:103">
            <PhoneCall className="size-3.5" aria-hidden="true" />
            <span>103</span>
          </a>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--urgent)]">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={(useJsonApi && !hydrated) || pending || hasInvalidReading}>
        {pending && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />}
        <span>Qaydni yuborish</span>
      </Button>
    </form>
  );
}

export function PatientRetakeBpForm({
  flagId,
  targets,
  isDemo = true,
}: {
  flagId: string;
  targets: BloodPressureTargets | null;
  isDemo?: boolean;
}) {
  const client = useClinicalClient();
  const hydrated = useHydrated();
  const useJsonApi = !isDemo || client.bearerToken !== null;
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [chestPain, setChestPain] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const zone = evaluateBpZone({ systolic, diastolic, chestPain, targets });
  const hasInvalidReading = Boolean(zone?.invalid);

  async function handleClinicSubmit(event: FormEvent<HTMLFormElement>) {
    if (!useJsonApi) return;
    event.preventDefault();
    if (pending || hasInvalidReading) return;
    setPending(true);
    setError('');
    try {
      const response = await client.fetchJson('/api/clinical/followup', {
        method: 'POST',
        body: JSON.stringify({
          flagId,
          kind: 'retake_vitals',
          systolic: Number(systolic),
          diastolic: Number(diastolic),
          chestPain,
        }),
      });
      if (!response.ok) {
        client.hapticNotify('error');
        setError('Qayta o‘lchov qiymatlarini tekshiring.');
        return;
      }
      client.hapticNotify('success');
      toast.success('Qayta o‘lchov yuborildi.');
      client.refresh();
    } catch {
      client.hapticNotify('error');
      setError('Aloqa uzildi.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className={styles.controls}
      action="/api/demo/followup"
      method="post"
      onSubmit={(event) => void handleClinicSubmit(event)}
    >
      <input type="hidden" name="flagId" value={flagId} />
      <input type="hidden" name="kind" value="retake_vitals" />
      <div className={styles.readings}>
        <label className="flex flex-col gap-1 text-sm font-medium">
          <span>Qayta sistolik</span>
          <Input
            name="systolic"
            type="number"
            inputMode="numeric"
            min={50}
            max={260}
            required
            value={systolic}
            aria-invalid={hasInvalidReading ? true : undefined}
            onChange={(event) => setSystolic(event.currentTarget.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          <span>Qayta diastolik</span>
          <Input
            name="diastolic"
            type="number"
            inputMode="numeric"
            min={30}
            max={160}
            required
            value={diastolic}
            aria-invalid={hasInvalidReading ? true : undefined}
            onChange={(event) => setDiastolic(event.currentTarget.value)}
          />
        </label>
      </div>
      <label className={styles.symptom}>
        <input
          type="checkbox"
          name="chestPain"
          value="yes"
          checked={chestPain}
          onChange={(event) => setChestPain(event.currentTarget.checked)}
        />
        <span>Ko‘krak og‘rig‘i bor</span>
      </label>
      <BpZoneBanner systolic={systolic} diastolic={diastolic} chestPain={chestPain} targets={targets} />
      {error && (
        <p role="alert" className="text-sm font-semibold text-[var(--urgent)]">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={(useJsonApi && !hydrated) || pending || hasInvalidReading}>
        {pending && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />}
        <span>Qayta o‘lchovni yuborish</span>
      </Button>
    </form>
  );
}
