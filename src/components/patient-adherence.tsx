import { getActivityDashboard } from '@/lib/activity-store';
import { defaultDailyStepGoal } from '@/lib/adherence';
import type { ActivityDashboardData } from '@/lib/clinical-brief';
import type { ClinicalActor } from '@/lib/clinical-types';
import {
  AdherenceSummary,
  MedicationBreakdown,
  PatientAdherenceView,
  stepSourceLabels,
  StepTrendList,
} from './patient-adherence-view';
import styles from './patient-adherence.module.css';

const numberFormat = new Intl.NumberFormat('uz-Latn-UZ');
const timestampFormat = new Intl.DateTimeFormat('uz-Latn-UZ', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tashkent',
});

export async function PatientAdherence({ actor }: { actor: ClinicalActor }) {
  const dashboard = await getActivityDashboard(actor).catch(() => null);
  if (!dashboard) return <p className="notice" role="alert">Reja ijrosi va qadamlarni yuklab bo‘lmadi. Sahifani yangilang.</p>;
  const { adherence, steps } = dashboard;
  const stepGoal = dashboard.dailyStepGoal ?? defaultDailyStepGoal;

  return (
    <PatientAdherenceView
      adherence={adherence}
      steps={steps}
      stepGoal={stepGoal}
      medicationAdherence={dashboard.medicationAdherence}
      stepTrend={dashboard.stepTrend}
      isDemo={actor.isDemo === true}
    />
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
