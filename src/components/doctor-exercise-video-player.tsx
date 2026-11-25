'use client';

import { useRef, useState } from 'react';
import { AlertCircle, Clock, Film, Loader2, Play, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ExerciseFlaggedSegment } from '@/lib/exercise-video-store';

type PlaybackData = {
  status: 'active';
  playbackUrl: string;
  durationSec: number | null;
  expiresAt: string;
  flaggedSegments: ExerciseFlaggedSegment[];
};

const shortTime = new Intl.DateTimeFormat('uz-Latn-UZ', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tashkent',
});

function formatMs(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`;
}

export function DoctorExerciseVideoPlayer({
  attemptId,
  hasVideo,
  videoDurationSec,
  videoExpiresAt,
  videoExpired,
}: {
  attemptId: string;
  hasVideo: boolean;
  videoDurationSec: number | null;
  videoExpiresAt: string | null;
  videoExpired: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loading, setLoading] = useState(false);
  const [playback, setPlayback] = useState<PlaybackData | null>(null);
  const [expired, setExpired] = useState(videoExpired);
  const [error, setError] = useState('');
  const [activeSegId, setActiveSegId] = useState<string | null>(null);

  if (!hasVideo) return null;

  if (expired) {
    return (
      <div className="mt-3 rounded-[7.2px] border border-border bg-secondary/50 p-3 text-sm">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
          <span>Video saqlash muddati tugagan</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Maxfiylik siyosatiga ko‘ra video o‘chirilgan, ammo barcha CV o‘lchovlari va shifokor javobi saqlanib qolgan.
        </p>
      </div>
    );
  }

  async function loadVideo() {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/clinical/exercise/${attemptId}/video`);
      if (response.status === 410) {
        setExpired(true);
        return;
      }
      if (!response.ok) {
        setError('Videoni yuklab bo‘lmadi. Qayta urinib ko‘ring.');
        return;
      }
      const data = (await response.json()) as PlaybackData;
      setPlayback(data);
    } catch {
      setError('Aloqa xatosi. Qayta urinib ko‘ring.');
    } finally {
      setLoading(false);
    }
  }

  function seekToSegment(seg: ExerciseFlaggedSegment) {
    setActiveSegId(seg.id);
    if (!videoRef.current) return;
    videoRef.current.currentTime = seg.fromMs / 1000;
    void videoRef.current.play().catch(() => undefined);
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-[7.2px] border border-border bg-background/70 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Film className="size-4 text-primary" aria-hidden="true" />
            <span>Bemor ruxsat bergan to‘liq video</span>
          </span>
          {videoDurationSec !== null && (
            <Badge variant="secondary" className="tabular-nums">
              {videoDurationSec} s
            </Badge>
          )}
        </div>
        {!playback && (
          <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void loadVideo()}>
            {loading ? <Loader2 className="animate-spin" data-icon="inline-start" aria-hidden="true" /> : <Play data-icon="inline-start" aria-hidden="true" />}
            <span>{loading ? 'Yuklanmoqda…' : 'To‘liq videoni ko‘rish'}</span>
          </Button>
        )}
      </div>

      {videoExpiresAt && (
        <p className="text-xs text-muted-foreground">
          Saqlash muddati: {shortTime.format(new Date(videoExpiresAt))} gacha
        </p>
      )}

      {error && (
        <p role="alert" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--urgent)]">
          <AlertCircle className="size-3.5" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {playback && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="overflow-hidden rounded-[7.2px] border border-white/10 bg-[#090a0d]">
            <video
              ref={videoRef}
              src={playback.playbackUrl}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Belgilangan sikl markerlari ({playback.flaggedSegments.length})
            </span>
            {playback.flaggedSegments.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Bu videoga alohida muammoli sikl markeri biriktirilmagan.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {playback.flaggedSegments.map((seg) => {
                  const isActive = activeSegId === seg.id;
                  const aiObs = seg.aiReview && typeof seg.aiReview.uncertaintyNoteUz === 'string'
                    ? seg.aiReview.uncertaintyNoteUz
                    : null;
                  return (
                    <button
                      key={seg.id}
                      type="button"
                      onClick={() => seekToSegment(seg)}
                      className={`flex flex-col gap-1 rounded-lg border p-2.5 text-left text-xs transition-colors ${
                        isActive
                          ? 'border-primary bg-accent/60'
                          : 'border-border bg-card hover:bg-secondary'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="font-semibold text-foreground tabular-nums">
                          {seg.cycleIndex + 1}-takror · {formatMs(seg.fromMs)}–{formatMs(seg.toMs)}
                        </span>
                        <Badge variant={seg.severity === 'red' ? 'urgent' : seg.severity === 'yellow' ? 'warn' : 'ok'}>
                          {seg.peakAngleDeg !== null ? `${Math.round(seg.peakAngleDeg)}°` : seg.severity}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">{seg.summaryUz}</p>
                      {aiObs && (
                        <p className="inline-flex items-start gap-1 text-[11px] text-muted-foreground">
                          <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" aria-hidden="true" />
                          <span>{aiObs}</span>
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
