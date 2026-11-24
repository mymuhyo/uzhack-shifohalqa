import { NextResponse, type NextRequest } from 'next/server';
import {
  getAuthenticatedSupabaseUser,
  listPendingMembershipInvites,
  resolveWebSessionContext,
} from '../../../../lib/auth';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  try {
    const session = await resolveWebSessionContext(request);
    if (session?.kind === 'supabase') {
      const pendingInvites = await listPendingMembershipInvites(session.userId).catch(() => []);
      return NextResponse.json(
        {
          session,
          user: {
            userId: session.userId,
            email: session.email ?? null,
            fullName: session.fullName ?? null,
            defaultRole: session.role,
          },
          ...(pendingInvites.length > 0 ? { pendingInvites } : {}),
        },
        { status: 200, headers: noStore },
      );
    }
    if (session?.kind === 'demo') {
      return NextResponse.json({ session }, { status: 200, headers: noStore });
    }

    const authUser = await getAuthenticatedSupabaseUser(request);
    if (authUser) {
      const pendingInvites = await listPendingMembershipInvites(authUser.userId).catch(() => []);
      return NextResponse.json(
        { session: null, user: authUser, pendingInvites },
        { status: 200, headers: noStore },
      );
    }

    return NextResponse.json({ session: null }, { status: 200, headers: noStore });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: noStore });
  }
}
