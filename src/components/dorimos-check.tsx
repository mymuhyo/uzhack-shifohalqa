'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { z } from 'zod';
import { dorimosResponse, formatBoxLabel, type dorimosInput } from '@/lib/dorimos-contract';
import { dorimosSamples, type DorimosSampleId } from '@/lib/dorimos-samples';
import styles from './patient-clinical.module.css';

const options = Object.values(dorimosSamples).filter((sample) => sample.demo);

export function DorimosCheck({ taskId, available }: { taskId: string; available: boolean }) {
  const router = useRouter();
  const [sampleId, setSample] = useState<DorimosSampleId>('box-5mg');
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState<Extract<z.infer<typeof dorimosResponse>, { status: 'needs_confirmation' }> | null>(null);
  const sample = dorimosSamples[sampleId];

  async function send(input: z.infer<typeof dorimosInput>) {
    setPending(true);
    setMessage(input.action === 'scan' ? 'Quti yozuvi tekshirilmoqda…' : 'Qayd saqlanmoqda…');
    if (input.action === 'scan') setConfirmation(null);
    try {
      const response = await fetch('/api/demo/dorimos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result = dorimosResponse.parse(await response.json());
      switch (result.status) {
        case 'needs_confirmation':
          setConfirmation(result);
          setMessage(`Qutidan o‘qildi · ${formatBoxLabel(result.reading.label)}. Yozuvni rasm bilan solishtiring.`);
          break;
        case 'retake':
          setMessage('Quti yozuvini ishonchli o‘qib bo‘lmadi. Boshqa namuna tanlang yoki qo‘lda qayd eting.');
          break;
        case 'manual':
          setMessage(input.action === 'manual' ? 'Qaydni saqlab bo‘lmadi. Qayta urinib ko‘ring.'
            : 'Avtomatik tekshiruv hozir ishlamadi. Qayta urinib ko‘ring yoki qo‘lda qayd eting.');
          break;
        case 'saved':
        case 'already_saved':
          setSaved(true);
          setMessage('Quti qaydi saqlandi.');
          router.refresh();
          break;
        case 'expired':
          setConfirmation(null);
          setMessage('Tasdiqlash muddati tugagan. Namunani qayta tekshiring.');
          break;
        default:
          setMessage('Bu qayd hozir qabul qilinmaydi. Sahifani yangilang.');
      }
    } catch {
      setMessage('Aloqa uzildi. Qayta urinib ko‘ring.');
    } finally {
      setPending(false);
    }
  }

  return (
    <details className={`${styles.controls} ${styles.disclosure}`}>
      <summary>DoriMos · qutini tekshirish</summary>
      <div className={styles.fields}>
        <p>Sinov uchun tayyorlangan qutilar. Rasmda dori nomi va qutidagi kuch tekshiriladi.</p>
        {available ? (
          <form className={styles.fields} onSubmit={(event) => {
            event.preventDefault();
            void send({ action: 'scan', taskId, sampleId });
          }}>
            <label htmlFor={`dorimos-${taskId}`}>Namuna rasmi</label>
            <select id={`dorimos-${taskId}`} className={styles.field} value={sampleId} disabled={pending || saved}
              onChange={(event) => {
                const option = options.find(({ id }) => id === event.target.value);
                if (!option) return;
                setSample(option.id);
                setConfirmation(null);
                setMessage('');
              }}>
              {options.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
            </select>
            <Image alt={`Demo qutisi · ${sample.label}`} src={sample.imagePath} width={800} height={500}
              sizes="(max-width: 540px) 90vw, 480px" className={styles.boxImage} unoptimized />
            <button type="submit" className={styles.submit} disabled={pending || saved}>Rasmni o‘qish</button>
          </form>
        ) : <p>Rejada qutining kuchi ko‘rsatilmagan. Qutini qo‘lda qayd etishingiz mumkin.</p>}
        <p role="status">{message}</p>
        {confirmation && !saved && (
          <div className={styles.fields}>
            <button type="button" className={styles.submit} disabled={pending}
              onClick={() => void send({ action: 'confirm', taskId, token: confirmation.token })}>
              Qutidagi yozuvni tasdiqlash
            </button>
            <button type="button" className="text-action" disabled={pending} onClick={() => {
              setConfirmation(null);
              setMessage('Yozuv tasdiqlanmadi. Boshqa namuna tanlang yoki qo‘lda qayd eting.');
            }}>Yozuvni rad etish</button>
          </div>
        )}
        <button type="button" className="text-action" disabled={pending || saved}
          onClick={() => void send({ action: 'manual', taskId })}>Tekshirilmaganini qo‘lda qayd etish · L0</button>
      </div>
    </details>
  );
}
