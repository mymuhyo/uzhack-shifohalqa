import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { acknowledgeCaregiverHelp } from '@/lib/caregiver-store';
import { isSameOriginDemoPost } from '@/lib/demo-session';
import { readRequestJson } from '@/lib/request-body';

const ackInput = z.strictObject({
  token: z.string().min(1),
  kind: z.enum(['supply_on_the_way', 'checked_in']),
});

function json(data: object, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginDemoPost(request)) return json({ error: 'forbidden' }, 403);
  const body = await readRequestJson(request, 2048);
  if (!body.ok) return json({ error: 'invalid' }, 400);
  const parsed = ackInput.safeParse(body.body);
  if (!parsed.success) return json({ error: 'invalid' }, 400);

  try {
    const saved = await acknowledgeCaregiverHelp(parsed.data.token, parsed.data.kind);
    if (!saved) return json({ error: 'not_found' }, 404);
    return json(saved, 200);
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
}
