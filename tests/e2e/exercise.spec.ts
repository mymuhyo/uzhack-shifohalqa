import { expect, test, type Page } from 'playwright/test';
import { resolve } from 'node:path';

test.describe.configure({ timeout: 90_000 });

async function enter(page: Page, role: 'doctor' | 'patient') {
  await page.goto('/');
  await page.getByRole('button', { name: role === 'doctor' ? 'Shifokor sifatida kirish' : 'Bemor sifatida kirish' }).click();
}

async function prescribeExercise(page: Page) {
  await enter(page, 'doctor');
  await page.getByRole('button', { name: 'Mashqni biriktirish' }).click();
  await expect(page.getByText(/Reja: 5 takror/)).toBeVisible();
  await enter(page, 'patient');
  await page.getByRole('link', { name: 'O‘tirib-turish mashqi' }).click();
}

test('stores exercise evidence levels and prevents duplicate files using synthetic API fixtures', async ({ page }) => {
  await prescribeExercise(page);
  const origin = new URL(page.url()).origin;
  const mediaFixture = {
    validReps: 3, shallowReps: 1, minAngle: 84, confidence: 0.86,
    analyzedFrames: 60, motionSignature: [165, 165, 160, 150, 140, 130, 120, 100, 90, 84, 85, 90, 100, 110, 120, 130, 140, 150, 160, 165],
  };
  const uploaded = { ...mediaFixture, source: 'uploaded_video', fileSha256: 'a'.repeat(64), patientConfirmed: true };
  const live = { ...mediaFixture, source: 'live_camera', fileSha256: null, patientConfirmed: false };
  const post = (data: object) => page.request.post('/api/demo/exercise', { headers: { Origin: origin }, data });

  const lowQuality = await post({ ...live, confidence: 0.4 });
  expect(lowQuality.status()).toBe(422);
  expect(await lowQuality.json()).toEqual({ status: 'retake' });
  expect((await post({ ...uploaded, patientConfirmed: false })).status()).toBe(422);

  const first = await post(uploaded);
  expect(await first.json()).toMatchObject({ status: 'saved', level: 2, primary: true });
  const repeated = await post(uploaded);
  expect(repeated.status()).toBe(409);
  const later = await post(live);
  expect(await later.json()).toMatchObject({ status: 'saved', level: 3, primary: false, similarMotion: true });
  expect(await (await post({ source: 'self_report', reason: 'manual', reps: 2 })).json()).toMatchObject({ status: 'saved', level: 0, primary: false });
  expect(await (await post({ source: 'self_report', reason: 'pain' })).json()).toMatchObject({ status: 'saved', level: 0, primary: false });

  await enter(page, 'doctor');
  await expect(page.getByRole('heading', { name: 'Yuklangan video · L2' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Jonli kamera · L3' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Og‘riq bildirildi · L0' })).toBeVisible();
  await expect(page.getByText('Tekshirish · O‘xshash harakat')).toBeVisible();
});

test('real local MediaPipe rejects an empty scene with no media upload', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => Promise.reject(new DOMException('Camera permission test fixture', 'NotAllowedError')),
    });
  });
  await prescribeExercise(page);
  await page.getByRole('button', { name: 'Kamerani boshlash' }).click();
  await expect(page.getByText(/Kameraga ruxsat berilmadi/)).toBeVisible();
  const requests: { method: string; url: string }[] = [];
  page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
  const model = page.waitForResponse(response => response.url().endsWith('/models/pose_landmarker_lite.task') && response.ok());
  const wasm = page.waitForResponse(response => response.url().includes('/models/wasm/') && response.url().endsWith('.wasm') && response.ok());
  const started = performance.now();
  await page.getByLabel(/Video tanlash/).setInputFiles(resolve('tests/fixtures/pose-no-person.webm'));
  await Promise.all([model, wasm]);
  await expect(page.getByText(/Tayanch nuqtalar yetarli ko‘rinmadi/)).toBeVisible({ timeout: 25_000 });
  expect(requests.filter(item => item.method !== 'GET')).toEqual([]);
  const origin = new URL(page.url()).origin;
  expect(requests.every(({ url }) => new URL(url).origin === origin || url.startsWith('blob:'))).toBe(true);
  console.log(`MediaPipe empty scene: ${Math.round(performance.now() - started)} ms; ${requests.length} GET requests; no media upload.`);
  await page.getByLabel('Takrorlar soni').fill('3');
  await page.getByRole('button', { name: 'Qo‘lda qayd yuborish' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'L0' })).toBeVisible();
});

test('analyzes the public sample locally and saves L2 outside the daily primary attempt', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await prescribeExercise(page);
  // File analysis must not race the playback clock when inference or decoding is slow.
  const video = page.getByLabel('Mashq videosi');
  await video.evaluate(element => element.addEventListener('play', () => element.setAttribute('data-file-played', 'yes')));
  const started = performance.now();
  await page.getByRole('button', { name: 'CDC namunasini sinash' }).click();
  await expect(page.getByText(/Eng kichik burchak/)).toBeVisible({ timeout: 35_000 });
  await expect(page.getByText('Yuklangan video · To‘liq 2 · Chala 0')).toBeVisible();
  const elapsed = Math.round(performance.now() - started);
  expect(await video.getAttribute('data-file-played')).toBeNull();
  await expect(page.getByRole('button', { name: 'Natijani yuborish' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Videodagi mashq natijasini tasdiqlayman' }).check();
  const posted = page.waitForResponse(response => response.url().endsWith('/api/demo/exercise') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Natijani yuborish' }).click();
  const result = await posted;
  expect(await result.json()).toMatchObject({ status: 'saved', level: 2, primary: false, sample: true });
  const { analyzedFrames, confidence, minAngle } = result.request().postDataJSON();
  console.log(`MediaPipe CDC sample: ${elapsed} ms; ${analyzedFrames} frames; ${confidence.toFixed(3)} confidence; ${minAngle.toFixed(1)}°; 2 full, 0 shallow.`);
  await page.getByText('Takrorni qo‘lda kiritish', { exact: true }).click();
  await page.getByLabel('Takrorlar soni').fill('2');
  const manual = page.waitForResponse(response => response.url().endsWith('/api/demo/exercise') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Qo‘lda qayd yuborish' }).click();
  expect(await (await manual).json()).toMatchObject({ level: 0, primary: true, sample: false });
  await enter(page, 'doctor');
  await expect(page.getByRole('heading', { name: 'CDC namuna videosi · L2' })).toBeVisible();
});
