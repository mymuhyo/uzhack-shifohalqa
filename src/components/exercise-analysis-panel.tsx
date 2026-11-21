'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { exerciseAnalysis, type ExerciseAnalysis, type ExerciseProvider } from '@/lib/exercise-analysis';
import type { MeasuredCycle } from '@/lib/pose/engine';
import styles from './exercise-client.module.css';

const viewLabels = {
  side_visible: 'Yon tomondagi tayanch nuqtalar ko‘rindi.',
  partly_visible: 'Tayanch nuqtalarning bir qismi to‘sildi.',
  unclear: 'Klipdan harakatni ishonchli ajratib bo‘lmadi.',
};

export function ExerciseAnalysisPanel({ provider, poseCycles }: { provider: ExerciseProvider; poseCycles?: MeasuredCycle[] }) {
  const name = provider === 'gemini' ? 'Gemini' : 'OpenRouter';
  const headingId = useId();
  const [report, setReport] = useState<ExerciseAnalysis | null>(null);
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function review() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setReport(null);
    try {
      const response = await fetch('/api/demo/exercise-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
        signal: controller.signal,
      });
      const parsed = exerciseAnalysis.safeParse(await response.json());
      if (!controller.signal.aborted) setReport(parsed.success ? parsed.data : { status: 'unavailable' });
    } catch {
      if (!controller.signal.aborted) setReport({ status: 'unavailable' });
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <section className={styles.aiPanel} aria-labelledby={headingId}>
      <h2 id={headingId}>{name} kuzatuvi</h2>
      <p>{provider === 'gemini' ? 'Gemini ommaviy CDC klipini mustaqil ko‘radi.' : 'OpenRouter CDC klipining yuzlar va ovoz olib tashlangan nusxasini ko‘radi.'}</p>
      {report?.status !== 'observed' && (
        <button type="button" className={styles.primary} onClick={review} disabled={pending}>Namunani {name} bilan tahlil qilish</button>
      )}
      {pending && <p role="status">{name} klipni ko‘rib chiqmoqda…</p>}
      {report?.status === 'unavailable' && <p role="status">{name} tahlili hozir mavjud emas. MediaPipe o‘lchovlari yuqorida.</p>}
      {report?.status === 'observed' && (
        <div className={styles.analysisResult} role="status">
          <p>{viewLabels[report.observation.view]}</p>
          {report.observation.view !== 'unclear' && (
            <>
              <p className={styles.counter}>
                {poseCycles && `MediaPipe: ${poseCycles.length} sikl · `}{name}: {report.observation.seatedAtSeconds.length} sikl
              </p>
              {report.observation.seatedAtSeconds.length > 0 && (
                <p>{name} bo‘yicha o‘tirish vaqtlari, taxminan {report.observation.seatedAtSeconds.map(time => time.toLocaleString('uz-Latn-UZ', { maximumFractionDigits: 1 })).join(' s · ')} s.</p>
              )}
              {poseCycles && <p>
                {poseCycles.length === report.observation.seatedAtSeconds.length ? 'Sikllar soni mos keldi.' : 'Sikllar soni farq qildi.'}
                {poseCycles.length > 0 && ` MediaPipe topgan ${poseCycles.length} sikldan ${poseCycles.filter(({ fromMs, toMs }) =>
                  report.observation.seatedAtSeconds.some(time => time * 1000 >= fromMs && time * 1000 <= toMs),
                ).length} tasining vaqt oralig‘iga ${name} belgilagan o‘tirish vaqti tushdi.`}
              </p>}
            </>
          )}
          <p className={styles.modelName}>{report.model} · Ommaviy namuna</p>
        </div>
      )}
    </section>
  );
}
