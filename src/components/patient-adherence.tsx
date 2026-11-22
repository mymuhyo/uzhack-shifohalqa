import { getActivityDashboard } from '@/lib/activity-store';
import { defaultDailyStepGoal, maximumDailySteps, type AdherenceCounts, type StepSource } from '@/lib/adherence';
import type { ActivityDashboardData } from '@/lib/clinical-brief';
import type { ClinicalActor } from '@/lib/clinical-types';
import styles from './patient-adherence.module.css';

const numberFormat = new Intl.NumberFormat('uz-Latn-UZ');
const timestampFormat = new Intl.DateTimeFormat('uz-Latn-UZ', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tashkent',
});
const stepSourceLabels: Record<StepSource, string> = {
  device_sensor: 'Telefon sensori (auto-sync)',
  demo_sim: 'Demo simulyatsiya (Android)',
  self_report: 'Qo‘lda kiritildi',
};

function AdherenceSummary({ counts, period }: { counts: AdherenceCounts; period: 'today' | 'week' }) {
  const headingId = `adherence-${period}`;
  const { scheduled, completed, answered } = counts;
  const completion = `${completed}/${scheduled} vazifa bajarildi`;

  return (
    <article className={styles.summary}>
      <h3 id={headingId}>{period === 'today' ? 'Bugun' : 'Oxirgi 7 kun'}</h3>
      {scheduled === 0 ? <p>Rejalashtirilgan vazifa yo‘q.</p> : (
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

export async function PatientAdherence({ actor }: { actor: ClinicalActor }) {
  const dashboard = await getActivityDashboard(actor).catch(() => null);
  if (!dashboard) return <p className="notice" role="alert">Reja ijrosi va qadamlarni yuklab bo‘lmadi. Sahifani yangilang.</p>;
  const { adherence, steps } = dashboard;

  return (
    <div className="ledger">
      <section>
        <h2>Reja ijrosi</h2>
        <p>Toshkent vaqti bo‘yicha muddati kelgan dori va qon bosimi vazifalari.</p>
        <div className={styles.summaries}>
          <AdherenceSummary counts={adherence.today} period="today" />
          <AdherenceSummary counts={adherence.week} period="week" />
        </div>
      </section>
      <section>
        <h2 id="daily-steps-title">Bugungi qadamlar</h2>
        <p>Shifokor belgilagan kunlik maqsad: {numberFormat.format(dashboard.dailyStepGoal ?? defaultDailyStepGoal)} qadam.</p>
        {steps ? (
          <div className={styles.stepRecord}>
            <p className={styles.completion}>
              {numberFormat.format(steps.count)} / {numberFormat.format(dashboard.dailyStepGoal ?? defaultDailyStepGoal)} qadam{' '}
              <span className={`status-pill ${steps.count >= (dashboard.dailyStepGoal ?? defaultDailyStepGoal) ? 'status-ok' : 'status-warn'}`}>
                {steps.count >= (dashboard.dailyStepGoal ?? defaultDailyStepGoal) ? 'Maqsad bajarildi' : 'Jarayonda'}
              </span>
            </p>
            <p>
              {stepSourceLabels[steps.source]} · L{steps.level} · AI rejimi {steps.aiMode}
            </p>
            <p><time dateTime={steps.updatedAt}>{timestampFormat.format(new Date(steps.updatedAt))}</time> · Toshkent</p>
          </div>
        ) : <p>Bugun qadamlar hali kiritilmagan (Android ilovasidan avtomatik sinxronlanadi yoki qo‘lda kiriting).</p>}
        <form className={styles.stepsForm} action="/api/demo/steps" method="post" aria-labelledby="daily-steps-title">
          <label htmlFor="daily-steps">Qadamlar soni</label>
          <input
            className={styles.field}
            id="daily-steps"
            name="steps"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{1,6}"
            maxLength={String(maximumDailySteps).length}
            defaultValue={steps?.count}
            required
          />
          <button className={styles.submit} type="submit">Qadamlarni saqlash</button>
        </form>
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

  return (
    <div className="ledger">
      <section>
        <h2>Reja ijrosi</h2>
        <AdherenceSummary counts={dashboard.adherence.week} period="week" />
        {(() => {
          const stepGoal = dashboard.dailyStepGoal ?? defaultDailyStepGoal;
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
        {dashboard.dueUnits.length > 0 && (
          <details>
            <summary>Hisobga kirgan vazifalar</summary>
            <ul>
              {dashboard.dueUnits.map(unit => (
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
