import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caregiverActionSchema, createCaregiverToken, digestCaregiverToken } from '../../src/lib/caregiver';

const dbMock = vi.hoisted(() => ({
  queryResult: [] as Record<string, unknown>[],
  txResults: [[], [], [], []] as Record<string, unknown>[][],
}));

vi.mock('../../src/lib/db', () => {
  const makeSql = () => {
    const fn = vi.fn(async () => dbMock.queryResult) as unknown as {
      (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>;
      transaction: (
        cb: (tx: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>) => readonly Promise<Record<string, unknown>[]>[],
      ) => Promise<Record<string, unknown>[][]>;
    };
    fn.transaction = async (cb) => {
      const tx = vi.fn(async () => []);
      cb(tx);
      return dbMock.txResults;
    };
    return fn;
  };
  return {
    getDatabase: vi.fn(() => makeSql()),
  };
});

import { POST as ackPost } from '../../src/app/api/caregiver/ack/route';
import { acknowledgeCaregiverHelp, readCaregiverSummary } from '../../src/lib/caregiver-store';
import { ensureDemoWorkspace } from '../../src/lib/seed';

beforeEach(() => {
  dbMock.queryResult = [];
  dbMock.txResults = [[], [], [], []];
  vi.stubEnv('DEMO_MODE', 'false');
  vi.stubEnv('SESSION_SECRET', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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

  it('reads caregiver summary and acknowledges help even when DEMO_MODE is false', async () => {
    const token = createCaregiverToken();
    dbMock.queryResult = [{
      local_date: '2026-11-24',
      observed_at: '2026-11-24T08:00:00.000Z',
      due: [{ planItemId: '11111111-1111-4111-8111-111111111111', scheduledDate: '2026-11-24', status: 'taken' }],
      supply_needed: false,
      open_reviews: false,
      reviewed_today: true,
      ack_kind: null,
      ack_at: null,
    }];

    const summary = await readCaregiverSummary(token);
    expect(summary).toEqual({
      observedAt: '2026-11-24T08:00:00.000Z',
      counts: { scheduled: 1, answered: 1, completed: 1 },
      statusSignal: 'doctor_replied',
      caregiverAck: null,
    });

    dbMock.queryResult = [{
      kind: 'supply_on_the_way',
      createdAt: '2026-11-24T08:05:00.000Z',
    }];
    const ack = await acknowledgeCaregiverHelp(token, 'supply_on_the_way');
    expect(ack).toEqual({
      status: 'saved',
      kind: 'supply_on_the_way',
      createdAt: '2026-11-24T08:05:00.000Z',
    });
  });

  it('POST /api/caregiver/ack succeeds same-origin and rejects cross-origin with DEMO_MODE=false', async () => {
    const token = createCaregiverToken();
    const origin = 'https://clinic.example.test';
    dbMock.queryResult = [{
      kind: 'checked_in',
      createdAt: '2026-11-24T08:10:00.000Z',
    }];

    const okResponse = await ackPost(new NextRequest(`${origin}/api/caregiver/ack`, {
      method: 'POST',
      headers: {
        origin,
        host: new URL(origin).host,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token, kind: 'checked_in' }),
    }));
    expect(okResponse.status).toBe(200);
    await expect(okResponse.json()).resolves.toEqual({
      status: 'saved',
      kind: 'checked_in',
      createdAt: '2026-11-24T08:10:00.000Z',
    });

    const crossOriginResponse = await ackPost(new NextRequest(`${origin}/api/caregiver/ack`, {
      method: 'POST',
      headers: {
        origin: 'https://evil.example.test',
        host: new URL(origin).host,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ token, kind: 'checked_in' }),
    }));
    expect(crossOriginResponse.status).toBe(403);
  });

  it('ensureDemoWorkspace fails closed and returns null when actorRows is empty', async () => {
    dbMock.txResults = [[], [], [], []];
    await expect(ensureDemoWorkspace('22222222-2222-4222-8222-222222222222')).resolves.toBeNull();
  });
});
