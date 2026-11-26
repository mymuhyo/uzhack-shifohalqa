import { z } from 'zod';
import { createStatelessSupabaseClient, resolveMobileClinicPatient } from '../../../../../lib/auth';
import { mobileJson, readMobileBody } from '../../../../../lib/mobile-demo';

const loginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  try {
    const body = await readMobileBody(request);
    if (!body.ok) return mobileJson({ error: body.status === 413 ? 'too_large' : 'invalid' }, body.status);
    const input = loginSchema.safeParse(body.body);
    if (!input.success) return mobileJson({ error: 'invalid' }, 400);

    const client = createStatelessSupabaseClient();
    if (!client) return mobileJson({ error: 'unavailable' }, 503);
    const { data, error } = await client.auth.signInWithPassword(input.data);
    if (error?.status === 429) return mobileJson({ error: 'rate_limited' }, 429);
    if (error && (!error.status || error.status >= 500)) return mobileJson({ error: 'unavailable' }, 503);
    if (error || !data.user || !data.session) return mobileJson({ error: 'invalid_credentials' }, 401);

    const result = await resolveMobileClinicPatient(data.user.id);
    if (!result.ok) return mobileJson({ error: result.error }, result.status);
    const expiry = data.session.expires_at;
    if (!expiry || !data.session.access_token) return mobileJson({ error: 'unavailable' }, 503);
    return mobileJson({
      token: data.session.access_token,
      expiresAt: new Date(expiry * 1000).toISOString(),
      workspaceId: result.actor.workspaceId,
      patientName: result.patientName,
      isDemo: false,
    });
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
