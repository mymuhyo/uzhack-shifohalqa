import { Clock, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PatientClinicalBriefView } from '@/lib/ai/clinical-brief-schema';
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
import type { TeachBackStatus } from '@/lib/teach-back-store';
import { DorimosCheck } from './dorimos-check';
import { PatientBpForm, PatientRetakeBpForm, type PriorBpReference } from './patient-bp-form';
import {
  PatientMedRetakeFollowupActions,
  PatientSupplyFollowupActions,
} from './patient-followup-actions';
import { PatientMedicationActions } from './patient-medication-actions';
import { PatientTeachBack } from './patient-teach-back';
import { PatientUrgentSymptomForm } from './patient-urgent-symptom-form';
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

const unitDisplay: Record<string, string> = {
  mg: 'mg',
  mcg: 'mkg',
  g: 'g',
  iu: 'IU',
};

function formatFollowup(
  item: FlagFollowup,
  targets: BloodPressureTargets | null,
): { text: string; tone?: 'ok' | 'warn' | 'urgent' | null; labelUz?: string | null } {
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
  isDemo,
}: {
  evidence: EvidenceView;
  targets: BloodPressureTargets | null;
  isDemo: boolean;
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
      ) : payload.result === 'manual' ? (
        <p>Quti tekshirilmagani qo‘lda qayd etildi.</p>
      ) : payload.result === 'deferred' ? (
        <p>Quti tekshiruvi keyinroqqa qoldirildi.</p>
      ) : (
        <>
          <p>
            {payload.result === 'match'
              ? 'Namuna qutisi rejadagi nom va kuchga mos.'
              : 'Namuna qutisi rejadan farq qiladi. Qayd shifokor navbatiga yuborildi.'}
          </p>
          <p>Qutidan o‘qildi · {formatBoxLabel(payload.reading.label)}</p>
          <p>Rejada · {formatBoxLabel(payload.expected)}</p>
        </>
      )}
      <dl className={styles.metadata}>
        <dt>Vaqti</dt>
        <dd><time dateTime={evidence.createdAt}>{displayTimestamp.format(new Date(evidence.createdAt))}</time> · Toshkent</dd>
        <dt>Manba</dt>
        <dd>
          {evidence.source === 'photo_ocr'
            ? (payload.kind === 'medication_box' && payload.result !== 'manual' && payload.result !== 'deferred' && payload.sampleId === 'camera_photo'
              ? 'Kamera rasmi · AI o‘qidi, bemor tasdiqladi'
              : 'Sintetik quti · AI o‘qidi, bemor tasdiqladi')
            : evidence.aiMode === 'manual'
              ? 'Qo‘lda kiritildi'
              : 'Bemor qaydi'}
        </dd>
        <dt>AI rejimi</dt>
        <dd>{evidence.aiMode}</dd>
        <dt>Dalil darajasi</dt>
        <dd>L{evidence.level}</dd>
      </dl>
      {review && (
        <div className={styles.reply}>
          <p className={styles.recordTitle}>
            {review.decision === 'approved' ? 'Shifokor ko‘rib tasdiqladi' : 'Shifokor qayta o‘lchashni so‘radi'}
          </p>
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
            <PatientSupplyFollowupActions flagId={flagId} isDemo={isDemo} />
          )}

          {flagId && review.decision === 'retake' && payload.kind === 'vitals' && (
            <PatientRetakeBpForm flagId={flagId} targets={targets} isDemo={isDemo} />
          )}

          {flagId && review.decision === 'retake' && payload.kind === 'medication' && !retakeMedTaken && (
            <PatientMedRetakeFollowupActions flagId={flagId} isDemo={isDemo} />
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
  isDemo,
  priorReadings,
}: {
  task: ClinicalTask;
  today: boolean;
  boxStrengthKnown: boolean;
  targets: NonNullable<ClinicalView['plan']>['targets'] | null;
  isDemo: boolean;
  priorReadings: readonly PriorBpReference[];
}) {
  const isBoxDeferred =
    task.boxEvidence?.payload.kind === 'medication_box' && task.boxEvidence.payload.result === 'deferred';
  const taskBoxAvailable = task.strength !== undefined ? task.strength !== null : boxStrengthKnown;
  const strengthText =
    task.type === 'medication' && task.strength !== undefined && task.strength !== null
      ? ` · ${task.strength} ${unitDisplay[task.strengthUnit ?? 'mg'] ?? 'mg'}`
      : '';

  return (
    <li className={styles.task}>
      <div className={styles.taskHeading}>
        <h3>
          {task.title}
          {strengthText}
        </h3>
        <time dateTime={`${task.date}T${task.dueTime}`} className="tabular-nums">
          {!today && `${displayDate.format(new Date(`${task.date}T00:00:00Z`))}, `}{task.dueTime} · Toshkent
        </time>
      </div>
      {task.evidence ? (
        <PatientRecord evidence={task.evidence} targets={targets} isDemo={isDemo} />
      ) : (
        today && task.status === 'pending' && (
          task.type === 'medication'
            ? <PatientMedicationActions taskId={task.id} taskTitle={task.title} isDemo={isDemo} />
            : <PatientBpForm taskId={task.id} targets={targets} isDemo={isDemo} priorReadings={priorReadings} />
        )
      )}
      {task.boxEvidence ? (
        <>
          <PatientRecord evidence={task.boxEvidence} targets={targets} isDemo={isDemo} />
          {today && isBoxDeferred && (
            <DorimosCheck taskId={task.id} available={taskBoxAvailable} isDemo={isDemo} deferred />
          )}
        </>
      ) : (
        today && task.type === 'medication' && (
          <DorimosCheck taskId={task.id} available={taskBoxAvailable} isDemo={isDemo} />
        )
      )}
    </li>
  );
}

export function PatientClinical({
  view,
  isDemo = true,
  patientBrief = null,
  teachBackStatus = null,
}: {
  view: ClinicalView;
  isDemo?: boolean;
  patientBrief?: PatientClinicalBriefView | null;
  teachBackStatus?: TeachBackStatus | null;
}) {
  const today = localDate.format(new Date());
  const todayTasks = view.tasks.filter((task) => task.date === today);
  const pastTasks = view.tasks.filter((task) => task.date < today && !task.lateReview && (task.evidence !== null || task.boxEvidence !== null));
  const lateReplies = view.tasks.filter((task) => task.lateReview);
  const boxStrengthKnown = view.plan?.medicationStrengthMg != null;
  const urgentSymptoms = view.urgentSymptoms ?? [];

  const priorReadings: PriorBpReference[] = view.tasks
    .filter((t) => t.evidence && t.evidence.payload.kind === 'vitals' && t.evidence.payload.systolic !== null)
    .map((t) => {
      const p = t.evidence!.payload;
      const reading = p.kind === 'vitals' ? `${p.systolic}/${p.diastolic} mmHg` : '';
      return {
        id: t.evidence!.id,
        label: `${t.date} · ${reading}`,
      };
    });

  // Group today's tasks by dueTime (Asia/Tashkent) while preserving task order
  const timeGroups = new Map<string, ClinicalTask[]>();
  for (const task of todayTasks) {
    const existing = timeGroups.get(task.dueTime);
    if (existing) existing.push(task);
    else timeGroups.set(task.dueTime, [task]);
  }
  const hasMultipleTimes = timeGroups.size > 1;

  return (
    <div className="ledger">
      {view.caregiverAck && (
        <p className="notice" role="status">
          {caregiverAckMessage(view.caregiverAck, 'patient')} ({displayTimestamp.format(new Date(view.caregiverAck.createdAt))}).
        </p>
      )}

      {patientBrief && (
        <section aria-labelledby="patient-weekly-brief-heading">
          <Card className="border-2 border-[var(--ok)]/40 bg-card shadow-[var(--surface-shadow)]">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-lg font-medium">
                  <h2 id="patient-weekly-brief-heading" className="flex items-center gap-2 text-inherit font-inherit leading-inherit">
                    <ShieldCheck className="size-5 text-[var(--ok)]" aria-hidden="true" />
                    <span>Shifokor tasdiqlagan 7 kunlik xulosa</span>
                  </h2>
                </CardTitle>
                <Badge variant="ok">L4 · Tasdiqlandi</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="whitespace-pre-wrap text-sm text-foreground">{patientBrief.approvedReplyUz}</p>
              <p className="text-xs text-muted-foreground">
                Tasdiqlangan vaqt: <time dateTime={patientBrief.approvedAt}>{displayTimestamp.format(new Date(patientBrief.approvedAt))}</time> · Toshkent
              </p>
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <h2>Bugungi vazifalar</h2>
        {todayTasks.length ? (
          hasMultipleTimes ? (
            <div className="mt-3 flex flex-col gap-4">
              {Array.from(timeGroups.entries()).map(([dueTime, tasks]) => (
                <div key={dueTime} className="rounded-xl border border-border bg-card/60 p-3.5">
                  <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-primary tabular-nums">
                    <Clock className="size-4" aria-hidden="true" />
                    <span>{dueTime} · Toshkent</span>
                  </div>
                  <ul className={styles.tasks}>
                    {tasks.map((task) => (
                      <PatientTask
                        key={task.id}
                        task={task}
                        today
                        boxStrengthKnown={boxStrengthKnown}
                        targets={view.plan?.targets ?? null}
                        isDemo={isDemo}
                        priorReadings={priorReadings}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <ul className={styles.tasks}>
              {todayTasks.map((task) => (
                <PatientTask
                  key={task.id}
                  task={task}
                  today
                  boxStrengthKnown={boxStrengthKnown}
                  targets={view.plan?.targets ?? null}
                  isDemo={isDemo}
                  priorReadings={priorReadings}
                />
              ))}
            </ul>
          )
        ) : (
          <p>Hozircha vazifa biriktirilmagan.</p>
        )}
      </section>

      {view.plan && <PatientTeachBack plan={view.plan} initialStatus={teachBackStatus} />}

      <section id="urgent-report-section" aria-labelledby="urgent-report-heading">
        <h2 id="urgent-report-heading">Kutilmagan simptom yoki og‘riq</h2>
        <PatientUrgentSymptomForm isDemo={isDemo} />
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
                isDemo={isDemo}
                priorReadings={priorReadings}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
