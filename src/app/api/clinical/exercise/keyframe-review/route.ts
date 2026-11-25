import { NextResponse, type NextRequest } from 'next/server';
import { keyframeReviewInputSchema, reviewExerciseKeyframes } from '../../../../../lib/ai/exercise-video-review';
import { resolveClinicalRequestActor } from '../../../../../lib/auth';
import { readRequestJson } from '../../../../../lib/request-body';

const noStore = { 'Cache-Control': 'private, no-store' };
const MAX_KEYFRAME_REQUEST_BYTES = 4 * 1024 * 1024; // up to 5 bounded base64 keyframes + metadata

export async function POST(request: NextRequest) {
  try {
    const authCheck = await resolveClinicalRequestActor(request, {
      allowBearer: true,
      requireSameOrigin: true,
      allowRoles: ['doctor', 'patient', 'individual'],
      allowDoctorWithoutPatient: true,
    });
    if (!authCheck.ok) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status, headers: noStore });
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

    const resolved = authCheck.authMode === 'cookie' && authCheck.actor.role === 'doctor' && parsed.data.attemptId
      ? await resolveClinicalRequestActor(request, {
          allowBearer: false,
          requireSameOrigin: true,
          allowRoles: ['doctor'],
          entityCheck: { kind: 'exercise_attempt', id: parsed.data.attemptId },
        })
      : authCheck;
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
