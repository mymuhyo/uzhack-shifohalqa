import { expect, test } from 'playwright/test';

test('DoriMos rejects arbitrary media and forged results and keeps manual fallback separate', async ({ page, browser }) => {
  test.setTimeout(75_000);
  await page.goto('/');
  const origin = new URL(page.url()).origin;
  const headers = { Origin: origin };
  await page.getByRole('button', { name: 'Shifokor sifatida kirish' }).click();

  // A plan saved by the previous version lacks a box strength.
  await page.request.post('/api/demo/plan', { headers, form: {
    medicationName: 'Namuna dori', medicationTime: '00:00', vitalsTime: '00:00',
    warnSystolic: '130', warnDiastolic: '80', maxSystolic: '150', maxDiastolic: '95',
  } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Bemor sifatida kirish' }).click();
  const medicationForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Ichdim', exact: true }) });
  const taskId = await medicationForm.locator('[name="taskId"]').getAttribute('value');
  expect(taskId).toBeTruthy();
  const post = (data: object) => page.request.post('/api/demo/dorimos', { headers, data });

  expect((await post({ action: 'scan', taskId, sampleId: '../private' })).status()).toBe(400);
  expect((await post({ action: 'scan', taskId, sampleId: 'box-5mg', image: 'unexpected-media' })).status()).toBe(400);
  expect((await post({ action: 'manual', taskId, level: 2, result: 'match' })).status()).toBe(400);
  expect(await (await post({ action: 'scan', taskId, sampleId: 'box-5mg' })).json()).toEqual({ status: 'manual' });

  const other = await browser.newContext({ baseURL: origin });
  try {
    await other.request.post('/api/demo/login', { headers, form: { role: 'patient' } });
    const outside = await other.request.post('/api/demo/dorimos', { headers, data: { action: 'manual', taskId } });
    expect(outside.status()).toBe(404);
  } finally {
    await other.close();
  }

  await page.getByText('DoriMos · qutini tekshirish', { exact: true }).click();
  await expect(page.getByText('Rejada qutining kuchi ko‘rsatilmagan.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /Tekshirilmaganini qo‘lda qayd etish/ }).click();
  await expect(page.getByText('Quti tekshirilmagani qo‘lda qayd etildi.')).toBeVisible();
  expect(await (await post({ action: 'manual', taskId })).json()).toEqual({ status: 'already_saved' });
  await page.getByRole('button', { name: 'Ichdim', exact: true }).click();
  await expect(page.getByText('Qayd saqlandi', { exact: true })).toHaveCount(1);
  await expect(page.getByText('DoriMos qaydi', { exact: true })).toHaveCount(1);
  await expect(page.getByText('L0', { exact: true })).toHaveCount(2);
});
