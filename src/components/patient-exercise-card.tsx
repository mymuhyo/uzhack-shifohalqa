import Link from 'next/link';
import { findLatestRealExerciseAttempt } from '@/lib/clinical-triage';
import type { readExerciseAttempts, readExercisePlan } from '@/lib/exercise-store';
import styles from './patient-clinical.module.css';

const displayTimestamp = new Intl.DateTimeFormat('uz-Latn-UZ', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tashkent',
});

type ExercisePlan = NonNullable<Awaited<ReturnType<typeof readExercisePlan>>>;
type ExerciseAttempts = Awaited<ReturnType<typeof readExerciseAttempts>>;

export function PatientExerciseCard({
  plan,
  attempts,
}: {
  plan: ExercisePlan;
  attempts: ExerciseAttempts;
}) {
  const latest = findLatestRealExerciseAttempt(attempts);
  const latestReview = latest?.review;

  return (
    <div className="ledger">
      <section aria-labelledby="patient-exercise-heading">
        <h2 id="patient-exercise-heading">Reabilitatsiya mashqi</h2>
        <div className={styles.record}>
          <p className={styles.recordTitle}>O‘tirib-turish mashqi</p>
          <p>
            Shifokor rejasi · {plan.targetReps} takror · tizza burchagi maqsadi {plan.targetAngle}°.
          </p>
          {latest ? (
            <>
              <p>
                Oxirgi mashq qaydi:{' '}
                {latest.reason === 'pain'
                  ? 'Og‘riq bildirildi'
                  : latest.validReps !== null
                    ? `${latest.validReps} to‘liq takror`
                    : 'Saqlandi'}{' '}
                · L{latest.level} ·{' '}
                <time dateTime={latest.createdAt}>{displayTimestamp.format(new Date(latest.createdAt))}</time>
              </p>
              {latestReview && (
                <div className={styles.reply}>
                  <p className={styles.recordTitle}>
                    {latestReview.decision === 'reviewed'
                      ? 'Shifokor mashq qaydini ko‘rdi'
                      : 'Shifokor mashqni qayta bajarishni so‘radi'}
                  </p>
                  <p className={styles.replyText}>{latestReview.body}</p>
                </div>
              )}
            </>
          ) : (
            <p>Bugun mashq hali bajarilmagan. Jonli kamera (L3) yoki video (L2) orqali bajaring.</p>
          )}
          <div className={styles.controls}>
            <Link className="role-button" href="/patient/exercise">
              O‘tirib-turish mashqi <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
