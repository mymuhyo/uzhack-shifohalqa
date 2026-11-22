import {
  caregiverAckMessage,
  countOpenClinicalAttention,
  describeRetakeVitalsFollowup,
  isFollowupSuperseded,
} from '@/lib/clinical-triage';
import type {
  BloodPressureTargets,
  ClinicalFlag,
  ClinicalView,
  FlagFollowup,
  MissedReason,
  PlanInput,
  UrgentSymptomType,
  UrgentSymptomView,
} from '@/lib/clinical-types';
import { formatBoxLabel } from '@/lib/dorimos-contract';
import { DoctorQueueFilter } from './doctor-queue-filter';
import { DoctorReviewForm } from './doctor-review-form';
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

const symptomLabels: Record<UrgentSymptomType, string> = {
  chest_pain: 'Ko‘krak og‘rig‘i',
  dizziness: 'Bosh aylanishi',
  shortness_of_breath: 'Nafas qisishi',
  severe_headache: 'Kuchli bosh og‘rig‘i',
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
          <input name="supplyFollowUp" type="checkbox" value="yes" defaultChecked />
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

function formatFollowup(
  followup: FlagFollowup,
  targets: BloodPressureTargets | null,
): { text: string; tone?: 'ok' | 'warn' | 'urgent' | null; labelUz?: string | null } {
  switch (followup.kind) {
    case 'supply_resolved':
      return { text: 'Bemor xabari: Dorini oldim va ichdim (halqa yopildi)', tone: 'ok', labelUz: 'Halqa yopildi' };
    case 'still_need_help':
      return { text: 'Bemor xabari: Hali yordam kerak', tone: 'warn', labelUz: 'Qayta nazorat' };
    case 'retake_vitals':
      return describeRetakeVitalsFollowup(followup, targets, 'mmHg');
    case 'retake_medication':
      return {
        text: `Qayta dori qaydi: ${followup.payload.status === 'taken' ? 'Ichdim' : 'Icha olmadim'}`,
        tone: followup.payload.status === 'taken' ? 'ok' : 'warn',
        labelUz: followup.payload.status === 'taken' ? 'Tasdiqlandi' : 'Qayta nazorat',
      };
  }
}

function QueueEntry({ flag, targets }: { flag: ClinicalFlag; targets: BloodPressureTargets | null }) {
  const { evidence: { createdAt, level, payload, review, followups }, color, metric, ruleKey, threshold } = flag;
  const titleId = `flag-title-${flag.id}`;
  const headingId = `review-${flag.id}`;

  const severityClass = review
    ? styles.reviewedItem
    : color === 'red'
      ? styles.urgentItem
      : styles.warnItem;

  return (
    <li className={`${styles.queueItem} ${severityClass}`}>
      <article aria-labelledby={titleId}>
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
        <h3 id={titleId}>{flagTitle(flag)}</h3>
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
        {followups && followups.length > 0 && (
          <div className={styles.reviewed}>
            <h4>Bemordan keyingi holat</h4>
            {followups.map((item) => {
              const detail = formatFollowup(item, targets);
              const showDetailPill = Boolean(
                detail.tone
                  && detail.labelUz
                  && (item.kind === 'retake_vitals' || !item.acknowledgedAt)
                  && !isFollowupSuperseded(followups, item),
              );
              return (
                <p key={item.id}>
                  {detail.text} · <LocalTime value={item.createdAt} />
                  {showDetailPill && detail.tone && detail.labelUz && (
                    <>
                      {' '}
                      <span className={`status-pill ${detail.tone === 'urgent' ? 'status-urgent' : detail.tone === 'warn' ? 'status-warn' : 'status-ok'}`}>
                        {detail.labelUz}
                      </span>
                    </>
                  )}
                  {item.acknowledgedAt && (
                    <>
                      {' '}
                      <span className="status-pill status-ok">Shifokor ko‘rdi</span>
                    </>
                  )}
                </p>
              );
            })}
          </div>
        )}
        <details>
          <summary id={headingId} className={styles.disclosure}>
            {review ? 'Qayd tafsilotlari' : 'Ko‘rib chiqish'}
          </summary>
          <FlagDetails flag={flag} />
          {review ? (
            <div className={styles.reviewed}>
              <h4>Bemorga yuborilgan javob</h4>
              <p>{review.reply}</p>
              <LocalTime value={review.reviewedAt} />
            </div>
          ) : (
            <DoctorReviewForm
              action="/api/demo/review"
              idFieldName="flagId"
              idFieldValue={flag.id}
              ruleKey={ruleKey}
              headingId={headingId}
              titleId={titleId}
            />
          )}
        </details>
      </article>
    </li>
  );
}

function UrgentSymptomEntry({ entry }: { entry: UrgentSymptomView }) {
  const titleId = `symptom-title-${entry.id}`;
  const headingId = `symptom-review-${entry.id}`;
  const severityClass = entry.review ? styles.reviewedItem : styles.urgentItem;

  return (
    <li className={`${styles.queueItem} ${severityClass}`}>
      <article aria-labelledby={titleId}>
        <p className={styles.queueMeta}>
          {entry.review ? (
            <span>{entry.review.decision === 'approved' ? 'Tasdiqlandi' : 'Qayta ko‘rik so‘raldi'}</span>
          ) : (
            <span className={styles.urgent}>
              <span className={styles.marker} aria-hidden="true" />
              Shoshilinch simptom
            </span>
          )}
          <LocalTime value={entry.createdAt} />
        </p>
        <h3 id={titleId}>{symptomLabels[entry.symptom]} · L{entry.level}</h3>
        {entry.note && <p>{entry.note}</p>}
        <details>
          <summary id={headingId} className={styles.disclosure}>
            {entry.review ? 'Qayd tafsilotlari' : 'Ko‘rib chiqish'}
          </summary>
          {entry.review ? (
            <div className={styles.reviewed}>
              <h4>Bemorga yuborilgan javob</h4>
              <p>{entry.review.reply}</p>
              <LocalTime value={entry.review.reviewedAt} />
            </div>
          ) : (
            <DoctorReviewForm
              action="/api/demo/symptom-review"
              idFieldName="symptomId"
              idFieldValue={entry.id}
              ruleKey={entry.symptom === 'chest_pain' ? 'chest_pain' : 'urgent_symptom'}
              headingId={headingId}
              titleId={titleId}
            />
          )}
        </details>
      </article>
    </li>
  );
}

export function DoctorClinical({ view, patientName }: { view: ClinicalView; patientName: string }) {
  const openFlags = view.flags.filter(({ evidence }) => evidence.review === null);
  const reviewedFlags = view.flags.filter(({ evidence }) => evidence.review !== null);
  const urgentSymptoms = view.urgentSymptoms ?? [];
  const openSymptoms = urgentSymptoms.filter(({ review }) => review === null);
  const reviewedSymptoms = urgentSymptoms.filter(({ review }) => review !== null);
  const { followupEscalations } = countOpenClinicalAttention({ view });
  const today = tashkentDate.format(new Date());
  const waitingForEvidence = view.plan && !view.tasks.some(({ date, evidence }) => date === today && evidence !== null);

  return (
    <div className={`${styles.dashboard} ${view.plan ? styles.assigned : ''}`}>
      {!view.plan && <PlanAssignment patientName={patientName} />}
      <div>
        {view.caregiverAck && (
          <p className="notice" role="status">
            {caregiverAckMessage(view.caregiverAck, 'doctor')} (<LocalTime value={view.caregiverAck.createdAt} />).
          </p>
        )}
        {followupEscalations.length > 0 && (
          <section className={styles.panel} aria-labelledby="followup-alerts-heading">
            <h2 id="followup-alerts-heading">Qayta aloqa va nazorat ({followupEscalations.length})</h2>
            <p className={styles.hint}>Ko‘rib chiqilgan qayddan keyin bemor yuborgan qayta xabar yoki yuqori qayta o‘lchov.</p>
            <ul role="list" className={styles.queue}>
              {followupEscalations.map((item) => {
                const titleId = `followup-title-${item.followupId}`;
                const noteId = `followup-note-${item.followupId}`;
                return (
                  <li
                    key={item.followupId}
                    className={`${styles.queueItem} ${item.severity === 'red' ? styles.urgentItem : styles.warnItem}`}
                  >
                    <article aria-labelledby={titleId}>
                      <p className={styles.queueMeta}>
                        <span className={item.severity === 'red' ? styles.urgent : styles.followup}>
                          <span className={styles.marker} aria-hidden="true" />
                          {item.severity === 'red' ? 'Tez ko‘rib chiqish' : 'Qayta nazorat'}
                        </span>
                        <LocalTime value={item.createdAt} />
                      </p>
                      <h3 id={titleId}>{item.titleUz}</h3>
                      <p>{item.summaryUz}</p>
                      <form
                        action="/api/demo/followup-ack"
                        method="post"
                        className={styles.form}
                        aria-labelledby={titleId}
                      >
                        <input type="hidden" name="followupId" value={item.followupId} />
                        <div className={styles.field}>
                          <label htmlFor={noteId}>Ichki izoh (ixtiyoriy)</label>
                          <input
                            id={noteId}
                            name="note"
                            maxLength={500}
                            placeholder="Masalan: bemor bilan telefon orqali bog‘landim"
                          />
                        </div>
                        <div className={styles.buttons}>
                          <button className={styles.submit} type="submit">Bog‘landim · Nazoratni yopish</button>
                        </div>
                      </form>
                      <p className="no-print">
                        <a className="text-action" href={`#flag-title-${item.flagId}`}>Asosiy qaydga o‘tish ↓</a>
                      </p>
                    </article>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {openSymptoms.length > 0 && (
          <section className={styles.panel} aria-labelledby="urgent-symptoms-heading">
            <h2 id="urgent-symptoms-heading">Shoshilinch simptomlar ({openSymptoms.length})</h2>
            <ul role="list" className={styles.queue}>
              {openSymptoms.map((entry) => <UrgentSymptomEntry key={entry.id} entry={entry} />)}
            </ul>
          </section>
        )}
        <section className={styles.panel} aria-labelledby="queue-heading">
          <h2 id="queue-heading">Bemorlar navbati</h2>
          <p className={styles.hint}>{patientName} · Dori va bosim bo‘yicha ochiq qaydlar ({openFlags.length})</p>
          {openFlags.length > 0 ? (
            <DoctorQueueFilter
              listClassName={styles.queue}
              items={openFlags.map((flag) => ({
                id: flag.id,
                color: flag.color,
                node: <QueueEntry key={flag.id} flag={flag} targets={view.plan?.targets ?? null} />,
              }))}
            />
          ) : (
            <p className={styles.empty}>
              {waitingForEvidence ? 'Bemordan ma’lumot kelmagan.' : 'Ko‘rib chiqiladigan ochiq qayd yo‘q.'}
            </p>
          )}
        </section>
        {(reviewedFlags.length > 0 || reviewedSymptoms.length > 0) && (
          <section className={styles.panel} aria-labelledby="reviewed-heading">
            <h2 id="reviewed-heading">Ko‘rib chiqilgan qaydlar</h2>
            <ul role="list" className={styles.queue}>
              {reviewedFlags.map((flag) => <QueueEntry key={flag.id} flag={flag} targets={view.plan?.targets ?? null} />)}
              {reviewedSymptoms.map((entry) => <UrgentSymptomEntry key={entry.id} entry={entry} />)}
            </ul>
          </section>
        )}
      </div>
      {view.plan && <PlanSummary plan={view.plan} />}
    </div>
  );
}
