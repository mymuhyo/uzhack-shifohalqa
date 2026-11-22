import type { ExerciseAttemptsData, ExercisePlanData } from '@/lib/clinical-brief';
import { exerciseCatalog } from '@/lib/pose/diagnostics';
import { DoctorExercisePlanForm } from './doctor-exercise-form';
import { readExerciseAttempts, readExercisePlan, type ExerciseAttempt } from '@/lib/exercise-store';
import type { ClinicalActor } from '@/lib/clinical-types';
import styles from './doctor-clinical.module.css';

const localTime = new Intl.DateTimeFormat('uz-Latn-UZ', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tashkent',
});

const sourceNames = { live_camera: 'Jonli kamera', uploaded_video: 'Yuklangan video', self_report: 'Bemor qaydi' };

function ExerciseReview({ attempt }: { attempt: ExerciseAttempt }) {
  if (attempt.review) return (
    <div className={styles.reviewed}>
      <h4>{attempt.review.decision === 'retake' ? 'Qayta o‘lchash so‘raldi' : 'Ko‘rib chiqildi'}</h4>
      <p>{attempt.review.body}</p>
    </div>
  );
  return (
    <details>
      <summary className={styles.disclosure}>Ko‘rib chiqish</summary>
      <form action="/api/demo/exercise-review" method="post" className={styles.form} aria-labelledby={`exercise-review-${attempt.id}`}>
        <h4 id={`exercise-review-${attempt.id}`}>Bemorga javob</h4>
        <input type="hidden" name="attemptId" value={attempt.id} />
        <fieldset className={styles.thresholds}>
          <legend>Qaror</legend>
          <label className={styles.checkbox}><input name="decision" type="radio" value="reviewed" defaultChecked /> Ko‘rib chiqildi</label>
          <label className={styles.checkbox}><input name="decision" type="radio" value="retake" /> Qayta o‘lchash so‘ralsin</label>
        </fieldset>
        <div className={styles.field}>
          <label htmlFor={`exercise-reply-${attempt.id}`}>Mashq bo‘yicha javob (majburiy)</label>
          <textarea id={`exercise-reply-${attempt.id}`} name="reply" maxLength={500} rows={3} required />
        </div>
        <button type="submit" className={styles.submit}>Javobni yuborish</button>
      </form>
    </details>
  );
}

export async function DoctorExercise({
  actor,
  initialPlan,
  initialAttempts,
}: {
  actor: ClinicalActor;
  initialPlan?: ExercisePlanData;
  initialAttempts?: ExerciseAttemptsData;
}) {
  const data =
    initialPlan !== undefined && initialAttempts !== undefined
      ? ([initialPlan, initialAttempts] as const)
      : await Promise.all([
          initialPlan !== undefined ? Promise.resolve(initialPlan) : readExercisePlan(actor),
          initialAttempts !== undefined ? Promise.resolve(initialAttempts) : readExerciseAttempts(actor),
        ]).catch(() => null);
  if (!data) return <p className="notice" role="alert">Mashq bo‘limini yuklab bo‘lmadi.</p>;
  const [plan, attempts] = data;
  return (
    <div className="ledger">
      <section aria-labelledby="exercise-heading">
        <h2 id="exercise-heading">{plan ? exerciseCatalog[plan.movement].title : 'O‘tirib-turish mashqi'}</h2>
        {plan ? (
          <p>Reja: {plan.targetReps} takror · {exerciseCatalog[plan.movement].jointLabel.toLowerCase()} burchagi {plan.targetAngle}°.</p>
        ) : (
          <DoctorExercisePlanForm />
        )}
      </section>
      {attempts.length > 0 && (
        <section>
          <h2>Mashq qaydlari</h2>
          <ul className={styles.queue}>
            {attempts.map(attempt => (
              <li key={attempt.id} className={styles.queueItem}>
                <article aria-labelledby={`exercise-attempt-${attempt.id}`}>
                  <h3 id={`exercise-attempt-${attempt.id}`}>{attempt.sample ? 'CDC namuna videosi' : attempt.reason === 'pain' ? 'Og‘riq bildirildi' : sourceNames[attempt.source]} · L{attempt.level}</h3>
                  <p><time dateTime={attempt.createdAt}>{localTime.format(new Date(attempt.createdAt))}</time> · Toshkent</p>
                  <p>Vazifa kuni · <time dateTime={attempt.scheduledDate}>{attempt.scheduledDate}</time></p>
                  {attempt.validReps !== null && <p>{attempt.validReps} takror{attempt.shallowReps !== null && ` · ${attempt.shallowReps} chala`}</p>}
                  {attempt.minAngle !== null && attempt.confidence !== null && (
                    <p>
                      {exerciseCatalog[attempt.movement].direction === 'extend' ? 'Eng katta burchak' : 'Eng kichik burchak'} {attempt.minAngle.toFixed(1)}° · Tayanch nuqtalari ishonchi {Math.round(attempt.confidence * 100)}%
                    </p>
                  )}
                  <p>AI rejimi {attempt.aiMode}{!attempt.sample && attempt.reason !== 'pain' && ` · ${attempt.primary ? 'Asosiy urinish' : 'Qayta urinish'}`}</p>
                  {attempt.diagnostics?.doctorSummaryUz && <p>{attempt.diagnostics.doctorSummaryUz}</p>}
                  {attempt.source !== 'self_report' && <p>O‘lchov manbasi · {attempt.android ? 'Android ilovasi' : 'Bemor brauzeri'}. Server o‘lchovni mustaqil tasdiqlamaydi.</p>}
                  {attempt.flagColor && <p>{attempt.flagColor === 'red' ? 'Tez ko‘rib chiqish' : 'Tekshirish'}{attempt.similarMotion && ' · O‘xshash harakat'}</p>}
                  {!attempt.sample && <ExerciseReview attempt={attempt} />}
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
