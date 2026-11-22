'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { fallbackAiProviderNames } from '@/lib/ai-provider';
import { exerciseAnalysis, type ExerciseAnalysis, type ExerciseProvider } from '@/lib/exercise-analysis';
import {
  compareExerciseObservations, exerciseExplanation, type ExerciseComparison, type ExerciseExplanation,
} from '@/lib/exercise-explanation';
import type { MeasuredCycle } from '@/lib/pose/engine';
import styles from './exercise-client.module.css';

const viewLabels = {
  side_visible: 'Yon tomondagi tayanch nuqtalar ko‘rindi.',
  partly_visible: 'Tayanch nuqtalarning bir qismi to‘sildi.',
  unclear: 'Klipdan harakatni ishonchli ajratib bo‘lmadi.',
};

function SampleExplanation({ comparison, name }: { comparison: ExerciseComparison; name: string }) {
  const [result, setResult] = useState<ExerciseExplanation | null>(null);
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function explain() {
    if (request.current || result?.status === 'explained') return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setResult(null);
    try {
      const response = await fetch('/api/demo/exercise-explanation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comparison }),
        signal: controller.signal,
      });
      const parsed = exerciseExplanation.safeParse(await response.json());
      if (!controller.signal.aborted) setResult(parsed.success ? parsed.data : { status: 'unavailable' });
    } catch {
      if (!controller.signal.aborted) setResult({ status: 'unavailable' });
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <div className={styles.analysisResult}>
      <button type="button" className={styles.primary} onClick={explain} aria-disabled={pending || result?.status === 'explained'}>
        {pending ? `${name} izoh tayyorlamoqda…` : `Natijani ${name} bilan izohlash`}
      </button>
      <div role="status">
        {result?.status === 'unavailable' && <p>{name} izohi hozir mavjud emas. Keyinroq qayta urinib ko‘ring.</p>}
        {result?.status === 'explained' && <>
          <p>{result.summary}</p>
          <p className={styles.modelName}>{result.provider && `${fallbackAiProviderNames[result.provider]} · `}{result.model} · Namuna izohi</p>
        </>}
      </div>
    </div>
  );
}

export function ExerciseAnalysisPanel({ provider, poseCycles }: {
  provider: Exclude<ExerciseProvider, 'gemini'>;
  poseCycles?: MeasuredCycle[];
}) {
  const name = { auto: 'AI', opencode: 'OpenCode Console', openrouter: 'OpenRouter' }[provider];
  const headingId = useId();
  const [report, setReport] = useState<ExerciseAnalysis | null>(null);
  const [pending, setPending] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  const comparison = poseCycles && compareExerciseObservations(
    poseCycles, report?.status === 'observed' ? report.observation : undefined,
  );
  const observationName = report?.status === 'observed' && report.provider
    ? fallbackAiProviderNames[report.provider] : name;

  async function review() {
    if (request.current || report?.status === 'observed') return;
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
      <p>{name} ommaviy CDC klipining tahrirlangan nusxasini{provider !== 'opencode' && ' yoki undan olingan kadrlarni'} kuzatadi.</p>
      <button type="button" className={styles.primary} onClick={review} aria-disabled={pending || report?.status === 'observed'}>
        {pending ? `${name} tahlil qilmoqda…` : report?.status === 'observed' ? 'Namuna tahlil qilindi' : `Namunani ${name} bilan tahlil qilish`}
      </button>
      {report?.status === 'unavailable' && <p role="status">{name} tahlili hozir mavjud emas. MediaPipe o‘lchovlari yuqorida.</p>}
      {report?.status === 'observed' && (
        <div className={styles.analysisResult} role="status">
          <p>{viewLabels[report.observation.view]}</p>
          {report.observation.view !== 'unclear' && (
            <>
              <p className={styles.counter}>
                {poseCycles && `MediaPipe: ${poseCycles.length} sikl · `}{observationName}: {report.observation.seatedAtSeconds.length} sikl
              </p>
              {report.observation.seatedAtSeconds.length > 0 && (
                <p>{observationName} bo‘yicha o‘tirish vaqtlari, taxminan {report.observation.seatedAtSeconds.map(time => time.toLocaleString('uz-Latn-UZ', { maximumFractionDigits: 1 })).join(' s · ')} s.</p>
              )}
              {poseCycles && comparison && <p>
                {poseCycles.length === report.observation.seatedAtSeconds.length ? 'Sikllar soni mos keldi.' : 'Sikllar soni farq qildi.'}
                {poseCycles.length > 0 && ` MediaPipe topgan ${poseCycles.length} sikldan ${comparison.alignedCycles} tasining vaqt oralig‘iga ${observationName} belgilagan o‘tirish vaqti tushdi.`}
              </p>}
            </>
          )}
          <p className={styles.modelName}>{report.provider && `${observationName} · `}{report.model} · {report.input === 'frames' ? 'Ommaviy namunadan 9 kadr' : 'Ommaviy namuna videosi'}</p>
        </div>
      )}
      {comparison && (
        <SampleExplanation key={comparison.comparison} comparison={comparison.comparison} name={provider === 'openrouter' ? 'Baidu' : name} />
      )}
    </section>
  );
}
