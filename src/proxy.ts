import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (request.method === 'GET' || request.method === 'HEAD') return NextResponse.next();

  return new Response(null, {
    status: 405,
    headers: { Allow: 'GET, HEAD', 'Cache-Control': 'private, no-store' },
  });
}

export const config = { matcher: '/caregiver/:path*' };
