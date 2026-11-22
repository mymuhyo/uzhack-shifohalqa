import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExerciseClient } from '@/components/exercise-client';
import { isDemoEnabled } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'O‘tirib oyoqni tekislash tahlili' };

export default function SeatedKneeExtExerciseDemo() {
  if (!isDemoEnabled()) notFound();

  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <h1>O‘tirib oyoqni tekislash tahlili</h1>
      <p className="lede">MediaPipe stulda o‘tirgan holda tizzaning to‘liq yozilish burchagini va gavda barqarorligini kuzatadi.</p>
      <nav className="exercise-tabs" aria-label="Mashq turlari">
        <Link className="exercise-tab" href="/demo/mashq">O‘tirib-turish</Link>
        <Link className="exercise-tab" href="/demo/mashq/tirsak">Tirsak bukish</Link>
        <Link className="exercise-tab" href="/demo/mashq/tizza">Tizza ko‘tarish</Link>
        <Link className="exercise-tab" href="/demo/mashq/yelka">Qo‘l ko‘tarish</Link>
        <Link className="exercise-tab exercise-tab-active" href="/demo/mashq/oyoq" aria-current="page">Oyoq tekislash</Link>
      </nav>
      <ExerciseClient targetAngle={155} movement="seated_knee_ext" preview />
    </main>
  );
}
