'use client';

import { useEffect, useRef, useState } from 'react';
import { exerciseAnalysis, type ExerciseAnalysis } from '@/lib/exercise-analysis';
import styles from './exercise-client.module.css';

const viewLabels = {
  side_visible: 'Yon tomondagi tayanch nuqtalar ko‘rindi.',
  partly_visible: 'Tayanch nuqtalarning bir qismi to‘sildi.',
  unclear: 'Klipdan harakatni ishonchli ajratib bo‘lmadi.',
};

export function ExerciseAnalysisPanel({ poseCycles }: { poseCycles: number }) {
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
        body: '{}',
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
    <section className={styles.aiPanel} aria-labelledby="gemini-observation">
      <h2 id="gemini-observation">Gemini kuzatuvi</h2>
      <p>Gemini faqat shu ommaviy CDC klipidagi harakatni mustaqil ko‘radi.</p>
      {report?.status !== 'observed' && (
        <button type="button" className={styles.primary} onClick={review} disabled={pending}>Namunani Gemini bilan tahlil qilish</button>
      )}
      {pending && <p role="status">Gemini klipni ko‘rib chiqmoqda…</p>}
      {report?.status === 'unavailable' && <p role="status">Gemini tahlili hozir mavjud emas. MediaPipe o‘lchovlari yuqorida.</p>}
      {report?.status === 'observed' && (
        <div className={styles.analysisResult} role="status">
          <p>{viewLabels[report.observation.view]}</p>
          {report.observation.view !== 'unclear' && (
            <>
              <p className={styles.counter}>MediaPipe: {poseCycles} sikl · Gemini: {report.observation.seatedAtSeconds.length} sikl</p>
              {report.observation.seatedAtSeconds.length > 0 && (
                <p>Gemini bo‘yicha o‘tirish vaqtlari, taxminan {report.observation.seatedAtSeconds.map(time => time.toLocaleString('uz-Latn-UZ', { maximumFractionDigits: 1 })).join(' s · ')} s.</p>
              )}
              <p>{poseCycles === report.observation.seatedAtSeconds.length ? 'Sikllar soni mos keldi.' : 'Sikllar soni farq qildi. Kadrlarni qayta ko‘rib chiqing.'}</p>
            </>
          )}
          <p className={styles.modelName}>{report.model} · Ommaviy namuna</p>
        </div>
      )}
    </section>
  );
}
