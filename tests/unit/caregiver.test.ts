import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { caregiverActionSchema, createCaregiverToken, digestCaregiverToken } from '../../src/lib/caregiver';

describe('caregiver capability', () => {
  it('generates distinct canonical 256-bit tokens and persists a SHA-256 digest', () => {
    const first = createCaregiverToken();
    const second = createCaregiverToken();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
    expect(digestCaregiverToken(first)).toBe(createHash('sha256').update(first).digest('hex'));
  });

  it.each([null, '', 'A'.repeat(42), 'A'.repeat(43) + '=', 'A'.repeat(42) + 'B', 'A'.repeat(42) + '/'])(
    'rejects invalid or noncanonical token %s',
    (value) => expect(digestCaregiverToken(value)).toBeNull(),
  );

  it('accepts only a sharing operation chosen by the patient', () => {
    expect(caregiverActionSchema.parse({ action: 'enable' })).toEqual({ action: 'enable' });
    expect(caregiverActionSchema.parse({ action: 'disable' })).toEqual({ action: 'disable' });
    expect(caregiverActionSchema.safeParse({ action: 'enable', patientId: 'other' }).success).toBe(false);
    expect(caregiverActionSchema.safeParse({ action: 'read' }).success).toBe(false);
  });
});
