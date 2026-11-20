import { neon } from '@neondatabase/serverless';
import { expect, test, type Page } from 'playwright/test';

const management = '/api/demo/telegram';
const webhook = 'http://127.0.0.1:3420/api/telegram/webhook';
const botUsername = 'shifohalqa_e2e_bot';
const webhookSecret = 'shifohalqa-e2e-webhook-secret';
const appUrl = 'https://shifohalqa.example.test/';

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

test('private Telegram pairing isolates workspaces and delivers exactly one privacy-safe red notice after a duplicate submit', async ({ page, browser, request, baseURL }) => {
  test.setTimeout(90_000);

  const chatId = Number(process.env.SHIFO_E2E_TELEGRAM_CHAT_ID);
  expect(Number.isSafeInteger(chatId) && chatId > 0).toBe(true);
  const otherChatId = chatId + 1;
  let updateId = 1;
  const update = (text: string, id = chatId, secret = webhookSecret, group = false) => request.post(webhook, {
    headers: { 'X-Telegram-Bot-Api-Secret-Token': secret },
    data: {
      update_id: updateId++,
      message: {
        message_id: updateId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: group ? -id : id, type: group ? 'group' : 'private' },
        from: { id, is_bot: false, first_name: 'Demo' },
        text,
      },
    },
  });
  const manage = (actor: Page, action: 'pair' | 'disconnect', origin = baseURL!) => actor.request.post(management, {
    headers: { Origin: origin }, data: { action },
  });
  const sql = neon(process.env.SHIFO_E2E_DATABASE_URL!);
  const readNotices = () => sql`
    SELECT notice.delivery_status AS status, flag.color
    FROM shifohalqa.telegram_flag_notices AS notice
    JOIN shifohalqa.flags AS flag ON flag.workspace_id = notice.workspace_id AND flag.id = notice.flag_id
    JOIN shifohalqa.telegram_doctor_links AS link ON link.workspace_id = notice.workspace_id
      AND link.doctor_id = notice.doctor_id AND link.link_id = notice.link_id
    WHERE link.chat_id = ${chatId}
    ORDER BY notice.created_at
  `;

  await enterRole(page, 'doctor');
  await expect(page.getByRole('region', { name: 'Telegram bildirishnomalari' })).toBeVisible();
  await page.getByLabel('Sistolik yuqori chegara').fill('144');
  await page.getByRole('checkbox', { name: /Dori tugadi/ }).check();
  await page.getByRole('button', { name: 'Rejani biriktirish' }).click();
  await expect(page.getByRole('heading', { name: 'Biriktirilgan reja' })).toBeVisible();
  expect((await manage(page, 'pair', 'https://example.invalid')).status()).toBe(403);

  const pairCode = await issuePairing(page);
  expect((await update(`/start ${pairCode}`, chatId, 'wrong-secret')).status()).toBe(403);
  const ignored = await update(`/start ${pairCode}`, chatId, webhookSecret, true);
  expect(ignored.status()).toBe(200);
  expect(await ignored.text()).toBe('');

  const paired = await update(`/start ${pairCode}`);
  await expect(paired).toBeOK();
  expect(await paired.json()).toMatchObject({ method: 'sendMessage', chat_id: chatId, text: 'Telegram xabarlari ulandi.' });
  expect(await (await update(`/start ${pairCode}`, otherChatId)).json()).toMatchObject({ chat_id: otherChatId, text: expect.stringContaining('yaroqsiz') });
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
    expect((await manage(page, 'pair')).status()).toBe(403);
    expect((await manage(page, 'disconnect')).status()).toBe(403);

    const today = await update('/bugun');
    await expect(today).toBeOK();
    expect(await today.json()).toEqual({
      method: 'sendMessage', chat_id: chatId, text: 'Bugungi vazifalarni ShifoHalqada oching.',
      reply_markup: { inline_keyboard: [[{ text: 'ShifoHalqani ochish', url: appUrl }]] },
    });

    await page.getByText('Icha olmadim', { exact: true }).click();
    await page.getByLabel('Nega icha olmadingiz?').selectOption('out_of_supply');
    await page.getByRole('button', { name: 'Sababni yuborish' }).click();
    await expect(page.getByText('Icha olmadim · Dori tugadi')).toBeVisible();
    const yellow = await sql`
      SELECT flag.color FROM shifohalqa.flags AS flag
      JOIN shifohalqa.telegram_doctor_links AS link ON link.workspace_id = flag.workspace_id
      WHERE link.chat_id = ${chatId}
    `;
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
    expect(await (await update('/stop')).json()).toEqual({ method: 'sendMessage', chat_id: chatId, text: 'Telegram xabarlari o‘chirildi.' });
    await otherDoctor.reload();
    await expect(telegramStatus(otherDoctor)).toContainText('Telegram ulanmagan.');
  } finally {
    await otherContext.close();
  }
});
