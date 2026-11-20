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
