'use client';

import { useState, type FormEvent } from 'react';
import { Check, HelpCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useClinicalClient, useHydrated } from '@/lib/clinical-client-fetch';
import styles from './patient-clinical.module.css';

export function PatientSupplyFollowupActions({
  flagId,
  isDemo,
}: {
  flagId: string;
  isDemo: boolean;
}) {
  const client = useClinicalClient();
  const hydrated = useHydrated();
  const useJsonApi = !isDemo || client.bearerToken !== null;
  const [pending, setPending] = useState<'supply_resolved' | 'still_need_help' | null>(null);

  async function sendJson(kind: 'supply_resolved' | 'still_need_help') {
    if (!useJsonApi || pending) return;
    setPending(kind);
    try {
      const response = await client.fetchJson('/api/clinical/followup', {
        method: 'POST',
        body: JSON.stringify({ flagId, kind }),
      });
      if (!response.ok) {
        client.hapticNotify('error');
        toast.error('Xabarni yuborib bo‘lmadi.');
        return;
      }
      client.hapticNotify('success');
      toast.success(kind === 'supply_resolved' ? 'Dori ta’minoti tasdiqlandi.' : 'Shifokorga xabar yuborildi.');
      client.refresh();
    } catch {
      client.hapticNotify('error');
      toast.error('Tarmoq xatosi.');
    } finally {
      setPending(null);
    }
  }

  function handleSubmit(kind: 'supply_resolved' | 'still_need_help') {
    return (event: FormEvent<HTMLFormElement>) => {
      if (!useJsonApi) return;
      event.preventDefault();
      void sendJson(kind);
    };
  }

  return (
    <div className={styles.controls}>
      <form action="/api/demo/followup" method="post" onSubmit={handleSubmit('supply_resolved')}>
        <input type="hidden" name="flagId" value={flagId} />
        <input type="hidden" name="kind" value="supply_resolved" />
        <Button type="submit" size="lg" className="w-full" disabled={(useJsonApi && !hydrated) || pending !== null}>
          {pending === 'supply_resolved' ? (
            <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />
          ) : (
            <Check data-icon="inline-start" aria-hidden="true" />
          )}
          <span>Dorini oldim va ichdim</span>
        </Button>
      </form>
      <form action="/api/demo/followup" method="post" onSubmit={handleSubmit('still_need_help')}>
        <input type="hidden" name="flagId" value={flagId} />
        <input type="hidden" name="kind" value="still_need_help" />
        <button className="text-action" type="submit" disabled={(useJsonApi && !hydrated) || pending !== null}>
          <HelpCircle className="size-4" aria-hidden="true" />
          <span>Hali yordam kerak</span>
        </button>
      </form>
    </div>
  );
}

export function PatientMedRetakeFollowupActions({
  flagId,
  isDemo,
}: {
  flagId: string;
  isDemo: boolean;
}) {
  const client = useClinicalClient();
  const hydrated = useHydrated();
  const useJsonApi = !isDemo || client.bearerToken !== null;
  const [pending, setPending] = useState<'taken' | 'missed' | null>(null);

  async function sendJson(medicationStatus: 'taken' | 'missed') {
    if (!useJsonApi || pending) return;
    setPending(medicationStatus);
    try {
      const response = await client.fetchJson('/api/clinical/followup', {
        method: 'POST',
        body: JSON.stringify({ flagId, kind: 'retake_medication', medicationStatus }),
      });
      if (!response.ok) {
        client.hapticNotify('error');
        toast.error('Qayta qayd yuborilmadi.');
        return;
      }
      client.hapticNotify('success');
      toast.success('Qayta dori qaydi yuborildi.');
      client.refresh();
    } catch {
      client.hapticNotify('error');
      toast.error('Tarmoq xatosi.');
    } finally {
      setPending(null);
    }
  }

  function handleSubmit(status: 'taken' | 'missed') {
    return (event: FormEvent<HTMLFormElement>) => {
      if (!useJsonApi) return;
      event.preventDefault();
      void sendJson(status);
    };
  }

  return (
    <div className={styles.controls}>
      <form action="/api/demo/followup" method="post" onSubmit={handleSubmit('taken')}>
        <input type="hidden" name="flagId" value={flagId} />
        <input type="hidden" name="kind" value="retake_medication" />
        <Button type="submit" size="lg" className="w-full" name="medicationStatus" value="taken" disabled={(useJsonApi && !hydrated) || pending !== null}>
          {pending === 'taken' && <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />}
          <span>Qayta tasdiqlash: Ichdim</span>
        </Button>
      </form>
      <form action="/api/demo/followup" method="post" onSubmit={handleSubmit('missed')}>
        <input type="hidden" name="flagId" value={flagId} />
        <input type="hidden" name="kind" value="retake_medication" />
        <button className="text-action" type="submit" name="medicationStatus" value="missed" disabled={(useJsonApi && !hydrated) || pending !== null}>
          Hali icha olmadim
        </button>
      </form>
    </div>
  );
}
