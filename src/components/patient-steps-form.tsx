'use client';

import { useState, type FormEvent } from 'react';
import { Footprints, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { maximumDailySteps } from '@/lib/adherence';
import { useClinicalClient, useHydrated } from '@/lib/clinical-client-fetch';
import styles from './patient-adherence.module.css';

export function PatientStepsForm({
  defaultSteps,
  isDemo,
}: {
  defaultSteps?: number;
  isDemo: boolean;
}) {
  const client = useClinicalClient();
  const hydrated = useHydrated();
  const useJsonApi = !isDemo || client.bearerToken !== null;
  const [steps, setSteps] = useState(defaultSteps !== undefined ? String(defaultSteps) : '');
  const [pending, setPending] = useState(false);

  async function handleClinicSubmit(event: FormEvent<HTMLFormElement>) {
    if (!useJsonApi) return;
    event.preventDefault();
    if (pending) return;
    const count = Number(steps.trim());
    if (!Number.isInteger(count) || count < 0 || count > maximumDailySteps) {
      client.hapticNotify('error');
      toast.error('Qadamlar sonini to‘g‘ri kiriting.');
      return;
    }
    setPending(true);
    try {
      const response = await client.fetchJson('/api/clinical/steps', {
        method: 'POST',
        body: JSON.stringify({ count, source: 'self_report' }),
      });
      if (!response.ok) {
        client.hapticNotify('error');
        toast.error('Qadamlarni saqlab bo‘lmadi.');
        return;
      }
      client.hapticNotify('success');
      toast.success('Bugungi qadamlar saqlandi.');
      client.refresh();
    } catch {
      client.hapticNotify('error');
      toast.error('Aloqa uzildi.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className={styles.stepsForm}
      action="/api/demo/steps"
      method="post"
      onSubmit={(event) => void handleClinicSubmit(event)}
      aria-labelledby="daily-steps-title"
    >
      <label htmlFor="daily-steps" className="text-sm font-semibold">
        Qadamlar soni
      </label>
      <Input
        id="daily-steps"
        name="steps"
        type="text"
        inputMode="numeric"
        pattern="[0-9]{1,6}"
        maxLength={String(maximumDailySteps).length}
        value={steps}
        onChange={(e) => setSteps(e.currentTarget.value)}
        required
      />
      <Button type="submit" size="lg" disabled={(useJsonApi && !hydrated) || pending}>
        {pending ? (
          <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />
        ) : (
          <Footprints data-icon="inline-start" aria-hidden="true" />
        )}
        <span>Qadamlarni saqlash</span>
      </Button>
    </form>
  );
}
