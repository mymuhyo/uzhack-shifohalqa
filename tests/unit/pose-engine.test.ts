import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createPoseTracker } from '../../src/lib/pose/engine';

type Tracker = ReturnType<typeof createPoseTracker>;
type FrameSize = { width: number; height: number };

const landscape = { width: 1280, height: 720 };
const targetAngle = 105;

function landmarks(angle: number, frame: FrameSize, visibility = 0.96) {
  const length = Math.min(frame.width, frame.height) / 4;
  const radians = angle * Math.PI / 180;
  const positions = Array.from({ length: 29 }, () => ({ x: 0, y: 0, visibility: 0 }));
  positions[23] = { x: 0.5, y: 0.5 - length / frame.height, visibility };
  positions[25] = { x: 0.5, y: 0.5, visibility };
  positions[27] = {
    x: 0.5 + length * Math.sin(radians) / frame.width,
    y: 0.5 - length * Math.cos(radians) / frame.height,
    visibility,
  };
  return positions;
}

function feed(tracker: Tracker, angles: number[], start = 0, frame = landscape) {
  angles.forEach((angle, index) => tracker.update(landmarks(angle, frame), {
    ...frame, timestampMs: start + index * 50,
  }));
  return start + angles.length * 50;
}

function cycle(bottom: number) {
  return [
    174, 174, 174, 174, 174, 174, 160, 150, 140, 130, 120,
    bottom, bottom, bottom, bottom, bottom, bottom,
    120, 130, 140, 150, 160, 174, 174, 174, 174, 174, 174,
  ];
}

const sharedTraces = readFileSync(new URL('../fixtures/chair-stand/live.tsv', import.meta.url), 'utf8')
  .trim().split('\n').slice(1).map(row => row.split('\t'));

it.each(sharedTraces)('matches the Android live trace %s', (_name, step, gapAt, gap, visibility, valid, shallow, angles) => {
  const tracker = createPoseTracker({ targetAngle: 100, liveCamera: true });
  angles.split(' ').forEach((angle, index) => {
    tracker.update(landmarks(Number(angle), landscape, Number(visibility)), {
      ...landscape,
      timestampMs: index * Number(step) + (Number(gapAt) >= 0 && index >= Number(gapAt) ? Number(gap) : 0),
    });
  });
  expect(tracker.result()).toMatchObject({ validReps: Number(valid), shallowReps: Number(shallow) });
});

describe('sit-to-stand pose tracker', () => {
  it('counts elbow bending with arm landmarks and ignores knee movement', () => {
    const tracker = createPoseTracker({ movement: 'elbow_bend', targetAngle: 80 });
    const kneeEnd = feed(tracker, cycle(70));
    expect(tracker.result()).toMatchObject({ validReps: 0, analyzedFrames: 0 });
    cycle(70).forEach((angle, index) => {
      const points = landmarks(angle, landscape);
      [11, 13, 15].forEach((joint, offset) => { points[joint] = points[23 + 2 * offset]; });
      tracker.update(points, { ...landscape, timestampMs: kneeEnd + index * 50 });
    });
    expect(tracker.result()).toMatchObject({ validReps: 1, shallowReps: 0 });
    expect(tracker.cycles()[0].minAngle).toBeCloseTo(70);
  });

  it('counts knee_lift repetitions using shoulder-hip-knee landmarks', () => {
    const tracker = createPoseTracker({ movement: 'knee_lift', targetAngle: 110 });
    cycle(95).forEach((angle, index) => {
      const points = landmarks(angle, landscape);
      // Map shoulder (11), hip (23), knee (25) using the synthetic angle triad.
      points[11] = points[23];
      points[23] = points[25];
      points[25] = points[27];
      points[27] = { x: 0, y: 0, visibility: 0 };
      tracker.update(points, { ...landscape, timestampMs: index * 50 });
    });
    expect(tracker.result()).toMatchObject({ validReps: 1, shallowReps: 0 });
    expect(tracker.cycles()[0].minAngle).toBeCloseTo(95);
  });

  it('counts shoulder_raise and seated_knee_ext extension movements', () => {
    const shoulder = createPoseTracker({ movement: 'shoulder_raise', targetAngle: 90 });
    const raiseSeq = [
      25, 25, 25, 25, 25, 25, 50, 75, 105, 105, 105, 105, 105, 75, 50, 25, 25, 25, 25, 25,
    ];
    raiseSeq.forEach((angle, index) => {
      const points = landmarks(angle, landscape);
      // Map hip (23), shoulder (11), elbow (13) using synthetic triad (vertex at 25 -> 11).
      points[23] = points[23];
      points[11] = points[25];
      points[13] = points[27];
      shoulder.update(points, { ...landscape, timestampMs: index * 60 });
    });
    expect(shoulder.result()).toMatchObject({ validReps: 1, shallowReps: 0 });
    expect(shoulder.cycles()[0].minAngle).toBeCloseTo(105);

    const kneeExt = createPoseTracker({ movement: 'seated_knee_ext', targetAngle: 155 });
    const extSeq = [
      100, 100, 100, 100, 100, 100, 130, 145, 165, 165, 165, 165, 165, 145, 130, 100, 100, 100, 100, 100,
    ];
    feed(kneeExt, extSeq);
    expect(kneeExt.result()).toMatchObject({ validReps: 1, shallowReps: 0 });
    expect(kneeExt.cycles()[0].minAngle).toBeCloseTo(165);
  });

  it('requires five usable consecutive frames and does not count repeated timestamps', () => {
    const tracker = createPoseTracker({ targetAngle });
    const timestampMs = feed(tracker, [172, 172, 172, 172]);
    tracker.update(landmarks(172, landscape), { ...landscape, timestampMs: timestampMs - 50 });
    expect(tracker.result()).toMatchObject({ minAngle: null, confidence: null, analyzedFrames: 4 });

    feed(tracker, [172], timestampMs);
    expect(tracker.result().minAngle).toBeCloseTo(172);
    expect(tracker.result().confidence).toBeCloseTo(0.96);
  });

  it('measures the same angle in landscape and portrait coordinates', () => {
    const wide = createPoseTracker({ targetAngle });
    const tall = createPoseTracker({ targetAngle });
    feed(wide, [113, 113, 113, 113, 113]);
    feed(tall, [113, 113, 113, 113, 113], 0, { width: 720, height: 1280 });

    expect(wide.result().minAngle).toBeCloseTo(113);
    expect(tall.result().minAngle).toBeCloseTo(113);
  });

  it('falls back to the other visible side when a joint pair is degenerate', () => {
    const tracker = createPoseTracker({ targetAngle });
    const points = landmarks(95, landscape, 1);
    const right = landmarks(119, landscape, 0.85);
    points[23] = points[25];
    [23, 25, 27].forEach((index) => { points[index + 1] = right[index]; });
    for (let index = 0; index < 5; index += 1) {
      tracker.update(points, { ...landscape, timestampMs: index * 50 });
    }

    expect(tracker.result().minAngle).toBeCloseTo(119);
    expect(tracker.result().confidence).toBeCloseTo(0.85);
  });

  it('drops coincident joints and absent detections from the analyzed frame count', () => {
    const tracker = createPoseTracker({ targetAngle });
    const points = landmarks(174, landscape);
    points[27] = points[25];
    tracker.update(points, { ...landscape, timestampMs: 0 });
    tracker.update([], { ...landscape, timestampMs: 50 });
    expect(tracker.result()).toEqual({
      validReps: 0, shallowReps: 0, minAngle: null, confidence: null,
      motionSignature: null, analyzedFrames: 0,
    });
  });

  it('counts complete valid and shallow repetitions and signs the first movement', () => {
    const tracker = createPoseTracker({ targetAngle });
    const nextTime = feed(tracker, cycle(105));
    feed(tracker, cycle(120), nextTime);

    const measured = tracker.result();
    expect(measured).toMatchObject({ validReps: 1, shallowReps: 1 });
    expect(measured.minAngle).toBeCloseTo(105);
    expect(tracker.cycles()).toEqual([
      { fromMs: expect.any(Number), toMs: expect.any(Number), minAngle: expect.closeTo(105), reachesTarget: true },
      { fromMs: expect.any(Number), toMs: expect.any(Number), minAngle: expect.closeTo(120), reachesTarget: false },
    ]);
    const [first, second] = tracker.cycles();
    expect(first.fromMs).toBeLessThan(first.toMs);
    expect(first.toMs).toBeLessThan(second.fromMs);
    expect(measured.motionSignature).toHaveLength(20);
    expect(Math.min(...measured.motionSignature!)).toBeCloseTo(105);
    expect(measured.motionSignature![19]).toBeGreaterThanOrEqual(160);
  });

  it('ignores seated starts, unfinished motions and standing jitter', () => {
    const tracker = createPoseTracker({ targetAngle });
    const end = feed(tracker, [90, 90, 90, 90, 90, 174, 174, 174, 174, 174, 174,
      150, 149, 151, 149, 150, 174, 174, 174, 174, 174]);
    feed(tracker, cycle(97).slice(0, 19), end);

    expect(tracker.result()).toMatchObject({ validReps: 0, shallowReps: 0, motionSignature: null });
  });

  it('does not bridge a missing detection or a long timestamp gap to finish a rep', () => {
    const missing = createPoseTracker({ targetAngle });
    const gap = createPoseTracker({ targetAngle });
    const prefix = cycle(95).slice(0, 17);
    const suffix = cycle(95).slice(17);
    const nextTime = feed(missing, prefix);
    feed(gap, prefix);
    missing.update([], { ...landscape, timestampMs: nextTime });
    feed(missing, suffix, nextTime + 50);
    feed(gap, suffix, nextTime + 2000);

    for (const tracker of [missing, gap]) {
      expect(tracker.result()).toMatchObject({ validReps: 0, shallowReps: 0, motionSignature: null });
    }
  });

  it('reduces confidence when few attempted frames have usable geometry', () => {
    const tracker = createPoseTracker({ targetAngle });
    const nextTime = feed(tracker, [172, 172, 172, 172, 172]);
    for (let index = 0; index < 5; index += 1) {
      tracker.update([], { ...landscape, timestampMs: nextTime + index * 50 });
    }
    expect(tracker.result().confidence).toBeCloseTo(0.48);
    expect(tracker.result().analyzedFrames).toBe(5);
  });

  it('omits camera setup and stopping frames outside a measured repetition', () => {
    const tracker = createPoseTracker({ targetAngle, liveCamera: true });
    for (let index = 0; index < 30; index += 1) {
      tracker.update([], { ...landscape, timestampMs: index * 50 });
    }
    expect(tracker.isTracking()).toBe(false);

    const end = feed(tracker, cycle(95), 1500);
    expect(tracker.isTracking()).toBe(true);
    for (let index = 0; index < 30; index += 1) {
      tracker.update([], { ...landscape, timestampMs: end + index * 50 });
    }

    expect(tracker.isTracking()).toBe(false);
    expect(tracker.result()).toMatchObject({ validReps: 1, analyzedFrames: cycle(95).length });
    expect(tracker.result().confidence).toBeCloseTo(0.96);
  });

  it('keeps intervening missed live frames in the confidence calculation', () => {
    const tracker = createPoseTracker({ targetAngle, liveCamera: true });
    const end = feed(tracker, [172, 172, 172, 172, 172]);
    for (let index = 0; index < 10; index += 1) {
      tracker.update([], { ...landscape, timestampMs: end + index * 50 });
    }
    feed(tracker, [172, 172, 172, 172, 172], end + 500);

    expect(tracker.result().confidence).toBeCloseTo(0.48);
    expect(tracker.result().analyzedFrames).toBe(10);
  });

  it('keeps a clearly visible leg when the other leg has a higher visibility score', () => {
    const tracker = createPoseTracker({ targetAngle, liveCamera: true });
    cycle(95).forEach((angle, index) => {
      const points = landmarks(angle, landscape, 0.84);
      const other = landmarks(angle, landscape, index >= 6 && index % 2 === 0 ? 0.99 : 0.79);
      [23, 25, 27].forEach(joint => { points[joint + 1] = other[joint]; });
      tracker.update(points, { ...landscape, timestampMs: index * 80 });
    });

    expect(tracker.result()).toMatchObject({ validReps: 1, shallowReps: 0 });
  });

  it('keeps a supported bottom and return at four measured frames per second', () => {
    const tracker = createPoseTracker({ targetAngle, liveCamera: true });
    const angles = [174, 174, 174, 174, 174, 174, 152, 130, 95, 95, 130, 152, 174, 174];
    angles.forEach((angle, index) => {
      tracker.update(landmarks(angle, landscape), { ...landscape, timestampMs: index * 250 });
    });

    expect(tracker.result()).toMatchObject({ validReps: 1, shallowReps: 0 });
    expect(tracker.cycles()[0].minAngle).toBeCloseTo(95);
  });

  it('does not join an unfinished live cycle across a long pause in frame delivery', () => {
    const tracker = createPoseTracker({ targetAngle, liveCamera: true });
    const nextTime = feed(tracker, cycle(95).slice(0, 17));
    feed(tracker, cycle(95).slice(17), nextTime + 500);

    expect(tracker.result()).toMatchObject({ validReps: 0, shallowReps: 0 });
    expect(tracker.feedback()).toMatchObject({ interruptedCycles: 1, incompleteCycles: 0 });
  });

  it('waits for the starting pose and distinguishes an incomplete movement from lost tracking', () => {
    const tracker = createPoseTracker({ targetAngle, liveCamera: true });
    const constant = (angle: number) => Array<number>(7).fill(angle);
    const seated = feed(tracker, constant(95));
    expect(tracker.isTracking()).toBe(true);
    expect(tracker.feedback().ready).toBe(false);
    const standing = feed(tracker, constant(174), seated);
    expect(tracker.feedback().ready).toBe(true);
    feed(tracker, [...constant(145), ...constant(174)], standing);
    expect(tracker.feedback()).toEqual({ ready: true, interruptedCycles: 0, incompleteCycles: 1 });
    expect(tracker.cycles()).toHaveLength(0);
  });

  it('retains the quality penalty if the camera loses tracking before any completed rep', () => {
    const tracker = createPoseTracker({ targetAngle, liveCamera: true });
    const end = feed(tracker, [172, 172, 172, 172, 172]);
    for (let index = 0; index < 5; index += 1) {
      tracker.update([], { ...landscape, timestampMs: end + index * 50 });
    }

    expect(tracker.result()).toMatchObject({ validReps: 0, shallowReps: 0 });
    expect(tracker.result().confidence).toBeCloseTo(0.48);
  });

  it('waits for a stable, clearly visible leg before starting live measurement', () => {
    const tracker = createPoseTracker({ targetAngle, liveCamera: true });
    const end = feed(tracker, [172, 172, 172, 172]);
    tracker.update(landmarks(172, landscape, 0.65), { ...landscape, timestampMs: end });
    feed(tracker, [172, 172, 172, 172], end + 50);
    expect(tracker.isTracking()).toBe(false);
    expect(tracker.result()).toMatchObject({ confidence: null, minAngle: null });

    feed(tracker, [172], end + 250);
    expect(tracker.isTracking()).toBe(true);
    expect(tracker.result()).toMatchObject({ analyzedFrames: 5 });
    expect(tracker.result().confidence).toBeCloseTo(0.96);
  });
});
