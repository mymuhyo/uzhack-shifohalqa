import { expect, test } from 'playwright/test';

test('opens both demo roles in one session and logs out', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Shifokor sifatida kirish' }).click();
  await expect(page).toHaveURL('/doctor');
  await expect(page.getByRole('heading', { name: 'Shifokor sahifasi' })).toBeVisible();
  await expect(page.getByText('Dr. Sardor')).toBeVisible();

  const session = (await context.cookies()).find(({ name }) => name === 'shifohalqa_demo');
  expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });

  await page.getByRole('link', { name: 'Rolni almashtirish' }).click();
  await page.getByRole('button', { name: 'Bemor sifatida kirish' }).click();
  await expect(page).toHaveURL('/patient');
  await expect(page.getByRole('heading', { name: 'Bemor sahifasi' })).toBeVisible();
  await expect(page.getByText('Anvar aka')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tez yordam · 103' })).toHaveAttribute('href', 'tel:103');

  await page.getByRole('button', { name: 'Demodan chiqish' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/patient');
  await expect(page).toHaveURL('/');
});

test('protects role pages and opens the doctor role by keyboard on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/doctor');
  await expect(page).toHaveURL('/');

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Asosiy mazmunga o‘tish' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Mashq demosini ochish' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Shifokor sifatida kirish' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/doctor');
  await expect(page.getByRole('link', { name: 'Rolni almashtirish' })).toBeInViewport();
  await page.getByRole('link', { name: 'Rolni almashtirish' }).click();
  await page.getByRole('button', { name: 'Bemor sifatida kirish' }).click();
  await expect(page.getByRole('link', { name: 'Rolni almashtirish' })).toBeInViewport();

  await page.goto('/doctor');
  await expect(page).toHaveURL('/');
});

test('starts a clean demo workspace from the judge information page', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Shifokor sifatida kirish' }).click();
  const workspace = async () => {
    const session = (await context.cookies()).find(({ name }) => name === 'shifohalqa_demo');
    return session ? JSON.parse(Buffer.from(session.value.split('.')[0], 'base64url').toString()).workspaceId : null;
  };
  const originalWorkspace = await workspace();
  expect(originalWorkspace).toBeTruthy();

  await page.getByRole('link', { name: 'Demo haqida' }).click();
  await expect(page.getByRole('heading', { name: 'AI qayerda ishlaydi?' })).toBeVisible();
  await page.getByRole('button', { name: 'Yangi demo ish joyini boshlash' }).click();
  await expect(page).toHaveURL('/');
  expect(await workspace()).toBeNull();
  await page.getByRole('button', { name: 'Bemor sifatida kirish' }).click();
  expect(await workspace()).toBeTruthy();
  expect(await workspace()).not.toBe(originalWorkspace);
});

test('opens the Telegram Mini App route cleanly on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/tg');
  await expect(page.getByRole('heading', { name: 'ShifoHalqa · Telegram' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bemor vazifalarini ochish/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Shifokor navbatini ochish/ })).toBeVisible();
  expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(360);
});

test('opens both public exercise previews without narrow-screen overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  for (const route of ['/demo/mashq', '/demo/mashq/tirsak']) {
    expect((await page.goto(route))?.ok()).toBe(true);
    await expect(page.getByRole('button', { name: 'CDC namunasini sinash' })).toBeVisible();
    expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(360);
  }
});

test('toggles large text accessibility mode and persists across reload without narrow-screen overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'A+ Katta shrift' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'large');
  await expect(page.getByRole('button', { name: 'A+ Katta shrift' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(360);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', 'large');

  await page.getByRole('button', { name: 'Bemor sifatida kirish' }).click();
  await expect(page).toHaveURL('/patient');
  expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(360);

  await page.getByRole('button', { name: 'A+ Katta shrift' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-text-scale', 'large');
});

test('shows and clears the offline alert banner with 103 emergency link when connectivity changes', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.getByText(/Internet aloqasi uzildi/)).toHaveCount(0);

  await context.setOffline(true);
  const banner = page.locator('.offline-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Internet aloqasi uzildi');
  await expect(banner.getByRole('link', { name: '103' })).toHaveAttribute('href', 'tel:103');
  expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBeLessThanOrEqual(360);

  await context.setOffline(false);
  await expect(banner).toHaveCount(0);
});
