import { type NextRequest, NextResponse } from 'next/server';
import { clearDemoSession, isSameOriginDemoPost } from '../../../../lib/demo-session';

export function POST(request: NextRequest): Response {
  if (!isSameOriginDemoPost(request)) return new Response('So‘rov rad etildi.', { status: 403 });

  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: '/', 'Cache-Control': 'no-store' },
  });
  clearDemoSession(request, response);
  return response;
}
