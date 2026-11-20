import { readExerciseAttempts, readExercisePlan } from '@/lib/exercise-store';
import type { ClinicalActor } from '@/lib/clinical-types';
import styles from './doctor-clinical.module.css';

const localTime = new Intl.DateTimeFormat('uz-Latn-UZ', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tashkent',
});

const sourceNames = { live_camera: 'Jonli kamera', uploaded_video: 'Yuklangan video', self_report: 'Bemor qaydi' };

export async function DoctorExercise({ actor }: { actor: ClinicalActor }) {
  const data = await Promise.all([readExercisePlan(actor), readExerciseAttempts(actor)]).catch(() => null);
  if (!data) return <p className="notice" role="alert">Mashq bo‘limini yuklab bo‘lmadi.</p>;
  const [plan, attempts] = data;
  return (
    <div className="ledger">
      <section aria-labelledby="exercise-heading">
        <h2 id="exercise-heading">O‘tirib-turish mashqi</h2>
        {plan ? (
          <p>Reja: {plan.targetReps} takror · tizza burchagi {plan.targetAngle}°.</p>
        ) : (
          <form action="/api/demo/exercise-plan" method="post" className={styles.form} aria-labelledby="exercise-heading">
            <p>Namuna qiymatlarini biriktirishdan oldin ko‘rib chiqing.</p>
            <div className={styles.pair}>
              <label className={styles.field}>Takror soni <input type="number" name="targetReps" defaultValue={5} min={1} max={40} required /></label>
              <label className={styles.field}>Maqsad burchagi <input type="number" name="targetAngle" defaultValue={100} min={60} max={130} required /></label>
              <label className={styles.field}>Chala takror chegarasi <input type="number" name="maxShallow" defaultValue={1} min={0} max={40} required /></label>
              <label className={styles.field}>Og‘riq xabari <select name="painColor"><option value="yellow">Tekshirish</option><option value="red">Tez ko‘rib chiqish</option></select></label>
            </div>
            <button className={styles.submit} type="submit">Mashqni biriktirish</button>
          </form>
        )}
      </section>
      {attempts.length > 0 && (
        <section>
          <h2>Mashq qaydlari</h2>
          <ul className={styles.queue}>
            {attempts.map(attempt => (
              <li key={attempt.id} className={styles.queueItem}>
                <h3>{attempt.sample ? 'CDC namuna videosi' : attempt.reason === 'pain' ? 'Og‘riq bildirildi' : sourceNames[attempt.source]} · L{attempt.level}</h3>
                <p><time dateTime={attempt.createdAt}>{localTime.format(new Date(attempt.createdAt))}</time> · Toshkent</p>
                {attempt.validReps !== null && <p>{attempt.validReps} takror{attempt.shallowReps !== null && ` · ${attempt.shallowReps} chala`}</p>}
                <p>AI rejimi {attempt.aiMode}{!attempt.sample && attempt.reason !== 'pain' && ` · ${attempt.primary ? 'Asosiy urinish' : 'Qayta urinish'}`}</p>
                {attempt.source !== 'self_report' && <p>Demo o‘lchovi bemor brauzeridan olingan. Server uni mustaqil tekshirmagan.</p>}
                {attempt.flagColor && <p>{attempt.flagColor === 'red' ? 'Tez ko‘rib chiqish' : 'Tekshirish'}{attempt.similarMotion && ' · O‘xshash harakat'}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
