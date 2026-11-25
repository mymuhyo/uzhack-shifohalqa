import { Clock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { CaregiverAckButton } from '@/components/caregiver-ack-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { readCaregiverSummary } from '@/lib/caregiver-store';

export const dynamic = 'force-dynamic';

const ferganaClock = new Intl.DateTimeFormat('uz-Latn-UZ', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Tashkent',
});
const kualaLumpurClock = new Intl.DateTimeFormat('uz-Latn-UZ', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Kuala_Lumpur',
});

const statusCopy = {
  supply_help: {
    pill: 'Oila yordami kerak',
    variant: 'warn' as const,
    body: 'Bugungi vazifalardan birida dori yoki yordam bo‘yicha xabar yuborildi.',
  },
  doctor_reviewing: {
    pill: 'Shifokor ko‘rib chiqmoqda',
    variant: 'warn' as const,
    body: 'Bugungi qaydlar shifokor tekshiruvida.',
  },
  doctor_replied: {
    pill: 'Shifokor javob berdi',
    variant: 'ok' as const,
    body: 'Shifokor so‘nggi qaydga javob berdi.',
  },
  all_good: {
    pill: 'Hammasi tinch',
    variant: 'ok' as const,
    body: 'Bugungi reja tinch bajarildi.',
  },
  waiting: {
    pill: 'Kuzatuvda',
    variant: 'ok' as const,
    body: 'Kunlik vazifalar bo‘yicha navbat kutilmoqda.',
  },
};

export default async function CaregiverPage({ params }: PageProps<'/caregiver/[token]'>) {
  const { token } = await params;
  const summary = await readCaregiverSummary(token).catch(() => null);
  const status = summary ? statusCopy[summary.statusSignal] : null;
  const ackKind = summary?.statusSignal === 'supply_help' ? 'supply_on_the_way' : 'checked_in';

  return (
    <main className="frame content flex flex-col items-center" id="content" tabIndex={-1}>
      <div className="w-full max-w-2xl">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-xs">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </span>
          <h1>Yaqinim</h1>
        </div>

        {summary && status ? (
          <Card className="border border-border bg-card shadow-[var(--surface-shadow-lg)]">
            <CardHeader className="gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge variant={status.variant}>{status.pill}</Badge>
                <span className="font-mono text-[11px] text-muted-foreground">FAQAT BUGUNGI QISQA HOLAT</span>
              </div>
              <CardTitle className="text-2xl font-semibold">
                <h2 className="text-inherit font-inherit leading-inherit">Bugungi qisqa holat</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{status.body}</p>
              {summary.counts.scheduled === 0 ? (
                <p className="rounded-xl border border-border bg-secondary/70 px-3.5 py-2.5 text-sm text-muted-foreground">
                  Bugun muddati kelgan vazifa yo‘q.
                </p>
              ) : (
                <>
                  <div className="caregiver-metrics" aria-label="Bugungi bajarilish">
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
                  <div className="grid gap-1 rounded-xl border border-border bg-secondary/70 px-3.5 py-2.5 text-sm text-foreground">
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

              <p className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground tabular-nums">
                <Clock className="size-3.5 text-primary" aria-hidden="true" />
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
