'use client';

import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type { ExerciseProvider } from '@/lib/exercise-analysis';
import type { ExerciseInput } from '@/lib/exercise-inputs';
import { elbowSample, exerciseSample } from '@/lib/exercise-sample';
import { createPoseTracker, type MeasuredCycle, type PoseMovement } from '@/lib/pose/engine';
import { drawPoseOverlay } from '@/lib/pose/overlay';
import { sampleRecordedFrames } from '@/lib/pose/recorded-frames';
import { ExerciseAnalysisPanel } from './exercise-analysis-panel';
import styles from './exercise-client.module.css';

type Source = 'live_camera' | 'uploaded_video';
type Framing = 'positioning' | 'waitingForStart' | 'ready' | 'lost';
type Tracker = ReturnType<typeof createPoseTracker>;
type Measurement = ReturnType<Tracker['result']>;

type Capture = {
  source: Source;
  video: HTMLVideoElement;
  tracker: Tracker;
  controller: AbortController;
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
  | { phase: 'running'; source: Source; framing: Framing | null; currentAngle: number | null; validReps: number; shallowReps: number }
  | { phase: 'result'; source: Source; measurement: Measurement; cycles: MeasuredCycle[]; feedback: ReturnType<Tracker['feedback']>; fileSha256: string | null };

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
const movementCopy = {
  chair_stand: { joint: 'Tizza', points: 'Son, tizza va to‘piq', start: 'tik turing', cycle: 'O‘tirib yana tik turing.' },
  elbow_bend: { joint: 'Tirsak', points: 'Yelka, tirsak va bilak', start: 'qo‘lingizni yozing', cycle: 'Tirsakni bukib, qo‘lingizni yana yozing.' },
};

function stopTracks(stream?: MediaStream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function releaseCapture(capture: Capture | null) {
  if (!capture) return;
  const { video, objectUrl } = capture;
  capture.controller.abort();
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

const seconds = new Intl.NumberFormat('uz-Latn-UZ', { maximumFractionDigits: 1 });

export function ExerciseClient({ targetAngle, preview = false, analysisProviders = [], movement = 'chair_stand' }: {
  targetAngle: number;
  preview?: boolean;
  analysisProviders?: readonly ExerciseProvider[];
  movement?: PoseMovement;
}) {
  const copy = movementCopy[movement];
  const example = movement === 'elbow_bend' ? elbowSample : exerciseSample;
  const framingMessage: Record<Framing, string> = {
    positioning: `Kameraga yon tomoningizni tuting. ${copy.points} kadrga sig‘sin.`,
    waitingForStart: `Tayanch nuqtalar ko‘rinyapti. Sanoqni boshlash uchun ${copy.start}.`,
    ready: `Sanoq tayyor. ${copy.cycle}`,
    lost: `Tayanch nuqtalar yo‘qoldi. Kadrga qaytib, ${copy.start}.`,
  };
  const [screen, setScreen] = useState<Screen>({ phase: 'idle' });
  const [confirmed, setConfirmed] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus | null>(null);
  const [reviewingSample, setReviewingSample] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const activeCapture = useRef<Capture | null>(null);
  const request = useRef<{ controller: AbortController; report: Report } | null>(null);
  const videoAlternative = preview ? 'Namuna yoki video tanlang.' : 'Video tanlang yoki takrorlarni qo‘lda kiriting.';

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
    const overlay = overlayRef.current;
    if (overlay) overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
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
      setScreen({ phase: 'retake', message: preview
        ? 'Tayanch nuqtalar yetarli ko‘rinmadi. Kadrni to‘g‘rilab qayta urinib ko‘ring.'
        : 'Tayanch nuqtalar yetarli ko‘rinmadi. Qayta urinib ko‘ring yoki takrorlarni qo‘lda kiriting.' });
      return;
    }
    setScreen({ phase: 'result', source, measurement, cycles: tracker.cycles(), feedback: tracker.feedback(), fileSha256 });
  }

  function begin(source: Source, message: string): Capture | null {
    if (!videoRef.current || activeCapture.current || request.current) return null;
    const tracker = createPoseTracker({ targetAngle, movement, liveCamera: source === 'live_camera' });
    const capture = { source, video: videoRef.current, tracker, controller: new AbortController(), fileSha256: null };
    activeCapture.current = capture;
    setConfirmed(false);
    setSaveStatus(null);
    setReviewingSample(false);
    setScreen({ phase: 'starting', message });
    return capture;
  }

  async function processCapture(capture: Capture, file?: Blob) {
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

    let framing: Framing | null = source === 'live_camera' ? 'positioning' : null;
    let lastTrackedTimestamp = -Infinity;
    const analyze = (timestampMs: number, frameWidth: number, frameHeight: number, draw: (width: number, height: number) => void) => {
      if (!frameWidth || !frameHeight) return;
      const scale = Math.min(1, longestFrameSide / Math.max(frameWidth, frameHeight));
      const width = Math.max(1, Math.round(frameWidth * scale));
      const height = Math.max(1, Math.round(frameHeight * scale));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      draw(width, height);
      const { landmarks } = landmarker.detectForVideo(canvas, timestampMs);
      const trackedFrame = tracker.update(landmarks[0] ?? [], { width, height, timestampMs });
      if (source === 'live_camera' && overlayRef.current) {
        drawPoseOverlay(overlayRef.current, width, height, trackedFrame?.joints ?? []);
      }
      if (framing !== null) {
        if (tracker.isTracking()) {
          framing = tracker.feedback().ready ? 'ready' : 'waitingForStart';
          lastTrackedTimestamp = timestampMs;
        } else if (lastTrackedTimestamp !== -Infinity && timestampMs - lastTrackedTimestamp >= framingLostDelayMs) {
          framing = 'lost';
        }
      }
      const { validReps, shallowReps } = tracker.result();
      const currentFraming = framing;
      const currentAngle = source === 'live_camera' && trackedFrame ? Math.round(trackedFrame.angle / 5) * 5 : null;
      setScreen((current) => current.phase === 'running' && (
        currentFraming !== current.framing || currentAngle !== current.currentAngle ||
        validReps !== current.validReps || shallowReps !== current.shallowReps
      ) ? { phase: 'running', source, framing: currentFraming, currentAngle, validReps, shallowReps } : current);
    };
    const analyzeVideo = (timestampMs: number) => analyze(timestampMs, video.videoWidth, video.videoHeight,
      (width, height) => context.drawImage(video, 0, 0, width, height));
    setScreen({ phase: 'running', source, framing, currentAngle: null, validReps: 0, shallowReps: 0 });

    if (file) {
      const signal = capture.controller.signal;
      let decoded = false;
      if (typeof VideoDecoder !== 'undefined') {
        const decoder = await import('@/lib/pose/sequential-frames').catch(() => null);
        signal.throwIfAborted();
        if (decoder) {
          decoded = await decoder.sampleSequentialFrames(file, minimumFrameIntervalMs, signal, frame => {
            analyze(frame.timestampMs, frame.width, frame.height, (width, height) => frame.draw(context, width, height));
          });
        }
      }
      if (!decoded) await sampleRecordedFrames(video, minimumFrameIntervalMs, signal, analyzeVideo);
      finish(capture);
      return;
    }

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

    let previousTimestamp = -Infinity;
    function onFrame(timeSeconds: number) {
      if (activeCapture.current !== capture) return;
      const timestampMs = Math.round(timeSeconds * 1000);
      if (timestampMs - previousTimestamp >= minimumFrameIntervalMs) {
        previousTimestamp = timestampMs;
        try {
          analyzeVideo(timestampMs);
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
      fallback(capture, `Bu brauzerda kamera ochilmadi. ${videoAlternative}`);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        // Let the camera keep its native framing. Downscale for inference after capture.
        video: { facingMode: { ideal: 'user' } },
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
      fallback(capture, `${denied ? 'Kameraga ruxsat berilmadi.' : 'Kamera ochilmadi.'} ${videoAlternative}`);
      return;
    }

    try {
      await processCapture(capture);
    } catch {
      fallback(capture, `Kamera tahlili ishga tushmadi. ${videoAlternative}`);
    }
  }

  async function analyzeLocalVideo(capture: Capture, file: Blob) {
    if (activeCapture.current !== capture) return;
    capture.fileSha256 = await sha256(file);
    if (activeCapture.current !== capture) return;
    capture.objectUrl = URL.createObjectURL(file);
    capture.video.src = capture.objectUrl;
    await processCapture(capture, file);
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
    setReviewingSample(true);
    try {
      const response = await fetch(example.path, { signal: capture.controller.signal });
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
  const sample = screen.phase === 'result' && screen.fileSha256 === example.sha256;
  const poseCycles = sample ? screen.cycles : undefined;
  const showVideo = capturing && (screen.phase !== 'running' || screen.source === 'live_camera');
  return (
    <div className={styles.exercise}>
      <p>{copy.points} kadrda bir tomondan ko‘rinsin. Video qurilmangizda qoladi.</p>
      <div>
        <button className={styles.primary} type="button" disabled={capturing || saving} onClick={playSample}>CDC namunasini sinash</button>
        <p>{movement === 'elbow_bend' ? 'CDC videosidan qirqilgan klip.' : 'Oldindan yozilgan klip.'} {preview ? 'Mashq natijasi faqat shu sahifada ko‘rinadi.' : 'Namuna kunlik asosiy urinishga kirmaydi.'} <a href={example.source}>Video manbasi</a></p>
      </div>
      <div className={styles.actions}>
        {!capturing ? (
          <button className={styles.primary} type="button" disabled={saving} onClick={startCamera}>Kamerani boshlash</button>
        ) : (
          <button className={styles.primary} type="button" onClick={() => {
            if (screen.phase === 'running' && activeCapture.current?.source === 'live_camera') finish(activeCapture.current);
            else {
              takeCapture();
              setScreen({ phase: 'idle' });
              setReviewingSample(false);
            }
          }}>To‘xtatish</button>
        )}
        {!preview && <form onSubmit={reportPain} aria-label="Og‘riq haqida xabar">
          <button className={styles.pain} type="submit" disabled={saving && saveStatus.report === 'pain'}>Og‘riq bor</button>
        </form>}
      </div>
      {screen.phase === 'starting' && <p role="status">{screen.message}</p>}
      {screen.phase === 'retake' && <p className={styles.notice} role="status">{screen.message}</p>}
      {screen.phase === 'running' && (
        <div>
          {screen.framing && <p role="status">{framingMessage[screen.framing]}</p>}
          <output className={styles.counter}>{sourceLabel[screen.source]} · To‘liq {screen.validReps} · Chala {screen.shallowReps}</output>
          {screen.currentAngle !== null && <p>{copy.joint} burchagi taxminan {screen.currentAngle}°</p>}
        </div>
      )}
      <div className={styles.preview} hidden={!showVideo}>
        <video ref={videoRef} className={styles.video} width={640} height={480} muted playsInline preload="none" aria-label="Mashq videosi" />
        <canvas ref={overlayRef} className={styles.overlay} aria-hidden="true" />
      </div>
      <label className={styles.file} htmlFor="exercise-video">
        Video tanlash (50 MB gacha)
        <input id="exercise-video" type="file" accept="video/*" disabled={capturing || saving} onChange={selectVideo} />
      </label>
      {screen.phase === 'result' && (
        <div className={styles.result}>
          <h2>MediaPipe o‘lchovi</h2>
          {sample && <p>CDC namuna videosi</p>}
          <p className={styles.counter}>{sourceLabel[screen.source]} · To‘liq {screen.measurement.validReps} · Chala {screen.measurement.shallowReps}</p>
          <p>Eng kichik burchak {Math.round(screen.measurement.minAngle ?? 0)}° · O‘lchov ishonchi {Math.round((screen.measurement.confidence ?? 0) * 100)}% · {screen.measurement.analyzedFrames} kadr</p>
          {screen.source === 'live_camera' && screen.feedback.interruptedCycles > 0 && (
            <p>Kuzatuv {screen.feedback.interruptedCycles} ta harakat paytida uzildi. Tayanch nuqtalar kadrga sig‘ishini tekshiring.</p>
          )}
          {screen.source === 'live_camera' && screen.feedback.incompleteCycles > 0 && (
            <p>{screen.feedback.incompleteCycles} ta harakatda bukilish yoki boshlang‘ich holatga qaytish to‘liq qayd etilmadi.</p>
          )}
          {screen.cycles.length > 0 && (
            <table className={styles.cycles}>
              <caption>Sikllar · {copy.joint.toLowerCase()} burchagi maqsadi {targetAngle}°</caption>
              <thead><tr><th scope="col">Vaqt</th><th scope="col">Min. burchak</th><th scope="col">Natija</th></tr></thead>
              <tbody>
                {screen.cycles.map(cycle => (
                  <tr key={cycle.fromMs}>
                    <td>{seconds.format(cycle.fromMs / 1000)}–{seconds.format(cycle.toMs / 1000)} s</td>
                    <td>{Math.round(cycle.minAngle)}°</td>
                    <td>{cycle.reachesTarget ? 'Maqsadga yetdi' : 'Maqsadga yetmadi'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!preview && screen.source === 'uploaded_video' && (
            <label className={styles.confirm}>
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.currentTarget.checked)} />
              Videodagi mashq natijasini tasdiqlayman
            </label>
          )}
          {!preview && <button className={styles.primary} type="button" onClick={saveMeasurement} disabled={
            saving || (saveStatus?.state === 'saved' && saveStatus.report === 'measurement') || (screen.source === 'uploaded_video' && !confirmed)
          }>Natijani yuborish</button>}
        </div>
      )}
      {reviewingSample && analysisProviders.includes('openrouter') && <ExerciseAnalysisPanel poseCycles={poseCycles} />}
      {saveStatus && <p className={styles.notice} role="status">{saveStatus.message}</p>}
      {!preview && <details className={styles.manual} open={screen.phase === 'retake' || undefined}>
        <summary id="exercise-manual-heading">Takrorni qo‘lda kiritish</summary>
        <form onSubmit={saveManual} className={styles.manualForm} aria-labelledby="exercise-manual-heading">
          <label htmlFor="exercise-reps">Takrorlar soni</label>
          <input id="exercise-reps" name="reps" type="number" inputMode="numeric" min={0} max={999} step={1} required />
          <button className={styles.primary} type="submit" disabled={capturing || saving}>Qo‘lda qayd yuborish</button>
        </form>
      </details>}
    </div>
  );
}
