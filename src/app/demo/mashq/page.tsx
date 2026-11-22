import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExerciseClient } from '@/components/exercise-client';
import { availableExerciseProviders } from '@/lib/ai/exercise-video';
import { isDemoEnabled } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Mashq tahlili' };

export default function ExerciseDemo() {
  if (!isDemoEnabled()) notFound();

  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <h1>O‘tirib-turish tahlili</h1>
      <p className="lede">MediaPipe yon tomondan tizza va gavda og‘ishini kuzatadi. Tayyor klip bilan boshlang yoki jonli kamerani sinang.</p>
      <nav className="exercise-tabs" aria-label="Mashq turlari">
        <Link className="exercise-tab exercise-tab-active" href="/demo/mashq" aria-current="page">O‘tirib-turish</Link>
        <Link className="exercise-tab" href="/demo/mashq/tirsak">Tirsakni bukish demosini ochish</Link>
        <Link className="exercise-tab" href="/demo/mashq/tizza">Tizza ko‘tarish</Link>
        <Link className="exercise-tab" href="/demo/mashq/yelka">Qo‘l ko‘tarish</Link>
        <Link className="exercise-tab" href="/demo/mashq/oyoq">Oyoq tekislash</Link>
      </nav>
      <ExerciseClient targetAngle={100} preview analysisProviders={availableExerciseProviders()} />
    </main>
  );
}
