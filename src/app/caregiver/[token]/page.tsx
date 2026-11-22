import type { Metadata } from 'next';
import { CaregiverAckButton } from '@/components/caregiver-ack-button';
import { readCaregiverSummary, type CaregiverStatusSignal } from '@/lib/caregiver-store';

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

const statusCopy: Record<CaregiverStatusSignal, { pill: string; tone: string; body: string }> = {
  supply_help: {
    pill: 'Oila yordami kerak',
    tone: 'status-warn',
    body: 'Bugun ta’minot bo‘yicha oila yordami kerak. Yaqiningiz bilan bog‘laning yoki quyidagi tugma orqali xabardor ekaningizni bildiring.',
  },
  doctor_reviewing: {
    pill: 'Shifokor ko‘rigida',
    tone: 'status-urgent',
    body: 'Shifokor ko‘rigida qayd bor. Klinik javob kutilmoqda.',
  },
  doctor_replied: {
    pill: 'Shifokor javob berdi',
    tone: 'status-ok',
    body: 'Shifokor so‘nggi qaydga javob berdi.',
  },
  all_good: {
    pill: 'Hammasi tinch',
    tone: 'status-ok',
    body: 'Bugungi reja tinch bajarildi.',
  },
  waiting: {
    pill: 'Kuzatuvda',
    tone: 'status-ok',
    body: 'Kunlik vazifalar bo‘yicha navbat kutilmoqda.',
  },
};

export default async function CaregiverPage({ params }: PageProps<'/caregiver/[token]'>) {
  const { token } = await params;
  const summary = await readCaregiverSummary(token).catch(() => null);
  const status = summary ? statusCopy[summary.statusSignal] : null;
  const ackKind = summary?.statusSignal === 'supply_help' ? 'supply_on_the_way' : 'checked_in';

  return (
    <main className="frame content" id="content" tabIndex={-1}>
      <h1>Yaqinim</h1>
      {summary && status ? (
        <div className="ledger">
          <section>
            <span className={`status-pill ${status.tone}`}>{status.pill}</span>
            <h2>Bugungi qisqa holat</h2>
            <p>{status.body}</p>
            {summary.counts.scheduled === 0 ? <p>Bugun muddati kelgan vazifa yo‘q.</p> : (
              <>
                <div className="caregiver-metrics" aria-label="Kunlik ko‘rsatkichlar">
                  <div className="caregiver-metric">
                    <strong>{summary.counts.scheduled}</strong>
                    <span>Muddati keldi</span>
                  </div>
                  <div className="caregiver-metric">
                    <strong>{summary.counts.answered}</strong>
                    <span>Javob berildi</span>
                  </div>
                  <div className="caregiver-metric">
                    <strong>{summary.counts.completed}</strong>
                    <span>Bajarildi</span>
                  </div>
                </div>
                <p>{summary.counts.scheduled} ta vazifaning muddati keldi.</p>
                <p>{summary.counts.answered} ta vazifaga javob berildi.</p>
                <p>{summary.counts.completed} ta vazifa bajarildi.</p>
              </>
            )}
            {(summary.statusSignal === 'supply_help' || summary.statusSignal === 'doctor_reviewing' || summary.caregiverAck !== null) && (
              <CaregiverAckButton
                token={token}
                kind={summary.caregiverAck?.kind ?? ackKind}
                initialAckAt={summary.caregiverAck?.createdAt ?? null}
              />
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
