import { getActivityDashboard } from '@/lib/activity-store';
import {
  defaultDailyStepGoal,
  type AdherenceCounts,
  type DailyStepTrendPoint,
  type MedicationAdherenceBreakdown,
  type StepSource,
} from '@/lib/adherence';
import type { ActivityDashboardData } from '@/lib/clinical-brief';
import type { ClinicalActor } from '@/lib/clinical-types';
import { Badge } from '@/components/ui/badge';
import { PatientStepsForm } from './patient-steps-form';
import styles from './patient-adherence.module.css';

const numberFormat = new Intl.NumberFormat('uz-Latn-UZ');
const timestampFormat = new Intl.DateTimeFormat('uz-Latn-UZ', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tashkent',
});

const stepSourceLabels: Record<StepSource, string> = {
  device_sensor: 'Telefon sensori (auto-sync)',
  demo_sim: 'Demo simulyatsiya (Android)',
  self_report: 'Qo‘lda kiritildi',
};

const shortStepSource: Record<StepSource, string> = {
  device_sensor: 'Telefon sensori',
  demo_sim: 'Demo simulyatsiya',
  self_report: 'Qo‘lda kiritilgan',
};

const unitDisplay: Record<string, string> = {
  mg: 'mg',
  mcg: 'mkg',
  g: 'g',
  iu: 'IU',
};

function AdherenceSummary({ counts, period }: { counts: AdherenceCounts; period: 'today' | 'week' }) {
  const headingId = `adherence-${period}`;
  const { scheduled, completed, answered } = counts;
  const completion = `${completed}/${scheduled} vazifa bajarildi`;

  return (
    <article className={styles.summary}>
      <h3 id={headingId}>{period === 'today' ? 'Bugun' : 'Oxirgi 7 kun'}</h3>
      {scheduled === 0 ? (
        <p>Rejalashtirilgan vazifa yo‘q.</p>
      ) : (
        <div className={styles.summaryBody}>
          <div>
            <p className={styles.completion} aria-hidden="true">{completion}</p>
            <p>{answered}/{scheduled} vazifaga javob berildi</p>
            <p>{scheduled - answered} ta javobsiz vazifa</p>
          </div>
          <progress
            className={period === 'today' ? styles.visuallyHidden : styles.bar}
            value={completed}
            max={scheduled}
            aria-labelledby={headingId}
            aria-valuetext={completion}
          />
          {period === 'today' && (
            <div
              className={styles.ring}
              style={{ backgroundImage: `conic-gradient(var(--ring-fill) ${completed / scheduled}turn, var(--ring-track) 0)` }}
              aria-hidden="true"
            />
          )}
        </div>
      )}
    </article>
  );
}

function MedicationBreakdown({ items }: { items?: MedicationAdherenceBreakdown[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-4 flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">Har bir dori bo‘yicha 7 kunlik ijro</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((med) => (
          <div
            key={`${med.medicationName}-${med.strengthUnit}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            <span className="font-semibold">
              {med.medicationName}
              {med.strength !== null ? ` (${med.strength} ${unitDisplay[med.strengthUnit] ?? med.strengthUnit})` : ''}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {med.week.taken}/{med.week.scheduled} ichildi · {med.week.missed} qoldirildi · {med.week.unanswered} javobsiz
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StepTrendList({
  trend,
  goal,
  showDualSources,
}: {
  trend?: DailyStepTrendPoint[];
  goal: number;
  showDualSources: boolean;
}) {
  if (!trend || trend.length === 0) return null;
  const maxRef = Math.max(goal, ...trend.map((t) => t.effectiveCount ?? 0), 1000);

  return (
    <div className="mt-4 flex flex-col gap-2" aria-label="7 kunlik qadam grafigi">
      <h3 className="text-sm font-semibold text-foreground">7 kunlik qadamlar</h3>
      <ul className="grid gap-1.5" role="list">
        {trend.map((day) => {
          const count = day.effectiveCount ?? 0;
          const pct = day.effectiveCount !== null ? Math.min(100, Math.max(8, Math.round((count / maxRef) * 100))) : 0;
          const achieved = day.effectiveCount !== null && count >= goal;
          return (
            <li
              key={day.date}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg border border-border/70 bg-card/70 px-3 py-1.5 text-xs"
            >
              <time dateTime={day.date} className="tabular-nums font-medium text-muted-foreground">
                {day.date.slice(5)}
              </time>
              {day.effectiveCount !== null && day.effectiveSource ? (
                <>
                  <div className="flex flex-col gap-1">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full ${achieved ? 'bg-[var(--ok)]' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={day.effectiveSource === 'device_sensor' ? 'ok' : 'outline'} className="text-[11px]">
                        {shortStepSource[day.effectiveSource]}
                      </Badge>
                      {showDualSources && day.deviceSensor && day.selfReport && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          (Sensor: {numberFormat.format(day.deviceSensor.count)} · Qo‘lda: {numberFormat.format(day.selfReport.count)})
                        </span>
                      )}
                    </div>
                  </div>
                  <strong className="tabular-nums text-sm">
                    {numberFormat.format(count)}
                  </strong>
                </>
              ) : (
                <>
                  <span className="text-muted-foreground">Qadam kiritilmagan</span>
                  <span className="text-muted-foreground">—</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export async function PatientAdherence({ actor }: { actor: ClinicalActor }) {
  const dashboard = await getActivityDashboard(actor).catch(() => null);
  if (!dashboard) return <p className="notice" role="alert">Reja ijrosi va qadamlarni yuklab bo‘lmadi. Sahifani yangilang.</p>;
  const { adherence, steps } = dashboard;
  const stepGoal = dashboard.dailyStepGoal ?? defaultDailyStepGoal;

  return (
    <div className="ledger">
      <section>
        <h2>Reja ijrosi</h2>
        <p>Toshkent vaqti bo‘yicha muddati kelgan dori va qon bosimi vazifalari.</p>
        <div className={styles.summaries}>
          <AdherenceSummary counts={adherence.today} period="today" />
          <AdherenceSummary counts={adherence.week} period="week" />
        </div>
        <MedicationBreakdown items={dashboard.medicationAdherence} />
      </section>

      <section>
        <h2 id="daily-steps-title">Bugungi qadamlar</h2>
        <p>Shifokor belgilagan kunlik maqsad: {numberFormat.format(stepGoal)} qadam.</p>
        {steps ? (
          <div className={styles.stepRecord}>
            <p className={styles.completion}>
              {numberFormat.format(steps.count)} / {numberFormat.format(stepGoal)} qadam{' '}
              <span className={`status-pill ${steps.count >= stepGoal ? 'status-ok' : 'status-warn'}`}>
                {steps.count >= stepGoal ? 'Maqsad bajarildi' : 'Jarayonda'}
              </span>
            </p>
            <p>
              {stepSourceLabels[steps.source]} · L{steps.level} · AI rejimi {steps.aiMode}
            </p>
            <p><time dateTime={steps.updatedAt}>{timestampFormat.format(new Date(steps.updatedAt))}</time> · Toshkent</p>
          </div>
        ) : (
          <p>Bugun qadamlar hali kiritilmagan (Android ilovasidan avtomatik sinxronlanadi yoki qo‘lda kiriting).</p>
        )}
        <PatientStepsForm defaultSteps={steps?.count} isDemo={actor.isDemo === true} />
        <StepTrendList trend={dashboard.stepTrend} goal={stepGoal} showDualSources={false} />
      </section>
    </div>
  );
}

const outcome = { pending: 'Javobsiz', taken: 'Bajarilgan', recorded: 'Bajarilgan', missed: 'Qoldirilgani bildirildi' };

export async function DoctorAdherence({
  actor,
  initialDashboard,
}: {
  actor: ClinicalActor;
  initialDashboard?: ActivityDashboardData;
}) {
  const dashboard = initialDashboard !== undefined
    ? initialDashboard
    : await getActivityDashboard(actor).catch(() => null);
  if (!dashboard) return <p className="notice" role="alert">Haftalik hisobni yuklab bo‘lmadi.</p>;

  const stepGoal = dashboard.dailyStepGoal ?? defaultDailyStepGoal;

  return (
    <div className="ledger">
      <section>
        <h2>Reja ijrosi</h2>
        <AdherenceSummary counts={dashboard.adherence.week} period="week" />
        <MedicationBreakdown items={dashboard.medicationAdherence} />
        {(() => {
          if (!dashboard.steps) {
            return (
              <div className={styles.stepRecord}>
                <p>Bugungi qadamlar: hali sinxronlanmagan (kunlik maqsad: {numberFormat.format(stepGoal)} qadam).</p>
              </div>
            );
          }
          const achieved = dashboard.steps.count >= stepGoal;
          return (
            <div className={styles.stepRecord}>
              <p className={styles.completion}>
                {numberFormat.format(dashboard.steps.count)} / {numberFormat.format(stepGoal)} qadam (bugun){' '}
                <span className={`status-pill ${achieved ? 'status-ok' : 'status-warn'}`}>
                  {achieved ? 'Maqsad bajarildi' : 'Maqsadga yetmagan'}
                </span>
              </p>
              <p>
                {stepSourceLabels[dashboard.steps.source]} · L{dashboard.steps.level} ·{' '}
                <time dateTime={dashboard.steps.updatedAt}>{timestampFormat.format(new Date(dashboard.steps.updatedAt))}</time> · Toshkent
              </p>
            </div>
          );
        })()}
        <StepTrendList trend={dashboard.stepTrend} goal={stepGoal} showDualSources />
        {dashboard.dueUnits.length > 0 && (
          <details className="mt-4">
            <summary>Hisobga kirgan vazifalar</summary>
            <ul>
              {dashboard.dueUnits.map((unit) => (
                <li key={`${unit.planItemId}/${unit.scheduledDate}`}>
                  <time dateTime={`${unit.scheduledDate}T${unit.dueTime}`}>{unit.scheduledDate} · {unit.dueTime}</time>
                  {' · '}{unit.title}{' · '}{outcome[unit.status ?? 'pending']}
                </li>
              ))}
            </ul>
            <p>Vaqt mintaqasi · Toshkent</p>
          </details>
        )}
      </section>
    </div>
  );
}
