'use client';

import Image from 'next/image';
import { usePatientApi } from './patient-api';
import { useEffect, useState, type ChangeEvent } from 'react';
import { Camera, Check, Clock, Loader2, ScanLine, X } from 'lucide-react';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { dorimosResponse, formatBoxLabel, type dorimosInput } from '@/lib/dorimos-contract';
import { dorimosSamples, type DorimosSampleId } from '@/lib/dorimos-samples';
import styles from './patient-clinical.module.css';

const options = Object.values(dorimosSamples).filter((sample) => sample.demo);
const maxEdgePx = 1280;

async function prepareCameraJpeg(file: File): Promise<Blob> {
  if (file.type === 'image/png' && file.size <= 1_500_000) return file;
  if (file.type === 'image/jpeg' && file.size <= 1_500_000) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdgePx / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ?? file;
  } finally {
    bitmap.close();
  }
}

export function DorimosCheck({
  taskId,
  available,
  isDemo = true,
  deferred = false,
}: {
  taskId: string;
  available: boolean;
  isDemo?: boolean;
  deferred?: boolean;
}) {
  const { apiFetch, refresh, linked } = usePatientApi();
  const endpoint = isDemo && !linked ? '/api/demo/dorimos' : '/api/clinical/dorimos';
  const [sampleId, setSampleId] = useState<DorimosSampleId>('box-5mg');
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState<Extract<z.infer<typeof dorimosResponse>, { status: 'needs_confirmation' }> | null>(null);
  const sample = dorimosSamples[sampleId];

  useEffect(() => () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
  }, [photoPreviewUrl]);

  function applyResult(result: z.infer<typeof dorimosResponse>, action: z.infer<typeof dorimosInput>['action']) {
    switch (result.status) {
      case 'needs_confirmation':
        setConfirmation(result);
        setMessage(`Qutidan o‘qildi · ${formatBoxLabel(result.reading.label)}. Yozuvni rasm bilan solishtiring.`);
        break;
      case 'retake':
        setMessage('Quti yozuvini ishonchli o‘qib bo‘lmadi. Yaqinroq, yorug‘roq rasmga oling yoki boshqa namuna tanlang.');
        break;
      case 'manual':
        setMessage(action === 'manual'
          ? 'Qaydni saqlab bo‘lmadi. Qayta urinib ko‘ring.'
          : 'Avtomatik tekshiruv hozir ishlamadi. Qayta urinib ko‘ring yoki qo‘lda qayd eting.');
        break;
      case 'saved':
      case 'already_saved':
        setSaved(true);
        setMessage(action === 'defer' ? 'Quti tekshiruvi keyinroqqa qoldirildi.' : 'Quti qaydi saqlandi.');
        refresh();
        break;
      case 'expired':
        setConfirmation(null);
        setMessage('Tasdiqlash muddati tugagan. Qutini qayta tekshiring.');
        break;
      default:
        setMessage('Bu qayd hozir qabul qilinmaydi. Sahifani yangilang.');
    }
  }

  async function send(input: z.infer<typeof dorimosInput>) {
    setPending(true);
    setMessage(input.action === 'scan' ? 'Quti yozuvi tekshirilmoqda…' : 'Qayd saqlanmoqda…');
    if (input.action === 'scan') setConfirmation(null);
    try {
      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result = dorimosResponse.parse(await response.json());
      applyResult(result, input.action);
    } catch {
      setMessage('Aloqa uzildi. Qayta urinib ko‘ring.');
    } finally {
      setPending(false);
    }
  }

  async function handlePhotoUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setPending(true);
    setConfirmation(null);
    setMessage('Kamera rasmi tekshirilmoqda…');
    try {
      const prepared = await prepareCameraJpeg(file);
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoPreviewUrl(URL.createObjectURL(prepared));

      const form = new FormData();
      form.set('taskId', taskId);
      form.set('image', prepared, prepared.type === 'image/png' ? 'box.png' : 'box.jpg');

      const response = await apiFetch(endpoint, { method: 'POST', body: form });
      const result = dorimosResponse.parse(await response.json());
      applyResult(result, 'confirm');
    } catch {
      setMessage('Rasmni yuborib bo‘lmadi. PNG yoki JPEG rasm tanlang.');
    } finally {
      setPending(false);
    }
  }

  return (
    <details className={`${styles.controls} ${styles.disclosure}`}>
      <summary>{deferred ? 'DoriMos · qutini hozir tekshirish' : 'DoriMos · qutini tekshirish'}</summary>
      <div className={styles.fields}>
        <p className="text-sm text-muted-foreground">
          {isDemo
            ? 'Dori qutisini real kamera bilan rasmga oling yoki tayyor demo namunalaridan birini tekshiring (mg / mkg / g / IU).'
            : 'Dori qutisini kamera bilan rasmga olib yozuvini tasdiqlang (mg / mkg / g / IU).'}
        </p>
        {available ? (
          <>
            <div className={styles.fields}>
              <label htmlFor={`dorimos-camera-${taskId}`} className="flex items-center gap-1.5 text-sm font-semibold">
                <Camera className="size-4 text-primary" aria-hidden="true" />
                <span>Real kamera yoki galereyadan quti rasmi</span>
              </label>
              <input
                id={`dorimos-camera-${taskId}`}
                className={styles.field}
                type="file"
                accept="image/png,image/jpeg,image/*"
                capture="environment"
                disabled={pending || saved}
                onChange={(event) => void handlePhotoUpload(event)}
              />
              {photoPreviewUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img alt="Yuklangan dori qutisi" src={photoPreviewUrl} className={styles.boxImage} />
              )}
            </div>
            {isDemo && (
              <form
                className={styles.fields}
                onSubmit={(event) => {
                  event.preventDefault();
                  void send({ action: 'scan', taskId, sampleId });
                }}
              >
                <label htmlFor={`dorimos-${taskId}`} className="text-sm font-semibold">
                  Namuna rasmi
                </label>
                <NativeSelect
                  id={`dorimos-${taskId}`}
                  value={sampleId}
                  disabled={pending || saved}
                  onChange={(event) => {
                    const option = options.find(({ id }) => id === event.target.value);
                    if (!option) return;
                    setSampleId(option.id);
                    setConfirmation(null);
                    setMessage('');
                  }}
                >
                  {options.map(({ id, label }) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
                <Image
                  alt={`Demo qutisi · ${sample.label}`}
                  src={sample.imagePath}
                  width={800}
                  height={500}
                  sizes="(max-width: 540px) 90vw, 480px"
                  className={styles.boxImage}
                  unoptimized
                />
                <Button type="submit" size="lg" className="w-full" disabled={pending || saved}>
                  {pending ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : <ScanLine data-icon="inline-start" aria-hidden="true" />}
                  <span>Rasmni o‘qish</span>
                </Button>
              </form>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Rejada qutining kuchi ko‘rsatilmagan. Qutini qo‘lda qayd etishingiz mumkin.
          </p>
        )}

        <p role="status" className="text-sm font-medium text-foreground">
          {message}
        </p>

        {confirmation && !saved && (
          <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-accent/40 p-3">
            <Button
              type="button"
              size="lg"
              disabled={pending}
              onClick={() => void send({ action: 'confirm', taskId, token: confirmation.token })}
            >
              <Check data-icon="inline-start" aria-hidden="true" />
              <span>Qutidagi yozuvni tasdiqlash</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setConfirmation(null);
                setMessage('Yozuv tasdiqlanmadi. Boshqa rasm oling yoki qo‘lda qayd eting.');
              }}
            >
              <X data-icon="inline-start" aria-hidden="true" />
              <span>Yozuvni rad etish</span>
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!deferred && (
            <button
              type="button"
              className="text-action"
              disabled={pending || saved}
              onClick={() => void send({ action: 'defer', taskId })}
            >
              <Clock className="size-3.5" aria-hidden="true" />
              <span>Keyinroq</span>
            </button>
          )}
          <button
            type="button"
            className="text-action"
            disabled={pending || saved}
            onClick={() => void send({ action: 'manual', taskId })}
          >
            Tekshirilmaganini qo‘lda qayd etish · L0
          </button>
        </div>
      </div>
    </details>
  );
}
