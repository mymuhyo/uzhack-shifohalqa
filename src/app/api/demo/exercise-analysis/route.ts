import type { NextRequest } from 'next/server';
import { isExerciseAnalysisEnabled, reviewExerciseSample } from '@/lib/ai/exercise-video';
import { isDemoEnabled, isSameOriginDemoPost } from '@/lib/demo-session';
import { exerciseAnalysisRequest } from '@/lib/exercise-analysis';
import { readRequestJson } from '@/lib/request-body';

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!isDemoEnabled() || !isExerciseAnalysisEnabled()) return new Response(null, { status: 404, headers });
  if (!isSameOriginDemoPost(request)) return new Response(null, { status: 403, headers });
  const payload = await readRequestJson(request, 256);
  if (!payload.ok || !exerciseAnalysisRequest.safeParse(payload.body).success) {
    return new Response(null, { status: 400, headers });
  }

  const report = await reviewExerciseSample();
  return Response.json(report, { status: report.status === 'observed' ? 200 : 503, headers });
}
