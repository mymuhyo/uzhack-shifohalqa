import type { NextRequest } from 'next/server';
import { explainExerciseComparison } from '@/lib/ai/exercise-explanation';
import { availableExerciseProviders } from '@/lib/ai/exercise-video';
import { isDemoEnabled, isSameOriginDemoPost } from '@/lib/demo-session';
import { exerciseExplanationRequest } from '@/lib/exercise-explanation';
import { readRequestJson } from '@/lib/request-body';

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!isDemoEnabled() || !availableExerciseProviders().includes('openrouter')) {
    return new Response(null, { status: 404, headers });
  }
  if (!isSameOriginDemoPost(request)) return new Response(null, { status: 403, headers });
  const payload = await readRequestJson(request, 128);
  if (!payload.ok) return new Response(null, { status: payload.status, headers });
  const parsed = exerciseExplanationRequest.safeParse(payload.body);
  if (!parsed.success) return new Response(null, { status: 400, headers });

  const report = await explainExerciseComparison(parsed.data.comparison);
  return Response.json(report, { status: report.status === 'explained' ? 200 : 503, headers });
}
