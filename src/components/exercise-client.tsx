'use client';

import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { ExerciseInput } from '@/lib/exercise-inputs';
import { exerciseSample } from '@/lib/exercise-sample';
import { createPoseTracker } from '@/lib/pose/engine';
import styles from './exercise-client.module.css';

type Source = 'live_camera' | 'uploaded_video';
type Framing = 'positioning' | 'tracking' | 'lost';
type Tracker = ReturnType<typeof createPoseTracker>;
type Measurement = ReturnType<Tracker['result']>;

type Capture = {
  source: Source;
  video: HTMLVideoElement;
  tracker: Tracker;
  landmarker?: PoseLandmarker;
  stream?: MediaStream;
  objectUrl?: string;
  fileSha256: string | null;
  cancelFrame?: () => void;
  removeListeners?: () => void;
};

type Screen =
  | { phase: 'idle' }
  | { phase: 'starting' | 'retake'; message: string }
  | { phase: 'running'; source: Source; framing: Framing | null; validReps: number; shallowReps: number }
  | { phase: 'result'; source: Source; measurement: Measurement; fileSha256: string | null };

type Report = 'measurement' | 'manual' | 'pain';
type SaveStatus = { state: 'saving' | 'saved' | 'error'; report: Report; message: string };

const maxVideoBytes = 50_000_000;
const minimumFrameIntervalMs = 80;
const framingLostDelayMs = 600;
const longestFrameSide = 640;
const sourceLabel: Record<Source, string> = {
  live_camera: 'Jonli kamera',
  uploaded_video: 'Yuklangan video',
};
const framingMessage: Record<Framing, string> = {
  positioning: 'Tayyorlaning. Kameraga yon tomoningizni tuting. Son, tizza va to‘piq kadrga sig‘sin.',
  tracking: 'Tayanch nuqtalar ko‘rinyapti. Tik turgan holatdan boshlang.',
  lost: 'Tayanch nuqtalar yo‘qoldi. Kadrga qaytib, yon tomoningiz bilan tik turing.',
};

function stopTracks(stream?: MediaStream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function releaseCapture(capture: Capture | null) {
  if (!capture) return;
  const { video, objectUrl } = capture;
  capture.cancelFrame?.();
  capture.removeListeners?.();
  stopTracks(capture.stream);
  video.pause();
  video.srcObject = null;
  if (objectUrl) {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
  capture.landmarker?.close();
}

async function loadLandmarker() {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const files = await FilesetResolver.forVisionTasks('/models/wasm');
  return PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: '/models/pose_landmarker_lite.task', delegate: 'CPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

async function sha256(file: Blob): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function nextVideoFrame(video: HTMLVideoElement, process: (timeSeconds: number) => void): () => void {
  if (typeof video.requestVideoFrameCallback === 'function') {
    const id = video.requestVideoFrameCallback((_, metadata) => process(metadata.mediaTime));
    return () => video.cancelVideoFrameCallback(id);
  }
  const id = requestAnimationFrame(() => process(video.currentTime));
  return () => cancelAnimationFrame(id);
}

function saveMessage(body: unknown, ok: boolean, report: Report): SaveStatus {
  if (typeof body === 'object' && body !== null && 'status' in body) {
    if (ok && (body.status === 'saved' || body.status === 'already_saved') && 'level' in body && (
      body.level === 0 || body.level === 2 || body.level === 3
    )) {
      const sample = 'sample' in body && body.sample === true;
      const saved = sample ? 'Namuna qaydi saqlandi' : report === 'pain' ? 'Og‘riq xabari saqlandi' : 'Mashq qaydi saqlandi';
      const label = body.status === 'already_saved' ? 'Qayd avval saqlangan' : saved;
      const retry = !sample && 'primary' in body && body.primary === false && report !== 'pain' ? ' · Qayta urinish' : '';
      const similar = 'similarMotion' in body && body.similarMotion === true ? ' · O‘xshash harakat tekshiriladi' : '';
      return { state: 'saved', report, message: `${label} · L${body.level}${retry}${similar}.` };
    }
    if (body.status === 'duplicate') {
      return { state: 'error', report, message: 'Bu video oldin qayd etilgan. Boshqa video tanlang.' };
    }
    if (body.status === 'retake') {
      return { state: 'error', report, message: 'O‘lchov yetarli emas. Qayta urinib ko‘ring yoki qo‘lda qayd eting.' };
    }
    if (body.status === 'invalid') {
      return { state: 'error', report, message: 'Qayd qabul qilinmadi. Sahifani yangilang va qayta urinib ko‘ring.' };
    }
  }
  return { state: 'error', report, message: 'Qayd saqlanganini tekshirib bo‘lmadi. Qayta urinib ko‘ring.' };
}

export function ExerciseClient({ targetAngle }: { targetAngle: number }) {
  const [screen, setScreen] = useState<Screen>({ phase: 'idle' });
  const [confirmed, setConfirmed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeCapture = useRef<Capture | null>(null);
  const request = useRef<{ controller: AbortController; report: Report } | null>(null);

  useEffect(() => () => {
    const capture = activeCapture.current;
    activeCapture.current = null;
    request.current?.controller.abort();
    request.current = null;
    releaseCapture(capture);
  }, []);

  function takeCapture() {
    const capture = activeCapture.current;
    activeCapture.current = null;
    releaseCapture(capture);
    return capture;
  }

  function fallback(capture: Capture, message: string) {
    if (activeCapture.current !== capture) return;
    takeCapture();
    setScreen({ phase: 'retake', message });
  }

  function finish(capture: Capture) {
    if (activeCapture.current !== capture) return;
    const { tracker, source, fileSha256 } = capture;
    const measurement = tracker.result();
    takeCapture();
    if (measurement.analyzedFrames < 5 || measurement.minAngle === null || measurement.confidence === null || measurement.confidence < 0.75) {
      setScreen({ phase: 'retake', message: 'Tayanch nuqtalar yetarli ko‘rinmadi. Qayta urinib ko‘ring yoki takrorlarni qo‘lda kiriting.' });
      return;
    }
    setScreen({ phase: 'result', source, measurement, fileSha256 });
  }

  function begin(source: Source, message: string): Capture | null {
    if (!videoRef.current || activeCapture.current || request.current) return null;
    const tracker = createPoseTracker({ targetAngle, liveCamera: source === 'live_camera' });
    const capture = { source, video: videoRef.current, tracker, fileSha256: null };
    activeCapture.current = capture;
    setConfirmed(false);
    setSaveStatus(null);
    setScreen({ phase: 'starting', message });
    return capture;
  }

  async function processCapture(capture: Capture) {
    const { video, source, tracker } = capture;
    const landmarker = await loadLandmarker();
    if (activeCapture.current !== capture) {
      landmarker.close();
      return;
    }
    capture.landmarker = landmarker;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Video frame canvas unavailable');

    const onEnded = () => finish(capture);
    const onError = () => fallback(capture, 'Video o‘qilmadi. Qayta urinib ko‘ring yoki takrorlarni qo‘lda kiriting.');
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    capture.removeListeners = () => {
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
    };

    await video.play();
    if (activeCapture.current !== capture) return;
    let framing: Framing | null = source === 'live_camera' ? 'positioning' : null;
    setScreen({ phase: 'running', source, framing, validReps: 0, shallowReps: 0 });

    let previousTimestamp = -Infinity;
    let lastTrackedTimestamp = -Infinity;
    function onFrame(timeSeconds: number) {
      if (activeCapture.current !== capture) return;
      const timestampMs = Math.round(timeSeconds * 1000);
      const { videoWidth, videoHeight } = video;
      if (context && videoWidth && videoHeight && timestampMs - previousTimestamp >= minimumFrameIntervalMs) {
        previousTimestamp = timestampMs;
        const scale = Math.min(1, longestFrameSide / Math.max(videoWidth, videoHeight));
        const width = Math.max(1, Math.round(videoWidth * scale));
        const height = Math.max(1, Math.round(videoHeight * scale));
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;

        try {
          context.drawImage(video, 0, 0, width, height);
          const { landmarks } = landmarker.detectForVideo(canvas, timestampMs);
          tracker.update(landmarks[0] ?? [], { width, height, timestampMs });
          if (framing !== null) {
            if (tracker.isTracking()) {
              framing = 'tracking';
              lastTrackedTimestamp = timestampMs;
            } else if (framing === 'tracking' && timestampMs - lastTrackedTimestamp >= framingLostDelayMs) {
              framing = 'lost';
            }
          }
          const { validReps, shallowReps } = tracker.result();
          const currentFraming = framing;
          setScreen((current) => current.phase === 'running' && (
            currentFraming !== current.framing || validReps !== current.validReps || shallowReps !== current.shallowReps
          ) ? { phase: 'running', source, framing: currentFraming, validReps, shallowReps } : current);
        } catch {
          fallback(capture, 'Kadrlarni tahlil qilib bo‘lmadi. Qayta urinib ko‘ring yoki takrorlarni qo‘lda kiriting.');
          return;
        }
      }
      capture.cancelFrame = nextVideoFrame(video, onFrame);
    }
    capture.cancelFrame = nextVideoFrame(video, onFrame);
  }

  async function startCamera() {
    const capture = begin('live_camera', 'Kamera ruxsati kutilmoqda…');
    if (!capture) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      fallback(capture, 'Bu brauzerda kamera ochilmadi. Video tanlang yoki takrorlarni qo‘lda kiriting.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (activeCapture.current !== capture) {
        stopTracks(stream);
        return;
      }
      capture.stream = stream;
      capture.video.srcObject = stream;
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', () => {
        fallback(capture, 'Kamera to‘xtadi. Qayta urinib ko‘ring yoki takrorlarni qo‘lda kiriting.');
      }, { once: true }));
      setScreen({ phase: 'starting', message: 'Mashq modeli yuklanmoqda…' });
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      fallback(capture, denied
        ? 'Kameraga ruxsat berilmadi. Video tanlang yoki takrorlarni qo‘lda kiriting.'
        : 'Kamera ochilmadi. Video tanlang yoki takrorlarni qo‘lda kiriting.');
      return;
    }

    try {
      await processCapture(capture);
    } catch {
      fallback(capture, 'Kamera tahlili ishga tushmadi. Qayta urinib ko‘ring yoki takrorlarni qo‘lda kiriting.');
    }
  }

  async function analyzeLocalVideo(capture: Capture, file: Blob) {
    if (activeCapture.current !== capture) return;
    capture.fileSha256 = await sha256(file);
    if (activeCapture.current !== capture) return;
    capture.objectUrl = URL.createObjectURL(file);
    capture.video.src = capture.objectUrl;
    await processCapture(capture);
  }

  async function selectVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (file.size === 0 || file.size > maxVideoBytes) {
      setSaveStatus(null);
      setScreen({ phase: 'retake', message: 'Hajmi 50 MB gacha bo‘lgan video tanlang.' });
      return;
    }

    const capture = begin('uploaded_video', 'Video tahlilga tayyorlanmoqda…');
    if (!capture) return;
    try {
      await analyzeLocalVideo(capture, file);
    } catch {
      fallback(capture, 'Videoni tahlil qilib bo‘lmadi. Boshqa video tanlang yoki takrorlarni qo‘lda kiriting.');
    }
  }

  async function playSample() {
    const capture = begin('uploaded_video', 'CDC namuna videosi tayyorlanmoqda…');
    if (!capture) return;
    try {
      const response = await fetch(exerciseSample.path);
      if (!response.ok) throw new Error('Demo video is unavailable');
      await analyzeLocalVideo(capture, await response.blob());
    } catch {
      fallback(capture, 'Namuna videosini ochib bo‘lmadi. Qurilmangizdan video tanlang.');
    }
  }

  async function submit(input: ExerciseInput, report: Report) {
    if (request.current && (report !== 'pain' || request.current.report === 'pain')) return;
    request.current?.controller.abort();
    const controller = new AbortController();
    request.current = { controller, report };
    setSaveStatus({ state: 'saving', report, message: 'Yuborilmoqda…' });
    try {
      const response = await fetch('/api/demo/exercise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (request.current?.controller === controller) setSaveStatus(saveMessage(body, response.ok, report));
    } catch {
      if (request.current?.controller === controller) setSaveStatus(saveMessage(null, false, report));
    } finally {
      if (request.current?.controller === controller) request.current = null;
    }
  }

  function saveMeasurement() {
    if (screen.phase !== 'result') return;
    const { source, measurement, fileSha256 } = screen;
    const metrics = { ...measurement, motionSignature: measurement.motionSignature && [...measurement.motionSignature] };
    if (source === 'live_camera') {
      void submit({ ...metrics, source, fileSha256: null, patientConfirmed: true }, 'measurement');
    } else if (confirmed && fileSha256) {
      void submit({ ...metrics, source, fileSha256, patientConfirmed: true }, 'measurement');
    }
  }

  function reportPain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    takeCapture();
    setScreen({ phase: 'idle' });
    void submit({ source: 'self_report', reason: 'pain' }, 'pain');
  }

  function saveManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('reps');
    if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) return;
    void submit({ source: 'self_report', reason: 'manual', reps: Number(value) }, 'manual');
  }

  const capturing = screen.phase === 'starting' || screen.phase === 'running';
  const saving = saveStatus?.state === 'saving';
  return (
    <div className={styles.exercise}>
      <p>Kadrda son, tizza va to‘piq bir tomondan ko‘rinsin. Video qurilmangizda qoladi.</p>
      <div className={styles.actions}>
        {!capturing ? (
          <button className={styles.primary} type="button" disabled={saving} onClick={startCamera}>Kamerani boshlash</button>
        ) : (
          <button className={styles.primary} type="button" onClick={() => {
            if (screen.phase === 'running' && activeCapture.current) finish(activeCapture.current);
            else {
              takeCapture();
              setScreen({ phase: 'idle' });
            }
          }}>To‘xtatish</button>
        )}
        <form onSubmit={reportPain} aria-label="Og‘riq haqida xabar">
          <button className={styles.pain} type="submit" disabled={saving && saveStatus.report === 'pain'}>Og‘riq bor</button>
        </form>
      </div>
      {screen.phase === 'starting' && <p role="status">{screen.message}</p>}
      {screen.phase === 'retake' && <p className={styles.notice} role="status">{screen.message}</p>}
      {screen.phase === 'running' && (
        <div>
          {screen.framing && <p role="status">{framingMessage[screen.framing]}</p>}
          <output className={styles.counter}>{sourceLabel[screen.source]} · To‘liq {screen.validReps} · Chala {screen.shallowReps}</output>
        </div>
      )}
      <video ref={videoRef} className={styles.video} width={640} height={480} muted playsInline preload="none" hidden={!capturing} aria-label="Mashq videosi" />
      <label className={styles.file} htmlFor="exercise-video">
        Video tanlash (50 MB gacha)
        <input id="exercise-video" type="file" accept="video/*" disabled={capturing || saving} onChange={selectVideo} />
      </label>
      <div>
        <button className={styles.primary} type="button" disabled={capturing || saving} onClick={playSample}>CDC namunasini sinash</button>
        <p>Namuna bemorning kunlik asosiy urinishiga kirmaydi. <a href={exerciseSample.source}>Video manbasi</a></p>
      </div>
      {screen.phase === 'result' && (
        <div className={styles.result}>
          {screen.fileSha256 === exerciseSample.sha256 && <p>CDC namuna videosi</p>}
          <p className={styles.counter}>{sourceLabel[screen.source]} · To‘liq {screen.measurement.validReps} · Chala {screen.measurement.shallowReps}</p>
          <p>Eng kichik burchak {Math.round(screen.measurement.minAngle ?? 0)}° · O‘lchov ishonchi {Math.round((screen.measurement.confidence ?? 0) * 100)}%</p>
          {screen.source === 'uploaded_video' && (
            <label className={styles.confirm}>
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} />
              Videodagi mashq natijasini tasdiqlayman
            </label>
          )}
          <button className={styles.primary} type="button" onClick={saveMeasurement} disabled={
            saving || (saveStatus?.state === 'saved' && saveStatus.report === 'measurement') || (screen.source === 'uploaded_video' && !confirmed)
          }>Natijani yuborish</button>
        </div>
      )}
      {saveStatus && <p className={styles.notice} role="status">{saveStatus.message}</p>}
      <details className={styles.manual} open={screen.phase === 'retake' || undefined}>
        <summary id="exercise-manual-heading">Takrorni qo‘lda kiritish</summary>
        <form onSubmit={saveManual} className={styles.manualForm} aria-labelledby="exercise-manual-heading">
          <label htmlFor="exercise-reps">Takrorlar soni</label>
          <input id="exercise-reps" name="reps" type="number" inputMode="numeric" min={0} max={999} step={1} required />
          <button className={styles.primary} type="submit" disabled={capturing || saving}>Qo‘lda qayd yuborish</button>
        </form>
      </details>
    </div>
  );
}
