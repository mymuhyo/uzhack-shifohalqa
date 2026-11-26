import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { findActiveMobilePatientMembership, getSupabasePublicEnv } from '../../../../../lib/auth';
import { getDatabase } from '../../../../../lib/db';
import { readMobileBody } from '../../../../../lib/mobile-demo';
import type { Database } from '../../../../../lib/supabase/database.types';

const mobileLoginSchema = z.strictObject({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(1).max(128),
  workspaceId: z.uuid().optional(),
});

const noStoreHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
};

function mobileLoginJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: noStoreHeaders });
}

export async function POST(request: Request) {
  try {
    const raw = await readMobileBody(request);
    if (!raw.ok) {
      return mobileLoginJson({ error: raw.status === 413 ? 'too_large' : 'invalid' }, raw.status === 413 ? 413 : 400);
    }

    const parsed = mobileLoginSchema.safeParse(raw.body);
    if (!parsed.success) {
      return mobileLoginJson({ error: 'invalid' }, 400);
    }

    const sql = getDatabase();
    const env = getSupabasePublicEnv();
    if (!sql || !env) {
      return mobileLoginJson({ error: 'unavailable' }, 503);
    }

    const supabase = createClient<Database>(env.url, env.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { email, password, workspaceId } = parsed.data;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const statusCode = typeof (error as { status?: unknown }).status === 'number'
        ? (error as { status: number }).status
        : null;
      const errorCode = typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : null;
      if (statusCode === 429 || errorCode === 'over_request_rate_limit') {
        return mobileLoginJson({ error: 'rate_limited' }, 429);
      }
      if (statusCode !== null && statusCode >= 500) {
        return mobileLoginJson({ error: 'unavailable' }, 503);
      }
      return mobileLoginJson({ error: 'invalid_credentials' }, 401);
    }
    if (!data.user || !data.session?.access_token) {
      return mobileLoginJson({ error: 'invalid_credentials' }, 401);
    }

    const membership = await findActiveMobilePatientMembership(sql, data.user.id, workspaceId ?? null);
    if (!membership) {
      return mobileLoginJson({ error: 'forbidden' }, 403);
    }

    const expiresAtMs = typeof data.session.expires_at === 'number'
      ? data.session.expires_at * 1000
      : Date.now() + (typeof data.session.expires_in === 'number' ? data.session.expires_in : 3600) * 1000;
    return mobileLoginJson(
      {
        token: data.session.access_token,
        expiresAt: new Date(expiresAtMs).toISOString(),
        workspaceId: membership.workspaceId,
        patientName: membership.patientName,
        isDemo: false,
      },
      200,
    );
  } catch {
    return mobileLoginJson({ error: 'unavailable' }, 503);
  }
}
