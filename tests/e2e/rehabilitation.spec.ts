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

test('Android saves a confirmed local video summary and restricts cloud analysis to the bundled sample', async ({ page }) => {
  test.setTimeout(60_000);
  const ai = '/api/mobile/v1/exercise/sample-ai';
  expect((await page.request.post(ai, { data: { provider: 'openrouter' } })).status()).toBe(401);
  await enter(page, 'doctor');
  await page.getByRole('button', { name: 'Mashqni biriktirish' }).click();
  await expect(page.getByText(/Reja: 5 takror/)).toBeVisible();
  const origin = new URL(page.url()).origin;
  const pairing = await page.request.post('/api/demo/android/pairing', { headers: { Origin: origin } });
  const paired = await page.request.post('/api/mobile/v1/pair', { data: { code: (await pairing.json()).code } });
  const headers = { Authorization: `Bearer ${(await paired.json()).token}` };
  const cloud = (data: object) => page.request.post(ai, { headers, data });
  expect((await cloud({ provider: 'openrouter', video: 'content://private/clip' })).status()).toBe(400);
  expect((await cloud({ provider: 'baidu', comparison: 'pose_only', summary: 'private measurement' })).status()).toBe(400);
  expect((await cloud({ provider: 'gemini' })).status()).toBe(404);
  if (![process.env.SHIFO_E2E_EXERCISE_OPENROUTER, process.env.SHIFO_E2E_EXERCISE_OPENCODE,
    process.env.SHIFO_E2E_EXERCISE_AUTO].includes('1')) {
    expect((await cloud({ provider: 'openrouter' })).status()).toBe(404);
  }

  const { date, plan } = await (await page.request.get(mobile, { headers })).json();
  const record = { clientAttemptId: randomUUID(), prescriptionId: plan.id, scheduledDate: date, evidence: {
    source: 'uploaded_video', patientConfirmed: true, fileSha256: 'c'.repeat(64), analyzedFrames: 30,
    validReps: 2, shallowReps: 0, minAngle: 86, confidence: 0.96, motionSignature: null,
  } };
  const send = (data: object) => page.request.post(mobile, { headers, data });
  expect((await send({ ...record, evidence: { ...record.evidence, patientConfirmed: false } })).status()).toBe(400);
  expect((await send({ ...record, evidence: { ...record.evidence, uri: 'content://private/clip' } })).status()).toBe(400);
  const responses = await Promise.all([send(record), send(record)]);
  const [saved, retry] = await Promise.all(responses.map(response => response.json()));
  expect(saved).toMatchObject({ status: 'saved', level: 2, primary: true, sample: false });
  expect(retry).toEqual(saved);
  expect((await send({ ...record, clientAttemptId: randomUUID() })).status()).toBe(409);
  await page.reload();
  const entry = page.getByRole('article', { name: 'Yuklangan video · L2' });
  await expect(entry).toContainText('Android ilovasi');
});

test('assigns a new movement and stores diagnostics without changing the paired exercise contract', async ({ page }) => {
  await enter(page, 'doctor');
  await page.getByLabel('Mashq turi').selectOption('shoulder_raise');
  await expect(page.getByLabel('Maqsad burchagi')).toHaveValue('90');
  await page.getByRole('button', { name: 'Mashqni biriktirish' }).click();
  await expect(page.getByText(/Reja: 5 takror/)).toBeVisible();
  const origin = new URL(page.url()).origin;
  const paired = await page.request.post('/api/demo/android/pairing', { headers: { Origin: origin } });
  const access = await page.request.post('/api/mobile/v1/pair', { data: { code: (await paired.json()).code } });
  const headers = { Authorization: `Bearer ${(await access.json()).token}` };
  const { plan, date } = await (await page.request.get(mobile, { headers })).json();
  expect(plan).toMatchObject({ movement: 'shoulder_raise', targetAngle: 90 });
  const record = { clientAttemptId: randomUUID(), prescriptionId: plan.id, scheduledDate: date };
  const send = (evidence: object) => page.request.post(mobile, { headers, data: { ...record, evidence } });
  expect((await send({ source: 'self_report', reason: 'pain' })).status()).toBe(404);
  const evidence = {
    movement: 'shoulder_raise', source: 'live_camera', fileSha256: null, patientConfirmed: true,
    analyzedFrames: 60, validReps: 2, shallowReps: 0, minAngle: 95, confidence: 0.95, motionSignature: null,
    formMetrics: { shoulderTiltMaxDeg: 28, compensationCycles: 2 },
  };
  const results = await Promise.all([send(evidence), send(evidence)]);
  const saved = await results[0].json();
  expect(saved).toMatchObject({ status: 'saved', level: 3 });
  expect(await results[1].json()).toEqual(saved);
  expect((await (await page.request.get(mobile, { headers })).json()).attempts).toEqual([
    expect.objectContaining({ id: saved.id, movement: 'shoulder_raise', diagnostics: expect.objectContaining({ needsDoctorReview: true }) }),
  ]);

  const coach = '/api/mobile/v1/exercise-coach';
  expect((await page.request.post(coach, { data: { sample: 'chair_stand' } })).status()).toBe(401);
  expect((await page.request.post(coach, { headers, data: { sample: 'chair_stand', video: 'content://private/clip' } })).status()).toBe(400);
  const publicAdvice = await page.request.post(coach, { headers, data: { sample: 'chair_stand' } });
  expect(await publicAdvice.json()).toMatchObject({ source: 'deterministic_coach' });
  const { movement, validReps, shallowReps, minAngle, formMetrics } = evidence;
  const localAdvice = await page.request.post('/api/demo/exercise-coach', {
    headers: { Origin: origin }, data: { movement, targetAngle: 90, targetReps: 5, validReps, shallowReps, minAngle, formMetrics },
  });
  expect(await localAdvice.json()).toMatchObject({ source: 'deterministic_coach', needsDoctorReview: true });
});
