import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from './database.types';

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    '';

  if (!url || !key) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const pendingCookies = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          const cookieKey = `${name}::${options?.domain ?? ''}::${options?.path ?? ''}`;
          pendingCookies.set(cookieKey, { name, value, options });
        }
        Object.assign(pendingHeaders, headers);

        response = NextResponse.next({ request });
        const seenCookieNames = new Set<string>();
        const extraSetCookies: string[] = [];
        for (const { name, value, options } of pendingCookies.values()) {
          if (!seenCookieNames.has(name)) {
            seenCookieNames.add(name);
            response.cookies.set(name, value, options);
          } else {
            const serializer = new NextResponse();
            serializer.cookies.set(name, value, options);
            const serialized = serializer.headers.get('set-cookie');
            if (serialized) {
              extraSetCookies.push(serialized);
            }
          }
        }
        for (const cookieHeader of extraSetCookies) {
          response.headers.append('set-cookie', cookieHeader);
        }
        for (const [headerName, headerValue] of Object.entries(pendingHeaders)) {
          response.headers.set(headerName, headerValue);
        }
      },
    },
  });

  try {
    await supabase.auth.getClaims();
  } catch {
    // Allow public and demo routes to proceed when Supabase Auth is unreachable.
  }

  return response;
}
