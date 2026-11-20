import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compareMedicationBox, medicationBoxReadingSchema, readMedicationBox } from '../../src/lib/ai/dorimos';

const sdk = vi.hoisted(() => ({
  decision: vi.fn(),
  interaction: vi.fn(),
  constructed: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor(options: unknown) { sdk.constructed(options); }
    decisions = { create: sdk.decision };
    interactions = { create: sdk.interaction };
  },
}));

const expected = { drugName: 'Namuna dori', strength: 5, unit: 'mg' } as const;
const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
const input = { image, mimeType: 'image/png', expected } as const;
const yes = { type: 'noul', noul: 0.94, confidence: 0.94 };
const no = { type: 'noul', noul: 0.06, confidence: 0.94 };
const answers = {
  is_packaging_visible: yes,
  is_label_legible: yes,
  matches_prescribed_drug: no,
  detected_dose_bucket: { type: 'choice', choice: '10mg', confidence: 0.91 },
};

describe('DoriMos reading', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('GEMINI_API_KEY', 'unit-key');
    vi.stubEnv('GEMINI_MODEL', 'test-primary');
    vi.stubEnv('GEMINI_DECISION_MODEL', 'test-decisions');
    sdk.decision.mockResolvedValue({ answers });
    sdk.interaction.mockResolvedValue({
      status: 'completed',
      output_text: JSON.stringify({ drugName: 'Andoza dori', strength: 10, unit: 'mg' }),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('allows a clear mismatch through to confirmation and stores no interaction', async () => {
    const result = await readMedicationBox(input);
    expect(result).toMatchObject({
      status: 'needs_confirmation',
      label: { drugName: 'Andoza dori', strength: 10, unit: 'mg' },
      model: 'test-primary',
      decisionModel: 'test-decisions',
      confidence: 0.91,
    });
    expect(medicationBoxReadingSchema.safeParse(result).success).toBe(true);
    expect(sdk.constructed).toHaveBeenCalledWith(expect.objectContaining({ apiVersion: 'v1beta' }));
    expect(sdk.constructed).toHaveBeenCalledWith(expect.objectContaining({ apiVersion: 'v1' }));
    expect(sdk.decision).toHaveBeenCalledOnce();
    expect(sdk.decision).toHaveBeenCalledWith(expect.objectContaining({ questions: expect.objectContaining({
      matches_prescribed_drug: expect.objectContaining({ instructions: expect.stringContaining('Ignore strength') }),
    }) }), expect.anything());
    expect(sdk.interaction).toHaveBeenCalledWith(expect.objectContaining({
      store: false,
      model: 'test-primary',
      generation_config: { thinking_level: 'low' },
      input: [expect.objectContaining({
        type: 'user_input',
        content: expect.arrayContaining([expect.objectContaining({ type: 'image', mime_type: 'image/png' })]),
      })],
      response_format: expect.objectContaining({ mime_type: 'application/json' }),
    }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it.each(['is_packaging_visible', 'is_label_legible'])('rejects a confident negative %s before extraction', async (key) => {
    sdk.decision.mockResolvedValue({ answers: { ...answers, [key]: no } });
    await expect(readMedicationBox(input)).resolves.toMatchObject({ status: 'retake', reason: 'unreadable' });
    expect(sdk.interaction).not.toHaveBeenCalled();
  });

  it('requires confidence on each decision and accepts equality at the cutoff', async () => {
    sdk.decision.mockResolvedValueOnce({ answers: {
      ...answers, detected_dose_bucket: { ...answers.detected_dose_bucket, confidence: 0.799 },
    } });
    sdk.decision.mockResolvedValueOnce({ answers: {
      ...answers, detected_dose_bucket: { ...answers.detected_dose_bucket, confidence: 0.80 },
    } });
    await expect(readMedicationBox(input)).resolves.toMatchObject({ status: 'retake', reason: 'low_confidence' });
    expect(sdk.interaction).not.toHaveBeenCalled();
    await expect(readMedicationBox(input)).resolves.toMatchObject({ status: 'needs_confirmation', confidence: 0.80 });
  });

  it('falls back for a failed extraction model but never fabricates an OCR result', async () => {
    sdk.interaction.mockRejectedValueOnce(new Error('model not found'));
    await expect(readMedicationBox(input)).resolves.toMatchObject({ status: 'needs_confirmation', model: 'gemini-3.5-flash-lite' });
    expect(sdk.interaction).toHaveBeenCalledTimes(2);
    sdk.interaction.mockRejectedValue(new Error('provider unavailable'));
    await expect(readMedicationBox(input)).resolves.toMatchObject({ status: 'manual', reason: 'provider_error' });
  });

  it('rejects explicit null label fields and unsupported pill strengths', async () => {
    sdk.interaction.mockResolvedValueOnce({
      status: 'completed', output_text: JSON.stringify({ drugName: 'Andoza dori', strength: null, unit: null }),
    });
    await expect(readMedicationBox(input)).resolves.toMatchObject({ status: 'retake', reason: 'extraction_unreadable' });
    expect(sdk.interaction).toHaveBeenCalledOnce();
    sdk.interaction.mockResolvedValue({
      status: 'completed', output_text: JSON.stringify({ drugName: 'Andoza dori', strength: 10, unit: 'mg/ml' }),
    });
    await expect(readMedicationBox(input)).resolves.toMatchObject({ status: 'retake', reason: 'extraction_unreadable' });
  });

  it('uses the manual path with a missing key, invalid provider response or invalid image bytes', async () => {
    vi.stubEnv('GEMINI_API_KEY', '');
    await expect(readMedicationBox(input)).resolves.toEqual({ status: 'manual', reason: 'missing_key' });
    expect(sdk.decision).not.toHaveBeenCalled();
    vi.stubEnv('GEMINI_API_KEY', 'unit-key');
    await expect(readMedicationBox({ ...input, image: Uint8Array.of(1, 2, 3) })).rejects.toThrow();
    sdk.decision.mockResolvedValueOnce({ answers: {} });
    await expect(readMedicationBox(input)).resolves.toMatchObject({ status: 'manual', reason: 'provider_error' });
    expect(sdk.interaction).not.toHaveBeenCalled();
  });

  it('applies one 18-second deadline and does not attempt another model on expiry', async () => {
    const controller = new AbortController();
    const timer = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    sdk.interaction.mockImplementationOnce(() => {
      controller.abort();
      return Promise.reject(new DOMException('timeout', 'TimeoutError'));
    });
    await expect(readMedicationBox(input)).resolves.toMatchObject({ status: 'manual', reason: 'timeout' });
    expect(timer).toHaveBeenCalledWith(18_000);
    expect(sdk.decision.mock.calls[0][1].signal).toBe(controller.signal);
    expect(sdk.interaction.mock.calls[0][1].signal.reason).toBe(controller.signal.reason);
    expect(sdk.interaction).toHaveBeenCalledOnce();
  });

  it('uses the reserved fallback time when only the primary model window expires', async () => {
    const overall = new AbortController();
    const primary = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => ms === 5_000 ? primary.signal : overall.signal);
    sdk.interaction.mockImplementationOnce(() => {
      primary.abort();
      return Promise.reject(primary.signal.reason);
    });

    await expect(readMedicationBox(input)).resolves.toMatchObject({ status: 'needs_confirmation', model: 'gemini-3.5-flash-lite' });
    expect(sdk.interaction.mock.calls[1][1].signal).toBe(overall.signal);
    expect(overall.signal.aborted).toBe(false);
  });
});

describe('DoriMos deterministic matching', () => {
  it('compares safe name formatting and equivalent mass units', () => {
    expect(compareMedicationBox(expected, { drugName: ' NAMUNA   DORI ', strength: 0.005, unit: 'g' })).toBe('match');
    expect(compareMedicationBox(expected, { ...expected, strength: 5000, unit: 'mcg' })).toBe('match');
    expect(compareMedicationBox(expected, { ...expected, unit: 'iu' })).toBe('strength_mismatch');
  });

  it('recognizes separate name and strength mismatches', () => {
    expect(compareMedicationBox(expected, { ...expected, drugName: 'Andoza dori' })).toBe('name_mismatch');
    expect(compareMedicationBox(expected, { ...expected, strength: 10 })).toBe('strength_mismatch');
    expect(compareMedicationBox(expected, { ...expected, drugName: 'Andoza dori', strength: 10 })).toBe('name_and_strength_mismatch');
  });
});
