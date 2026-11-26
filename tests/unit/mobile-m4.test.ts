import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  getDatabase: vi.fn(),
  select: vi.fn(),
  getTaskContext: vi.fn(),
  saveEvidence: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@supabase/supabase-js', async (original) => ({
  ...await original<typeof import('@supabase/supabase-js')>(),
  createClient: () => ({
    auth: { signInWithPassword: fixtures.signInWithPassword, getUser: fixtures.getUser },
  }),
}));
vi.mock('../../src/lib/db', () => ({ getDatabase: fixtures.getDatabase }));
vi.mock('../../src/lib/clinical-store', () => ({
  getTaskContext: fixtures.getTaskContext,
  saveEvidence: fixtures.saveEvidence,
}));

import { POST as evidence } from '../../src/app/api/mobile/v1/evidence/route';
import { POST as login } from '../../src/app/api/mobile/v1/login/route';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const patientId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const token = 'fixture.patient.jwt';
const expiresAt = 2_000_000_000;

function request(body: object, authorization?: string) {
  return new Request('https://example.test/api/mobile/v1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fixture');
  fixtures.getDatabase.mockReturnValue(fixtures.select);
  const user = { id: patientId };
  fixtures.signInWithPassword.mockResolvedValue({
    data: { session: { access_token: token, expires_at: expiresAt }, user },
    error: null,
  });
  fixtures.getUser.mockResolvedValue({ data: { user }, error: null });
  fixtures.select.mockResolvedValue([{ workspaceId, patientId, doctorId: null, patientName: 'Bemor', role: 'patient' }]);
});

describe('mobile clinic login', () => {
  it.each(['patient', 'individual'])('returns a stateless no-store session for %s', async (role) => {
    fixtures.select.mockResolvedValueOnce([{ workspaceId, patientId, doctorId: null, patientName: 'Bemor', role }]);
    const response = await login(request({ email: ' Patient@example.test ', password: 'test-password' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(await response.json()).toEqual({
      token, expiresAt: new Date(expiresAt * 1000).toISOString(), workspaceId, patientName: 'Bemor', isDemo: false,
    });
    expect(fixtures.signInWithPassword).toHaveBeenCalledWith({ email: 'patient@example.test', password: 'test-password' });
    expect(fixtures.select.mock.calls[0][0].join(' ')).toContain("cm.status = 'active'");
  });

  it.each(['doctor', 'caregiver', 'demo', 'unlinked'])('denies %s without exposing a token', async (role) => {
    fixtures.select.mockResolvedValueOnce(role === 'unlinked' ? [] : [{
      workspaceId, patientId, doctorId: null, patientName: 'Bemor',
      role: role === 'demo' ? 'patient' : role, isDemo: role === 'demo',
    }]);
    const response = await login(request({ email: 'patient@example.test', password: 'test-password' }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'forbidden' });
  });

  it('distinguishes malformed input from incorrect credentials', async () => {
    fixtures.signInWithPassword.mockResolvedValueOnce({ data: { user: null, session: null }, error: { status: 400 } });
    expect((await login(request({ email: 'invalid', password: 'test-password' }))).status).toBe(400);
    expect((await login(request({ email: 'patient@example.test', password: 'test-password' }))).status).toBe(401);
    expect(fixtures.select).not.toHaveBeenCalled();
  });
});

describe('mobile manual BP', () => {
  const auth = `Bearer ${token}`;
  const targets = { warnSystolic: 140, warnDiastolic: 90, maxSystolic: 160, maxDiastolic: 100, minSystolic: 90, minDiastolic: 60 };

  beforeEach(() => {
    fixtures.getTaskContext.mockResolvedValue({ type: 'vitals', plan: { targets } });
    fixtures.saveEvidence.mockResolvedValue('saved');
  });

  it.each([[170, 105, 'bp_max'], [85, 55, 'bp_low']])('flags %s/%s through the shared rules', async (systolic, diastolic, ruleKey) => {
    const response = await evidence(request({ taskId, systolic, diastolic, chestPain: false }, auth));
    expect(response.status).toBe(200);
    expect(fixtures.saveEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ patientId, workspaceId }),
      expect.objectContaining({
        level: 0, source: 'self_report', aiMode: 'manual',
        payload: { kind: 'vitals', systolic, diastolic, chestPain: false },
        flag: expect.objectContaining({ ruleKey }),
      }),
    );
  });

  it('keeps legacy medication submissions working', async () => {
    fixtures.getTaskContext.mockResolvedValueOnce({ type: 'medication', date: '2026-11-26', plan: { supplyFollowUp: true } });
    const response = await evidence(request({ taskId, medicationStatus: 'missed', reason: 'out_of_supply' }, auth));
    expect(response.status).toBe(200);
    expect(fixtures.saveEvidence).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      aiMode: 'none', source: 'self_report', flag: expect.objectContaining({ ruleKey: 'medication_out_of_supply' }),
    }));
  });

  it.each([
    { systolic: 89, diastolic: 90 },
    { systolic: 300, diastolic: 90 },
    { systolic: 120 },
    { systolic: 120, diastolic: 80, patientId },
    { systolic: 120, diastolic: 80, source: 'device_sensor' },
  ])('rejects invalid or unscoped metadata', async (body) => {
    expect((await evidence(request({ taskId, ...body }, auth))).status).toBe(400);
    expect(fixtures.saveEvidence).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated and mismatched task submissions', async () => {
    expect((await evidence(request({ taskId, systolic: 120, diastolic: 80 }))).status).toBe(401);
    fixtures.getTaskContext.mockResolvedValueOnce({ type: 'medication' });
    expect((await evidence(request({ taskId, systolic: 120, diastolic: 80 }, auth))).status).toBe(404);
    expect(fixtures.saveEvidence).not.toHaveBeenCalled();
  });
});
