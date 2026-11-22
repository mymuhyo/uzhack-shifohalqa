import { z } from 'zod';

type Landmark = { x: number; y: number; visibility?: number };
type Frame = { width: number; height: number; timestampMs: number };
type Side = 'left' | 'right';
type Phase = 'waiting' | 'standing' | 'descending' | 'bottom' | 'ascending';
type AngleSample = { angle: number; time: number };
type Measurement = { side: Side; angle: number; visibility: number };
type Cycle = { samples: AngleSample[]; minimum: number; bottomFrames: number };
export type MeasuredCycle = { fromMs: number; toMs: number; minAngle: number; reachesTarget: boolean };

const angleWindow = 5;
const liveAngleWindowMs = 400;
const minimumVisibility = 0.4;
const framingVisibility = 0.75;
const maxFrameGapMs = 750;
const minCycleMs = 350;
const maxCycleMs = 15_000;
const signatureSize = 20;
const movements = {
  chair_stand: { joints: { left: [23, 25, 27], right: [24, 26, 28] }, extended: 160, bending: 150, bent: 140 },
  elbow_bend: { joints: { left: [11, 13, 15], right: [12, 14, 16] }, extended: 155, bending: 145, bent: 125 },
} as const;
const movementId = z.enum(['chair_stand', 'elbow_bend']);
export type PoseMovement = z.infer<typeof movementId>;
type JointIndices = (typeof movements)[PoseMovement]['joints'];
const trackerConfig = z.strictObject({
  movement: movementId.default('chair_stand'),
  targetAngle: z.number().min(0),
  liveCamera: z.boolean().default(false),
}).refine(({ movement, targetAngle }) => targetAngle <= movements[movement].bent, { path: ['targetAngle'] });

function isVisible(point?: Landmark): point is Landmark & { visibility: number } {
  return !!point && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    && point.visibility !== undefined && point.visibility >= minimumVisibility && point.visibility <= 1;
}

function measureSide(landmarks: readonly Landmark[], frame: Frame, indices: JointIndices, side: Side): Measurement | null {
  const [startIndex, jointIndex, endIndex] = indices[side];
  const start = landmarks[startIndex];
  const joint = landmarks[jointIndex];
  const end = landmarks[endIndex];
  if (!isVisible(start) || !isVisible(joint) || !isVisible(end)) return null;

  // MediaPipe normalizes each axis separately. Express both in the same length unit.
  const scale = Math.max(frame.width, frame.height);
  const xScale = frame.width / scale;
  const yScale = frame.height / scale;
  const startX = (start.x - joint.x) * xScale;
  const startY = (start.y - joint.y) * yScale;
  const endX = (end.x - joint.x) * xScale;
  const endY = (end.y - joint.y) * yScale;
  const firstLength = Math.hypot(startX, startY);
  const secondLength = Math.hypot(endX, endY);
  if (firstLength < 1e-6 || secondLength < 1e-6) return null;

  const cosine = (startX * endX + startY * endY) / (firstLength * secondLength);
  return {
    side,
    angle: Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI,
    visibility: Math.min(start.visibility, joint.visibility, end.visibility),
  };
}

function measureFrame(landmarks: readonly Landmark[], frame: Frame, indices: JointIndices, trackedSide: Side | null, liveCamera: boolean) {
  if (!Number.isFinite(frame.width) || !Number.isFinite(frame.height) || frame.width <= 0 || frame.height <= 0) return null;
  const left = measureSide(landmarks, frame, indices, 'left');
  const right = measureSide(landmarks, frame, indices, 'right');
  if (!left || !right) return left ?? right;
  if (trackedSide) {
    const tracked = trackedSide === 'left' ? left : right;
    if ((liveCamera && tracked.visibility >= framingVisibility) || Math.abs(left.visibility - right.visibility) < 0.05) {
      return tracked;
    }
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
  const { targetAngle, liveCamera, movement } = trackerConfig.parse(config);
  const { joints, extended, bending, bent } = movements[movement];
  const recentAngles: AngleSample[] = [];
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
  let interruptedCycles = 0;
  let incompleteCycles = 0;
  let motionSignature: number[] | null = null;
  const completed: MeasuredCycle[] = [];

  function resetSegment() {
    recentAngles.length = 0;
    phase = 'waiting';
    trackedSide = null;
    standingSample = null;
    if (cycle) interruptedCycles += 1;
    cycle = null;
    if (!measuring) {
      attemptedFrames = 0;
      analyzedFrames = 0;
      visibilitySum = 0;
    }
  }

  function advance(sample: AngleSample, rawAngle: number) {
    if (sample.angle >= extended && !cycle) {
      phase = 'standing';
      standingSample = sample;
      return;
    }
    if (phase === 'waiting') return;
    if (!cycle) {
      if (sample.angle <= bending && standingSample) {
        phase = 'descending';
        cycle = { samples: [standingSample, sample], minimum: sample.angle, bottomFrames: 0 };
      }
      return;
    }

    const duration = sample.time - cycle.samples[0].time;
    if (duration > maxCycleMs) {
      incompleteCycles += 1;
      cycle = null;
      resetSegment();
      return;
    }
    cycle.samples.push(sample);
    cycle.minimum = Math.min(cycle.minimum, sample.angle);
    if (rawAngle <= bent) cycle.bottomFrames += 1;
    if (phase === 'descending' && sample.angle <= bent && cycle.bottomFrames >= 2) phase = 'bottom';
    if (phase === 'bottom' && sample.angle >= cycle.minimum + 6) phase = 'ascending';
    if (phase === 'ascending' && sample.angle <= cycle.minimum + 3) phase = 'bottom';
    if (sample.angle < extended) return;

    if (phase === 'ascending' && duration >= minCycleMs) {
      const reachesTarget = cycle.minimum <= targetAngle + 1e-9;
      if (reachesTarget) validReps += 1;
      else shallowReps += 1;
      completed.push({ fromMs: cycle.samples[0].time, toMs: sample.time, minAngle: cycle.minimum, reachesTarget });
      if (completed.length > 40) completed.shift();
      motionSignature ??= sampleSignature(cycle.samples);
    } else {
      incompleteCycles += 1;
    }
    phase = 'standing';
    standingSample = sample;
    cycle = null;
  }

  function update(landmarks: readonly Landmark[], frame: Frame) {
    const { timestampMs } = frame;
    if (!Number.isFinite(timestampMs) || timestampMs <= lastFrameTime) return;
    if (timestampMs - lastFrameTime > (liveCamera ? liveAngleWindowMs : maxFrameGapMs)) resetSegment();
    lastFrameTime = timestampMs;

    const measurement = measureFrame(landmarks, frame, joints, trackedSide, liveCamera);
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

    recentAngles.push({ angle: measurement.angle, time: timestampMs });
    if (recentAngles.length > angleWindow) recentAngles.shift();
    if (recentAngles.length < angleWindow) return;
    const samples = liveCamera
      ? recentAngles.filter(sample => timestampMs - sample.time <= liveAngleWindowMs)
      : recentAngles;
    measuring = true;
    const angle = samples.reduce((total, sample) => total + sample.angle, 0) / samples.length;
    minAngle = Math.min(minAngle ?? angle, angle);
    advance({ angle, time: timestampMs }, measurement.angle);
    return { angle, joints: joints[measurement.side].map(index => landmarks[index]) };
  }

  return {
    update,
    cycles: () => completed.slice(),
    isTracking: () => recentAngles.length === angleWindow,
    feedback: () => ({
      ready: standingSample !== null,
      interruptedCycles,
      incompleteCycles: incompleteCycles + (cycle ? 1 : 0),
    }),
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
