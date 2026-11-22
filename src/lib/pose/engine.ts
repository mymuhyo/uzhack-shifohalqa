import { z } from 'zod';

type Landmark = { x: number; y: number; visibility?: number };
type Frame = { width: number; height: number; timestampMs: number };
type Side = 'left' | 'right';
type Phase = 'waiting' | 'standing' | 'descending' | 'bottom' | 'ascending';
type AngleSample = { angle: number; time: number };
type Measurement = { side: Side; angle: number; visibility: number };
type Cycle = { samples: AngleSample[]; minimum: number; maximum: number; bottomFrames: number };
export type MeasuredCycle = { fromMs: number; toMs: number; minAngle: number; reachesTarget: boolean };
export type FormWarning = 'trunk_lean' | 'elbow_drift' | 'shoulder_asymmetry';

export type BiomechanicsSummary = {
  trunkLeanMaxDeg: number | null;
  elbowDriftMaxDeg: number | null;
  shoulderTiltMaxDeg: number | null;
  compensationCycles: number;
  tempoSpreadSeconds: number | null;
  currentFormWarning: FormWarning | null;
};

const angleWindow = 5;
const liveAngleWindowMs = 400;
const minimumVisibility = 0.4;
const framingVisibility = 0.75;
const maxFrameGapMs = 750;
const minCycleMs = 350;
const maxCycleMs = 15_000;
const signatureSize = 20;

const movements = {
  chair_stand: {
    direction: 'flex' as const,
    joints: { left: [23, 25, 27], right: [24, 26, 28] },
    extended: 160,
    bending: 150,
    bent: 140,
    rest: 160,
    rising: 150,
    peak: 140,
  },
  elbow_bend: {
    direction: 'flex' as const,
    joints: { left: [11, 13, 15], right: [12, 14, 16] },
    extended: 155,
    bending: 145,
    bent: 125,
    rest: 155,
    rising: 145,
    peak: 125,
  },
  knee_lift: {
    direction: 'flex' as const,
    joints: { left: [11, 23, 25], right: [12, 24, 26] },
    extended: 162,
    bending: 150,
    bent: 135,
    rest: 162,
    rising: 150,
    peak: 135,
  },
  shoulder_raise: {
    direction: 'extend' as const,
    joints: { left: [23, 11, 13], right: [24, 12, 14] },
    extended: 40,
    bending: 50,
    bent: 70,
    rest: 40,
    rising: 50,
    peak: 70,
  },
  seated_knee_ext: {
    direction: 'extend' as const,
    joints: { left: [23, 25, 27], right: [24, 26, 28] },
    extended: 115,
    bending: 125,
    bent: 140,
    rest: 115,
    rising: 125,
    peak: 140,
  },
} as const;

const movementId = z.enum(['chair_stand', 'elbow_bend', 'knee_lift', 'shoulder_raise', 'seated_knee_ext']);
export { movementId };
export type PoseMovement = z.infer<typeof movementId>;
type JointIndices = (typeof movements)[PoseMovement]['joints'];

const trackerConfig = z.strictObject({
  movement: movementId.default('chair_stand'),
  targetAngle: z.number().min(0),
  liveCamera: z.boolean().default(false),
}).refine(({ movement, targetAngle }) => {
  const spec = movements[movement];
  return spec.direction === 'flex' ? targetAngle <= spec.bent : targetAngle >= spec.peak;
}, { path: ['targetAngle'] });

function isVisible(point?: Landmark): point is Landmark & { visibility: number } {
  return !!point && point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    && point.visibility !== undefined && point.visibility >= minimumVisibility && point.visibility <= 1;
}

function measureTriadAngle(start: Landmark, joint: Landmark, end: Landmark, frame: Frame): number | null {
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
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

function measureSide(landmarks: readonly Landmark[], frame: Frame, indices: JointIndices, side: Side): Measurement | null {
  const [startIndex, jointIndex, endIndex] = indices[side];
  const start = landmarks[startIndex];
  const joint = landmarks[jointIndex];
  const end = landmarks[endIndex];
  if (!isVisible(start) || !isVisible(joint) || !isVisible(end)) return null;
  const angle = measureTriadAngle(start, joint, end, frame);
  if (angle === null) return null;
  return {
    side,
    angle,
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

function measurePosture(landmarks: readonly Landmark[], frame: Frame, side: Side, movement: PoseMovement) {
  const scale = Math.max(frame.width, frame.height);
  const xScale = frame.width / scale;
  const yScale = frame.height / scale;

  const shoulderIdx = side === 'left' ? 11 : 12;
  const hipIdx = side === 'left' ? 23 : 24;
  const elbowIdx = side === 'left' ? 13 : 14;
  const shoulder = landmarks[shoulderIdx];
  const hip = landmarks[hipIdx];

  let trunkLeanDeg: number | null = null;
  let torsoJoints: Landmark[] | undefined;
  if (isVisible(shoulder) && isVisible(hip)) {
    const dx = (shoulder.x - hip.x) * xScale;
    const dy = (hip.y - shoulder.y) * yScale;
    if (Math.hypot(dx, dy) >= 1e-5) {
      trunkLeanDeg = Math.atan2(Math.abs(dx), Math.max(1e-5, Math.abs(dy))) * 180 / Math.PI;
      torsoJoints = [shoulder, hip];
    }
  }

  let elbowDriftDeg: number | null = null;
  if (movement === 'elbow_bend') {
    const elbow = landmarks[elbowIdx];
    if (isVisible(hip) && isVisible(shoulder) && isVisible(elbow)) {
      elbowDriftDeg = measureTriadAngle(hip, shoulder, elbow, frame);
    }
  }

  let shoulderTiltDeg: number | null = null;
  if (movement === 'shoulder_raise') {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    if (isVisible(leftShoulder) && isVisible(rightShoulder)) {
      const dx = Math.abs(leftShoulder.x - rightShoulder.x) * xScale;
      const dy = Math.abs(leftShoulder.y - rightShoulder.y) * yScale;
      if (dx >= 1e-5) {
        shoulderTiltDeg = Math.atan2(dy, dx) * 180 / Math.PI;
      }
    }
  }

  let formWarning: FormWarning | null = null;
  if (movement === 'chair_stand' && trunkLeanDeg !== null && trunkLeanDeg > 35) formWarning = 'trunk_lean';
  else if (movement === 'knee_lift' && trunkLeanDeg !== null && trunkLeanDeg > 25) formWarning = 'trunk_lean';
  else if (movement === 'seated_knee_ext' && trunkLeanDeg !== null && trunkLeanDeg > 28) formWarning = 'trunk_lean';
  else if (movement === 'elbow_bend' && elbowDriftDeg !== null && elbowDriftDeg > 35) formWarning = 'elbow_drift';
  else if (movement === 'shoulder_raise' && shoulderTiltDeg !== null && shoulderTiltDeg > 14) formWarning = 'shoulder_asymmetry';

  return { trunkLeanDeg, elbowDriftDeg, shoulderTiltDeg, formWarning, torsoJoints };
}

export function createPoseTracker(config: z.input<typeof trackerConfig>) {
  const { targetAngle, liveCamera, movement } = trackerConfig.parse(config);
  const spec = movements[movement];
  const { joints, direction } = spec;
  const recentAngles: AngleSample[] = [];
  let measuring = !liveCamera;
  let phase: Phase = 'waiting';
  let trackedSide: Side | null = null;
  let standingSample: AngleSample | null = null;
  let cycle: Cycle | null = null;
  let cycleHasCompensation = false;
  let lastFrameTime = -Infinity;
  let attemptedFrames = 0;
  let trailingMissedFrames = 0;
  let analyzedFrames = 0;
  let visibilitySum = 0;
  let extremalAngle: number | null = null;
  let validReps = 0;
  let shallowReps = 0;
  let interruptedCycles = 0;
  let incompleteCycles = 0;
  let compensationCycles = 0;
  let trunkLeanMaxDeg: number | null = null;
  let elbowDriftMaxDeg: number | null = null;
  let shoulderTiltMaxDeg: number | null = null;
  let currentFormWarning: FormWarning | null = null;
  let motionSignature: number[] | null = null;
  const completed: MeasuredCycle[] = [];

  function resetSegment() {
    recentAngles.length = 0;
    phase = 'waiting';
    trackedSide = null;
    standingSample = null;
    currentFormWarning = null;
    if (cycle) interruptedCycles += 1;
    cycle = null;
    cycleHasCompensation = false;
    if (!measuring) {
      attemptedFrames = 0;
      analyzedFrames = 0;
      visibilitySum = 0;
    }
  }

  function advance(sample: AngleSample, rawAngle: number) {
    if (direction === 'flex') {
      if (sample.angle >= spec.extended && !cycle) {
        phase = 'standing';
        standingSample = sample;
        return;
      }
      if (phase === 'waiting') return;
      if (!cycle) {
        if (sample.angle <= spec.bending && standingSample) {
          phase = 'descending';
          cycle = { samples: [standingSample, sample], minimum: sample.angle, maximum: sample.angle, bottomFrames: 0 };
          cycleHasCompensation = currentFormWarning !== null;
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
      if (currentFormWarning !== null) cycleHasCompensation = true;
      if (rawAngle <= spec.bent) cycle.bottomFrames += 1;
      if (phase === 'descending' && sample.angle <= spec.bent && cycle.bottomFrames >= 2) phase = 'bottom';
      if (phase === 'bottom' && sample.angle >= cycle.minimum + 6) phase = 'ascending';
      if (phase === 'ascending' && sample.angle <= cycle.minimum + 3) phase = 'bottom';
      if (sample.angle < spec.extended) return;

      if (phase === 'ascending' && duration >= minCycleMs) {
        const reachesTarget = cycle.minimum <= targetAngle + 1e-9;
        if (reachesTarget) validReps += 1;
        else shallowReps += 1;
        if (cycleHasCompensation) compensationCycles += 1;
        completed.push({ fromMs: cycle.samples[0].time, toMs: sample.time, minAngle: cycle.minimum, reachesTarget });
        if (completed.length > 40) completed.shift();
        motionSignature ??= sampleSignature(cycle.samples);
      } else {
        incompleteCycles += 1;
      }
      phase = 'standing';
      standingSample = sample;
      cycle = null;
      cycleHasCompensation = false;
      return;
    }

    // Extension direction (shoulder_raise, seated_knee_ext): rest <= spec.rest, peak >= spec.peak
    if (sample.angle <= spec.rest && !cycle) {
      phase = 'standing';
      standingSample = sample;
      return;
    }
    if (phase === 'waiting') return;
    if (!cycle) {
      if (sample.angle >= spec.rising && standingSample) {
        phase = 'descending';
        cycle = { samples: [standingSample, sample], minimum: sample.angle, maximum: sample.angle, bottomFrames: 0 };
        cycleHasCompensation = currentFormWarning !== null;
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
    cycle.maximum = Math.max(cycle.maximum, sample.angle);
    if (currentFormWarning !== null) cycleHasCompensation = true;
    if (rawAngle >= spec.peak) cycle.bottomFrames += 1;
    if (phase === 'descending' && sample.angle >= spec.peak && cycle.bottomFrames >= 2) phase = 'bottom';
    if (phase === 'bottom' && sample.angle <= cycle.maximum - 6) phase = 'ascending';
    if (phase === 'ascending' && sample.angle >= cycle.maximum - 3) phase = 'bottom';
    if (sample.angle > spec.rest) return;

    if (phase === 'ascending' && duration >= minCycleMs) {
      const reachesTarget = cycle.maximum >= targetAngle - 1e-9;
      if (reachesTarget) validReps += 1;
      else shallowReps += 1;
      if (cycleHasCompensation) compensationCycles += 1;
      completed.push({ fromMs: cycle.samples[0].time, toMs: sample.time, minAngle: cycle.maximum, reachesTarget });
      if (completed.length > 40) completed.shift();
      motionSignature ??= sampleSignature(cycle.samples);
    } else {
      incompleteCycles += 1;
    }
    phase = 'standing';
    standingSample = sample;
    cycle = null;
    cycleHasCompensation = false;
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
    extremalAngle = extremalAngle === null
      ? angle
      : direction === 'flex'
        ? Math.min(extremalAngle, angle)
        : Math.max(extremalAngle, angle);

    const posture = measurePosture(landmarks, frame, measurement.side, movement);
    if (posture.trunkLeanDeg !== null) {
      trunkLeanMaxDeg = Math.max(trunkLeanMaxDeg ?? 0, Math.round(posture.trunkLeanDeg * 10) / 10);
    }
    if (posture.elbowDriftDeg !== null) {
      elbowDriftMaxDeg = Math.max(elbowDriftMaxDeg ?? 0, Math.round(posture.elbowDriftDeg * 10) / 10);
    }
    if (posture.shoulderTiltDeg !== null) {
      shoulderTiltMaxDeg = Math.max(shoulderTiltMaxDeg ?? 0, Math.round(posture.shoulderTiltDeg * 10) / 10);
    }
    currentFormWarning = posture.formWarning;

    advance({ angle, time: timestampMs }, measurement.angle);
    return {
      angle,
      joints: joints[measurement.side].map(index => landmarks[index]),
      torsoJoints: posture.torsoJoints,
      formWarning: posture.formWarning,
    };
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
    biomechanics: (): BiomechanicsSummary => {
      let tempoSpreadSeconds: number | null = null;
      if (completed.length >= 2) {
        const durations = completed.map(c => Math.max(0, (c.toMs - c.fromMs) / 1000));
        tempoSpreadSeconds = Math.round((Math.max(...durations) - Math.min(...durations)) * 10) / 10;
      }
      return {
        trunkLeanMaxDeg,
        elbowDriftMaxDeg,
        shoulderTiltMaxDeg,
        compensationCycles,
        tempoSpreadSeconds,
        currentFormWarning,
      };
    },
    result: () => {
      // A person may step out of frame to stop the camera after a completed rep.
      const frames = liveCamera && (validReps > 0 || shallowReps > 0)
        ? attemptedFrames - trailingMissedFrames
        : attemptedFrames;
      return {
        validReps,
        shallowReps,
        minAngle: extremalAngle,
        confidence: extremalAngle === null ? null : visibilitySum / frames,
        motionSignature: motionSignature?.slice() ?? null,
        analyzedFrames,
      };
    },
  };
}
