'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Film, Loader2, Upload, X } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useClinicalClient } from '@/lib/clinical-client-fetch';

const MAX_VIDEO_DURATION_SEC = 60;
const MAX_VIDEO_SIZE_BYTES = 20 * 1024 * 1024;

function normalizeVideoMimeType(raw: string): string {
  return raw.split(';')[0]?.trim().toLowerCase() ?? '';
}

type UploadState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'uploading'; percent: number }
  | { status: 'finalizing' }
  | { status: 'uploaded'; expiresAt: string }
  | { status: 'error'; message: string };

const shortDate = new Intl.DateTimeFormat('uz-Latn-UZ', {
  dateStyle: 'medium',
  timeZone: 'Asia/Tashkent',
});

function uploadViaXhr(
  url: string,
  blob: Blob,
  mimeType: string,
  onProgress: (percent: number) => void,
): { promise: Promise<void>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<void>((resolve, reject) => {
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.onabort = () => reject(new Error('Aborted'));
    xhr.send(blob);
  });
  return { promise, abort: () => xhr.abort() };
}

export function ExerciseVideoUpload({
  attemptId,
  videoBlob,
  durationSec,
}: {
  attemptId: string;
  videoBlob: Blob;
  durationSec: number;
}) {
  const client = useClinicalClient();
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<UploadState>({ status: 'idle' });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const busy =
      state.status === 'requesting' ||
      state.status === 'uploading' ||
      state.status === 'finalizing';
    client.setUploadBusy(busy);
    return () => {
      client.setUploadBusy(false);
    };
  }, [client, state.status]);

  const normalizedMime = normalizeVideoMimeType(videoBlob.type || 'video/webm');
  const validMime = normalizedMime === 'video/mp4' || normalizedMime === 'video/webm';
  const roundedDuration = Math.max(1, Math.round(durationSec || 1));
  const withinLimits =
    validMime &&
    videoBlob.size >= 1 &&
    videoBlob.size <= MAX_VIDEO_SIZE_BYTES &&
    roundedDuration <= MAX_VIDEO_DURATION_SEC;

  useEffect(() => {
    const videoEl = videoRef.current;
    const url = URL.createObjectURL(videoBlob);
    if (videoEl) {
      videoEl.src = url;
    }
    return () => {
      abortRef.current?.();
      if (videoEl) {
        videoEl.removeAttribute('src');
        videoEl.load();
      }
      URL.revokeObjectURL(url);
    };
  }, [videoBlob]);

  async function startUpload() {
    if (!withinLimits || !consent) return;
    if (state.status === 'requesting' || state.status === 'uploading' || state.status === 'finalizing') {
      return;
    }

    setState({ status: 'requesting' });
    try {
      const reqRes = await client.fetchJson('/api/clinical/exercise/video-upload', {
        method: 'POST',
        body: JSON.stringify({
          action: 'request',
          attemptId,
          consent: true,
          durationSec: roundedDuration,
          sizeBytes: videoBlob.size,
          mimeType: normalizedMime,
        }),
      });
      if (!reqRes.ok) {
        client.hapticNotify('error');
        const errBody = (await reqRes.json().catch(() => ({}))) as { error?: string };
        setState({
          status: 'error',
          message:
            errBody.error === 'quota_exceeded'
              ? 'Kunlik video yuklash limiti tugagan.'
              : 'Yuklash ruxsatini olib bo‘lmadi. Qayta urinib ko‘ring.',
        });
        return;
      }

      const reqData = (await reqRes.json()) as { signedUrl: string; path: string; mimeType: string };
      setState({ status: 'uploading', percent: 5 });

      const task = uploadViaXhr(reqData.signedUrl, videoBlob, reqData.mimeType, (percent) => {
        setState({ status: 'uploading', percent });
      });
      abortRef.current = task.abort;
      await task.promise;
      abortRef.current = null;

      setState({ status: 'finalizing' });
      const finRes = await client.fetchJson('/api/clinical/exercise/video-upload', {
        method: 'POST',
        body: JSON.stringify({
          action: 'finalize',
          attemptId,
          consent: true,
          durationSec: roundedDuration,
          sizeBytes: videoBlob.size,
          mimeType: reqData.mimeType,
          path: reqData.path,
        }),
      });
      if (!finRes.ok) {
        client.hapticNotify('error');
        setState({ status: 'error', message: 'Video yuklandi, lekin yakunlab bo‘lmadi. Qayta urinib ko‘ring.' });
        return;
      }
      const finData = (await finRes.json()) as { expiresAt: string };
      client.hapticNotify('success');
      setState({ status: 'uploaded', expiresAt: finData.expiresAt });
      client.refresh();
    } catch (error) {
      abortRef.current = null;
      if (error instanceof Error && error.message === 'Aborted') {
        setState({ status: 'error', message: 'Yuklash bekor qilindi.' });
      } else {
        setState({
          status: 'error',
          message: 'Internet aloqasi yoki yuklashda xatolik. O‘lchov natijangiz saqlangan — videoni qayta yuborishingiz mumkin.',
        });
      }
    }
  }

  function cancelUpload() {
    abortRef.current?.();
    abortRef.current = null;
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-[7.2px] border border-border bg-card p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Film className="size-4 text-primary" aria-hidden="true" />
          <span>To‘liq urinish videosini shifokorga ulashish (ixtiyoriy)</span>
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {(videoBlob.size / (1024 * 1024)).toFixed(1)} MB · {roundedDuration} s
        </span>
      </div>

      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        className="aspect-video w-full rounded-lg border border-border bg-black"
      />

      {!withinLimits ? (
        <p className="text-xs text-muted-foreground">
          Shifokorga yuklash uchun video MP4 yoki WebM formatida, ko‘pi bilan 60 soniya va 20 MiB bo‘lishi kerak. Raqamli CV natijangiz allaqachon saqlangan.
        </p>
      ) : state.status === 'uploaded' ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          className="flex items-center gap-2 rounded-lg border border-[var(--ok)]/30 bg-[var(--ok-bg)] px-3 py-2 text-sm font-semibold text-[var(--ok)]"
          role="status"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Yuborildi · Video shifokorga biriktirildi (saqlash muddati {shortDate.format(new Date(state.expiresAt))} gacha).
          </span>
        </motion.div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Video faqat sizning roziligingiz bilan shaxsiy saqlash omboriga yuboriladi va shifokor javobidan 7 kun (yoki yuklangandan 30 kun) o‘tgach muddati tugaydi.
          </p>

          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={consent}
              disabled={state.status === 'uploading' || state.status === 'requesting' || state.status === 'finalizing'}
              onChange={(e) => setConsent(e.currentTarget.checked)}
              className="size-5 accent-[var(--action)]"
            />
            <span>Shifokor ko‘rishi uchun videoni yuborishga roziman</span>
          </label>

          {state.status === 'uploading' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs font-semibold tabular-nums">
                <span>Yuklanmoqda…</span>
                <span>{state.percent}%</span>
              </div>
              <Progress value={state.percent} />
            </div>
          )}

          {state.status === 'error' && (
            <p role="alert" className="text-xs font-semibold text-[var(--urgent)]">
              {state.message}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="lg"
              disabled={!consent || state.status === 'requesting' || state.status === 'uploading' || state.status === 'finalizing'}
              onClick={() => void startUpload()}
            >
              {state.status === 'requesting' || state.status === 'uploading' || state.status === 'finalizing' ? (
                <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" />
              ) : (
                <Upload data-icon="inline-start" aria-hidden="true" />
              )}
              <span>
                {state.status === 'finalizing'
                  ? 'Tasdiqlanmoqda…'
                  : state.status === 'uploading'
                    ? 'Yuklanmoqda…'
                    : 'Shu urinish videosini shifokorga yuborish'}
              </span>
            </Button>

            {state.status === 'uploading' && (
              <Button type="button" variant="outline" size="lg" onClick={cancelUpload}>
                <X data-icon="inline-start" aria-hidden="true" />
                <span>Bekor qilish</span>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
