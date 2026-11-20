import { neon } from '@neondatabase/serverless';
import { expect, test, type Page } from 'playwright/test';

test.describe.configure({ timeout: 90_000 });

async function enterRole(page: Page, role: 'doctor' | 'patient') {
  await page.goto('/');
  await page.getByRole('button', { name: role === 'doctor' ? 'Shifokor sifatida kirish' : 'Bemor sifatida kirish' }).click();
  await expect(page).toHaveURL(`/${role}`);
}

async function assignDemoPlan(page: Page) {
  await enterRole(page, 'doctor');
  await page.getByLabel('Sistolik yuqori chegara').fill('144');
  await expect(page.getByRole('checkbox', { name: /Dori tugadi/ })).toBeChecked();
  await page.getByRole('button', { name: 'Rejani biriktirish' }).click();
  await expect(page.getByRole('heading', { name: 'Biriktirilgan reja' })).toBeVisible();
}

test('returns the reply and L4 to the exact older log in the clinical loop', async ({ page }) => {
  await assignDemoPlan(page);

  await enterRole(page, 'patient');
  await page.getByText('Icha olmadim', { exact: true }).click();
  await page.getByLabel('Nega icha olmadingiz?').selectOption('out_of_supply');
  await page.getByRole('button', { name: 'Sababni yuborish' }).click();
  await expect(page.getByText('Icha olmadim · Dori tugadi')).toBeVisible();

  await page.getByLabel('Sistolik bosim').fill('144');
  await page.getByLabel('Diastolik bosim').fill('80');
  await page.getByRole('button', { name: 'Qaydni yuborish' }).click();
  await page.reload();
  await expect(page.getByText('Qayd saqlandi')).toHaveCount(2);

  await enterRole(page, 'doctor');
  const queue = page.getByRole('region', { name: 'Bemorlar navbati' });
  const older = queue.getByRole('article', { name: 'Dori tugadi' });
  const newer = queue.getByRole('article', { name: 'Bosim reja chegarasiga yetdi' });
  await expect(queue.getByRole('article').first()).toContainText('144/80');
  await expect(older).toContainText('L0');
  await expect(newer).toContainText('L0');
  await older.getByText('Ko‘rib chiqish', { exact: true }).click();
  await older.getByLabel('Bemorga javob').fill('Xabaringizni oldim. Siz bilan bog‘lanaman.');
  await older.getByLabel('Ichki izoh (ixtiyoriy)').fill('Faqat ichki demo izoh');
  await older.getByRole('button', { name: 'Qaydni tasdiqlash' }).click();
  await expect(newer).toContainText('L0');
  await expect(queue.getByRole('article')).toHaveCount(1);
  const reviewed = page.getByRole('region', { name: 'Ko‘rib chiqilgan qaydlar' });
  await expect(reviewed.getByRole('article', { name: 'Dori tugadi' })).toContainText('L4');

  await enterRole(page, 'patient');
  await expect(page.getByText('Shifokor ko‘rib tasdiqladi')).toBeVisible();
  await expect(page.getByText('Xabaringizni oldim. Siz bilan bog‘lanaman.')).toBeVisible();
  await expect(page.getByText('Faqat ichki demo izoh')).toHaveCount(0);
  await expect(page.getByText('L4', { exact: true })).toHaveCount(1);
  await expect(page.getByText('L0', { exact: true })).toHaveCount(1);
});

test('deduplicates concurrent submissions and rejects cross-workspace review', async ({ page, browser }) => {
  await assignDemoPlan(page);
  await enterRole(page, 'patient');
  const medication = page.locator('form').filter({ has: page.getByRole('button', { name: 'Ichdim', exact: true }) });
  const taskId = await medication.locator('[name="taskId"]').getAttribute('value');
  expect(taskId).toBeTruthy();
  const origin = new URL(page.url()).origin;
  const request = { headers: { Origin: origin }, maxRedirects: 0, form: {
    taskId: taskId ?? '', medicationStatus: 'missed', reason: 'out_of_supply',
  } };
  const results = await Promise.all([page.request.post('/api/demo/evidence', request), page.request.post('/api/demo/evidence', request)]);
  expect(results.map((result) => result.status())).toEqual([303, 303]);
  expect(results.map((result) => result.headers()['location']).sort()).toEqual(['/patient', '/patient?result=already_saved']);
  await page.reload();
  await expect(page.getByText('Qayd saqlandi')).toHaveCount(1);

  await enterRole(page, 'doctor');
  const entry = page.getByRole('article', { name: 'Dori tugadi' });
  await entry.getByText('Ko‘rib chiqish', { exact: true }).click();
  const flagId = await entry.locator('[name="flagId"]').getAttribute('value');
  expect(flagId).toBeTruthy();

  const isolated = await browser.newContext({ baseURL: origin });
  try {
    const other = await isolated.newPage();
    await enterRole(other, 'doctor');
    await expect(other.getByRole('article', { name: 'Dori tugadi' })).toHaveCount(0);
    const response = await other.request.post('/api/demo/review', {
      headers: { Origin: origin }, maxRedirects: 0, form: { flagId: flagId ?? '', decision: 'approved', reply: 'Boshqa sessiya' },
    });
    expect(response.status()).toBe(303);
    expect(response.headers()['location']).toBe('/doctor?result=not_found');
  } finally {
    await isolated.close();
  }

  await page.reload();
  await expect(entry).toContainText('L0');
  await entry.getByText('Ko‘rib chiqish', { exact: true }).click();
  await entry.getByLabel('Bemorga javob').fill('Iltimos, qayta qayd yuboring.');
  await entry.getByRole('button', { name: 'Qayta o‘lchashni so‘rash' }).click();
  const repeat = await page.request.post('/api/demo/review', {
    headers: { Origin: origin }, maxRedirects: 0, form: { flagId: flagId ?? '', decision: 'approved', reply: 'Ikkinchi javob' },
  });
  expect(repeat.headers()['location']).toBe('/doctor?result=already_saved');
  await enterRole(page, 'patient');
  await expect(page.getByText('Shifokor qayta o‘lchashni so‘radi')).toBeVisible();
  await expect(page.getByText('Iltimos, qayta qayd yuboring.')).toBeVisible();
  await expect(page.getByText('L0', { exact: true })).toBeVisible();
  await expect(page.getByText('Ikkinchi javob')).toHaveCount(0);
});

test('shows a new review on an old task without bringing back its unrelated evidence', async ({ page, baseURL }) => {
  await assignDemoPlan(page);
  await enterRole(page, 'patient');
  const taskId = await page.locator('form').filter({ has: page.getByRole('button', { name: 'Ichdim', exact: true }) })
    .locator('[name="taskId"]').inputValue();
  await page.getByText('Icha olmadim', { exact: true }).click();
  await page.getByLabel('Nega icha olmadingiz?').selectOption('out_of_supply');
  await page.getByRole('button', { name: 'Sababni yuborish' }).click();
  await expect(page.getByText('Icha olmadim · Dori tugadi')).toBeVisible();
  const box = await page.request.post('/api/demo/dorimos', {
    headers: { Origin: baseURL! }, data: { action: 'manual', taskId },
  });
  expect(await box.json()).toMatchObject({ status: 'saved' });

  // Move this synthetic task and both of its evidence rows outside the normal history.
  const sql = neon(process.env.SHIFO_E2E_DATABASE_URL!);
  const [[task]] = await sql.transaction(tx => [
    tx`UPDATE shifohalqa.task_instances
       SET scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date - 10
       WHERE id = ${taskId} RETURNING scheduled_date::text AS date`,
    tx`UPDATE shifohalqa.evidence_logs SET created_at = CURRENT_TIMESTAMP - INTERVAL '10 days'
       WHERE task_instance_id = ${taskId}`,
  ]);
  await page.reload();
  await expect(page.getByText('Icha olmadim · Dori tugadi')).toHaveCount(0);
  const week = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Oxirgi 7 kun' }) });
  const originalCounts = await week.innerText();

  await enterRole(page, 'doctor');
  const entry = page.getByRole('article', { name: 'Dori tugadi' });
  await entry.getByText('Ko‘rib chiqish', { exact: true }).click();
  const flagId = await entry.locator('[name="flagId"]').inputValue();
  const reply = 'Avvalgi xabaringizni ko‘rdim. Siz bilan bog‘lanaman.';
  await entry.getByLabel('Bemorga javob').fill(reply);
  await entry.getByRole('button', { name: 'Qaydni tasdiqlash' }).click();
  await expect(page.getByRole('region', { name: 'Ko‘rib chiqilgan qaydlar' })).toContainText('Dori tugadi');
  await enterRole(page, 'patient');
  const late = page.getByRole('region', { name: 'Eski qaydlarga yangi javoblar' });
  await expect(late).toContainText(reply);
  await expect(late).toContainText('L4');
  await expect(late.locator('time').first()).toHaveAttribute('datetime', `${task.date}T08:00`);
  await expect(late).not.toContainText('DoriMos qaydi');
  expect(await week.innerText()).toBe(originalCounts);

  // Midnight at the start of the sixth prior Tashkent day is still inside the review window.
  await sql`UPDATE shifohalqa.flags SET reviewed_at =
    (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date - 6)::timestamp AT TIME ZONE 'Asia/Tashkent')
    WHERE id = ${flagId}`;
  await page.reload();
  await expect(late).toContainText(reply);
  await sql`UPDATE shifohalqa.flags SET reviewed_at = reviewed_at - INTERVAL '1 second' WHERE id = ${flagId}`;
  await page.reload();
  await expect(late).toHaveCount(0);
});
