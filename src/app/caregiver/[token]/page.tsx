import type { Metadata } from 'next';
import { Clock, ShieldAlert } from 'lucide-react';
import { CaregiverAckButton } from '@/components/caregiver-ack-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { readCaregiverSummary, type CaregiverStatusSignal } from '@/lib/caregiver-store';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Yaqinim',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const clockFormat = (timeZone: string) =>
  new Intl.DateTimeFormat('uz-Latn-UZ', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  });
const ferganaClock = clockFormat('Asia/Tashkent');
const kualaLumpurClock = clockFormat('Asia/Kuala_Lumpur');

const statusCopy: Record<CaregiverStatusSignal, { pill: string; variant: 'warn' | 'urgent' | 'ok'; body: string }> = {
  supply_help: {
    pill: 'Oila yordami kerak',
    variant: 'warn',
    body: 'Bugun ta’minot bo‘yicha oila yordami kerak. Yaqiningiz bilan bog‘laning yoki quyidagi tugma orqali xabardor ekaningizni bildiring.',
  },
  doctor_reviewing: {
    pill: 'Shifokor ko‘rigida',
    variant: 'urgent',
    body: 'Shifokor ko‘rigida qayd bor. Klinik javob kutilmoqda.',
  },
  doctor_replied: {
    pill: 'Shifokor javob berdi',
    variant: 'ok',
    body: 'Shifokor so‘nggi qaydga javob berdi.',
  },
  all_good: {
    pill: 'Hammasi tinch',
    variant: 'ok',
    body: 'Bugungi reja tinch bajarildi.',
  },
  waiting: {
    pill: 'Kuzatuvda',
    variant: 'ok',
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
      <div className="mt-4 max-w-2xl">
        {summary && status ? (
          <Card className="border border-border bg-card shadow-[var(--surface-shadow)]">
            <CardHeader className="gap-2">
              <Badge variant={status.variant}>{status.pill}</Badge>
              <CardTitle className="text-2xl font-medium">
                <h2 className="text-inherit font-inherit leading-inherit">Bugungi qisqa holat</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{status.body}</p>
              {summary.counts.scheduled === 0 ? (
                <p className="text-sm text-muted-foreground">Bugun muddati kelgan vazifa yo‘q.</p>
              ) : (
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
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                    <p>{summary.counts.scheduled} ta vazifaning muddati keldi.</p>
                    <p>{summary.counts.answered} ta vazifaga javob berildi.</p>
                    <p>{summary.counts.completed} ta vazifa bajarildi.</p>
                  </div>
                </>
              )}

              {(summary.statusSignal === 'supply_help' ||
                summary.statusSignal === 'doctor_reviewing' ||
                summary.caregiverAck !== null) && (
                <CaregiverAckButton
                  token={token}
                  kind={summary.caregiverAck?.kind ?? ackKind}
                  initialAckAt={summary.caregiverAck?.createdAt ?? null}
                />
              )}

              <Separator />

              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                <Clock className="size-3.5" aria-hidden="true" />
                <span>
                  Ochilgan vaqt · Farg‘ona{' '}
                  <time dateTime={summary.observedAt}>{ferganaClock.format(new Date(summary.observedAt))}</time>
                  {' · '}Kuala Lumpur{' '}
                  <time dateTime={summary.observedAt}>{kualaLumpurClock.format(new Date(summary.observedAt))}</time>
                </span>
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border border-border bg-card shadow-[var(--surface-shadow)]">
            <CardContent className="flex items-center gap-3 pt-5 text-sm text-muted-foreground">
              <ShieldAlert className="size-5 shrink-0 text-[var(--warn)]" aria-hidden="true" />
              <p>Havola faol emas. Bemor bilan bog‘lanib, yangi havola so‘rang.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
