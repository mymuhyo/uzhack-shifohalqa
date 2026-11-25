import { NextResponse, type NextRequest } from 'next/server';
import { resolveClinicalActor, resolveWebSessionContext } from '../../../../../lib/auth';
import { isPatientSideRole } from '../../../../../lib/clinical-types';
import {
  finalizeExerciseVideoUpload,
  requestExerciseVideoUpload,
  videoUploadActionBodySchema,
} from '../../../../../lib/exercise-video-store';
import { isSameOriginPost, readRequestJson } from '../../../../../lib/request-body';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginPost(request)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    }

    const session = await resolveWebSessionContext(request);
    if (!session) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
    }
    if (!isPatientSideRole(session.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: noStore });
    }

    const body = await readRequestJson(request, 4096);
    if (!body.ok) {
      return NextResponse.json(
        { error: body.status === 413 ? 'too_large' : 'invalid' },
        { status: body.status, headers: noStore },
      );
    }

    const parsed = videoUploadActionBodySchema.safeParse(body.body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid' }, { status: 400, headers: noStore });
    }

    const resolved = await resolveClinicalActor(session);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status, headers: noStore });
    }

    const outcome =
      parsed.data.action === 'request'
        ? await requestExerciseVideoUpload(resolved.actor, {
            attemptId: parsed.data.attemptId,
            consent: parsed.data.consent,
            durationSec: parsed.data.durationSec,
            sizeBytes: parsed.data.sizeBytes,
            mimeType: parsed.data.mimeType,
          })
        : await finalizeExerciseVideoUpload(resolved.actor, {
            attemptId: parsed.data.attemptId,
            consent: parsed.data.consent,
            durationSec: parsed.data.durationSec,
            sizeBytes: parsed.data.sizeBytes,
            mimeType: parsed.data.mimeType,
            path: parsed.data.path,
          });

    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status, headers: noStore });
    }

    return NextResponse.json(outcome.data, { status: 200, headers: noStore });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: noStore });
  }
}
