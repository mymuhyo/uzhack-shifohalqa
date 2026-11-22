import type { NextRequest } from 'next/server';
import { availableExerciseProviders, reviewExerciseSample } from '@/lib/ai/exercise-video';
import { isDemoEnabled, isSameOriginDemoPost } from '@/lib/demo-session';
import { exerciseAnalysisRequest } from '@/lib/exercise-analysis';
import { readRequestJson } from '@/lib/request-body';

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  const providers = availableExerciseProviders();
  if (!isDemoEnabled() || providers.length === 0) return new Response(null, { status: 404, headers });
  if (!isSameOriginDemoPost(request)) return new Response(null, { status: 403, headers });
  const payload = await readRequestJson(request, 256);
  const parsed = payload.ok && exerciseAnalysisRequest.safeParse(payload.body);
  if (!parsed || !parsed.success) {
    return new Response(null, { status: 400, headers });
  }

  const provider = parsed.data.provider ?? providers[0];
  if (!providers.includes(provider)) return new Response(null, { status: 404, headers });
  const report = await reviewExerciseSample(provider);
  return Response.json(report, { status: report.status === 'observed' ? 200 : 503, headers });
}
