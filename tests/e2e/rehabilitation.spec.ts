import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from 'playwright/test';

const mobile = '/api/mobile/v1/exercise';

async function enter(page: Page, role: 'doctor' | 'patient') {
  await page.goto('/');
  await page.getByRole('button', { name: role === 'doctor' ? 'Shifokor sifatida kirish' : 'Bemor sifatida kirish' }).click();
}

test('pairs Android, sends one pain report after retry and returns only its review', async ({ page, browser }) => {
  test.setTimeout(90_000);
  expect((await page.request.get(mobile)).status()).toBe(401);
  await enter(page, 'doctor');
  await page.getByRole('button', { name: 'Mashqni biriktirish' }).click();
  await expect(page.getByText(/Reja: 5 takror/)).toBeVisible();
  const origin = new URL(page.url()).origin;
  const pairing = await page.request.post('/api/demo/android/pairing', { headers: { Origin: origin } });
  const paired = await page.request.post('/api/mobile/v1/pair', { data: { code: (await pairing.json()).code } });
  const headers = { Authorization: `Bearer ${(await paired.json()).token}` };
  const read = () => page.request.get(mobile, { headers });
  const before = await read();
  await expect(before).toBeOK();
  expect(before.headers()['cache-control']).toContain('no-store');
  const { plan, date } = await before.json();
  const data = { clientAttemptId: randomUUID(), prescriptionId: plan.id, scheduledDate: date,
    evidence: { source: 'self_report', reason: 'pain' } };
  const send = (body: object) => page.request.post(mobile, { headers, data: body });
  expect((await send({ ...data, prescriptionId: randomUUID() })).status()).toBe(404);
  const future = await send({ ...data, scheduledDate: '9999-01-01' });
  expect(future.status()).toBe(422);
  expect(await future.json()).toEqual({ error: 'stale' });
  expect((await send({ ...data, evidence: { ...data.evidence, video: 'forged' } })).status()).toBe(400);
  const responses = await Promise.all([send(data), send(data)]);
  const results = await Promise.all(responses.map(response => response.json()));
  expect(results[0]).toMatchObject({ status: 'saved', level: 0, primary: false });
  expect(results[1]).toEqual(results[0]);
  expect((await send({ ...data, evidence: { source: 'self_report', reason: 'manual', reps: 2 } })).status()).toBe(409);
  await page.reload();
  const card = page.getByRole('article', { name: 'Og‘riq bildirildi · L0' });
  await expect(card).toHaveCount(1);
  const review = { attemptId: results[0].id, decision: 'reviewed', reply: 'Mashq qaydingizni ko‘rdim.' };
  const other = await browser.newPage();
  try {
    await other.goto(`${origin}/`);
    await other.getByRole('button', { name: 'Shifokor sifatida kirish' }).click();
    const denied = await other.request.post('/api/demo/exercise-review', { headers: { Origin: origin }, form: review, maxRedirects: 0 });
    expect(denied.headers().location).toBe('/doctor?result=not_found');
  } finally { await other.close(); }
  await card.getByText('Ko‘rib chiqish', { exact: true }).click();
  await card.getByLabel('Mashq bo‘yicha javob').fill(review.reply);
  await card.getByRole('button', { name: 'Javobni yuborish' }).click();
  const duplicateReview = await page.request.post('/api/demo/exercise-review', {
    headers: { Origin: origin }, form: { ...review, reply: 'Boshqa javob' }, maxRedirects: 0,
  });
  expect(duplicateReview.headers().location).toBe('/doctor?result=already_saved');
  expect((await (await read()).json()).attempts).toMatchObject([
    { id: results[0].id, level: 0, reason: 'pain', review: { body: review.reply, decision: 'reviewed' } },
  ]);
  await enter(page, 'patient');
  await page.getByRole('link', { name: 'O‘tirib-turish mashqi' }).click();
  await expect(page.getByText(review.reply, { exact: true })).toBeVisible();
});

test('judge completes the browser exercise story without camera permission', async ({ page }) => {
  test.setTimeout(90_000);
  const started = performance.now();
  await page.setViewportSize({ width: 360, height: 800 });
  await enter(page, 'doctor');
  await page.getByRole('button', { name: 'Mashqni biriktirish' }).click();
  await expect(page.getByText(/Reja: 5 takror/)).toBeVisible();
  await enter(page, 'patient');
  await page.getByRole('link', { name: 'O‘tirib-turish mashqi' }).click();
  await page.getByRole('button', { name: 'CDC namunasini sinash' }).click();
  await expect(page.getByText('Yuklangan video · To‘liq 2 · Chala 0')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('checkbox', { name: 'Videodagi mashq natijasini tasdiqlayman' }).check();
  await page.getByRole('button', { name: 'Natijani yuborish' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Namuna qaydi saqlandi/ })).toBeVisible();
  await page.getByRole('button', { name: 'Og‘riq bor' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Og‘riq xabari saqlandi/ })).toBeVisible();
  await enter(page, 'doctor');
  const entry = page.getByRole('article', { name: 'Og‘riq bildirildi · L0' });
  await expect(page.getByRole('heading', { name: 'CDC namuna videosi · L2' })).toBeVisible();
  await entry.getByText('Ko‘rib chiqish', { exact: true }).click();
  await entry.getByRole('radio', { name: 'Qayta o‘lchash so‘ralsin' }).check();
  await entry.getByLabel('Mashq bo‘yicha javob').fill('Og‘riq haqidagi xabaringizni ko‘rdim.');
  await entry.getByRole('button', { name: 'Javobni yuborish' }).click();
  await expect(entry.getByText('Qayta o‘lchash so‘raldi')).toBeVisible();
  await enter(page, 'patient');
  await page.getByRole('link', { name: 'O‘tirib-turish mashqi' }).click();
  await expect(page.getByText('Og‘riq haqidagi xabaringizni ko‘rdim.')).toBeVisible();
  console.log(`Browser judge journey: ${Math.round(performance.now() - started)} ms (automated, synthetic).`);
});
