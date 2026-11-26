import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDatabase } from '../../../../../lib/db';
import { readMobileBody } from '../../../../../lib/mobile-demo';
import type { Database } from '../../../../../lib/supabase/database.types';

const mobileLoginSchema = z.strictObject({
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(1).max(128),
  workspaceId: z.uuid().optional(),
});

const mobileLoginMembershipSchema = z.object({
  workspaceId: z.uuid(),
  patientId: z.uuid().nullable(),
  role: z.enum(['doctor', 'patient', 'caregiver', 'individual']),
  patientName: z.string().nullable(),
  isDemo: z.literal(false).optional().default(false),
});

const noStoreHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
};

function mobileLoginJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: noStoreHeaders });
}

function getSupabasePublicEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    '';
  if (!url || !key) return null;
  return { url, key };
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
    if (error || !data.user || !data.session?.access_token) {
      return mobileLoginJson({ error: 'invalid_credentials' }, 401);
    }

    const rows = await sql`
      SELECT cm.workspace_id AS "workspaceId",
             p.id AS "patientId",
             cm.role,
             p.name AS "patientName",
             w.is_demo AS "isDemo"
      FROM public.clinic_memberships AS cm
      JOIN public.workspaces AS w ON w.id = cm.workspace_id AND w.is_demo = false
      LEFT JOIN public.patients AS p ON p.workspace_id = cm.workspace_id AND p.id = cm.actor_id
      WHERE cm.user_id = ${data.user.id}
        AND cm.is_demo = false
        AND cm.status = 'active'
        AND w.is_demo = false
        AND (${workspaceId ?? null}::uuid IS NULL OR cm.workspace_id = ${workspaceId ?? null}::uuid)
      ORDER BY (cm.role IN ('patient', 'individual')) DESC, cm.created_at DESC, cm.id DESC
    `;

    for (const rawRow of rows) {
      const membership = mobileLoginMembershipSchema.safeParse(rawRow);
      if (!membership.success) continue;
      if ((membership.data.role === 'patient' || membership.data.role === 'individual') && membership.data.patientId) {
        const expiresAtMs = typeof data.session.expires_at === 'number'
          ? data.session.expires_at * 1000
          : Date.now() + (typeof data.session.expires_in === 'number' ? data.session.expires_in : 3600) * 1000;
        return mobileLoginJson(
          {
            token: data.session.access_token,
            expiresAt: new Date(expiresAtMs).toISOString(),
            workspaceId: membership.data.workspaceId,
            patientName: membership.data.patientName ?? 'Bemor',
            isDemo: false,
          },
          200,
        );
      }
    }

    return mobileLoginJson({ error: 'forbidden' }, 403);
  } catch {
    return mobileLoginJson({ error: 'unavailable' }, 503);
  }
}
