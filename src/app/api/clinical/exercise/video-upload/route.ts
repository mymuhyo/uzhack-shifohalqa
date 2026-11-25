import { NextResponse, type NextRequest } from 'next/server';
import { resolveClinicalRequestActor } from '../../../../../lib/auth';
import {
  finalizeExerciseVideoUpload,
  requestExerciseVideoUpload,
  videoUploadActionBodySchema,
} from '../../../../../lib/exercise-video-store';
import { readRequestJson } from '../../../../../lib/request-body';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveClinicalRequestActor(request, {
      allowBearer: true,
      requireSameOrigin: true,
      allowRoles: ['patient', 'individual'],
    });
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status, headers: noStore });
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
