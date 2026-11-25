'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Footprints, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { maximumDailySteps } from '@/lib/adherence';
import styles from './patient-adherence.module.css';

export function PatientStepsForm({
  defaultSteps,
  isDemo,
}: {
  defaultSteps?: number;
  isDemo: boolean;
}) {
  const router = useRouter();
  const [steps, setSteps] = useState(defaultSteps !== undefined ? String(defaultSteps) : '');
  const [pending, setPending] = useState(false);

  async function handleClinicSubmit(event: FormEvent<HTMLFormElement>) {
    if (isDemo) return;
    event.preventDefault();
    if (pending) return;
    const count = Number(steps.trim());
    if (!Number.isInteger(count) || count < 0 || count > maximumDailySteps) {
      toast.error('Qadamlar sonini to‘g‘ri kiriting.');
      return;
    }
    setPending(true);
    try {
      const response = await fetch('/api/clinical/steps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, source: 'self_report' }),
      });
      if (!response.ok) {
        toast.error('Qadamlarni saqlab bo‘lmadi.');
        return;
      }
      toast.success('Bugungi qadamlar saqlandi.');
      router.refresh();
    } catch {
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
      <Button type="submit" size="lg" disabled={pending}>
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
