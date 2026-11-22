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
  const savedNotes = page.getByText('Qayd saqlandi');
  await expect(savedNotes).toHaveCount(2);
  await page.reload();
  await expect(savedNotes).toHaveCount(2);

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

test('closes the loop with 1-click doctor template, supply confirmation, retake BP, and urgent symptom review', async ({ page }) => {
  await assignDemoPlan(page);
  await enterRole(page, 'patient');

  await page.getByText('Icha olmadim', { exact: true }).click();
  await page.getByLabel('Nega icha olmadingiz?').selectOption('out_of_supply');
  await page.getByRole('button', { name: 'Sababni yuborish' }).click();
  await expect(page.getByText('Icha olmadim · Dori tugadi')).toBeVisible();

  await page.getByLabel('Sistolik bosim').fill('155');
  await page.getByLabel('Diastolik bosim').fill('90');
  await page.getByRole('button', { name: 'Qaydni yuborish' }).click();
  await expect(page.getByText('155/90 mm sim. ust.')).toBeVisible();

  await page.getByRole('button', { name: /Shifokor sifatida ko‘rish/ }).click();
  await expect(page).toHaveURL('/doctor');
  const queue = page.getByRole('region', { name: 'Bemorlar navbati' });

  const supplyEntry = queue.getByRole('article', { name: 'Dori tugadi' });
  await supplyEntry.getByText('Ko‘rib chiqish', { exact: true }).click();
  await supplyEntry.locator('.template-chip').first().click();
  await supplyEntry.getByRole('button', { name: 'Qaydni tasdiqlash' }).click();

  const bpEntry = queue.getByRole('article', { name: 'Bosim reja chegarasiga yetdi' });
  await bpEntry.getByText('Ko‘rib chiqish', { exact: true }).click();
  await bpEntry.locator('.template-chip').first().click();
  await bpEntry.getByRole('button', { name: 'Qayta o‘lchashni so‘rash' }).click();

  await page.getByRole('button', { name: /Bemor sifatida ko‘rish/ }).click();
  await expect(page).toHaveURL('/patient');
  await page.getByRole('button', { name: 'Dorini oldim va ichdim' }).click();
  await expect(page.getByText('Sizning tasdiqingiz: Dorini oldim va ichdim.')).toBeVisible();

  await page.getByLabel('Qayta sistolik').fill('128');
  await page.getByLabel('Qayta diastolik').fill('82');
  await page.getByRole('button', { name: 'Qayta o‘lchovni yuborish' }).click();
  await expect(page.getByText('Qayta o‘lchov yuborildi: 128/82 mm sim. ust.')).toBeVisible();

  await page.getByText('Shoshilinch simptom bildirish', { exact: true }).click();
  await page.getByLabel('Belgi turi').selectOption('dizziness');
  await page.getByLabel('Qisqa izoh (ixtiyoriy)').fill('Kechqurun bosh aylandi');
  await page.getByRole('button', { name: 'Shifokorga yuborish' }).click();
  await expect(page.getByText('Kechqurun bosh aylandi')).toBeVisible();

  await page.getByRole('button', { name: /Shifokor sifatida ko‘rish/ }).click();
  const urgentSection = page.getByRole('region', { name: /Shoshilinch simptomlar/ });
  await expect(urgentSection).toContainText('Bosh aylanishi');
  await urgentSection.getByText('Ko‘rib chiqish', { exact: true }).click();
  await urgentSection.locator('.template-chip').first().click();
  await urgentSection.getByRole('button', { name: 'Qaydni tasdiqlash' }).click();

  const reviewed = page.getByRole('region', { name: 'Ko‘rib chiqilgan qaydlar' });
  await expect(reviewed).toContainText('Dorini oldim va ichdim');
  await expect(reviewed).toContainText('Qayta o‘lchov: 128/82 mmHg');
  await expect(reviewed).toContainText('Bosh aylanishi · L4');
  await expect(page.getByRole('heading', { name: '7 kunlik klinik xulosa' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xulosani nusxalash' })).toBeVisible();
});

test('deduplicates simultaneous supply confirmations for one reviewed flag', async ({ page, baseURL }) => {
  await assignDemoPlan(page);
  await enterRole(page, 'patient');
  await page.getByText('Icha olmadim', { exact: true }).click();
  await page.getByLabel('Nega icha olmadingiz?').selectOption('out_of_supply');
  await page.getByRole('button', { name: 'Sababni yuborish' }).click();

  await enterRole(page, 'doctor');
  const entry = page.getByRole('article', { name: 'Dori tugadi' });
  await entry.getByText('Ko‘rib chiqish', { exact: true }).click();
  await entry.locator('.template-chip').first().click();
  await entry.getByRole('button', { name: 'Qaydni tasdiqlash' }).click();
  await enterRole(page, 'patient');
  const form = page.locator('form[action="/api/demo/followup"]').filter({ hasText: 'Dorini oldim va ichdim' });
  const flagId = await form.locator('input[name="flagId"]').inputValue();
  const responses = await Promise.all(Array.from({ length: 6 }, () => page.request.post('/api/demo/followup', {
    headers: { origin: baseURL! },
    form: { flagId, kind: 'supply_resolved' },
    maxRedirects: 0,
  })));
  expect(responses.map(response => response.status())).toEqual(Array(6).fill(303));
  const redirects = responses.map(response => response.headers().location);
  expect(redirects.filter(location => location === '/patient')).toHaveLength(1);
  expect(redirects.filter(location => location === '/patient?result=already_saved')).toHaveLength(5);

  await page.reload();
  await expect(page.getByText('Sizning tasdiqingiz: Dorini oldim va ichdim.')).toBeVisible();
});

test('shows live BP zone preview, completes Teach-Back, and filters doctor queue', async ({ page }) => {
  await assignDemoPlan(page);
  await enterRole(page, 'patient');

  await page.getByLabel('Sistolik bosim').fill('152');
  await page.getByLabel('Diastolik bosim').fill('88');
  await expect(page.getByText(/Yuqori chegara.*shifokorga shoshilinch navbatga tushadi/)).toBeVisible();

  await page.getByText(/Qisqa 3 ta savol bilan rejani tekshiring/).click();
  await page.getByRole('button', { name: /Namuna dori · soat 08:00 da/ }).click();
  await page.getByRole('button', { name: /5 mg yozilgan qutini/ }).click();
  await page.getByRole('button', { name: /103 ga qo‘ng‘iroq qilaman/ }).click();
  await expect(page.getByText('Reja tushunildi (3/3)', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Qaydni yuborish' }).click();
  await page.getByRole('button', { name: /Shifokor sifatida ko‘rish/ }).click();
  await expect(page.getByRole('group', { name: 'Navbatni filtrlash' })).toBeVisible();
  await page.getByRole('button', { name: /Tez ko‘rib chiqish/ }).click();
  await expect(page.getByRole('region', { name: 'Bemorlar navbati' }).getByRole('article')).toHaveCount(1);
});

test('escalates still_need_help and elevated retake BP to doctor follow-up alerts and renders 7-day BP trend', async ({ page }) => {
  await assignDemoPlan(page);
  await enterRole(page, 'patient');

  await page.getByText('Icha olmadim', { exact: true }).click();
  await page.getByLabel('Nega icha olmadingiz?').selectOption('out_of_supply');
  await page.getByRole('button', { name: 'Sababni yuborish' }).click();

  await page.getByLabel('Sistolik bosim').fill('155');
  await page.getByLabel('Diastolik bosim').fill('90');
  await page.getByRole('button', { name: 'Qaydni yuborish' }).click();

  await page.getByRole('button', { name: /Shifokor sifatida ko‘rish/ }).click();
  const queue = page.getByRole('region', { name: 'Bemorlar navbati' });

  const supplyEntry = queue.getByRole('article', { name: 'Dori tugadi' });
  await supplyEntry.getByText('Ko‘rib chiqish', { exact: true }).click();
  await supplyEntry.locator('.template-chip').first().click();
  await supplyEntry.getByRole('button', { name: 'Qaydni tasdiqlash' }).click();

  const bpEntry = queue.getByRole('article', { name: 'Bosim reja chegarasiga yetdi' });
  await bpEntry.getByText('Ko‘rib chiqish', { exact: true }).click();
  await bpEntry.locator('.template-chip').first().click();
  await bpEntry.getByRole('button', { name: 'Qayta o‘lchashni so‘rash' }).click();

  // Patient reports still_need_help AND submits an elevated retake BP (triggers live warning + doctor escalation)
  await page.getByRole('button', { name: /Bemor sifatida ko‘rish/ }).click();
  await page.getByRole('button', { name: 'Hali yordam kerak' }).click();
  await expect(page.getByText('Sizning xabaringiz: Hali yordam kerak.')).toBeVisible();

  await page.getByLabel('Qayta sistolik').fill('158');
  await page.getByLabel('Qayta diastolik').fill('94');
  await expect(page.getByText(/Yuqori chegara.*shifokorga shoshilinch navbatga tushadi/)).toBeVisible();
  await page.getByRole('button', { name: 'Qayta o‘lchovni yuborish' }).click();
  await expect(page.getByText('Qayta o‘lchov yuborildi: 158/94 mm sim. ust.')).toBeVisible();

  await page.getByRole('button', { name: /Shifokor sifatida ko‘rish/ }).click();
  const followupSection = page.getByRole('region', { name: /Qayta aloqa va nazorat/ });
  await expect(followupSection).toBeVisible();
  await expect(followupSection).toContainText('Dori ta’minoti: bemor hali yordam so‘ramoqda');
  await expect(followupSection).toContainText('Qayta bosim yuqori chegarada');
  await expect(followupSection.getByRole('link', { name: /Asosiy qaydga o‘tish/ })).toHaveCount(2);
  await expect(page.getByRole('region', { name: 'Ko‘rib chiqilgan qaydlar' })).toContainText('Yuqori chegara');
  await expect(page.getByText('Ochiq murojaatlar: 2')).toBeVisible();
  await expect(page.getByText('Qon bosimi dinamikasi (2 qayd)')).toBeVisible();

  // Patient later resolves supply and normalizes BP -> escalations clear
  await page.getByRole('button', { name: /Bemor sifatida ko‘rish/ }).click();
  await page.getByRole('button', { name: 'Dorini oldim va ichdim' }).click();
  await page.getByLabel('Qayta sistolik').fill('124');
  await page.getByLabel('Qayta diastolik').fill('80');
  await page.getByRole('button', { name: 'Qayta o‘lchovni yuborish' }).click();

  await page.getByRole('button', { name: /Shifokor sifatida ko‘rish/ }).click();
  await expect(page.getByRole('region', { name: /Qayta aloqa va nazorat/ })).toHaveCount(0);
  await expect(page.getByText('Ochiq murojaatlar: 0')).toBeVisible();
  await expect(page.getByText('Qon bosimi dinamikasi (3 qayd)')).toBeVisible();
});

test('allows doctor to acknowledge follow-up escalations safely and re-escalates new patient help requests', async ({ page, browser }) => {
  await assignDemoPlan(page);
  await enterRole(page, 'patient');

  await page.getByText('Icha olmadim', { exact: true }).click();
  await page.getByLabel('Nega icha olmadingiz?').selectOption('out_of_supply');
  await page.getByRole('button', { name: 'Sababni yuborish' }).click();

  await page.getByLabel('Sistolik bosim').fill('155');
  await page.getByLabel('Diastolik bosim').fill('90');
  await page.getByRole('button', { name: 'Qaydni yuborish' }).click();

  await page.getByRole('button', { name: /Shifokor sifatida ko‘rish/ }).click();
  const queue = page.getByRole('region', { name: 'Bemorlar navbati' });

  const supplyEntry = queue.getByRole('article', { name: 'Dori tugadi' });
  await supplyEntry.getByText('Ko‘rib chiqish', { exact: true }).click();
  await supplyEntry.locator('.template-chip').first().click();
  await supplyEntry.getByRole('button', { name: 'Qaydni tasdiqlash' }).click();

  const bpEntry = queue.getByRole('article', { name: 'Bosim reja chegarasiga yetdi' });
  await bpEntry.getByText('Ko‘rib chiqish', { exact: true }).click();
  await bpEntry.locator('.template-chip').first().click();
  await bpEntry.getByRole('button', { name: 'Qayta o‘lchashni so‘rash' }).click();

  await page.getByRole('button', { name: /Bemor sifatida ko‘rish/ }).click();
  await page.getByRole('button', { name: 'Hali yordam kerak' }).click();
  await page.getByLabel('Qayta sistolik').fill('158');
  await page.getByLabel('Qayta diastolik').fill('94');
  await page.getByRole('button', { name: 'Qayta o‘lchovni yuborish' }).click();

  await page.getByRole('button', { name: /Shifokor sifatida ko‘rish/ }).click();
  const followupSection = page.getByRole('region', { name: /Qayta aloqa va nazorat/ });
  await expect(followupSection).toContainText('Qayta aloqa va nazorat (2)');

  const helpAlert = followupSection.getByRole('article', { name: /Dori ta’minoti: bemor hali yordam so‘ramoqda/ });
  const helpFollowupId = await helpAlert.locator('[name="followupId"]').inputValue();
  expect(helpFollowupId).toBeTruthy();

  const origin = new URL(page.url()).origin;
  const isolated = await browser.newContext({ baseURL: origin });
  try {
    const otherDoctor = await isolated.newPage();
    await enterRole(otherDoctor, 'doctor');
    const crossWorkspace = await otherDoctor.request.post('/api/demo/followup-ack', {
      headers: { Origin: origin },
      maxRedirects: 0,
      form: { followupId: helpFollowupId, note: 'Boshqa shifokor' },
    });
    expect(crossWorkspace.status()).toBe(303);
    expect(crossWorkspace.headers()['location']).toBe('/doctor?result=not_found');
  } finally {
    await isolated.close();
  }

  const privateNote = 'Telefon orqali bog‘landim — faqat ichki izoh';
  await helpAlert.getByLabel('Ichki izoh (ixtiyoriy)').fill(privateNote);
  await helpAlert.getByRole('button', { name: 'Bog‘landim · Nazoratni yopish' }).click();

  await expect(followupSection).toContainText('Qayta aloqa va nazorat (1)');
  await expect(page.getByText('Ochiq murojaatlar: 1')).toBeVisible();

  // Repeating acknowledgment for the same followup is idempotent
  const repeatAck = await page.request.post('/api/demo/followup-ack', {
    headers: { Origin: origin },
    maxRedirects: 0,
    form: { followupId: helpFollowupId, note: 'Ikkinchi izoh' },
  });
  expect(repeatAck.status()).toBe(303);
  expect(repeatAck.headers()['location']).toBe('/doctor?result=already_saved');

  // Acknowledge elevated retake BP with 1 click (optional note blank)
  const bpAlert = followupSection.getByRole('article', { name: /Qayta bosim yuqori chegarada/ });
  await bpAlert.getByRole('button', { name: 'Bog‘landim · Nazoratni yopish' }).click();

  await expect(page.getByRole('region', { name: /Qayta aloqa va nazorat/ })).toHaveCount(0);
  await expect(page.getByText('Ochiq murojaatlar: 0')).toBeVisible();
  const reviewed = page.getByRole('region', { name: 'Ko‘rib chiqilgan qaydlar' });
  await expect(reviewed).toContainText('Yuqori chegara');
  await expect(reviewed.getByText('Shifokor ko‘rdi', { exact: true })).toHaveCount(2);
  await expect(page.getByText(/2 tasi shifokor tomonidan ko‘rilgan/)).toBeVisible();

  // Switch to patient: private note must NOT leak, patient cannot call followup-ack, and new help request re-escalates
  await page.getByRole('button', { name: /Bemor sifatida ko‘rish/ }).click();
  await expect(page.getByText('Shifokor ko‘rdi', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Shifokorga bildirildi', { exact: true })).toHaveCount(0);
  await expect(page.getByText(privateNote)).toHaveCount(0);

  // Extract flag IDs from the patient followup forms to test cross-kind/wrong-decision rejection
  const supplyFlagId = await page.locator('form').filter({ has: page.getByRole('button', { name: 'Dorini oldim va ichdim' }) })
    .locator('[name="flagId"]').inputValue();
  const bpFlagId = await page.locator('form').filter({ has: page.getByRole('button', { name: 'Qayta o‘lchovni yuborish' }) })
    .locator('[name="flagId"]').inputValue();

  const wrongKindOnBp = await page.request.post('/api/demo/followup', {
    headers: { Origin: origin },
    maxRedirects: 0,
    form: { flagId: bpFlagId, kind: 'still_need_help' },
  });
  expect(wrongKindOnBp.headers()['location']).toBe('/patient?result=not_found');

  const wrongKindOnSupply = await page.request.post('/api/demo/followup', {
    headers: { Origin: origin },
    maxRedirects: 0,
    form: { flagId: supplyFlagId, kind: 'retake_vitals', systolic: '160', diastolic: '96' },
  });
  expect(wrongKindOnSupply.headers()['location']).toBe('/patient?result=not_found');

  const wrongMedRetakeOnBp = await page.request.post('/api/demo/followup', {
    headers: { Origin: origin },
    maxRedirects: 0,
    form: { flagId: bpFlagId, kind: 'retake_medication', medicationStatus: 'missed' },
  });
  expect(wrongMedRetakeOnBp.headers()['location']).toBe('/patient?result=not_found');

  const forbidden = await page.request.post('/api/demo/followup-ack', {
    headers: { Origin: origin },
    maxRedirects: 0,
    form: { followupId: helpFollowupId },
  });
  expect(forbidden.status()).toBe(403);

  await page.getByRole('button', { name: 'Hali yordam kerak' }).click();
  await page.getByRole('button', { name: /Shifokor sifatida ko‘rish/ }).click();
  await expect(page.getByRole('region', { name: /Qayta aloqa va nazorat/ })).toContainText('Qayta aloqa va nazorat (1)');
  await expect(page.getByText('Ochiq murojaatlar: 1')).toBeVisible();

  // Patient submits supply_resolved + normal retake BP -> doctor cannot spuriously ack closed/normal followups,
  // and patient cannot reopen a resolved supply loop with still_need_help.
  await page.getByRole('button', { name: /Bemor sifatida ko‘rish/ }).click();
  await page.getByRole('button', { name: 'Dorini oldim va ichdim' }).click();
  const reopenAttempt = await page.request.post('/api/demo/followup', {
    headers: { Origin: origin },
    maxRedirects: 0,
    form: { flagId: supplyFlagId, kind: 'still_need_help' },
  });
  expect(reopenAttempt.headers()['location']).toBe('/patient?result=already_saved');

  await page.getByLabel('Qayta sistolik').fill('122');
  await page.getByLabel('Qayta diastolik').fill('78');
  await page.getByRole('button', { name: 'Qayta o‘lchovni yuborish' }).click();

  const sql = neon(process.env.SHIFO_E2E_DATABASE_URL!);
  const [resolvedRow] = await sql`
    SELECT id FROM shifohalqa.flag_followups WHERE flag_id = ${supplyFlagId} AND kind = 'supply_resolved' LIMIT 1
  `;
  const [normalRetakeRow] = await sql`
    SELECT id FROM shifohalqa.flag_followups
    WHERE flag_id = ${bpFlagId} AND kind = 'retake_vitals' AND (payload->>'systolic')::int = 122
    LIMIT 1
  `;

  await page.getByRole('button', { name: /Shifokor sifatida ko‘rish/ }).click();
  const ackResolved = await page.request.post('/api/demo/followup-ack', {
    headers: { Origin: origin },
    maxRedirects: 0,
    form: { followupId: String(resolvedRow.id) },
  });
  expect(ackResolved.headers()['location']).toBe('/doctor?result=not_found');

  const ackNormalRetake = await page.request.post('/api/demo/followup-ack', {
    headers: { Origin: origin },
    maxRedirects: 0,
    form: { followupId: String(normalRetakeRow.id) },
  });
  expect(ackNormalRetake.headers()['location']).toBe('/doctor?result=not_found');

  // Aging an old reviewed BP flag with a normal latest retake >7 days must let it age out of the 7-day doctor view.
  await sql.transaction((tx) => [
    tx`UPDATE shifohalqa.task_instances AS task
       SET scheduled_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date - 10
       FROM shifohalqa.evidence_logs AS ev
       JOIN shifohalqa.flags AS f ON f.evidence_log_id = ev.id
       WHERE f.id = ${bpFlagId} AND task.id = ev.task_instance_id`,
    tx`UPDATE shifohalqa.flags SET reviewed_at = CURRENT_TIMESTAMP - INTERVAL '10 days' WHERE id = ${bpFlagId}`,
    tx`UPDATE shifohalqa.flag_followups
       SET created_at = CURRENT_TIMESTAMP - INTERVAL '9 days',
           acknowledged_at = CASE WHEN acknowledged_at IS NOT NULL THEN CURRENT_TIMESTAMP - INTERVAL '9 days' ELSE NULL END
       WHERE flag_id = ${bpFlagId}`,
  ]);
  await page.reload();
  await expect(page.getByRole('region', { name: 'Ko‘rib chiqilgan qaydlar' }).getByRole('article', { name: 'Bosim reja chegarasiga yetdi' })).toHaveCount(0);
});

test('renders doctor 7-day brief and BP trend cleanly under @media print without interactive chrome or overflow', async ({ page }) => {
  await assignDemoPlan(page);
  await enterRole(page, 'patient');

  await page.getByText('Icha olmadim', { exact: true }).click();
  await page.getByLabel('Nega icha olmadingiz?').selectOption('out_of_supply');
  await page.getByRole('button', { name: 'Sababni yuborish' }).click();

  await page.getByLabel('Sistolik bosim').fill('155');
  await page.getByLabel('Diastolik bosim').fill('90');
  await page.getByRole('button', { name: 'Qaydni yuborish' }).click();

  await page.getByRole('button', { name: /Shifokor sifatida ko‘rish/ }).click();
  const bpEntry = page.getByRole('region', { name: 'Bemorlar navbati' }).getByRole('article', { name: 'Bosim reja chegarasiga yetdi' });
  await bpEntry.getByText('Ko‘rib chiqish', { exact: true }).click();
  await bpEntry.locator('.template-chip').first().click();
  await bpEntry.getByRole('button', { name: 'Qayta o‘lchashni so‘rash' }).click();

  await page.getByRole('button', { name: /Bemor sifatida ko‘rish/ }).click();
  await page.getByLabel('Qayta sistolik').fill('126');
  await page.getByLabel('Qayta diastolik').fill('80');
  await page.getByRole('button', { name: 'Qayta o‘lchovni yuborish' }).click();

  await page.getByRole('button', { name: /Shifokor sifatida ko‘rish/ }).click();
  await expect(page.getByRole('heading', { name: '7 kunlik klinik xulosa' })).toBeVisible();
  await expect(page.getByText('Qon bosimi dinamikasi (2 qayd)')).toBeVisible();

  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: 'print' });

  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.locator('.sticky-bar')).toBeHidden();
  await expect(page.locator('.brief-actions')).toBeHidden();
  await expect(page.locator('.filter-bar')).toBeHidden();
  await expect(page.locator('.role-actions')).toBeHidden();

  const visibleForms = await page.locator('form').evaluateAll((forms) =>
    forms.filter((el) => window.getComputedStyle(el).display !== 'none').length,
  );
  expect(visibleForms).toBe(0);

  await expect(page.getByRole('heading', { name: '7 kunlik klinik xulosa' })).toBeVisible();
  await expect(page.getByText('Qon bosimi dinamikasi (2 qayd)')).toBeVisible();
  await expect(page.locator('.bp-trend-row')).toHaveCount(2);

  const a4Overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(a4Overflow).toBeLessThanOrEqual(0);

  // Also check narrow print width does not overflow horizontally
  await page.setViewportSize({ width: 360, height: 800 });
  const narrowPrintOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(narrowPrintOverflow).toBeLessThanOrEqual(0);

  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('.site-header')).toBeVisible();
  await expect(page.locator('.sticky-bar')).toBeVisible();
});
