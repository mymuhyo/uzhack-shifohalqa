import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExerciseClient } from '@/components/exercise-client';
import { isDemoEnabled } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Qo‘lni yelkadan ko‘tarish tahlili' };

export default function ShoulderRaiseExerciseDemo() {
  if (!isDemoEnabled()) notFound();

  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <h1>Qo‘lni yelkadan ko‘tarish tahlili</h1>
      <p className="lede">MediaPipe son, yelka va tirsak orqali qo‘l ko‘tarilish burchagi hamda yelka tekisligini kuzatadi.</p>
      <nav className="exercise-tabs" aria-label="Mashq turlari">
        <Link className="exercise-tab" href="/demo/mashq">O‘tirib-turish</Link>
        <Link className="exercise-tab" href="/demo/mashq/tirsak">Tirsak bukish</Link>
        <Link className="exercise-tab" href="/demo/mashq/tizza">Tizza ko‘tarish</Link>
        <Link className="exercise-tab exercise-tab-active" href="/demo/mashq/yelka" aria-current="page">Qo‘l ko‘tarish</Link>
        <Link className="exercise-tab" href="/demo/mashq/oyoq">Oyoq tekislash</Link>
      </nav>
      <ExerciseClient targetAngle={90} movement="shoulder_raise" preview />
    </main>
  );
}
