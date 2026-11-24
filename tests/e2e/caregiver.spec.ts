import { expect, test } from 'playwright/test';
import { digestCaregiverToken } from '../../src/lib/caregiver';
import { createDatabase } from '../../src/lib/db';

test.describe.configure({ timeout: 90_000 });

test('a patient shares only the current daily aggregate and can rotate, revoke and expire the anonymous link', async ({ page, browser, baseURL }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Shifokor sifatida kirish' }).click();
  await expect(page.getByRole('heading', { name: 'Yaqinim' })).toHaveCount(0);
  const management = '/api/demo/caregiver';
  const request = (action: 'enable' | 'disable') => ({ headers: { origin: baseURL! }, data: { action } });
  expect((await page.request.post(management, request('enable'))).status()).toBe(403);
  await page.getByLabel('Dori vaqti').fill('00:00');
  await page.getByLabel('Bosim o‘lchash vaqti').fill('00:00');
  await page.getByRole('button', { name: 'Rejani biriktirish' }).click();
  await expect(page.getByRole('heading', { name: 'Biriktirilgan reja' })).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: 'Bemor sifatida kirish' }).click();
  await page.getByText('Icha olmadim', { exact: true }).click();
  await page.getByLabel('Nega icha olmadingiz?').selectOption('out_of_supply');
  await page.getByRole('button', { name: 'Sababni yuborish' }).click();
  await page.getByLabel('Sistolik bosim').fill('123');
  await page.getByLabel('Diastolik bosim').fill('81');
  await page.getByRole('button', { name: 'Qaydni yuborish' }).click();
  const shareLink = page.getByLabel('Yaqiningizga beriladigan havola');
  await expect(shareLink).toHaveCount(0);
  await page.getByRole('button', { name: 'Ulashishni yoqish' }).click();
  await expect(shareLink).toBeVisible();
  const firstLink = await shareLink.inputValue();

  const guest = await browser.newContext();
  const caregiver = await guest.newPage();
  try {
    const publicResponse = await caregiver.goto(firstLink);
    expect(publicResponse?.headers()['cache-control']).toContain('no-store');
    expect(publicResponse?.headers()['referrer-policy']).toBe('no-referrer');
    expect(publicResponse?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(caregiver.getByRole('heading', { name: 'Bugungi qisqa holat' })).toBeVisible();
    await expect(caregiver.getByText('2 ta vazifaning muddati keldi.')).toBeVisible();
    await expect(caregiver.getByText('2 ta vazifaga javob berildi.')).toBeVisible();
    await expect(caregiver.getByText('1 ta vazifa bajarildi.')).toBeVisible();
    await expect(caregiver.getByText(/Farg‘ona.*Kuala Lumpur/)).toBeVisible();
    await expect(caregiver.getByRole('main')).not.toContainText(/Anvar|Sardor|123|Dori tugadi|Namuna dori|diastolik/i);
    expect(await caregiver.locator('meta[name=robots]').getAttribute('content')).toBe('noindex, nofollow');
    const auditBeforeWrite = await readAudit(firstLink);
    expect(auditBeforeWrite).toEqual(expect.arrayContaining(['share_enabled', 'summary_viewed']));
    expect((await caregiver.request.post(firstLink)).status()).toBe(405);
    expect((await caregiver.request.post(new URL(management, firstLink).href, request('disable'))).status()).toBe(403);

    await caregiver.goto(new URL('/', firstLink).href);
    await caregiver.getByRole('button', { name: 'Bemor sifatida kirish' }).click();
    await caregiver.getByRole('button', { name: 'Ulashishni yoqish' }).click();
    const otherShare = caregiver.getByLabel('Yaqiningizga beriladigan havola');
    await expect(otherShare).toBeVisible();
    const otherLink = await otherShare.inputValue();
    await caregiver.goto(otherLink);
    await expect(caregiver.getByText('Bugun muddati kelgan vazifa yo‘q.')).toBeVisible();
    await caregiver.goto(firstLink);
    await expect(caregiver.getByText('2 ta vazifaga javob berildi.')).toBeVisible();
    expect((await caregiver.request.post(new URL(management, firstLink).href, {
      headers: { origin: baseURL! }, data: { action: 'disable', token: new URL(firstLink).pathname.split('/').at(-1) },
    })).status()).toBe(400);
    expect((await page.request.post(management, {
      headers: { origin: 'https://example.invalid' }, data: { action: 'disable' },
    })).status()).toBe(403);

    await page.reload();
    await expect(shareLink).toHaveCount(0);
    await page.getByRole('button', { name: 'Havolani yangilash' }).click();
    await expect(shareLink).toBeVisible();
    const renewedLink = await shareLink.inputValue();
    expect(renewedLink).not.toBe(firstLink);
    await caregiver.reload();
    await expect(caregiver.getByText(/Havola faol emas/)).toBeVisible();
    await caregiver.goto(renewedLink);
    await expect(caregiver.getByText('2 ta vazifaga javob berildi.')).toBeVisible();

    await page.getByRole('button', { name: 'Ulashishni o‘chirish' }).click();
    await expect(page.getByText('Ulashish o‘chiq. Yangi havola 24 soat ishlaydi.')).toBeVisible();
    await caregiver.reload();
    await expect(caregiver.getByText(/Havola faol emas/)).toBeVisible();
    expect(await readAudit(renewedLink)).toEqual(expect.arrayContaining(['share_enabled', 'share_disabled', 'summary_viewed']));
    await caregiver.goto(otherLink);
    await expect(caregiver.getByText('Bugun muddati kelgan vazifa yo‘q.')).toBeVisible();

    await page.getByRole('button', { name: 'Ulashishni yoqish' }).click();
    await expect(shareLink).toBeVisible();
    const expiringLink = await shareLink.inputValue();
    const sql = createDatabase(process.env.SHIFO_E2E_DATABASE_URL!);
    let expired: Record<string, unknown> | undefined;
    try {
      [expired] = await sql`
        UPDATE public.caregiver_links SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
        WHERE token_hash = ${hashLink(expiringLink)}
        RETURNING 1 AS matched
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
    expect(expired?.matched).toBe(1);
    await caregiver.goto(expiringLink);
    await expect(caregiver.getByText(/Havola faol emas/)).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Ulashishni yoqish' }).click();
    const ackLink = await shareLink.inputValue();
    await caregiver.goto(ackLink);
    await expect(caregiver.getByText('Oila yordami kerak', { exact: true })).toBeVisible();
    await expect(caregiver.getByRole('main')).not.toContainText(/Anvar|Sardor|123|Dori tugadi|Namuna dori|diastolik/i);
    await caregiver.getByRole('button', { name: 'Xabar oldim — yordam beramiz' }).click();
    await expect(caregiver.getByText(/Tasdiq yuborildi/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Yaqiningiz xabaringizni ko‘rdi/)).toBeVisible();
  } finally {
    await guest.close();
  }
});

function hashLink(link: string) {
  return digestCaregiverToken(new URL(link).pathname.split('/').at(-1));
}

async function readAudit(link: string) {
  const sql = createDatabase(process.env.SHIFO_E2E_DATABASE_URL!);
  try {
    const rows = await sql`
      SELECT audit.action
      FROM public.caregiver_links AS link
      JOIN public.caregiver_audit_events AS audit
        ON audit.workspace_id = link.workspace_id AND audit.patient_id = link.patient_id
      WHERE link.token_hash = ${hashLink(link)}
    `;
    return rows.map(row => row.action);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
