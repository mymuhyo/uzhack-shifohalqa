'use client';

import { useState } from 'react';
import { Check, CheckCircle2, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';

export function CaregiverAckButton({
  token,
  kind,
  initialAckAt,
}: {
  token: string;
  kind: 'supply_on_the_way' | 'checked_in';
  initialAckAt: string | null;
}) {
  const [ackAt, setAckAt] = useState<string | null>(initialAckAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendAck() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/caregiver/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, kind }),
      });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { createdAt?: string };
      setAckAt(data.createdAt ?? new Date().toISOString());
    } catch {
      setError('Tasdiqni yuborib bo‘lmadi. Sahifani yangilab qayta urinib ko‘ring.');
    } finally {
      setBusy(false);
    }
  }

  const buttonLabel = kind === 'supply_on_the_way'
    ? 'Xabar oldim — yordam beramiz'
    : 'Xabar oldim — bog‘lanamiz';
  const confirmedText = kind === 'supply_on_the_way'
    ? 'Tasdiq yuborildi: yaqiningiz yordam tayyorlanayotganini ko‘radi.'
    : 'Tasdiq yuborildi: yaqiningiz bog‘lanishingizni ko‘radi.';

  if (ackAt) {
    return (
      <motion.p
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        className="notice flex items-center gap-2 font-medium"
        role="status"
      >
        <CheckCircle2 className="size-4 shrink-0 text-[var(--ok)]" aria-hidden="true" />
        <span>{confirmedText}</span>
      </motion.p>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <Button type="button" size="lg" className="w-full" disabled={busy} onClick={() => void sendAck()}>
        {busy ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : <Check data-icon="inline-start" aria-hidden="true" />}
        <span>{busy ? 'Yuborilmoqda…' : buttonLabel}</span>
      </Button>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
