import { expect, test } from 'playwright/test';

test.describe.configure({ timeout: 90_000 });

test('counts missed tasks as answers and keeps manual steps outside adherence', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Bemor sifatida kirish' }).click();
  await expect(page.getByText('Rejalashtirilgan vazifa yo‘q.', { exact: true })).toHaveCount(2);

  await page.goto('/');
  await page.getByRole('button', { name: 'Shifokor sifatida kirish' }).click();
  await page.getByLabel('Dori vaqti').fill('00:00');
  await page.getByLabel('Bosim o‘lchash vaqti').fill('00:00');
  await page.getByRole('button', { name: 'Rejani biriktirish' }).click();
  await expect(page.getByRole('heading', { name: 'Biriktirilgan reja' })).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: 'Bemor sifatida kirish' }).click();
  await expect(page.getByRole('progressbar', { name: 'Oxirgi 7 kun' })).toHaveAttribute('aria-valuetext', '0/2 vazifa bajarildi');
  await page.getByText('Icha olmadim', { exact: true }).click();
  await page.getByLabel('Nega icha olmadingiz?').selectOption('out_of_supply');
  await page.getByRole('button', { name: 'Sababni yuborish' }).click();
  await page.getByLabel('Sistolik bosim').fill('120');
  await page.getByLabel('Diastolik bosim').fill('80');
  await page.getByRole('button', { name: 'Qaydni yuborish' }).click();

  const today = page.getByRole('progressbar', { name: 'Bugun' });
  const week = page.getByRole('progressbar', { name: 'Oxirgi 7 kun' });
  await expect(today).toHaveAttribute('aria-valuetext', '1/2 vazifa bajarildi');
  await expect(week).toHaveAttribute('aria-valuetext', '1/2 vazifa bajarildi');
  await expect(page.getByText('2/2 vazifaga javob berildi')).toHaveCount(2);
  await page.getByLabel('Qadamlar soni').fill('815');
  await page.getByRole('button', { name: 'Qadamlarni saqlash' }).click();
  await page.reload();
  const stepRecord = page.getByText(/815 \/ 3[\s\u00a0]000 qadam/);
  await expect(stepRecord).toBeVisible();
  await expect(stepRecord).toContainText('Jarayonda');
  await expect(page.getByText('Qo‘lda kiritildi · L0 · AI rejimi manual')).toBeVisible();
  await expect(week).toHaveAttribute('aria-valuetext', '1/2 vazifa bajarildi');

  await page.goto('/');
  await page.getByRole('button', { name: 'Shifokor sifatida kirish' }).click();
  await page.getByText('Hisobga kirgan vazifalar', { exact: true }).click();
  await expect(page.getByText(/Namuna dori · Qoldirilgani bildirildi/)).toBeVisible();
  await expect(page.getByText(/Qon bosimi · Bajarilgan/)).toBeVisible();
});
