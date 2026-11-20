import type { NextRequest } from 'next/server';
import { getDemoSession, isSameOriginDemoPost } from '@/lib/demo-session';
import { isAndroidDemoEnabled, issueAndroidPairing, mobileJson } from '@/lib/mobile-demo';
import { ensureDemoWorkspace } from '@/lib/seed';

export async function POST(request: NextRequest) {
  if (!isAndroidDemoEnabled()) return mobileJson({ error: 'not_found' }, 404);
  if (!isSameOriginDemoPost(request)) return mobileJson({ error: 'unauthorized' }, 403);
  const session = await getDemoSession();
  if (session?.role !== 'doctor') return mobileJson({ error: 'unauthorized' }, 401);
  try {
    const workspace = await ensureDemoWorkspace(session.workspaceId);
    if (!workspace) return mobileJson({ error: 'unavailable' }, 503);
    return mobileJson(await issueAndroidPairing(session.workspaceId, workspace.patient.id));
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
