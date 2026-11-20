import type { ClinicalFlag, ClinicalView, MissedReason, PlanInput } from '@/lib/clinical-types';
import { formatBoxLabel } from '@/lib/dorimos-contract';
import styles from './doctor-clinical.module.css';

const tashkentTime = new Intl.DateTimeFormat('uz-UZ', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tashkent',
});
const tashkentDate = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'Asia/Tashkent' });

const missedReasons: Record<MissedReason, string> = {
  out_of_supply: 'Dori tugadi',
  side_effects: 'Nojo‘ya ta’sir sezildi',
  forgot: 'Esdan chiqdi',
  other: 'Boshqa sabab',
};

const pressureFields = [
  { name: 'warnSystolic', label: 'Sistolik kuzatuv chegarasi', value: 135 },
  { name: 'warnDiastolic', label: 'Diastolik kuzatuv chegarasi', value: 85 },
  { name: 'maxSystolic', label: 'Sistolik yuqori chegara', value: 150 },
  { name: 'maxDiastolic', label: 'Diastolik yuqori chegara', value: 95 },
] as const;

function LocalTime({ value }: { value: string }) {
  return <time dateTime={value}>{tashkentTime.format(new Date(value))} · Toshkent</time>;
}

function PlanAssignment({ patientName }: { patientName: string }) {
  return (
    <section className={styles.panel} aria-labelledby="plan-heading">
      <h2 id="plan-heading">Uy rejasini biriktirish</h2>
      <p className={styles.hint} id="plan-hint">
        {patientName} uchun demo reja. Namuna qiymatlarini biriktirishdan oldin tahrirlash mumkin.
      </p>
      <form
        className={styles.form}
        method="post"
        action="/api/demo/plan"
        aria-labelledby="plan-heading"
        aria-describedby="plan-hint"
      >
        <div className={styles.field}>
          <label htmlFor="medication-name">Dori nomi</label>
          <input id="medication-name" name="medicationName" defaultValue="Namuna dori" maxLength={80}
            pattern={String.raw`.*\p{L}.*`} title="Dori nomida kamida bitta harf bo‘lsin." required />
        </div>
        <div className={styles.pair}>
          <div className={styles.field}>
            <label htmlFor="medication-strength">Qutida yozilgan kuch (mg)</label>
            <input id="medication-strength" name="medicationStrengthMg" type="number"
              min="0.001" max="999999.999" step="0.001" defaultValue={5} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="medication-time">Dori vaqti</label>
            <input id="medication-time" name="medicationTime" type="time" defaultValue="08:00" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="vitals-time">Bosim o‘lchash vaqti</label>
            <input id="vitals-time" name="vitalsTime" type="time" defaultValue="09:00" required />
          </div>
        </div>
        <fieldset className={styles.thresholds}>
          <legend>Bosim chegaralari (mmHg)</legend>
          <div className={styles.pair}>
            {pressureFields.map(({ name, label, value }) => (
              <div className={styles.field} key={name}>
                <label htmlFor={name}>{label}</label>
                <input id={name} name={name} type="number" min={1} max={999} defaultValue={value} required />
              </div>
            ))}
          </div>
        </fieldset>
        <label className={styles.checkbox}>
          <input name="supplyFollowUp" type="checkbox" value="yes" />
          <span>«Dori tugadi» xabarini tekshiruv navbatiga chiqarish</span>
        </label>
        <button className={styles.submit} type="submit">Rejani biriktirish</button>
      </form>
    </section>
  );
}

function PlanSummary({ plan }: { plan: PlanInput }) {
  const { targets } = plan;
  return (
    <section className={styles.panel} aria-labelledby="plan-heading">
      <h2 id="plan-heading">Biriktirilgan reja</h2>
      <dl className={styles.metadata}>
        <div><dt>Dori</dt><dd>{plan.medicationName} · {plan.medicationTime}</dd></div>
        <div><dt>Quti kuchi</dt><dd>{plan.medicationStrengthMg === null ? 'Ko‘rsatilmagan' : `${plan.medicationStrengthMg} mg`}</dd></div>
        <div><dt>Bosim o‘lchash vaqti</dt><dd>{plan.vitalsTime} · Toshkent</dd></div>
        <div><dt>Kuzatuv chegarasi</dt><dd>{targets.warnSystolic}/{targets.warnDiastolic} mmHg</dd></div>
        <div><dt>Yuqori chegara</dt><dd>{targets.maxSystolic}/{targets.maxDiastolic} mmHg</dd></div>
        <div><dt>«Dori tugadi» bo‘yicha navbat</dt><dd>{plan.supplyFollowUp ? 'Yoqilgan' : 'O‘chirilgan'}</dd></div>
      </dl>
    </section>
  );
}

function flagTitle({ ruleKey, evidence: { payload } }: ClinicalFlag) {
  if (ruleKey === 'medication_box_mismatch') return 'Dori qutisi rejaga mos kelmadi';
  if (ruleKey === 'chest_pain') return 'Ko‘krak og‘rig‘i bildirildi';
  if (ruleKey === 'medication_missed_consecutive_days') return 'Ikki reja kunida dori qoldirildi';
  if (payload.kind === 'medication') return payload.status === 'missed' ? missedReasons[payload.reason] : 'Dori qaydi';
  return 'Bosim reja chegarasiga yetdi';
}

function FlagDetails({ flag }: { flag: ClinicalFlag }) {
  const { evidence } = flag;
  const box = evidence.payload.kind === 'medication_box' && evidence.payload.result !== 'manual' ? evidence.payload : null;
  return (
    <dl className={styles.metadata}>
      <div><dt>AI rejimi</dt><dd>{evidence.aiMode === 'live' ? 'Jonli tahlil (live)'
        : evidence.aiMode === 'manual' ? 'Qo‘lda (manual)' : 'AI ishlatilmagan (none)'}</dd></div>
      {box && (
        <>
          <div><dt>Ajratish modeli</dt><dd>{box.reading.model}</dd></div>
          <div><dt>Sifat modeli</dt><dd>{box.reading.decisionModel} · {Math.round(box.reading.confidence * 100)}%</dd></div>
        </>
      )}
      <div><dt>Dalil ID</dt><dd><code>{evidence.id}</code></dd></div>
      <div><dt>Bayroq ID</dt><dd><code>{flag.id}</code></dd></div>
    </dl>
  );
}

function ReviewForm({ flag }: { flag: ClinicalFlag }) {
  const replyId = `review-reply-${flag.id}`;
  const noteId = `review-note-${flag.id}`;
  return (
    <form
      method="post"
      action="/api/demo/review"
      className={styles.form}
      aria-labelledby={`review-${flag.id} flag-title-${flag.id}`}
    >
      <input type="hidden" name="flagId" value={flag.id} />
      <div className={styles.field}>
        <label htmlFor={replyId}>Bemorga javob</label>
        <textarea id={replyId} name="reply" rows={3} maxLength={500} required />
      </div>
      <div className={styles.field}>
        <label htmlFor={noteId}>Ichki izoh (ixtiyoriy)</label>
        <textarea id={noteId} name="note" rows={2} maxLength={500} />
      </div>
      <div className={styles.buttons}>
        <button className={styles.submit} name="decision" value="approved" type="submit">Qaydni tasdiqlash</button>
        <button className={styles.secondary} name="decision" value="retake" type="submit">Qayta o‘lchashni so‘rash</button>
      </div>
    </form>
  );
}

function QueueEntry({ flag }: { flag: ClinicalFlag }) {
  const { evidence: { createdAt, level, payload, review }, color, metric, ruleKey, threshold } = flag;
  return (
    <li className={styles.queueItem}>
      <article aria-labelledby={`flag-title-${flag.id}`}>
        <p className={styles.queueMeta}>
          {review ? (
            <span>{review.decision === 'approved' ? 'Tasdiqlandi' : 'Qayta o‘lchash so‘raldi'}</span>
          ) : (
            <span className={color === 'red' ? styles.urgent : styles.followup}>
              <span className={styles.marker} aria-hidden="true" />
              {color === 'red' ? 'Tez ko‘rib chiqish' : 'Tekshirish'}
            </span>
          )}
          <LocalTime value={createdAt} />
        </p>
        <h3 id={`flag-title-${flag.id}`}>{flagTitle(flag)}</h3>
        {payload.kind === 'vitals' && payload.systolic !== null && payload.diastolic !== null && (
          <p className={styles.reading}>{payload.systolic}/{payload.diastolic} mmHg</p>
        )}
        {payload.kind === 'medication' && payload.status === 'missed' && ruleKey === 'medication_missed_consecutive_days' && (
          <p>{missedReasons[payload.reason]}</p>
        )}
        {payload.kind === 'medication_box' && payload.result !== 'manual' && (
          <>
            <p>Qutidan o‘qildi · {formatBoxLabel(payload.reading.label)}</p>
            <p>Rejada · {formatBoxLabel(payload.expected)}</p>
          </>
        )}
        <p className={styles.evidenceLine}>{payload.kind === 'medication_box' ? 'Sintetik quti · bemor tasdiqlagan OCR' : 'Bemor kiritgan qayd'} · L{level}</p>
        {threshold !== undefined && metric && (
          <p className={styles.evidenceLine}>Rejadagi {metric === 'systolic' ? 'sistolik' : 'diastolik'} chegara · {threshold} mmHg</p>
        )}
        <details>
          <summary id={`review-${flag.id}`} className={styles.disclosure}>
            {review ? 'Qayd tafsilotlari' : 'Ko‘rib chiqish'}
          </summary>
          <FlagDetails flag={flag} />
          {review ? (
            <div className={styles.reviewed}>
              <h4>Bemorga yuborilgan javob</h4>
              <p>{review.reply}</p>
              <LocalTime value={review.reviewedAt} />
            </div>
          ) : <ReviewForm flag={flag} />}
        </details>
      </article>
    </li>
  );
}

export function DoctorClinical({ view, patientName }: { view: ClinicalView; patientName: string }) {
  const openFlags = view.flags.filter(({ evidence }) => evidence.review === null);
  const reviewedFlags = view.flags.filter(({ evidence }) => evidence.review !== null);
  const today = tashkentDate.format(new Date());
  const waitingForEvidence = view.plan && !view.tasks.some(({ date, evidence }) => date === today && evidence !== null);

  return (
    <div className={`${styles.dashboard} ${view.plan ? styles.assigned : ''}`}>
      {!view.plan && <PlanAssignment patientName={patientName} />}
      <div>
        <section className={styles.panel} aria-labelledby="queue-heading">
          <h2 id="queue-heading">Bemorlar navbati</h2>
          <p className={styles.hint}>{patientName} · Ochiq qaydlar ({openFlags.length})</p>
          {openFlags.length > 0 ? (
            <ul role="list" className={styles.queue}>{openFlags.map((flag) => <QueueEntry key={flag.id} flag={flag} />)}</ul>
          ) : (
            <p className={styles.empty}>
              {waitingForEvidence ? 'Bemordan ma’lumot kelmagan.' : 'Ko‘rib chiqiladigan ochiq qayd yo‘q.'}
            </p>
          )}
        </section>
        {reviewedFlags.length > 0 && (
          <section className={styles.panel} aria-labelledby="reviewed-heading">
            <h2 id="reviewed-heading">Ko‘rib chiqilgan qaydlar</h2>
            <ul role="list" className={styles.queue}>{reviewedFlags.map((flag) => <QueueEntry key={flag.id} flag={flag} />)}</ul>
          </section>
        )}
      </div>
      {view.plan && <PlanSummary plan={view.plan} />}
    </div>
  );
}
