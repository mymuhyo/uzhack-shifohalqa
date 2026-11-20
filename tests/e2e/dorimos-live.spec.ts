import { expect, test } from 'playwright/test';

test('live DoriMos rejects a blurred sample and reviews the confirmed mismatch on its own log', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const origin = new URL(page.url()).origin;
  const headers = { Origin: origin };
  const enter = async (name: string) => {
    await page.goto('/');
    await page.getByRole('button', { name }).click();
  };
  await page.getByRole('button', { name: 'Shifokor sifatida kirish' }).click();
  await page.getByRole('button', { name: 'Rejani biriktirish' }).click();
  await expect(page.getByRole('heading', { name: 'Biriktirilgan reja' })).toBeVisible();

  // Record intake first, then check a different practice box against the same plan.
  await enter('Bemor sifatida kirish');
  await page.getByRole('button', { name: 'Ichdim', exact: true }).click();
  await expect(page.getByText('Qayd saqlandi', { exact: true })).toBeVisible();
  await page.getByText('DoriMos · qutini tekshirish', { exact: true }).click();
  const sample = page.getByLabel('Namuna rasmi');
  const check = page.getByRole('button', { name: 'Rasmni o‘qish' });
  const patientConfirm = page.getByRole('button', { name: 'Qutidagi yozuvni tasdiqlash' });
  await sample.selectOption('box-unreadable');
  await check.click();
  await expect(page.getByText(/Quti yozuvini ishonchli o‘qib bo‘lmadi/)).toBeVisible({ timeout: 22_000 });
  await expect(patientConfirm).toHaveCount(0);
  await expect(page.getByText('L2', { exact: true })).toHaveCount(0);

  await sample.selectOption('box-10mg');
  const scan = page.waitForResponse((response) => response.url().endsWith('/api/demo/dorimos') && response.request().method() === 'POST');
  await check.click();
  const scanResponse = await scan;
  const { token, status } = await scanResponse.json();
  expect(status).toBe('needs_confirmation');
  expect(typeof token).toBe('string');
  const { taskId } = scanResponse.request().postDataJSON();
  const forged = await page.request.post('/api/demo/dorimos', { headers, data: { action: 'confirm', taskId, token: 'forged' } });
  expect(forged.status()).toBe(422);
  await expect(page.getByText('L2', { exact: true })).toHaveCount(0);
  await patientConfirm.click();
  await expect(page.getByText('L2', { exact: true })).toBeVisible();
  await expect(page.getByText(/Namuna qutisi rejadan farq qiladi/)).toBeVisible();
  await expect(page.getByText('L0', { exact: true })).toBeVisible();

  await enter('Shifokor sifatida kirish');
  const entry = page.getByRole('article', { name: 'Dori qutisi rejaga mos kelmadi' });
  await expect(entry).toContainText('10 mg');
  await expect(entry).toContainText('5 mg');
  await expect(entry).toContainText('L2');
  await entry.getByText('Ko‘rib chiqish', { exact: true }).click();
  await entry.getByLabel('Bemorga javob').fill('Namuna qutisini ko‘rdim. Siz bilan bog‘lanaman.');
  await entry.getByRole('button', { name: 'Qaydni tasdiqlash' }).click();
  await expect(entry).toContainText('L4');
  await enter('Bemor sifatida kirish');
  await expect(page.getByText('Namuna qutisini ko‘rdim. Siz bilan bog‘lanaman.')).toBeVisible();
  await expect(page.getByText('L4', { exact: true })).toBeVisible();
  await expect(page.getByText('L0', { exact: true })).toBeVisible();
});
