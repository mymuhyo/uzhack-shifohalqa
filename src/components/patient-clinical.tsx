import {
  caregiverAckMessage,
  describeRetakeVitalsFollowup,
  isFollowupSuperseded,
} from '@/lib/clinical-triage';
import type {
  BloodPressureTargets,
  ClinicalTask,
  ClinicalView,
  EvidenceView,
  FlagFollowup,
  MissedReason,
  UrgentSymptomType,
} from '@/lib/clinical-types';
import { formatBoxLabel } from '@/lib/dorimos-contract';
import { DorimosCheck } from './dorimos-check';
import { PatientBpForm, PatientRetakeBpForm } from './patient-bp-form';
import { PatientTeachBack } from './patient-teach-back';
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

const symptomLabels: Record<UrgentSymptomType, string> = {
  chest_pain: 'Ko‘krak og‘rig‘i',
  dizziness: 'Bosh aylanishi',
  shortness_of_breath: 'Nafas qisishi',
  severe_headache: 'Kuchli bosh og‘rig‘i',
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

function formatFollowup(item: FlagFollowup, targets: BloodPressureTargets | null): { text: string; tone?: 'ok' | 'warn' | 'urgent' | null; labelUz?: string | null } {
  switch (item.kind) {
    case 'supply_resolved':
      return { text: 'Sizning tasdiqingiz: Dorini oldim va ichdim.', tone: 'ok', labelUz: 'Halqa yopildi' };
    case 'still_need_help':
      return { text: 'Sizning xabaringiz: Hali yordam kerak.', tone: 'warn', labelUz: 'Shifokorga bildirildi' };
    case 'retake_vitals':
      return describeRetakeVitalsFollowup(item, targets);
    case 'retake_medication':
      return { text: `Qayta dori qaydi: ${item.payload.status === 'taken' ? 'Ichdim' : 'Icha olmadim'}` };
  }
}

function PatientRecord({
  evidence,
  targets,
}: {
  evidence: EvidenceView;
  targets: BloodPressureTargets | null;
}) {
  const { payload, review, flagId, followups = [] } = evidence;
  const isOutOfSupply = payload.kind === 'medication' && payload.status === 'missed' && payload.reason === 'out_of_supply';
  const supplyResolved = followups.some((item) => item.kind === 'supply_resolved');
  const retakeMedTaken = followups.some((item) => item.kind === 'retake_medication' && item.payload.status === 'taken');

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
        <dd>{evidence.source === 'photo_ocr' ? 'Sintetik quti · AI o‘qidi, bemor tasdiqladi'
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
                {detail.text} ({displayTimestamp.format(new Date(item.createdAt))})
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

          {flagId && isOutOfSupply && review.decision === 'approved' && !supplyResolved && (
            <div className={styles.controls}>
              <form action="/api/demo/followup" method="post">
                <input type="hidden" name="flagId" value={flagId} />
                <input type="hidden" name="kind" value="supply_resolved" />
                <button className={styles.submit} type="submit">Dorini oldim va ichdim</button>
              </form>
              <form action="/api/demo/followup" method="post">
                <input type="hidden" name="flagId" value={flagId} />
                <input type="hidden" name="kind" value="still_need_help" />
                <button className="text-action" type="submit">Hali yordam kerak</button>
              </form>
            </div>
          )}

          {flagId && review.decision === 'retake' && payload.kind === 'vitals' && (
            <PatientRetakeBpForm flagId={flagId} targets={targets} />
          )}

          {flagId && review.decision === 'retake' && payload.kind === 'medication' && !retakeMedTaken && (
            <div className={styles.controls}>
              <form action="/api/demo/followup" method="post">
                <input type="hidden" name="flagId" value={flagId} />
                <input type="hidden" name="kind" value="retake_medication" />
                <button className={styles.submit} type="submit" name="medicationStatus" value="taken">
                  Qayta tasdiqlash: Ichdim
                </button>
              </form>
              <form action="/api/demo/followup" method="post">
                <input type="hidden" name="flagId" value={flagId} />
                <input type="hidden" name="kind" value="retake_medication" />
                <button className="text-action" type="submit" name="medicationStatus" value="missed">
                  Hali icha olmadim
                </button>
              </form>
            </div>
          )}

          {flagId && review.decision === 'retake' && payload.kind === 'medication_box' && (
            <p className={styles.note}>
              Dori qutisi yorlig‘ini rejadagi dori nomi va dozasi bilan solishtiring hamda shifokor javobiga amal qiling.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function PatientTask({
  task,
  today,
  boxStrengthKnown,
  targets,
}: {
  task: ClinicalTask;
  today: boolean;
  boxStrengthKnown: boolean;
  targets: NonNullable<ClinicalView['plan']>['targets'] | null;
}) {
  return (
    <li className={styles.task}>
      <div className={styles.taskHeading}>
        <h3>{task.title}</h3>
        <time dateTime={`${task.date}T${task.dueTime}`}>
          {!today && `${displayDate.format(new Date(`${task.date}T00:00:00Z`))}, `}{task.dueTime} · Toshkent
        </time>
      </div>
      {task.evidence ? <PatientRecord evidence={task.evidence} targets={targets} /> : (
        today && task.status === 'pending' && (task.type === 'medication'
          ? <MedicationForm taskId={task.id} />
          : <PatientBpForm taskId={task.id} targets={targets} />)
      )}
      {task.boxEvidence ? <PatientRecord evidence={task.boxEvidence} targets={targets} /> : (
        today && task.type === 'medication' && <DorimosCheck taskId={task.id} available={boxStrengthKnown} />
      )}
    </li>
  );
}

export function PatientClinical({ view }: { view: ClinicalView }) {
  const today = localDate.format(new Date());
  const todayTasks = view.tasks.filter((task) => task.date === today);
  const pastTasks = view.tasks.filter((task) => task.date < today && !task.lateReview && (task.evidence !== null || task.boxEvidence !== null));
  const lateReplies = view.tasks.filter((task) => task.lateReview);
  const boxStrengthKnown = view.plan?.medicationStrengthMg != null;
  const urgentSymptoms = view.urgentSymptoms ?? [];

  return (
    <div className="ledger">
      {view.caregiverAck && (
        <p className="notice" role="status">
          {caregiverAckMessage(view.caregiverAck, 'patient')} ({displayTimestamp.format(new Date(view.caregiverAck.createdAt))}).
        </p>
      )}
      <section>
        <h2>Bugungi vazifalar</h2>
        {todayTasks.length ? (
          <ul className={styles.tasks}>
            {todayTasks.map((task) => (
              <PatientTask
                key={task.id}
                task={task}
                today
                boxStrengthKnown={boxStrengthKnown}
                targets={view.plan?.targets ?? null}
              />
            ))}
          </ul>
        ) : <p>Hozircha vazifa biriktirilmagan.</p>}
      </section>
      {view.plan && <PatientTeachBack plan={view.plan} />}
      <section aria-labelledby="urgent-report-heading">
        <h2 id="urgent-report-heading">Kutilmagan simptom yoki og‘riq</h2>
        <details className={styles.disclosure}>
          <summary>Shoshilinch simptom bildirish</summary>
          <form className={styles.fields} action="/api/demo/symptom" method="post">
            <label htmlFor="urgent-symptom-select">Belgi turi</label>
            <select id="urgent-symptom-select" name="symptom" className={styles.field} required defaultValue="chest_pain">
              {Object.entries(symptomLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <label htmlFor="urgent-symptom-note">Qisqa izoh (ixtiyoriy)</label>
            <input id="urgent-symptom-note" name="note" className={styles.field} maxLength={300} placeholder="Masalan: kechqurun boshlandi" />
            <button className={styles.submit} type="submit">Shifokorga yuborish</button>
          </form>
        </details>
        {urgentSymptoms.length > 0 && (
          <ul className={styles.tasks}>
            {urgentSymptoms.map((entry) => (
              <li key={entry.id} className={styles.task}>
                <div className={styles.record}>
                  <p className={styles.recordTitle}>
                    {symptomLabels[entry.symptom]} · L{entry.level}
                  </p>
                  {entry.note && <p>{entry.note}</p>}
                  <p>{displayTimestamp.format(new Date(entry.createdAt))} · Toshkent</p>
                  {entry.review && (
                    <div className={styles.reply}>
                      <p className={styles.recordTitle}>
                        {entry.review.decision === 'approved' ? 'Shifokor ko‘rib chiqdi' : 'Shifokor qayta ko‘rik so‘radi'}
                      </p>
                      <p className={styles.replyText}>{entry.review.reply}</p>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {[
        { title: 'Eski qaydlarga yangi javoblar', tasks: lateReplies },
        { title: 'Oldingi qaydlar', tasks: pastTasks },
      ].filter(({ tasks }) => tasks.length > 0).map(({ title, tasks }) => (
        <section key={title} aria-label={title}>
          <h2>{title}</h2>
          <ul className={styles.tasks}>
            {tasks.map((task) => (
              <PatientTask
                key={task.id}
                task={task}
                today={false}
                boxStrengthKnown={boxStrengthKnown}
                targets={view.plan?.targets ?? null}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
