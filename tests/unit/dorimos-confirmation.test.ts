import { describe, expect, it, vi } from 'vitest';
import { issueBoxConfirmation, readBoxConfirmation } from '../../src/lib/dorimos-confirmation';

const secret = 'test-signing-secret-with-at-least-32-characters';
const scope = {
  workspaceId: 'a8aa515c-60c9-42b6-ad0a-ed9710a71351',
  taskId: 'f2b5ee25-b406-4732-83f9-f45ce90aeccd',
};
const input = {
  ...scope,
  sampleId: 'box-10mg',
  reading: {
    label: { drugName: 'Namuna dori', strength: 10, unit: 'mg' },
    model: 'test-extraction', decisionModel: 'test-gate', confidence: 0.8,
  },
} as const;

describe('DoriMos patient confirmation', () => {
  it('returns exactly the server-attested reading only in its task and workspace', () => {
    const token = issueBoxConfirmation(input, secret);
    expect(readBoxConfirmation(token, scope, secret)).toMatchObject(input);
    expect(readBoxConfirmation(token, { ...scope, taskId: scope.workspaceId }, secret)).toBeNull();
    expect(readBoxConfirmation(token, { ...scope, workspaceId: scope.taskId }, secret)).toBeNull();
  });

  it('rejects edits and another signing key', () => {
    const token = issueBoxConfirmation(input, secret);
    const [payload, signature] = token.split('.');
    const changed = Buffer.from(Buffer.from(payload, 'base64url').toString().replace('"strength":10', '"strength":5')).toString('base64url');
    expect(readBoxConfirmation(`${changed}.${signature}`, scope, secret)).toBeNull();
    expect(readBoxConfirmation(token, scope, `${secret}-different`)).toBeNull();
  });

  it('expires at ten minutes and does not attest below the OCR threshold', () => {
    vi.useFakeTimers();
    try {
      const token = issueBoxConfirmation(input, secret);
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(readBoxConfirmation(token, scope, secret)).toBeNull();
      expect(() => issueBoxConfirmation({ ...input, reading: { ...input.reading, confidence: 0.799 } }, secret)).toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
