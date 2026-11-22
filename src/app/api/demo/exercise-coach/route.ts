import type { NextRequest } from 'next/server';
import { exerciseCoachAdvice, exerciseCoachInputSchema } from '@/lib/ai/exercise-coach';
import { publicExerciseCoach } from '@/lib/ai/public-exercise-coach';
import { isDemoEnabled, isSameOriginDemoPost } from '@/lib/demo-session';
import { readRequestJson } from '@/lib/request-body';

export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!isDemoEnabled()) return new Response(null, { status: 404, headers });
  if (!isSameOriginDemoPost(request)) return new Response(null, { status: 403, headers });
  const body = await readRequestJson(request, 2048);
  if (!body.ok) return new Response(null, { status: body.status, headers });
  const input = exerciseCoachInputSchema.safeParse(body.body);
  if (!input.success) return Response.json({ error: 'invalid' }, { status: 400, headers });
  const advice = 'sample' in input.data ? await publicExerciseCoach(input.data.sample) : exerciseCoachAdvice(input.data);
  return Response.json(advice, { headers });
}
