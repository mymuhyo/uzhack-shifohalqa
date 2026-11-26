import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test, type Page } from 'playwright/test';
import { createDatabase } from '../../src/lib/db';

const management = '/api/demo/telegram';
const webhook = `http://127.0.0.1:${process.env.SHIFO_E2E_TELEGRAM_PORT ?? '3420'}/api/telegram/webhook`;
const botUsername = 'shifohalqa_e2e_bot';
const webhookSecret = 'shifohalqa-e2e-webhook-secret';
const appUrl = 'https://shifohalqa.example.test/';
const syntheticBotToken = '123456789:shifohalqa_e2e_not_a_live_telegram_token';
const syntheticBridgeKey = 'shifohalqa-e2e-fake-bridge-key-for-tests';

async function enterRole(page: Page, role: 'doctor' | 'patient') {
  await page.goto('/');
  await page.getByRole('button', { name: role === 'doctor' ? 'Shifokor sifatida kirish' : 'Bemor sifatida kirish' }).click();
  await expect(page).toHaveURL(`/${role}`);
}

async function issuePairing(page: Page) {
  await page.getByRole('button', { name: 'Telegramni ulash', exact: true }).click();
  const link = page.getByRole('link', { name: 'Telegramda ulashni yakunlash' });
  await expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
  const href = await link.getAttribute('href');
  expect(href).toBeTruthy();
  const url = new URL(href!);
  expect(url.origin).toBe('https://t.me');
  expect(url.pathname).toBe(`/${botUsername}`);
  const code = url.searchParams.get('start');
  expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return code!;
}

function telegramStatus(page: Page) {
  return page.getByRole('region', { name: 'Telegram bildirishnomalari' }).getByRole('status');
}

test('Telegram isolates workspaces, retries a throttled red notice and ignores stale stop commands', async ({ page, browser, request, baseURL }) => {
  test.setTimeout(90_000);

  const chatId = Number(process.env.SHIFO_E2E_TELEGRAM_CHAT_ID);
  expect(Number.isSafeInteger(chatId) && chatId > 0).toBe(true);
  const otherChatId = chatId + 1;
  let updateId = 1;
  const commandDate = Math.floor(Date.now() / 1000);
  const update = (text: string, { id = chatId, secret = webhookSecret, group = false, eventId = updateId++, date = commandDate } = {}) => request.post(webhook, {
    headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
    data: {
      update_id: eventId,
      message: {
        message_id: eventId,
        date,
        chat: { id: group ? -id : id, type: group ? 'group' : 'private' },
        from: { id, is_bot: false, first_name: 'Demo' },
        text,
      },
    },
  });
  const manage = (actor: Page, action: 'pair' | 'disconnect', origin = baseURL!) => actor.request.post(management, {
    headers: { Origin: origin }, data: { action },
  });
  const sql = createDatabase(process.env.SHIFO_E2E_DATABASE_URL!);
  try {
    const readNotices = async () => Array.from(await sql`
      SELECT notice.delivery_status AS status, flag.color
      FROM public.telegram_flag_notices AS notice
      JOIN public.flags AS flag ON flag.workspace_id = notice.workspace_id AND flag.id = notice.flag_id
      JOIN public.telegram_doctor_links AS link ON link.workspace_id = notice.workspace_id
        AND link.doctor_id = notice.doctor_id AND link.link_id = notice.link_id
      WHERE link.chat_id = ${chatId}
      ORDER BY notice.created_at
    `);

    await enterRole(page, 'doctor');
    await expect(page.getByRole('region', { name: 'Telegram bildirishnomalari' })).toBeVisible();
    await page.getByLabel('Sistolik yuqori chegara').fill('144');
    await page.getByRole('checkbox', { name: /Dori tugadi/ }).check();
    await page.getByRole('button', { name: 'Rejani biriktirish' }).click();
    await expect(page.getByRole('heading', { name: 'Biriktirilgan reja' })).toBeVisible();
    expect((await manage(page, 'pair', 'https://example.invalid')).status()).toBe(403);

    const pairCode = await issuePairing(page);
    expect((await update(`/start ${pairCode}`, { secret: 'wrong-secret' })).status()).toBe(403);
    const ignored = await update(`/start ${pairCode}`, { group: true });
    expect(ignored.status()).toBe(200);
    expect(await ignored.text()).toBe('');

    const paired = await update(`/start ${pairCode}`);
    await expect(paired).toBeOK();
    expect(await paired.json()).toMatchObject({ method: 'sendMessage', chat_id: chatId, text: 'Telegram xabarlari ulandi.' });
    expect(await (await update(`/start ${pairCode}`, { id: otherChatId })).json()).toMatchObject({ chat_id: otherChatId, text: expect.stringContaining('yaroqsiz') });
    expect(await (await update(`/start ${pairCode}`)).json()).toMatchObject({ chat_id: chatId, text: 'Telegram xabarlari ulandi.' });
    await page.getByRole('button', { name: 'Ulanishni tekshirish' }).click();
    await expect(telegramStatus(page)).toContainText('Telegram ulangan.');
    expect((await manage(page, 'pair')).status()).toBe(409);

    const otherContext = await browser.newContext({ baseURL });
    try {
      const otherDoctor = await otherContext.newPage();
      await enterRole(otherDoctor, 'doctor');
      await expect(telegramStatus(otherDoctor)).toContainText('Telegram ulanmagan.');
      const otherPairCode = await issuePairing(otherDoctor);
      expect(await (await update(`/start ${otherPairCode}`)).json()).toMatchObject({ chat_id: chatId, text: expect.stringContaining('yaroqsiz') });
      await otherDoctor.getByRole('button', { name: 'Ulanishni tekshirish' }).click();
      await expect(telegramStatus(otherDoctor)).toContainText('Telegram ulanmagan.');

      await enterRole(page, 'patient');
      await expect(page.getByRole('region', { name: 'Telegram bildirishnomalari' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Telegram botini ochish' })).toHaveAttribute('href', `https://t.me/${botUsername}`);
      expect((await request.post(management, {
        headers: { Origin: baseURL! }, data: { action: 'pair' },
      })).status()).toBe(403);
      const patientPair = await manage(page, 'pair');
      expect(patientPair.status()).toBe(200);
      const patientPairBody = await patientPair.json() as { href?: string };
      expect(patientPairBody.href).toBeTruthy();
      const patientPairUrl = new URL(patientPairBody.href!);
      expect(patientPairUrl.origin).toBe('https://t.me');
      expect(patientPairUrl.pathname).toBe(`/${botUsername}`);
      expect(patientPairUrl.searchParams.get('start')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect((await manage(page, 'disconnect')).status()).toBe(204);

      const today = await update('/bugun');
      await expect(today).toBeOK();
      expect(await today.json()).toEqual({
        method: 'sendMessage', chat_id: chatId, text: 'Bugungi vazifalarni ShifoHalqada oching.',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'ShifoHalqa Mini App', web_app: { url: `${appUrl}tg?focus=patient` } }],
            [
              { text: 'Mashq tahlili', web_app: { url: `${appUrl}tg?tab=exercise` } },
              { text: 'Brauzerda ochish', url: appUrl },
            ],
          ],
        },
      });

      await page.getByText('Icha olmadim', { exact: true }).click();
      await page.getByLabel('Nega icha olmadingiz?').selectOption('out_of_supply');
      await page.getByRole('button', { name: 'Sababni yuborish' }).click();
      await expect(page.getByText('Icha olmadim · Dori tugadi')).toBeVisible();
      const yellow = Array.from(await sql`
        SELECT flag.color FROM public.flags AS flag
        JOIN public.telegram_doctor_links AS link ON link.workspace_id = flag.workspace_id
        WHERE link.chat_id = ${chatId}
      `);
      expect(yellow).toEqual([{ color: 'yellow' }]);
      expect(await readNotices()).toEqual([]);

      const pressureForm = page.getByRole('form', { name: 'Qon bosimi (mm sim. ust.)' });
      const taskId = await pressureForm.locator('[name="taskId"]').getAttribute('value');
      expect(taskId).toBeTruthy();
      const saveRed = () => page.request.post('/api/demo/evidence', {
        headers: { Origin: baseURL! }, maxRedirects: 0,
        form: { taskId: taskId!, systolic: '144', diastolic: '80' },
      });
      const results = await Promise.all([saveRed(), saveRed()]);
      expect(results.map((result) => result.status())).toEqual([303, 303]);
      expect(results.map((result) => result.headers().location).sort()).toEqual(['/patient', '/patient?result=already_saved']);
      await expect.poll(readNotices, { timeout: 20_000 }).toEqual([{ status: 'sent', color: 'red' }]);

      await enterRole(page, 'doctor');
      await page.getByRole('button', { name: 'Telegramni uzish' }).click();
      await expect(telegramStatus(page)).toContainText('Telegram ulanmagan.');
      expect(await (await update(`/start ${pairCode}`)).json()).toMatchObject({ text: expect.stringContaining('yaroqsiz') });
      expect(await readNotices()).toEqual([]);

      expect(await (await update(`/start ${otherPairCode}`)).json()).toMatchObject({ chat_id: chatId, text: 'Telegram xabarlari ulandi.' });
      await otherDoctor.getByRole('button', { name: 'Ulanishni tekshirish' }).click();
      await expect(telegramStatus(otherDoctor)).toContainText('Telegram ulangan.');
      const stopId = updateId++;
      expect(await (await update('/stop', { eventId: stopId })).json()).toEqual({ method: 'sendMessage', chat_id: chatId, text: 'Telegram xabarlari o‘chirildi.' });
      await otherDoctor.reload();
      await expect(telegramStatus(otherDoctor)).toContainText('Telegram ulanmagan.');

      const newerCode = await issuePairing(otherDoctor);
      expect(await (await update(`/start ${newerCode}`)).json()).toMatchObject({ chat_id: chatId, text: 'Telegram xabarlari ulandi.' });
      const staleStop = await update('/stop', { eventId: stopId });
      await expect(staleStop).toBeOK();
      expect(await staleStop.text()).toBe('');
      await otherDoctor.reload();
      await expect(telegramStatus(otherDoctor)).toContainText('Telegram ulangan.');

      const freshStop = await update('/stop', { eventId: 1, date: commandDate + 7 * 86_400 + 1 });
      expect(await freshStop.json()).toMatchObject({ chat_id: chatId, text: 'Telegram xabarlari o‘chirildi.' });
      await otherDoctor.reload();
      await expect(telegramStatus(otherDoctor)).toContainText('Telegram ulanmagan.');
    } finally {
      await otherContext.close();
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
});

test('linked Mini App works in an iframe and shares a private, exact dose workflow with chat', async ({ page, browser, request, baseURL }) => {
  test.setTimeout(90_000);
  const chatId = Number(process.env.SHIFO_E2E_TELEGRAM_CHAT_ID) + 2;
  await enterRole(page, 'doctor');
  const plan = await page.request.post('/api/clinical/plan', {
      headers: { Origin: baseURL! },
      data: {
        medications: [
          { name: 'Dori A', strength: 5, strengthUnit: 'mg', times: ['08:00', '20:00'] },
          { name: 'Dori B', strength: 10, strengthUnit: 'mg', times: ['08:00'] },
        ],
        vitalsTime: '09:00',
        maxSystolic: 160, warnSystolic: 140, maxDiastolic: 100, warnDiastolic: 90,
        supplyFollowUp: true,
      },
  });
  await expect(plan).toBeOK();
  await enterRole(page, 'patient');
  const pairing = await page.request.post(management, {
    headers: { Origin: baseURL! }, data: { action: 'pair' },
  });
  await expect(pairing).toBeOK();
  const code = new URL((await pairing.json()).href).searchParams.get('start');
  const paired = await request.post(webhook, {
    headers: { 'X-Telegram-Bot-Api-Secret-Token': webhookSecret },
    data: {
      update_id: 30,
      message: {
        message_id: 30, date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'private' },
        from: { id: chatId, is_bot: false, first_name: 'Demo' },
        text: `/start ${code}`,
      },
    },
  });
  expect(await paired.json()).toMatchObject({ text: 'Telegram xabarlari ulandi.' });

  const launch = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: chatId }), query_id: 'synthetic',
  });
  const check = [...launch].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  launch.set('hash', createHmac('sha256', createHmac('sha256', 'WebAppData').update(syntheticBotToken).digest())
    .update(check).digest('hex'));
  const auth = await request.post('/api/telegram/auth', { data: { initData: launch.toString() } });
  await expect(auth).toBeOK();
  expect(auth.headers()['set-cookie']).toBeUndefined();
  const patientHeaders = { Authorization: `Bearer ${(await auth.json()).token}` };
  expect((await request.get('/api/mobile/v1/today', { headers: patientHeaders })).status()).toBe(401);

  const bridge = '/api/telegram/bridge';
  const workerHeaders = { Authorization: `Bearer ${syntheticBridgeKey}`, 'X-Telegram-Chat-Id': String(chatId) };
  expect(await (await request.get(bridge, { headers: workerHeaders })).json()).toEqual({ detailsEnabled: false });

  const isolated = await browser.newContext({ viewport: { width: 360, height: 840 } });
  const sql = createDatabase(process.env.SHIFO_E2E_DATABASE_URL!);
  const host = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(`<iframe title="Telegram" src="${baseURL}/tg?tab=privacy" style="width:100%;height:95vh;border:0"></iframe>`);
  });
  try {
    // Chromium classifies a fulfilled navigation without a real connection as a public origin.
    await new Promise<void>((resolve, reject) => {
      host.once('error', reject);
      host.listen(0, '127.0.0.1', resolve);
    });
    const address = host.address() as AddressInfo;
    await isolated.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
      contentType: 'application/javascript',
      body: `window.Telegram = { WebApp: { initData: ${JSON.stringify(launch.toString())}, colorScheme: "dark" } };`,
    }));
    const embedded = await isolated.newPage();
    await embedded.goto(`http://localhost:${address.port}/telegram-harness`);
    const mini = embedded.frameLocator('iframe');
    await expect(mini.getByRole('button', { name: 'Tafsilotlarni yoqish' })).toBeVisible({ timeout: 15_000 });
    await mini.getByRole('button', { name: 'Tafsilotlarni yoqish' }).click();
    await expect(mini.getByRole('button', { name: 'Tafsilotlarni o‘chirish' })).toBeVisible();
    await expect(mini.getByText('Chat tafsilotlari', { exact: true })).toHaveCSS('color', 'rgb(245, 247, 250)');
    const snapshot = await (await request.get(bridge, { headers: workerHeaders })).json();
    expect(snapshot.doses.map((dose: { time: string }) => dose.time)).toEqual(['08:00', '08:00', '20:00']);
    expect(new Set(snapshot.doses.map((dose: { id: string }) => dose.id)).size).toBe(3);
    const taskId: string = snapshot.doses[0].id;
    const persist = () => request.post(bridge, {
      headers: workerHeaders,
      data: { action: 'dose', taskId, medicationStatus: 'missed', reason: 'out_of_supply' },
    });
    expect(await (await persist()).json()).toEqual({ status: 'saved', queued: true });
    expect(await (await persist()).json()).toEqual({ status: 'already_saved', queued: false });
    const dashboard = await (await request.get('/api/telegram/patient', { headers: patientHeaders })).json();
    const savedDose = dashboard.tasks.find((task: { id: string }) => task.id === taskId);
    expect(savedDose.status).toBe('missed');
    expect(dashboard.tasks.filter((task: { type: string; status: string }) => task.type === 'medication' && task.status === 'pending')).toHaveLength(2);
    const flagId: string = savedDose.evidence.flagId;
    expect(flagId).toMatch(/^[a-f0-9-]{36}$/);
    await enterRole(page, 'doctor');
    const reviewed = await page.request.post('/api/clinical/review', {
      headers: { Origin: baseURL! },
      data: { flagId, decision: 'approved', reply: 'Tasdiqlangan sinov javobi.', note: 'Ichki sinov eslatmasi.' },
    });
    await expect(reviewed).toBeOK();
    const delivered = () => sql`
      SELECT notice.delivery_status AS status, notice.attempted_at IS NOT NULL AS attempted
      FROM public.telegram_patient_notices AS notice
      JOIN public.telegram_patient_links AS link USING (workspace_id, patient_id, link_id)
      WHERE link.chat_id = ${chatId} AND notice.ref_id = ${flagId}
    `.then((rows) => Array.from(rows));
    await expect.poll(delivered, { timeout: 15000 }).toEqual([{ status: 'pending', attempted: true }]);

    await mini.getByRole('button', { name: 'Tafsilotlarni o‘chirish' }).click();
    await expect(mini.getByRole('button', { name: 'Tafsilotlarni yoqish' })).toBeVisible();
    expect((await persist()).status()).toBe(403);
    await expect.poll(delivered, { timeout: 18000 }).toEqual([{ status: 'sent', attempted: true }]);
    const exact = await request.get(`/api/telegram/patient?kind=doctor_reply&reply=${flagId}`, { headers: patientHeaders });
    await expect(exact).toBeOK();
    expect(await exact.json()).toEqual({ reply: { id: flagId, kind: 'doctor_reply', body: 'Tasdiqlangan sinov javobi.' } });
    await mini.getByRole('button', { name: 'Mashqlar', exact: true }).click();
    await expect(mini.getByRole('button', { name: 'Oyoqni tekislash', exact: true })).toBeVisible();
    await mini.getByRole('button', { name: 'Oyoqni tekislash', exact: true }).click();
    await expect(mini.getByText('Namuna mashqi', { exact: false })).toBeVisible();
    expect(await mini.locator('body').evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(360);
  } finally {
    await isolated.close();
    if (host.listening) await new Promise<void>((resolve) => { host.close(() => resolve()); });
    await sql.end({ timeout: 5 });
    await enterRole(page, 'patient');
    await page.request.post(management, { headers: { Origin: baseURL! }, data: { action: 'disconnect' } });
  }
  expect((await request.get('/api/telegram/patient', { headers: patientHeaders })).status()).toBe(401);
});
