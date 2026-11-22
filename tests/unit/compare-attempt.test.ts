import { describe, expect, it } from 'vitest';
import { compareAttempt } from '../../src/lib/anticheat/compare-attempt';

const signature = [166, 163, 155, 143, 130, 121, 110, 101, 96, 93, 94, 97, 105, 115, 125, 138, 149, 155, 160, 165];

describe('exercise attempt comparison', () => {
  it('matches a real SHA-256 file digest independently of a motion signature', () => {
    expect(compareAttempt({
      fileSha256: 'AB'.repeat(32), motionSignature: null,
      previous: [{ fileSha256: 'ab'.repeat(32), motionSignature: null }],
    })).toEqual({ duplicateFile: true, similarMotion: false, closestMae: null });
  });

  it('computes the closest mean absolute error across previous 20-point profiles', () => {
    expect(compareAttempt({
      fileSha256: 'ab'.repeat(32), motionSignature: signature,
      previous: [
        { fileSha256: 'cd'.repeat(32), motionSignature: signature.map((point) => point - 6) },
        { fileSha256: null, motionSignature: signature.map((point) => point + 1.25) },
      ],
    })).toEqual({ duplicateFile: false, similarMotion: true, closestMae: 1.25 });
  });

  it('uses a strict 2.5 degree threshold for a similarity signal', () => {
    expect(compareAttempt({
      fileSha256: null, motionSignature: signature,
      previous: [{ fileSha256: null, motionSignature: signature.map((point) => point + 2.5) }],
    })).toEqual({ duplicateFile: false, similarMotion: false, closestMae: 2.5 });
  });

  it('ignores malformed hashes and stationary, partial or non-finite fingerprints', () => {
    expect(compareAttempt({
      fileSha256: 'fake', motionSignature: signature,
      previous: [
        { fileSha256: 'fake', motionSignature: signature.slice(1) },
        { fileSha256: null, motionSignature: Array(20).fill(160) },
        { fileSha256: null, motionSignature: [Number.NaN, ...signature.slice(1)] },
      ],
    })).toEqual({ duplicateFile: false, similarMotion: false, closestMae: null });
  });

  it('detects similar extension trajectories (shoulder_raise / seated_knee_ext) while rejecting flat curves', () => {
    const extensionSignature = [22, 26, 35, 48, 63, 78, 88, 94, 96, 95, 92, 85, 74, 61, 49, 39, 31, 26, 24, 23];
    const flatCurve = [22, 24, 25, 27, 28, 30, 31, 32, 31, 29, 28, 27, 26, 25, 24, 24, 23, 23, 22, 22];

    expect(compareAttempt({
      fileSha256: null,
      motionSignature: extensionSignature,
      previous: [
        { fileSha256: null, motionSignature: extensionSignature.map((point) => point + 10) },
        { fileSha256: null, motionSignature: extensionSignature.map((point) => point + 1.5) },
      ],
    })).toEqual({ duplicateFile: false, similarMotion: true, closestMae: 1.5 });

    expect(compareAttempt({
      fileSha256: null,
      motionSignature: extensionSignature,
      previous: [{ fileSha256: null, motionSignature: flatCurve }],
    })).toEqual({ duplicateFile: false, similarMotion: false, closestMae: null });
  });
});
