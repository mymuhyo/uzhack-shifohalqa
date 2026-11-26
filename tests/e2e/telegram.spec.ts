import { createHmac } from 'node:crypto';
import { expect, test, type Page } from 'playwright/test';
import { createDatabase } from '../../src/lib/db';

const management = '/api/demo/telegram';
const webhook = `http://127.0.0.1:${process.env.SHIFO_E2E_TELEGRAM_PORT ?? '3420'}/api/telegram/webhook`;
const botUsername = 'shifohalqa_e2e_bot';
const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '123456789:shifohalqa_e2e_not_a_live_telegram_token';
const webhookSecret = 'shifohalqa-e2e-webhook-secret';
const appUrl = 'https://shifohalqa.example.test/';

function signTelegramInitData(user: { id: number; first_name: string; username?: string }, authDate: number): string {
  const fields: Record<string, string> = {
    auth_date: String(authDate),
    query_id: `q-${authDate}-${user.id}`,
    user: JSON.stringify(user),
  };
  const dataCheckString = Object.entries(fields)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
}

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

async function issuePatientPairing(page: Page): Promise<string> {
  const res = await page.request.post(management, {
    headers: { Origin: new URL(page.url()).origin },
    data: { action: 'pair' },
  });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { href?: string };
  expect(body.href).toBeTruthy();
  const url = new URL(body.href!);
  expect(url.origin).toBe('https://t.me');
  expect(url.pathname).toBe(`/${botUsername}`);
  const code = url.searchParams.get('start');
  expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return code!;
}

function telegramStatus(page: Page) {
  return page.getByRole('region', { name: 'Telegram bildirishnomalari' }).getByRole('status');
}

test.describe.serial('Telegram bot, bridge and Mini App end-to-end', () => {
  test('Telegram isolates workspaces, retries a throttled red notice and ignores stale stop commands', async ({ page, browser, request, baseURL }) => {
    test.setTimeout(90_000);

    const chatId = Number(process.env.SHIFO_E2E_TELEGRAM_CHAT_ID);
    expect(Number.isSafeInteger(chatId) && chatId > 0).toBe(true);
    const otherChatId = chatId + 1;
    let updateId = 1;
    const commandDate = Math.floor(Date.now() / 1000);
    const update = (
      text: string,
      { id = chatId, secret = webhookSecret, group = false, eventId = updateId++, date = commandDate } = {},
    ) =>
      request.post(webhook, {
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
    const manage = (actor: Page, action: 'pair' | 'disconnect', origin = baseURL!) =>
      actor.request.post(management, {
        headers: { Origin: origin },
        data: { action },
      });
    const sql = createDatabase(process.env.SHIFO_E2E_DATABASE_URL!);
    try {
      const readNotices = async () =>
        Array.from(
          await sql`
            SELECT notice.delivery_status AS status, flag.color
            FROM public.telegram_flag_notices AS notice
            JOIN public.flags AS flag ON flag.workspace_id = notice.workspace_id AND flag.id = notice.flag_id
            JOIN public.telegram_doctor_links AS link ON link.workspace_id = notice.workspace_id
              AND link.doctor_id = notice.doctor_id AND link.link_id = notice.link_id
            WHERE link.chat_id = ${chatId}
            ORDER BY notice.created_at
          `,
        );

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
      expect(await (await update(`/start ${pairCode}`, { id: otherChatId })).json()).toMatchObject({
        chat_id: otherChatId,
        text: expect.stringContaining('yaroqsiz'),
      });
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
        expect(await (await update(`/start ${otherPairCode}`)).json()).toMatchObject({
          chat_id: chatId,
          text: expect.stringContaining('yaroqsiz'),
        });
        await otherDoctor.getByRole('button', { name: 'Ulanishni tekshirish' }).click();
        await expect(telegramStatus(otherDoctor)).toContainText('Telegram ulanmagan.');

        await enterRole(page, 'patient');
        await expect(page.getByRole('region', { name: 'Telegram bildirishnomalari' })).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Telegram botini ochish' })).toHaveAttribute('href', `https://t.me/${botUsername}`);
        expect((await request.post(management, { headers: { Origin: baseURL! }, data: { action: 'pair' } })).status()).toBe(403);
        await issuePatientPairing(page);
        expect((await manage(page, 'disconnect')).status()).toBe(204);

        const unlinkedToday = await update('/bugun', { id: otherChatId });
        await expect(unlinkedToday).toBeOK();
        expect(await unlinkedToday.json()).toEqual({
          method: 'sendMessage',
          chat_id: otherChatId,
          text: 'Bugungi vazifalarni ShifoHalqada oching.',
          reply_markup: {
            inline_keyboard: [
              [{ text: 'ShifoHalqa Mini App', style: 'primary', web_app: { url: `${appUrl}tg?focus=patient` } }],
              [
                { text: 'Mashqlar (3 ta)', style: 'primary', web_app: { url: `${appUrl}tg?focus=patient&tab=exercise` } },
                { text: 'Brauzerda ochish', url: appUrl },
              ],
            ],
          },
        });

        const doctorToday = await update('/bugun');
        await expect(doctorToday).toBeOK();
        expect(await doctorToday.json()).toMatchObject({
          method: 'sendMessage',
          chat_id: chatId,
          text: expect.stringContaining('Shifokor holati ·'),
          reply_markup: {
            inline_keyboard: [[{ text: 'Shifokor navbatini ochish', style: 'primary', web_app: { url: `${appUrl}tg?focus=doctor` } }]],
          },
        });

        await page.getByText('Icha olmadim', { exact: true }).click();
        await page.getByLabel('Nega icha olmadingiz?').selectOption('out_of_supply');
        await page.getByRole('button', { name: 'Sababni yuborish' }).click();
        await expect(page.getByText('Icha olmadim · Dori tugadi')).toBeVisible();
        const yellow = Array.from(
          await sql`
            SELECT flag.color FROM public.flags AS flag
            JOIN public.telegram_doctor_links AS link ON link.workspace_id = flag.workspace_id
            WHERE link.chat_id = ${chatId}
          `,
        );
        expect(yellow).toEqual([{ color: 'yellow' }]);
        expect(await readNotices()).toEqual([]);

        const pressureForm = page.getByRole('form', { name: 'Qon bosimi (mm sim. ust.)' });
        const taskId = await pressureForm.locator('[name="taskId"]').getAttribute('value');
        expect(taskId).toBeTruthy();
        const saveRed = () =>
          page.request.post('/api/demo/evidence', {
            headers: { Origin: baseURL! },
            maxRedirects: 0,
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
        expect(await (await update('/stop', { eventId: stopId })).json()).toEqual({
          method: 'sendMessage',
          chat_id: chatId,
          text: 'Telegram xabarlari o‘chirildi.',
        });
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

  test('Mini App iframe Bearer auth (Light/Dark), multi-dose bot flow, opt-in privacy, L4 brief notice and unlink revocation', async ({ page, browser, request, baseURL }) => {
    test.setTimeout(120_000);

    const chatId = Number(process.env.SHIFO_E2E_TELEGRAM_CHAT_ID);
    expect(Number.isSafeInteger(chatId) && chatId > 0).toBe(true);
    let updateId = 1000;
    const baseCommandDate = Math.floor(Date.now() / 1000) + 120;

    const sendWebhookMessage = (text: string) => {
      const eventId = updateId++;
      return request.post(webhook, {
        headers: { 'X-Telegram-Bot-Api-Secret-Token': webhookSecret },
        data: {
          update_id: eventId,
          message: {
            message_id: eventId,
            date: baseCommandDate,
            chat: { id: chatId, type: 'private' },
            from: { id: chatId, is_bot: false, first_name: 'Anvar' },
            text,
          },
        },
      });
    };

    const sendCallback = (data: string) => {
      const eventId = updateId++;
      return request.post(webhook, {
        headers: { 'X-Telegram-Bot-Api-Secret-Token': webhookSecret },
        data: {
          update_id: eventId,
          callback_query: {
            id: `cb-${eventId}`,
            from: { id: chatId, is_bot: false, first_name: 'Anvar' },
            chat_instance: 'shifo-e2e-instance',
            data,
            message: {
              message_id: 500 + eventId,
              date: baseCommandDate,
              chat: { id: chatId, type: 'private' },
              from: { id: 999999, is_bot: true, first_name: 'DemoBot' },
              text: 'Bugungi holat',
            },
          },
        },
      });
    };

    const sql = createDatabase(process.env.SHIFO_E2E_DATABASE_URL!);
    try {
      // Ensure clean chatId state in case an earlier test aborted prematurely
      await sendWebhookMessage('/stop');

      // 1. Doctor sets up a 2-drug daily regimen on desktop web
      await enterRole(page, 'doctor');
      await page.getByLabel('Dori nomi').fill('Amlodipin');
      await page.getByLabel('Dori vaqti').fill('08:00');
      await page.getByRole('button', { name: /Yana dori qo‘shish/ }).click();
      await page.getByLabel('2-dori nomi').fill('Metformin');
      await page.locator('#medication-time-1').fill('20:00');
      await page.getByRole('button', { name: 'Rejani biriktirish' }).click();
      await expect(page.getByRole('heading', { name: 'Biriktirilgan reja' })).toBeVisible();

      // 2. Patient issues Telegram pairing link and pairs via /start
      await enterRole(page, 'patient');
      const patientCode = await issuePatientPairing(page);
      const startRes = await sendWebhookMessage(`/start ${patientCode}`);
      await expect(startRes).toBeOK();
      const startJson = (await startRes.json()) as {
        method: string;
        text: string;
        reply_markup: { inline_keyboard: Array<Array<{ style?: string; web_app?: { url: string } }>> };
      };
      expect(startJson.method).toBe('sendMessage');
      expect(startJson.text).toContain('Telegram xabarlari ulandi');
      expect(startJson.reply_markup.inline_keyboard[0]?.[0]?.style).toBe('success');

      // 3. Default privacy mode (detailsEnabled = false) hides drug names in /bugun and /maxfiylik
      const maskedTodayRes = await sendWebhookMessage('/bugun');
      await expect(maskedTodayRes).toBeOK();
      const maskedToday = (await maskedTodayRes.json()) as {
        text: string;
        reply_markup: { inline_keyboard: Array<Array<{ text: string; style?: string; callback_data?: string }>> };
      };
      expect(maskedToday.text).toContain('maxfiy rejim');
      expect(maskedToday.text).not.toContain('Amlodipin');
      expect(maskedToday.text).not.toContain('Metformin');
      const pickerButtons = maskedToday.reply_markup.inline_keyboard.flat().filter((btn) => btn.callback_data?.startsWith('dose_pick:'));
      expect(pickerButtons.length).toBe(2);
      expect(pickerButtons[0]?.style).toBe('primary');

      // Tap picker then tap ✓ Ichdim via callback query (EditMessageText + AnswerCallbackQuery)
      const firstTaskId = pickerButtons[0]!.callback_data!.split(':')[1]!;
      const pickCb = await sendCallback(`dose_pick:${firstTaskId}`);
      await expect(pickCb).toBeOK();
      expect(await pickCb.json()).toMatchObject({ method: 'answerCallbackQuery' });

      const takeCb = await sendCallback(`dose_take:${firstTaskId}`);
      await expect(takeCb).toBeOK();
      expect(await takeCb.json()).toMatchObject({
        method: 'answerCallbackQuery',
        text: expect.stringContaining('Dori ichildi'),
      });

      const privacyCmdRes = await sendWebhookMessage('/maxfiylik');
      await expect(privacyCmdRes).toBeOK();
      expect(await privacyCmdRes.json()).toMatchObject({
        method: 'sendMessage',
        text: expect.stringContaining('O‘chiq (maxfiy sukut)'),
      });

      // Log BP & steps via bot commands (default privacy mode hides exact raw values in chat)
      const bpCmdRes = await sendWebhookMessage('/bosim 135/85');
      await expect(bpCmdRes).toBeOK();
      const bpCmdJson = (await bpCmdRes.json()) as { method: string; text: string };
      expect(bpCmdJson.method).toBe('sendMessage');
      expect(bpCmdJson.text).toContain('Qon bosimi saqlandi');
      expect(bpCmdJson.text).not.toContain('135/85');

      const stepsCmdRes = await sendWebhookMessage('/qadam 4800');
      await expect(stepsCmdRes).toBeOK();
      const stepsCmdJson = (await stepsCmdRes.json()) as { method: string; text: string };
      expect(stepsCmdJson.method).toBe('sendMessage');
      expect(stepsCmdJson.text).toContain('Maqsad bajarildi');
      expect(stepsCmdJson.text).not.toContain('4800');

      // 4. Open /tg Mini App inside a brand-new cookie-less iframe context in Dark Mode
      const signedInitData = signTelegramInitData({ id: chatId, first_name: 'Anvar', username: 'anvar_demo' }, Math.floor(Date.now() / 1000));
      const tgDarkContext = await browser.newContext({
        baseURL,
        viewport: { width: 360, height: 800 },
      });
      let capturedBearerHeader = '';
      try {
        const tgPage = await tgDarkContext.newPage();
        const consoleErrors: string[] = [];
        tgPage.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        tgPage.on('request', (req) => {
          if (req.url().includes('/api/clinical/view')) {
            const auth = req.headers()['authorization'] ?? '';
            if (auth.startsWith('Bearer tgm1.')) capturedBearerHeader = auth;
          }
        });

        await tgPage.addInitScript((initData: string) => {
          const makeBtn = () => ({
            isVisible: false,
            setText() {},
            setParams() {},
            show() {
              this.isVisible = true;
            },
            hide() {
              this.isVisible = false;
            },
            enable() {},
            disable() {},
            onClick() {},
            offClick() {},
          });
          (window as unknown as { Telegram?: unknown }).Telegram = {
            WebApp: {
              initData,
              platform: 'android',
              version: '8.0',
              colorScheme: 'dark',
              themeParams: { bg_color: '#0a0a0b', text_color: '#ffffff', secondary_bg_color: '#181a20' },
              safeAreaInset: { top: 20, bottom: 20, left: 0, right: 0 },
              contentSafeAreaInset: { top: 0, bottom: 0, left: 0, right: 0 },
              ready() {},
              expand() {},
              enableClosingConfirmation() {},
              disableClosingConfirmation() {},
              setHeaderColor() {},
              setBackgroundColor() {},
              onEvent() {},
              offEvent() {},
              HapticFeedback: { impactOccurred() {}, notificationOccurred() {}, selectionChanged() {} },
              MainButton: makeBtn(),
              SecondaryButton: makeBtn(),
              BackButton: makeBtn(),
            },
          };
        }, signedInitData);

        await tgPage.goto('/tg?focus=patient');
        await expect(tgPage.getByRole('heading', { name: /Amlodipin/ })).toBeVisible();
        await expect(tgPage.getByRole('heading', { name: /Metformin/ })).toBeVisible();
        expect(capturedBearerHeader).toMatch(/^Bearer tgm1\./);
        expect(await tgDarkContext.cookies()).toEqual([]);

        // Verify dark scheme + responsive 360px layout
        await expect(tgPage.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
        const darkOverflow = await tgPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
        expect(darkOverflow).toBe(false);

        // Switch through all 3 exercises on Mashq tab
        await tgPage.getByRole('tab', { name: 'Mashq' }).click();
        await expect(tgPage.getByText('Reabilitatsiya mashqlari (3 ta harakat)')).toBeVisible();
        await tgPage.getByRole('button', { name: /Tirsakni bukib-yozish mashqi/ }).click();
        await expect(tgPage.getByRole('button', { name: /Tirsakni bukib-yozish mashqi/ })).toHaveAttribute('aria-pressed', 'true');
        await tgPage.getByRole('button', { name: /O‘tirib oyoqni tekislash/ }).click();
        await expect(tgPage.getByRole('button', { name: /O‘tirib oyoqni tekislash/ })).toHaveAttribute('aria-pressed', 'true');

        // Enable chat details opt-in in Maxfiylik tab
        await tgPage.getByRole('tab', { name: 'Maxfiylik' }).click();
        await expect(tgPage.getByText('Maxfiy rejim faol (sukut)')).toBeVisible();
        await tgPage.getByRole('button', { name: 'Chatda batafsil xabarlarni yoqish' }).click();
        await expect(tgPage.getByText('Batafsil xabarlar yoqilgan (opt-in)')).toBeVisible();

        // 5. After opt-in, /bugun & /hisobot reveal detailed plan + Doctor L4 brief reply queues Telegram notice
        const optInTodayRes = await sendWebhookMessage('/bugun');
        await expect(optInTodayRes).toBeOK();
        const optInToday = (await optInTodayRes.json()) as { text: string };
        expect(optInToday.text).toContain('Metformin');
        expect(optInToday.text).toContain('135/85 mmHg');

        const reportCmdRes = await sendWebhookMessage('/hisobot');
        await expect(reportCmdRes).toBeOK();
        expect((await reportCmdRes.json()).text).toContain('7 kunlik hisobot');

        // Doctor generates 7-day brief and approves L4 reply
        await enterRole(page, 'doctor');
        await page.getByRole('button', { name: /7-kunlik xulosa/ }).click();
        const replyBox = page.getByLabel('Bemorga yuboriladigan 7 kunlik shifokor javobi');
        await expect(replyBox).toBeVisible();
        const approvedText = 'Bosim va dori intizomingiz yaxshi, Amlodipin va Metformin jadvalini davom ettiring.';
        await replyBox.fill(approvedText);
        await page.getByRole('button', { name: /L4 tasdiqlash/ }).click();
        await expect(page.getByText(/Tasdiqlangan:/)).toBeVisible();

        // Verify Telegram L4 brief notice is delivered to linked patient chat
        await expect
          .poll(
            async () =>
              Array.from(
                await sql`
                  SELECT notice.delivery_status AS status, notice.kind
                  FROM public.telegram_patient_notices AS notice
                  JOIN public.telegram_patient_links AS link USING (workspace_id, patient_id, link_id)
                  WHERE link.chat_id = ${chatId} AND notice.kind = 'brief_reply'
                `,
              ),
            { timeout: 20_000 },
          )
          .toEqual([{ status: 'sent', kind: 'brief_reply' }]);

        // Refresh Mini App view and verify Hisobot tab displays L4 approved reply
        await tgPage.getByRole('button', { name: 'Ma’lumotlarni yangilash' }).click();
        await tgPage.getByRole('tab', { name: 'Hisobot' }).click();
        await expect(tgPage.getByText('L4 · Tasdiqlandi')).toBeVisible();
        await expect(tgPage.getByText(approvedText)).toBeVisible();

        // 6. Unlink Telegram from Mini App -> tgm1 Bearer token is immediately revoked (401)
        await tgPage.getByRole('tab', { name: 'Maxfiylik' }).click();
        await tgPage.getByRole('button', { name: 'Telegramni uzish' }).click();
        await expect(tgPage.getByText(/Telegram hali ulanmagan|ulanmagan/i)).toBeVisible();

        const revokedCall = await tgPage.request.get('/api/clinical/view', {
          headers: { Authorization: capturedBearerHeader },
        });
        expect(revokedCall.status()).toBe(401);
        expect(await revokedCall.json()).toEqual({ error: 'unauthorized' });
        expect(consoleErrors).toEqual([]);
      } finally {
        await tgDarkContext.close();
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  });
});
