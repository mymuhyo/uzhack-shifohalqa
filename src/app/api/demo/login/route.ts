import { type NextRequest, NextResponse } from 'next/server';
import { clearSupabaseCookies } from '../../../../lib/auth';
import { demoRoleSchema, isDemoEnabled, isSameOriginDemoPost, issueDemoSession } from '../../../../lib/demo-session';
import { readRequestText } from '../../../../lib/request-body';

export async function POST(request: NextRequest): Promise<Response> {
  if (!isDemoEnabled()) return new Response('Demo rejimi yopiq.', { status: 404 });
  if (!isSameOriginDemoPost(request)) return new Response('So‘rov rad etildi.', { status: 403 });

  const form = await readRequestText(request, 'application/x-www-form-urlencoded', 1024);
  if (!form.ok) return new Response('Demo rolini tanlang.', { status: form.status });
  const roles = new URLSearchParams(form.text).getAll('role');
  const role = demoRoleSchema.safeParse(roles.length === 1 ? roles[0] : undefined);
  if (!role.success) return new Response('Demo rolini tanlang.', { status: 400 });

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: role.data === 'doctor' ? '/doctor' : '/patient', 'Cache-Control': 'no-store' },
  });
  if (!issueDemoSession(request, response, role.data)) return new Response('Demo rejimi yopiq.', { status: 404 });
  clearSupabaseCookies(request, response);
  return response;
}
