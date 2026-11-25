import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveClinicalActor, resolveWebSessionContext } from '../../../../../../lib/auth';
import { getExerciseVideoPlayback } from '../../../../../../lib/exercise-video-store';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ attemptId: string }> },
) {
  try {
    const session = await resolveWebSessionContext(request);
    if (!session) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
    }
    if (session.role === 'caregiver') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    }

    const { attemptId } = await context.params;
    const parsedId = z.uuid().safeParse(attemptId);
    if (!parsedId.success) {
      return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
    }

    const resolved = await resolveClinicalActor(
      session,
      session.role === 'doctor'
        ? { entityCheck: { kind: 'exercise_attempt', id: parsedId.data } }
        : {},
    );
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status, headers: noStore });
    }

    const outcome = await getExerciseVideoPlayback(resolved.actor, parsedId.data);
    if (!outcome.ok) {
      if (outcome.status === 410 && outcome.data) {
        return NextResponse.json(outcome.data, { status: 410, headers: noStore });
      }
      return NextResponse.json({ error: outcome.error }, { status: outcome.status, headers: noStore });
    }

    return NextResponse.json(outcome.data, { status: 200, headers: noStore });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: noStore });
  }
}
