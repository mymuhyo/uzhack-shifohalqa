'use client';

import { useState } from 'react';

export function DoctorAndroidPairing() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  async function issue() {
    setBusy(true);
    setCode('');
    setStatus('');
    try {
      const response = await fetch('/api/demo/android/pairing', { method: 'POST' });
      if (!response.ok) throw new Error('Pairing failed');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('code' in data)
        || typeof data.code !== 'string' || !/^[a-f0-9]{32}$/.test(data.code)) {
        throw new Error('Invalid code');
      }
      setCode(data.code);
      setStatus('Ulash kodi tayyor.');
    } catch {
      setStatus('Kod olinmadi. Qayta urinib ko‘ring.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setStatus('Kod nusxalandi.');
    } catch {
      setStatus('Kodni belgilab, qo‘lda nusxalang.');
    }
  }

  return (
    <section className="ledger" aria-labelledby="android-pairing-heading">
      <h2 id="android-pairing-heading">Android ilovasi</h2>
      <p>Shu demo ish joyini bemor telefoniga ulang. Kod 10 daqiqa va bir marta amal qiladi. Yangi kod avvalgi ulanishni tugatadi.</p>
      <button className="text-action" type="button" disabled={busy} onClick={() => void issue()}>
        Android ulash kodini olish
      </button>
      {code && <p><code data-testid="android-pair-code">{code}</code>{' '}
        <button className="text-action" type="button" onClick={() => void copy()}>Kodni nusxalash</button>
      </p>}
      <p role="status">{status}</p>
    </section>
  );
}
