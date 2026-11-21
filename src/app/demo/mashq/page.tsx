import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExerciseClient } from '@/components/exercise-client';
import { isExerciseAnalysisEnabled } from '@/lib/ai/exercise-video';
import { isDemoEnabled } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mashq tahlili' };

export default function ExerciseDemo() {
  if (!isDemoEnabled()) notFound();

  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <h1>O‘tirib-turish tahlili</h1>
      <p className="lede">MediaPipe yon tomondan tizzani kuzatadi. Tayyor klip bilan boshlang yoki jonli kamerani sinang.</p>
      <p><Link href="/demo/mashq/tirsak">Tirsakni bukish demosini ochish</Link></p>
      <ExerciseClient targetAngle={100} preview showGemini={isExerciseAnalysisEnabled()} />
    </main>
  );
}
