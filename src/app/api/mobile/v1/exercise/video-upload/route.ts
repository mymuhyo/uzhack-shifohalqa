import { resolveMobilePatientActor } from '../../../../../../lib/auth';
import {
  finalizeExerciseVideoUpload,
  requestExerciseVideoUpload,
  videoUploadActionBodySchema,
} from '../../../../../../lib/exercise-video-store';
import { mobileJson, readMobileBody } from '../../../../../../lib/mobile-demo';

export async function POST(request: Request) {
  try {
    const auth = await resolveMobilePatientActor(request);
    if (!auth.ok) {
      return mobileJson({ error: auth.error }, auth.status);
    }

    const raw = await readMobileBody(request);
    if (!raw.ok) {
      return mobileJson({ error: raw.status === 413 ? 'too_large' : 'invalid' }, raw.status === 413 ? 413 : 400);
    }

    const parsed = videoUploadActionBodySchema.safeParse(raw.body);
    if (!parsed.success) {
      return mobileJson({ error: 'invalid' }, 400);
    }

    const outcome =
      parsed.data.action === 'request'
        ? await requestExerciseVideoUpload(auth.actor, {
            attemptId: parsed.data.attemptId,
            consent: parsed.data.consent,
            durationSec: parsed.data.durationSec,
            sizeBytes: parsed.data.sizeBytes,
            mimeType: parsed.data.mimeType,
          })
        : await finalizeExerciseVideoUpload(auth.actor, {
            attemptId: parsed.data.attemptId,
            consent: parsed.data.consent,
            durationSec: parsed.data.durationSec,
            sizeBytes: parsed.data.sizeBytes,
            mimeType: parsed.data.mimeType,
            path: parsed.data.path,
          });

    if (!outcome.ok) {
      return mobileJson({ error: outcome.error }, outcome.status);
    }

    return mobileJson(outcome.data, 200);
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
