import { NextResponse, type NextRequest } from 'next/server';
import { clearSupabaseCookies, createSupabaseRouteClient } from '../../../../lib/auth';
import { clearDemoSession } from '../../../../lib/demo-session';
import { isSameOriginPost } from '../../../../lib/request-body';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function POST(request: NextRequest) {
  if (!isSameOriginPost(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
  }

  const routeClient = createSupabaseRouteClient(request);
  if (routeClient) {
    await routeClient.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true }, { status: 200, headers: noStore });
  clearDemoSession(request, response);
  clearSupabaseCookies(request, response);
  routeClient?.applyToResponse(response);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
