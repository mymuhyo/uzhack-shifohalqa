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
    const path = new URL(request.url()).pathname;
    // Next's dev overlay resolves stack frames for MediaPipe's console output.
    if (request.method() === 'POST' && path !== '/__nextjs_original-stack-frames') requests.push(path);
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

test('measures the public elbow demo using the arm joints', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/demo/mashq');
  await page.getByRole('link', { name: 'Tirsakni bukish demosini ochish' }).click();
  await expect(page.getByRole('heading', { name: 'Tirsakni bukish tahlili' })).toBeVisible();
  await page.getByRole('button', { name: 'CDC namunasini sinash' }).click();
  await expect(page.getByRole('heading', { name: 'MediaPipe o‘lchovi' })).toBeVisible({ timeout: 95_000 });
  const cycles = page.getByRole('table', { name: /tirsak burchagi/ });
  await expect(cycles.getByRole('row')).toHaveCount(2);
  await expect(page.getByText(/Yuklangan video · To‘liq/)).toContainText('To‘liq 1 · Chala 0');
  await expect(page.getByRole('heading', { name: /(?:OpenRouter|OpenCode Console|AI) kuzatuvi/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Natijani yuborish' })).toHaveCount(0);
});

test('asks the live provider to observe the fixed clip and leaves MediaPipe evidence separate', async ({ page, baseURL }) => {
  const openCode = process.env.SHIFO_E2E_EXERCISE_OPENCODE === '1';
  const auto = process.env.SHIFO_E2E_EXERCISE_AUTO === '1';
  test.skip(!auto && !openCode && process.env.SHIFO_E2E_EXERCISE_OPENROUTER !== '1', 'Enable the live synthetic video provider test');
  const provider = auto ? 'auto' : openCode ? 'opencode' : 'openrouter';
  const name = auto ? 'AI' : openCode ? 'OpenCode Console' : 'OpenRouter';
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/demo/mashq');
  await page.getByRole('button', { name: 'CDC namunasini sinash' }).click();
  await expect(page.getByRole('button', { name: `Namunani ${name} bilan tahlil qilish` })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'MediaPipe o‘lchovi' })).toHaveCount(0);
  const poseResult = page.getByText(/Yuklangan video · To‘liq/);
  const rejected = await page.request.post('/api/demo/exercise-analysis', {
    headers: { Origin: baseURL! }, data: { source: 'user_media' },
  });
  expect(rejected.status()).toBe(400);
  const started = performance.now();
  const observed = page.waitForResponse(response => response.url().endsWith('/api/demo/exercise-analysis') &&
    response.request().method() === 'POST');
  await page.getByRole('button', { name: `Namunani ${name} bilan tahlil qilish` }).click();
  const response = await observed;
  expect(response.status()).toBe(200);
  const report = await response.json();
  expect(report).toMatchObject({ status: 'observed' });
  if (auto) expect(['vercel', 'opencode_go', 'gemini']).toContain(report.provider);
  expect(response.request().postDataJSON()).toEqual({ provider });
  const panel = page.getByRole('region', { name: `${name} kuzatuvi` });
  expect(['video', 'frames']).toContain(report.input);
  await expect(panel).toContainText(report.input === 'frames' ? 'Ommaviy namunadan 9 kadr' : 'Ommaviy namuna videosi');
  const result = page.getByRole('heading', { name: 'MediaPipe o‘lchovi' });
  await expect(result).toBeVisible({ timeout: 95_000 });
  await expect(poseResult).toHaveText('Yuklangan video · To‘liq 2 · Chala 0');
  expect(await page.locator('body').evaluate(body => body.scrollWidth)).toBeLessThanOrEqual(360);
  console.log(`${name} public clip:`, Math.round(performance.now() - started), 'ms;', JSON.stringify(report));
});
