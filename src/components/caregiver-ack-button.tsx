'use client';

import { useState } from 'react';

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
      <p className="notice" role="status">
        {confirmedText}
      </p>
    );
  }

  return (
    <div>
      <button type="button" className="role-button" disabled={busy} onClick={() => void sendAck()}>
        {busy ? 'Yuborilmoqda…' : buttonLabel}
      </button>
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
  );
}
