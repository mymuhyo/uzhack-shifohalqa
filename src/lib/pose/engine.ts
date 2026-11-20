import { z } from 'zod';

type Landmark = { x: number; y: number; visibility?: number };
type Frame = { width: number; height: number; timestampMs: number };
type Side = 'left' | 'right';
type Phase = 'waiting' | 'standing' | 'descending' | 'bottom' | 'ascending';
type AngleSample = { angle: number; time: number };
type Measurement = { side: Side; angle: number; visibility: number };
type Cycle = { samples: AngleSample[]; minimum: number; bottomFrames: number };
export type MeasuredCycle = { fromMs: number; toMs: number; minAngle: number; reachesTarget: boolean };

const standingAngle = 160;
const descendingAngle = 150;
const meaningfulBottomAngle = 140;
const angleWindow = 5;
const minimumVisibility = 0.4;
const framingVisibility = 0.75;
const maxFrameGapMs = 750;
const minCycleMs = 350;
const maxCycleMs = 15_000;
const signatureSize = 20;
const indices = { left: [23, 25, 27], right: [24, 26, 28] } as const;
const trackerConfig = z.strictObject({
  targetAngle: z.number().min(0).max(meaningfulBottomAngle),
  liveCamera: z.boolean().default(false),
});

function isVisible(point?: Landmark): point is Landmark & { visibility: number } {
  return !!point && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    && point.visibility !== undefined && point.visibility >= minimumVisibility && point.visibility <= 1;
}

function measureSide(landmarks: readonly Landmark[], frame: Frame, side: Side): Measurement | null {
  const [hipIndex, kneeIndex, ankleIndex] = indices[side];
  const hip = landmarks[hipIndex];
  const knee = landmarks[kneeIndex];
  const ankle = landmarks[ankleIndex];
  if (!isVisible(hip) || !isVisible(knee) || !isVisible(ankle)) return null;

  // MediaPipe normalizes each axis separately. Express both in the same length unit.
  const scale = Math.max(frame.width, frame.height);
  const xScale = frame.width / scale;
  const yScale = frame.height / scale;
  const thighX = (hip.x - knee.x) * xScale;
  const thighY = (hip.y - knee.y) * yScale;
  const shinX = (ankle.x - knee.x) * xScale;
  const shinY = (ankle.y - knee.y) * yScale;
  const thigh = Math.hypot(thighX, thighY);
  const shin = Math.hypot(shinX, shinY);
  if (thigh < 1e-6 || shin < 1e-6) return null;

  const cosine = (thighX * shinX + thighY * shinY) / (thigh * shin);
  return {
    side,
    angle: Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI,
    visibility: Math.min(hip.visibility, knee.visibility, ankle.visibility),
  };
}

function measureFrame(landmarks: readonly Landmark[], frame: Frame, trackedSide: Side | null) {
  if (!Number.isFinite(frame.width) || !Number.isFinite(frame.height) || frame.width <= 0 || frame.height <= 0) return null;
  const left = measureSide(landmarks, frame, 'left');
  const right = measureSide(landmarks, frame, 'right');
  if (!left || !right) return left ?? right;
  if (trackedSide && Math.abs(left.visibility - right.visibility) < 0.05) {
    return trackedSide === 'left' ? left : right;
  }
  return left.visibility >= right.visibility ? left : right;
}

function sampleSignature(samples: AngleSample[]): number[] {
  const first = samples[0];
  const last = samples[samples.length - 1];
  let next = 1;

  return Array.from({ length: signatureSize }, (_, index) => {
    const targetTime = first.time + (last.time - first.time) * index / (signatureSize - 1);
    while (samples[next].time < targetTime && next < samples.length - 1) next += 1;
    const before = samples[next - 1];
    const after = samples[next];
    const weight = (targetTime - before.time) / (after.time - before.time);
    return before.angle + (after.angle - before.angle) * weight;
  });
}

export function createPoseTracker(config: z.input<typeof trackerConfig>) {
  const { targetAngle, liveCamera } = trackerConfig.parse(config);
  const recentAngles: number[] = [];
  let measuring = !liveCamera;
  let phase: Phase = 'waiting';
  let trackedSide: Side | null = null;
  let standingSample: AngleSample | null = null;
  let cycle: Cycle | null = null;
  let lastFrameTime = -Infinity;
  let attemptedFrames = 0;
  let trailingMissedFrames = 0;
  let analyzedFrames = 0;
  let visibilitySum = 0;
  let minAngle: number | null = null;
  let validReps = 0;
  let shallowReps = 0;
  let motionSignature: number[] | null = null;
  const completed: MeasuredCycle[] = [];

  function resetSegment() {
    recentAngles.length = 0;
    phase = 'waiting';
    trackedSide = null;
    standingSample = null;
    cycle = null;
    if (!measuring) {
      attemptedFrames = 0;
      analyzedFrames = 0;
      visibilitySum = 0;
    }
  }

  function advance(sample: AngleSample, rawAngle: number) {
    if (sample.angle >= standingAngle && !cycle) {
      phase = 'standing';
      standingSample = sample;
      return;
    }
    if (phase === 'waiting') return;
    if (!cycle) {
      if (sample.angle <= descendingAngle && standingSample) {
        phase = 'descending';
        cycle = { samples: [standingSample, sample], minimum: sample.angle, bottomFrames: 0 };
      }
      return;
    }

    const duration = sample.time - cycle.samples[0].time;
    if (duration > maxCycleMs) {
      resetSegment();
      return;
    }
    cycle.samples.push(sample);
    cycle.minimum = Math.min(cycle.minimum, sample.angle);
    if (rawAngle <= meaningfulBottomAngle) cycle.bottomFrames += 1;
    if (phase === 'descending' && sample.angle <= meaningfulBottomAngle && cycle.bottomFrames >= 2) phase = 'bottom';
    if (phase === 'bottom' && sample.angle >= cycle.minimum + 6) phase = 'ascending';
    if (phase === 'ascending' && sample.angle <= cycle.minimum + 3) phase = 'bottom';
    if (sample.angle < standingAngle) return;

    if (phase === 'ascending' && duration >= minCycleMs) {
      const reachesTarget = cycle.minimum <= targetAngle + 1e-9;
      if (reachesTarget) validReps += 1;
      else shallowReps += 1;
      completed.push({ fromMs: cycle.samples[0].time, toMs: sample.time, minAngle: cycle.minimum, reachesTarget });
      if (completed.length > 40) completed.shift();
      motionSignature ??= sampleSignature(cycle.samples);
    }
    phase = 'standing';
    standingSample = sample;
    cycle = null;
  }

  function update(landmarks: readonly Landmark[], frame: Frame) {
    const { timestampMs } = frame;
    if (!Number.isFinite(timestampMs) || timestampMs <= lastFrameTime) return;
    if (timestampMs - lastFrameTime > maxFrameGapMs) resetSegment();
    lastFrameTime = timestampMs;

    const measurement = measureFrame(landmarks, frame, trackedSide);
    if (!measurement || (!measuring && measurement.visibility < framingVisibility)) {
      attemptedFrames += 1;
      trailingMissedFrames += 1;
      resetSegment();
      return;
    }
    if (trackedSide && measurement.side !== trackedSide) resetSegment();
    trackedSide = measurement.side;
    attemptedFrames += 1;
    trailingMissedFrames = 0;
    analyzedFrames += 1;
    visibilitySum += measurement.visibility;

    recentAngles.push(measurement.angle);
    if (recentAngles.length > angleWindow) recentAngles.shift();
    if (recentAngles.length < angleWindow) return;
    measuring = true;
    const angle = recentAngles.reduce((total, value) => total + value, 0) / angleWindow;
    minAngle = Math.min(minAngle ?? angle, angle);
    advance({ angle, time: timestampMs }, measurement.angle);
    return { angle, joints: indices[measurement.side].map(index => landmarks[index]) };
  }

  return {
    update,
    cycles: () => completed.slice(),
    isTracking: () => recentAngles.length === angleWindow,
    result: () => {
      // A person may step out of frame to stop the camera after a completed rep.
      const frames = liveCamera && (validReps > 0 || shallowReps > 0)
        ? attemptedFrames - trailingMissedFrames
        : attemptedFrames;
      return {
        validReps,
        shallowReps,
        minAngle,
        confidence: minAngle === null ? null : visibilitySum / frames,
        motionSignature: motionSignature?.slice() ?? null,
        analyzedFrames,
      };
    },
  };
}
