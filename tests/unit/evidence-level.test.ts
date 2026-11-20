import { describe, expect, it } from 'vitest';
import { deriveEvidenceLevel } from '../../src/lib/rules/evidence-level';

const verified = (confidence: number) => ({ status: 'verified', confidence });

const photo = {
  source: 'photo_ocr',
  ai_mode: 'live',
  measurement: verified(0.80),
  patient_confirmed: true,
};
const upload = { ...photo, source: 'uploaded_video', measurement: verified(0.75) };
const camera = { source: 'live_camera', ai_mode: 'live', measurement: verified(0.75) };
const timer = { source: 'timer', ai_mode: 'none', duration_seconds: 30 };

describe('deriveEvidenceLevel', () => {
  it.each([
    { name: 'self-report', input: { source: 'self_report', ai_mode: 'none' }, level: 0 },
    { name: 'manual fallback submitted separately', input: { source: 'self_report', ai_mode: 'manual' }, level: 0 },
    { name: 'measured timer', input: timer, level: 1 },
    { name: 'confirmed OCR at the quality floor', input: photo, level: 2 },
    { name: 'confirmed uploaded video at the pose quality floor', input: upload, level: 2 },
    { name: 'live camera at the pose quality floor', input: camera, level: 3 },
  ])('accepts $name as L$level', ({ input, level }) => {
    expect(deriveEvidenceLevel(input)).toEqual({ status: 'accepted', level });
  });

  it.each([
    { name: 'readable photo', input: photo },
    { name: 'usable uploaded video', input: upload },
  ])('requires patient confirmation for $name', ({ input }) => {
    expect(deriveEvidenceLevel({ ...input, patient_confirmed: false })).toEqual({
      status: 'needs_confirmation',
    });
  });

  it.each([
    { name: 'photo', input: photo, confidence: 0.799 },
    { name: 'uploaded video', input: upload, confidence: 0.749 },
    { name: 'live camera', input: camera, confidence: 0.749 },
  ])('requests a retake below the quality floor for $name', ({ input, confidence }) => {
    expect(deriveEvidenceLevel({ ...input, measurement: verified(confidence) })).toEqual({
      status: 'retake',
      reason: 'low_confidence',
    });
  });

  it.each([
    { name: 'unreadable photo before confirmation', input: { ...photo, patient_confirmed: false } },
    { name: 'upload with insufficient frames', input: upload },
    { name: 'camera with insufficient frames', input: camera },
  ])('requests a retake for $name', ({ input }) => {
    expect(deriveEvidenceLevel({ ...input, measurement: { status: 'unavailable' } })).toEqual({
      status: 'retake',
      reason: 'measurement_unavailable',
    });
  });

  it.each([
    { name: 'missing inputs', input: undefined },
    { name: 'unknown source', input: { source: 'pose', ai_mode: 'live' } },
    { name: 'caller-supplied L4', input: { ...camera, level: 4 } },
    { name: 'synthetic camera result', input: { ...camera, ai_mode: 'synthetic' } },
    { name: 'manual upload labelled as measured', input: { ...upload, ai_mode: 'manual' } },
    { name: 'confirmation omitted', input: { ...photo, patient_confirmed: undefined } },
    { name: 'confirmation coerced from text', input: { ...photo, patient_confirmed: 'true' } },
    { name: 'missing confidence for a verified measure', input: { ...camera, measurement: { status: 'verified' } } },
    { name: 'negative confidence', input: { ...camera, measurement: verified(-0.1) } },
    { name: 'out-of-range confidence', input: { ...camera, measurement: verified(1.1) } },
    { name: 'non-finite confidence', input: { ...camera, measurement: verified(Infinity) } },
    { name: 'zero timer duration', input: { ...timer, duration_seconds: 0 } },
    { name: 'unmeasured timer duration', input: { ...timer, duration_seconds: undefined } },
  ])('rejects $name', ({ input }) => {
    expect(deriveEvidenceLevel(input)).toEqual({ status: 'invalid_input' });
  });
});
