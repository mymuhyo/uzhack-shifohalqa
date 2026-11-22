import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExerciseClient } from '@/components/exercise-client';
import { isDemoEnabled } from '@/lib/demo-session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Tirsakni bukish tahlili' };

export default function ElbowExerciseDemo() {
  if (!isDemoEnabled()) notFound();

  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <h1>Tirsakni bukish tahlili</h1>
      <p className="lede">MediaPipe yelka, tirsak va bilak orqali qo‘lning bukilishi va tirsak siljishini sanaydi.</p>
      <nav className="exercise-tabs" aria-label="Mashq turlari">
        <Link className="exercise-tab" href="/demo/mashq">O‘tirib-turish</Link>
        <Link className="exercise-tab exercise-tab-active" href="/demo/mashq/tirsak" aria-current="page">Tirsak bukish</Link>
        <Link className="exercise-tab" href="/demo/mashq/tizza">Tizza ko‘tarish</Link>
        <Link className="exercise-tab" href="/demo/mashq/yelka">Qo‘l ko‘tarish</Link>
        <Link className="exercise-tab" href="/demo/mashq/oyoq">Oyoq tekislash</Link>
      </nav>
      <ExerciseClient targetAngle={80} movement="elbow_bend" preview />
    </main>
  );
}
