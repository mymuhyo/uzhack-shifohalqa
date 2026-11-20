import { z } from 'zod';

type Attempt = {
  fileSha256: string | null;
  motionSignature: readonly number[] | null;
};

const similarMotionMae = 2.5;
const fileDigest = z.string().regex(/^[0-9a-f]{64}$/i).toLowerCase();
const motionProfile = z.array(z.number().min(0).max(180)).length(20).refine((points) => (
  Math.min(points[0], points[points.length - 1]) - Math.min(...points) >= 15
));

export function compareAttempt(input: Attempt & { previous: readonly Attempt[] }) {
  const digest = fileDigest.safeParse(input.fileSha256).data;
  const signature = motionProfile.safeParse(input.motionSignature).data;
  let duplicateFile = false;
  let closestMae: number | null = null;

  for (const attempt of input.previous) {
    const previousDigest = fileDigest.safeParse(attempt.fileSha256).data;
    if (digest && digest === previousDigest) duplicateFile = true;

    const previousSignature = motionProfile.safeParse(attempt.motionSignature).data;
    if (signature && previousSignature) {
      const distance = signature.reduce((sum, point, index) => sum + Math.abs(point - previousSignature[index]), 0)
        / signature.length;
      closestMae = Math.min(closestMae ?? distance, distance);
    }
  }

  return { duplicateFile, similarMotion: closestMae !== null && closestMae < similarMotionMae, closestMae };
}
