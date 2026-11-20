import type { ClinicalTask, ClinicalView, EvidenceView, MissedReason } from '@/lib/clinical-types';
import { formatBoxLabel } from '@/lib/dorimos-contract';
import { DorimosCheck } from './dorimos-check';
import styles from './patient-clinical.module.css';

const tashkentTimeZone = 'Asia/Tashkent';
const localDate = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: tashkentTimeZone });
const displayDate = new Intl.DateTimeFormat('uz-Latn-UZ', { dateStyle: 'medium', timeZone: 'UTC' });
const displayTimestamp = new Intl.DateTimeFormat('uz-Latn-UZ', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: tashkentTimeZone,
});

const missedReasons: Record<MissedReason, string> = {
  out_of_supply: 'Dori tugadi',
  side_effects: 'Nojo‘ya ta’sir sezdim',
  forgot: 'Unutdim',
  other: 'Boshqa sabab',
};

function MedicationForm({ taskId }: { taskId: string }) {
  const reasonId = `reason-${taskId}`;

  return (
    <div className={styles.controls}>
      <form action="/api/demo/evidence" method="post" aria-labelledby={`taken-${taskId}`}>
        <input type="hidden" name="taskId" value={taskId} />
        <button className={styles.submit} id={`taken-${taskId}`} type="submit" name="medicationStatus" value="taken">Ichdim</button>
      </form>
      <details className={styles.disclosure}>
        <summary id={`missed-${taskId}`}>Icha olmadim</summary>
        <form className={styles.fields} action="/api/demo/evidence" method="post" aria-labelledby={`missed-${taskId}`}>
          <input type="hidden" name="taskId" value={taskId} />
          <input type="hidden" name="medicationStatus" value="missed" />
          <label htmlFor={reasonId}>Nega icha olmadingiz?</label>
          <select className={styles.field} id={reasonId} name="reason" defaultValue="" required>
            <option value="" disabled>Sababni tanlang</option>
            {Object.entries(missedReasons).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
          <button className={styles.submit} type="submit">Sababni yuborish</button>
        </form>
      </details>
    </div>
  );
}

function BloodPressureForm({ taskId }: { taskId: string }) {
  const hintId = `pressure-hint-${taskId}`;

  return (
    <form className={styles.controls} action="/api/demo/evidence" method="post" aria-labelledby={`pressure-${taskId}`}>
      <input type="hidden" name="taskId" value={taskId} />
      <fieldset aria-describedby={hintId}>
        <legend id={`pressure-${taskId}`}>Qon bosimi (mm sim. ust.)</legend>
        <div className={styles.readings}>
          <label htmlFor={`systolic-${taskId}`}>
            Sistolik bosim
            <input className={styles.field} id={`systolic-${taskId}`} name="systolic" type="number" inputMode="numeric" min={1} max={999} step={1} />
          </label>
          <label htmlFor={`diastolic-${taskId}`}>
            Diastolik bosim
            <input className={styles.field} id={`diastolic-${taskId}`} name="diastolic" type="number" inputMode="numeric" min={1} max={999} step={1} />
          </label>
        </div>
        <p id={hintId}>Bosimni qayd etish uchun ikkala qiymatni kiriting. Faqat og‘riq haqida xabar bersangiz, ularni bo‘sh qoldiring.</p>
      </fieldset>
      <label className={styles.symptom}>
        <input type="checkbox" name="chestPain" value="yes" />
        Ko‘krak og‘rig‘i bor
      </label>
      <button className={styles.submit} type="submit">Qaydni yuborish</button>
    </form>
  );
}

function PatientRecord({ evidence }: { evidence: EvidenceView }) {
  const { payload, review } = evidence;

  return (
    <div className={styles.record}>
      <p className={styles.recordTitle}>{payload.kind === 'medication_box' ? 'DoriMos qaydi' : 'Qayd saqlandi'}</p>
      {payload.kind === 'medication' ? (
        <p>{payload.status === 'taken' ? 'Ichdim' : `Icha olmadim · ${missedReasons[payload.reason]}`}</p>
      ) : payload.kind === 'vitals' ? (
        <>
          {payload.systolic !== null && payload.diastolic !== null && <p>{payload.systolic}/{payload.diastolic} mm sim. ust.</p>}
          {payload.chestPain && <p>Ko‘krak og‘rig‘i bildirildi.</p>}
        </>
      ) : payload.result === 'manual' ? <p>Quti tekshirilmagani qo‘lda qayd etildi.</p> : (
        <>
          <p>{payload.result === 'match' ? 'Namuna qutisi rejadagi nom va kuchga mos.' : 'Namuna qutisi rejadan farq qiladi. Qayd shifokor navbatiga yuborildi.'}</p>
          <p>Qutidan o‘qildi · {formatBoxLabel(payload.reading.label)}</p>
          <p>Rejada · {formatBoxLabel(payload.expected)}</p>
        </>
      )}
      <dl className={styles.metadata}>
        <dt>Vaqti</dt>
        <dd><time dateTime={evidence.createdAt}>{displayTimestamp.format(new Date(evidence.createdAt))}</time> · Toshkent</dd>
        <dt>Manba</dt>
        <dd>{evidence.source === 'photo_ocr' ? 'Sintetik quti · Gemini o‘qidi, bemor tasdiqladi'
          : evidence.aiMode === 'manual' ? 'Qo‘lda kiritildi' : 'Bemor qaydi'}</dd>
        <dt>AI rejimi</dt>
        <dd>{evidence.aiMode}</dd>
        <dt>Dalil darajasi</dt>
        <dd>L{evidence.level}</dd>
      </dl>
      {review && (
        <div className={styles.reply}>
          <p className={styles.recordTitle}>{review.decision === 'approved' ? 'Shifokor ko‘rib tasdiqladi' : 'Shifokor qayta o‘lchashni so‘radi'}</p>
          <p>Shifokor javobi</p>
          <p className={styles.replyText}>{review.reply}</p>
          <p><time dateTime={review.reviewedAt}>{displayTimestamp.format(new Date(review.reviewedAt))}</time> · Toshkent</p>
        </div>
      )}
    </div>
  );
}

function PatientTask({ task, today, boxStrengthKnown }: { task: ClinicalTask; today: boolean; boxStrengthKnown: boolean }) {
  return (
    <li className={styles.task}>
      <div className={styles.taskHeading}>
        <h3>{task.title}</h3>
        <time dateTime={`${task.date}T${task.dueTime}`}>
          {!today && `${displayDate.format(new Date(`${task.date}T00:00:00Z`))}, `}{task.dueTime} · Toshkent
        </time>
      </div>
      {task.evidence ? <PatientRecord evidence={task.evidence} /> : (
        today && task.status === 'pending' && (task.type === 'medication'
          ? <MedicationForm taskId={task.id} />
          : <BloodPressureForm taskId={task.id} />)
      )}
      {task.boxEvidence ? <PatientRecord evidence={task.boxEvidence} /> : (
        today && task.type === 'medication' && <DorimosCheck taskId={task.id} available={boxStrengthKnown} />
      )}
    </li>
  );
}

export function PatientClinical({ view }: { view: ClinicalView }) {
  const today = localDate.format(new Date());
  const todayTasks = view.tasks.filter((task) => task.date === today);
  const pastTasks = view.tasks.filter((task) => task.date < today && (task.evidence !== null || task.boxEvidence !== null));
  const boxStrengthKnown = view.plan?.medicationStrengthMg != null;

  return (
    <div className="ledger">
      <section>
        <h2>Bugungi vazifalar</h2>
        {todayTasks.length ? (
          <ul className={styles.tasks}>
            {todayTasks.map((task) => <PatientTask key={task.id} task={task} today boxStrengthKnown={boxStrengthKnown} />)}
          </ul>
        ) : <p>Hozircha vazifa biriktirilmagan.</p>}
      </section>
      {pastTasks.length > 0 && (
        <section>
          <h2>Oldingi qaydlar</h2>
          <ul className={styles.tasks}>
            {pastTasks.map((task) => <PatientTask key={task.id} task={task} today={false} boxStrengthKnown={boxStrengthKnown} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
