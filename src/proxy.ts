import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/caregiver' || pathname.startsWith('/caregiver/')) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      return NextResponse.next();
    }

    return new Response(null, {
      status: 405,
      headers: { Allow: 'GET, HEAD', 'Cache-Control': 'private, no-store' },
    });
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|models(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|mp3|task|wasm)$).*)',
  ],
};
