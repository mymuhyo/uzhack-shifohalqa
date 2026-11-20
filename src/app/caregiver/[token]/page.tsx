import type { Metadata } from 'next';
import { readCaregiverSummary } from '@/lib/caregiver-store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Yaqinim',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const clockFormat = (timeZone: string) => new Intl.DateTimeFormat('uz-Latn-UZ', {
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone,
});
const ferganaClock = clockFormat('Asia/Tashkent');
const kualaLumpurClock = clockFormat('Asia/Kuala_Lumpur');

export default async function CaregiverPage({ params }: PageProps<'/caregiver/[token]'>) {
  const { token } = await params;
  const summary = await readCaregiverSummary(token).catch(() => null);

  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <h1>Yaqinim</h1>
      {summary ? (
        <div className="ledger">
          <section>
            <h2>Bugungi qisqa holat</h2>
            {summary.counts.scheduled === 0 ? <p>Bugun muddati kelgan vazifa yo‘q.</p> : (
              <>
                <p>{summary.counts.scheduled} ta vazifaning muddati keldi.</p>
                <p>{summary.counts.answered} ta vazifaga javob berildi.</p>
                <p>{summary.counts.completed} ta vazifa bajarildi.</p>
              </>
            )}
            <p>
              Ochilgan vaqt · Farg‘ona <time dateTime={summary.observedAt}>{ferganaClock.format(new Date(summary.observedAt))}</time>
              {' · '}Kuala Lumpur <time dateTime={summary.observedAt}>{kualaLumpurClock.format(new Date(summary.observedAt))}</time>
            </p>
          </section>
        </div>
      ) : <p className="notice">Havola faol emas. Bemor bilan bog‘lanib, yangi havola so‘rang.</p>}
    </main>
  );
}
