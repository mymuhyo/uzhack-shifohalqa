import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExerciseClient } from '@/components/exercise-client';
import { isDemoEnabled } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tizza ko‘tarish tahlili' };

export default function KneeLiftExerciseDemo() {
  if (!isDemoEnabled()) notFound();

  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <h1>Tizza ko‘tarish tahlili</h1>
      <p className="lede">MediaPipe yelka, son va tizza orqali oyoqni ko‘tarish amplitudasi hamda gavda barqarorligini kuzatadi.</p>
      <nav className="exercise-tabs" aria-label="Mashq turlari">
        <Link className="exercise-tab" href="/demo/mashq">O‘tirib-turish</Link>
        <Link className="exercise-tab" href="/demo/mashq/tirsak">Tirsak bukish</Link>
        <Link className="exercise-tab exercise-tab-active" href="/demo/mashq/tizza" aria-current="page">Tizza ko‘tarish</Link>
        <Link className="exercise-tab" href="/demo/mashq/yelka">Qo‘l ko‘tarish</Link>
        <Link className="exercise-tab" href="/demo/mashq/oyoq">Oyoq tekislash</Link>
      </nav>
      <ExerciseClient targetAngle={110} movement="knee_lift" preview />
    </main>
  );
}
