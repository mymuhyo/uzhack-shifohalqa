import { expect, test, type APIResponse, type Page } from 'playwright/test';

const mobile = '/api/mobile/v1';
const medicine = 'Namuna Android dori';
const doseTime = '08:45';

async function enterDoctor(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Shifokor sifatida kirish' }).click();
  await expect(page).toHaveURL('/doctor');
}

async function issuePairing(page: Page) {
  await page.getByRole('button', { name: 'Android ulash kodini olish', exact: true }).click();
  const codeDisplay = page.getByTestId('android-pair-code');
  await expect(codeDisplay).toHaveText(/^[a-f0-9]{32}$/);
  return (await codeDisplay.innerText()).trim();
}

async function bearerFromPairing(response: APIResponse) {
  await expect(response).toBeOK();
  const { token, expiresAt } = await response.json() as { token: string; expiresAt: string };
  expect(token).toEqual(expect.any(String));
  expect(token.length).toBeGreaterThan(32);
  expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
  return { Authorization: `Bearer ${token}` };
}

test('pairs Android with one demo workspace and returns the doctor reply to the exact medication record', async ({ page, browser, request, baseURL }) => {
  test.setTimeout(90_000);

  const anonymous = await request.get(`${mobile}/today`);
  expect(anonymous.status()).toBe(401);
  expect(await anonymous.json()).toEqual({ error: 'unauthorized' });

  await enterDoctor(page);
  const code = await issuePairing(page);
  const redeem = (pairingCode: string) => request.post(`${mobile}/pair`, { data: { code: pairingCode } });
  const pairingAttempts = await Promise.all([redeem(code), redeem(code)]);
  const paired = pairingAttempts.filter((response) => response.ok());
  const rejected = pairingAttempts.filter((response) => !response.ok());
  expect(paired).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(rejected[0].status()).toBe(401);
  expect(await rejected[0].json()).toEqual({ error: 'invalid_code' });
  const headers = await bearerFromPairing(paired[0]);

  const readToday = () => request.get(`${mobile}/today`, { headers });
  const emptyPlan = await readToday();
  await expect(emptyPlan).toBeOK();
  expect(await emptyPlan.json()).toMatchObject({ patientName: 'Anvar aka', tasks: [], replies: [] });

  await page.getByLabel('Dori nomi').fill(medicine);
  await page.getByLabel('Dori vaqti').fill(doseTime);
  await page.getByRole('checkbox', { name: /Dori tugadi/ }).check();
  await page.getByRole('button', { name: 'Rejani biriktirish' }).click();
  await expect(page.getByRole('heading', { name: 'Biriktirilgan reja' })).toBeVisible();

  const today = await readToday();
  await expect(today).toBeOK();
  expect(today.headers()['cache-control']).toContain('no-store');
  const planned = await today.json() as { date: string; tasks: Array<{ id: string }> };
  expect(planned).toMatchObject({
    patientName: 'Anvar aka', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), replies: [],
    tasks: [{ id: expect.any(String), title: medicine, time: doseTime, record: null }],
  });
  const taskId = planned.tasks[0].id;
  const save = (authorization: typeof headers) => request.post(`${mobile}/evidence`, {
    headers: authorization,
    data: { taskId, medicationStatus: 'missed', reason: 'out_of_supply' },
  });

  const otherContext = await browser.newContext({ baseURL });
  try {
    const otherDoctor = await otherContext.newPage();
    await enterDoctor(otherDoctor);
    const otherHeaders = await bearerFromPairing(await redeem(await issuePairing(otherDoctor)));
    const denied = await save(otherHeaders);
    expect(denied.status()).toBe(404);
    expect(await denied.json()).toEqual({ error: 'not_found' });

    const results = await Promise.all([save(headers), save(headers)]);
    for (const response of results) await expect(response).toBeOK();
    const outcomes = await Promise.all(results.map(async (response) => (await response.json()).result));
    expect(outcomes.sort()).toEqual(['already_saved', 'saved']);

    const beforeReview = await readToday();
    await expect(beforeReview).toBeOK();
    const pending = await beforeReview.json() as { tasks: Array<{ record: { id: string } }> };
    expect(pending).toMatchObject({
      tasks: [{ id: taskId, record: { id: expect.any(String), status: 'missed', reason: 'out_of_supply', reply: null } }],
      replies: [],
    });
    const recordId = pending.tasks[0].record.id;

    await page.reload();
    const queue = page.getByRole('region', { name: 'Bemorlar navbati' });
    const entry = queue.getByRole('article', { name: 'Dori tugadi' });
    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText('L0');
    await entry.getByText('Ko‘rib chiqish', { exact: true }).click();
    await expect(entry.getByText(recordId, { exact: true })).toBeVisible();
    const reply = 'Qaydingizni ko‘rdim. Dori ta’minoti bo‘yicha bog‘lanaman.';
    const internalNote = 'Faqat shifokor uchun sintetik izoh';
    await entry.getByLabel('Bemorga javob').fill(reply);
    await entry.getByLabel('Ichki izoh (ixtiyoriy)').fill(internalNote);
    await entry.getByRole('button', { name: 'Qaydni tasdiqlash' }).click();
    await expect(page.getByRole('region', { name: 'Ko‘rib chiqilgan qaydlar' })
      .getByRole('article', { name: 'Dori tugadi' })).toContainText('L4');

    const afterReview = await readToday();
    await expect(afterReview).toBeOK();
    const reviewed = await afterReview.json();
    const review = { body: reply, decision: 'approved', reviewedAt: expect.any(String) };
    expect(reviewed).toMatchObject({
      tasks: [{ id: taskId, record: { id: recordId, reply: review } }],
      replies: [{ recordId, taskTitle: medicine, date: planned.date, ...review }],
    });
    expect(JSON.stringify(reviewed)).not.toContain(internalNote);

    const otherToday = await request.get(`${mobile}/today`, { headers: otherHeaders });
    await expect(otherToday).toBeOK();
    expect(await otherToday.json()).toMatchObject({ tasks: [], replies: [] });

    const replacement = await issuePairing(page);
    const revoked = await readToday();
    expect(revoked.status()).toBe(401);
    expect(await revoked.json()).toEqual({ error: 'unauthorized' });
    const nextHeaders = await bearerFromPairing(await redeem(replacement));
    const relinked = await request.get(`${mobile}/today`, { headers: nextHeaders });
    expect(await relinked.json()).toMatchObject({ replies: [{ recordId, ...review }] });
  } finally {
    await otherContext.close();
  }
});
