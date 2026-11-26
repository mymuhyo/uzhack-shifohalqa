import { expect, it, vi } from 'vitest';

const { link, getLink, getView, getActivity, getTask, saveEvidence } = vi.hoisted(() => ({
  link: { actor: { role: 'patient', workspaceId: 'workspace', patientId: 'patient', isDemo: false }, detailsEnabled: false },
  getLink: vi.fn(), getView: vi.fn(), getActivity: vi.fn(), getTask: vi.fn(), saveEvidence: vi.fn(),
}));
vi.mock('../../src/lib/telegram-store', () => ({ getTelegramPatientLink: getLink }));
vi.mock('../../src/lib/clinical-store', () => ({
  getClinicalView: getView, getTaskContext: getTask, saveEvidence,
}));
vi.mock('../../src/lib/activity-store', () => ({ getActivityDashboard: getActivity }));

import { GET, POST } from '../../src/app/api/telegram/bridge/route';

const secret = 'example-bot-service-secret-for-tests-only';
const taskId = '10000000-0000-4000-8000-000000000001';

function request(token: string, body?: object) {
  return new Request('https://preview.example/api/telegram/bridge', {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, 'x-telegram-chat-id': '42', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

it('keeps the default response generic and resolves the private chat only after bot authentication', async () => {
  vi.stubEnv('TELEGRAM_BOT_SERVICE_SECRET', secret);
  getLink.mockResolvedValue(link);
  expect((await GET(request('wrong'))).status).toBe(401);
  expect(getLink).not.toHaveBeenCalled();
  expect(await (await GET(request(secret))).json()).toEqual({ detailsEnabled: false });
  expect(getLink).toHaveBeenCalledWith(42);
  expect(getView).not.toHaveBeenCalled();
});

it('checks the current opt-in before applying an old dose action', async () => {
  vi.stubEnv('TELEGRAM_BOT_SERVICE_SECRET', secret);
  getLink.mockResolvedValue(link);
  const response = await POST(request(secret, { action: 'dose', taskId, medicationStatus: 'taken' }));
  expect(response.status).toBe(403);
  expect(getTask).not.toHaveBeenCalled();
  expect(saveEvidence).not.toHaveBeenCalled();
});
