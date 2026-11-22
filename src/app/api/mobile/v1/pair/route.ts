import { androidPairingForm, isAndroidDemoEnabled, mobileJson, readMobileBody, redeemAndroidPairing } from '@/lib/mobile-demo';

export async function POST(request: Request) {
  if (!isAndroidDemoEnabled()) return mobileJson({ error: 'not_found' }, 404);
  const raw = await readMobileBody(request);
  if (!raw.ok) return mobileJson({ error: raw.status === 413 ? 'too_large' : 'invalid' }, raw.status === 413 ? 413 : 400);
  const input = androidPairingForm.safeParse(raw.body);
  if (!input.success) return mobileJson({ error: 'invalid' }, 400);
  try {
    const session = await redeemAndroidPairing(input.data.code);
    return session ? mobileJson(session) : mobileJson({ error: 'invalid_code' }, 401);
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
