import { androidPairingForm, isAndroidDemoEnabled, mobileJson, readMobileBody, redeemAndroidPairing } from '@/lib/mobile-demo';

export async function POST(request: Request) {
  if (!isAndroidDemoEnabled()) return mobileJson({ error: 'not_found' }, 404);
  const input = androidPairingForm.safeParse(await readMobileBody(request));
  if (!input.success) return mobileJson({ error: 'invalid' }, 400);
  try {
    const session = await redeemAndroidPairing(input.data.code);
    return session ? mobileJson(session) : mobileJson({ error: 'invalid_code' }, 401);
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
