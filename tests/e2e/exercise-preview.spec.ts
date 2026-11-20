import { expect, test } from 'playwright/test';

test.describe.configure({ timeout: 135_000 });

test('opens the camera demo without a plan and measures the public clip in the browser', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Mashq demosini ochish' }).click();
  await expect(page).toHaveURL('/demo/mashq');
  await expect(page.getByRole('heading', { name: 'O‘tirib-turish tahlili' })).toBeVisible();
  const requests: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST') requests.push(new URL(request.url()).pathname);
  });
  await page.getByRole('button', { name: 'CDC namunasini sinash' }).click();
  await expect(page.getByRole('heading', { name: 'MediaPipe o‘lchovi' })).toBeVisible({ timeout: 95_000 });
  await expect(page.getByText('Yuklangan video · To‘liq 2 · Chala 0')).toBeVisible();
  const cycles = page.getByRole('table', { name: /Sikllar/ });
  await expect(cycles.getByRole('row')).toHaveCount(3);
  await expect(cycles.getByRole('cell', { name: 'Maqsadga yetdi', exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Natijani yuborish' })).toHaveCount(0);
  expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(360);
  expect(requests).toEqual([]);
});

test('asks real Gemini to observe the fixed clip and leaves MediaPipe evidence separate', async ({ page, baseURL }) => {
  test.skip(process.env.SHIFO_E2E_EXERCISE_GEMINI !== '1', 'Enable the live synthetic video provider test');
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/demo/mashq');
  await page.getByRole('button', { name: 'CDC namunasini sinash' }).click();
  await expect(page.getByRole('heading', { name: 'MediaPipe o‘lchovi' })).toBeVisible({ timeout: 95_000 });
  const poseResult = page.getByText(/Yuklangan video · To‘liq/);
  const measurement = await poseResult.innerText();
  const rejected = await page.request.post('/api/demo/exercise-analysis', {
    headers: { Origin: baseURL! }, data: { source: 'user_media' },
  });
  expect(rejected.status()).toBe(400);
  const started = performance.now();
  const observed = page.waitForResponse(response => response.url().endsWith('/api/demo/exercise-analysis') &&
    response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Namunani Gemini bilan tahlil qilish' }).click();
  const response = await observed;
  expect(response.status()).toBe(200);
  const report = await response.json();
  expect(report).toMatchObject({ status: 'observed' });
  expect(response.request().postDataJSON()).toEqual({});
  const panel = page.getByRole('region', { name: 'Gemini kuzatuvi' });
  await expect(panel).toContainText('Ommaviy namuna');
  await expect(poseResult).toHaveText(measurement);
  expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(360);
  console.log('Gemini public clip:', Math.round(performance.now() - started), 'ms;', JSON.stringify(report));
});
