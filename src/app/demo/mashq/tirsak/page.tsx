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
      <p className="lede">MediaPipe yelka, tirsak va bilak orqali qo‘lning bukilishi va yozilishini sanaydi.</p>
      <p><Link href="/demo/mashq">O‘tirib-turish demosiga qaytish</Link></p>
      <ExerciseClient targetAngle={80} movement="elbow_bend" preview />
    </main>
  );
}
