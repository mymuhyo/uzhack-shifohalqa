import { NextResponse, type NextRequest } from 'next/server';
import { keyframeReviewInputSchema, reviewExerciseKeyframes } from '../../../../../lib/ai/exercise-video-review';
import { resolveClinicalActor, resolveWebSessionContext } from '../../../../../lib/auth';
import { isSameOriginPost, readRequestJson } from '../../../../../lib/request-body';

const noStore = { 'Cache-Control': 'private, no-store' };
const MAX_KEYFRAME_REQUEST_BYTES = 4 * 1024 * 1024; // up to 5 bounded base64 keyframes + metadata

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginPost(request)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    }

    const session = await resolveWebSessionContext(request);
    if (!session) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
    }
    if (session.role === 'caregiver') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    }

    const body = await readRequestJson(request, MAX_KEYFRAME_REQUEST_BYTES);
    if (!body.ok) {
      return NextResponse.json(
        { error: body.status === 413 ? 'too_large' : 'invalid' },
        { status: body.status, headers: noStore },
      );
    }

    const parsed = keyframeReviewInputSchema.safeParse(body.body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
    }

    const resolved = await resolveClinicalActor(session, {
      ...(parsed.data.attemptId && session.role === 'doctor'
        ? { entityCheck: { kind: 'exercise_attempt' as const, id: parsed.data.attemptId } }
        : {}),
      ...(session.role === 'doctor' && !parsed.data.attemptId ? { allowDoctorWithoutPatient: true } : {}),
    });
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status, headers: noStore });
    }

    const outcome = await reviewExerciseKeyframes(parsed.data, resolved.actor);
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status, headers: noStore });
    }

    return NextResponse.json(outcome.data, { status: 200, headers: noStore });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: noStore });
  }
}
