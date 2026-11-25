import type { ExerciseAttemptsData, ExercisePlanData } from '@/lib/clinical-brief';
import { exerciseCatalog } from '@/lib/pose/diagnostics';
import { DoctorExercisePlanForm } from './doctor-exercise-form';
import { DoctorExerciseReviewForm } from './doctor-exercise-review-form';
import { DoctorExerciseVideoPlayer } from './doctor-exercise-video-player';
import { readExerciseAttempts, readExercisePlan, type ExerciseAttempt } from '@/lib/exercise-store';
import type { ClinicalActor } from '@/lib/clinical-types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import styles from './doctor-clinical.module.css';

const localTime = new Intl.DateTimeFormat('uz-Latn-UZ', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tashkent',
});

const sourceNames = {
  live_camera: 'Jonli kamera',
  uploaded_video: 'Yuklangan video',
  self_report: 'Bemor qaydi',
};

function ExerciseReview({
  attempt,
  isDemo,
  patientId,
}: {
  attempt: ExerciseAttempt;
  isDemo: boolean;
  patientId: string | null;
}) {
  if (attempt.review) {
    return (
      <div className={styles.reviewed}>
        <h4>{attempt.review.decision === 'retake' ? 'Qayta o‘lchash so‘raldi' : 'Ko‘rib chiqildi'}</h4>
        <p>{attempt.review.body}</p>
      </div>
    );
  }
  return <DoctorExerciseReviewForm attemptId={attempt.id} isDemo={isDemo} patientId={patientId} />;
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
  const isDemo = actor.isDemo === true;

  return (
    <div className="ledger">
      <section aria-labelledby="exercise-heading">
        <Card className="border border-border bg-card">
          <CardHeader>
            <CardTitle className="text-xl font-medium">
              <h2 id="exercise-heading" className="text-inherit font-inherit leading-inherit">
                {plan ? exerciseCatalog[plan.movement].title : 'O‘tirib-turish mashqi'}
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {plan ? (
              <p className="text-sm text-muted-foreground tabular-nums">
                Reja: {plan.targetReps} takror · {exerciseCatalog[plan.movement].jointLabel.toLowerCase()} burchagi {plan.targetAngle}°.
              </p>
            ) : (
              <DoctorExercisePlanForm isDemo={isDemo} patientId={actor.patientId} />
            )}
          </CardContent>
        </Card>
      </section>

      {attempts.length > 0 && (
        <section>
          <h2>Mashq qaydlari</h2>
          <ul className={styles.queue}>
            {attempts.map((attempt) => (
              <li
                key={attempt.id}
                id={`record-${attempt.id}`}
                className={`${styles.queueItem} ${
                  attempt.review
                    ? styles.reviewedItem
                    : attempt.flagColor === 'red'
                      ? styles.urgentItem
                      : attempt.flagColor === 'yellow'
                        ? styles.warnItem
                        : ''
                }`}
              >
                <article aria-labelledby={`exercise-attempt-${attempt.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id={`exercise-attempt-${attempt.id}`}>
                      {attempt.sample
                        ? 'CDC namuna videosi'
                        : attempt.reason === 'pain'
                          ? 'Og‘riq bildirildi'
                          : sourceNames[attempt.source]}{' '}
                      · L{attempt.level}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {attempt.android && <Badge variant="secondary">Android</Badge>}
                      {attempt.flagColor && (
                        <Badge variant={attempt.flagColor === 'red' ? 'urgent' : 'warn'}>
                          {attempt.flagColor === 'red' ? 'Tez ko‘rib chiqish' : 'Tekshirish'}
                          {attempt.similarMotion && ' · O‘xshash harakat'}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <time dateTime={attempt.createdAt}>{localTime.format(new Date(attempt.createdAt))}</time> · Toshkent
                  </p>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    Vazifa kuni · <time dateTime={attempt.scheduledDate}>{attempt.scheduledDate}</time>
                  </p>
                  {attempt.validReps !== null && (
                    <p className="mt-1 text-sm font-medium tabular-nums">
                      {attempt.validReps} takror{attempt.shallowReps !== null && ` · ${attempt.shallowReps} chala`}
                    </p>
                  )}
                  {attempt.minAngle !== null && attempt.confidence !== null && (
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {exerciseCatalog[attempt.movement].direction === 'extend' ? 'Eng katta burchak' : 'Eng kichik burchak'}{' '}
                      {attempt.minAngle.toFixed(1)}° · Tayanch nuqtalari ishonchi {Math.round(attempt.confidence * 100)}%
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    AI rejimi {attempt.aiMode}
                    {!attempt.sample && attempt.reason !== 'pain' && ` · ${attempt.primary ? 'Asosiy urinish' : 'Qayta urinish'}`}
                  </p>
                  {attempt.diagnostics?.doctorSummaryUz && (
                    <p className="mt-1.5 text-sm text-foreground">{attempt.diagnostics.doctorSummaryUz}</p>
                  )}
                  {attempt.source !== 'self_report' && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      O‘lchov manbasi · {attempt.android ? 'Android ilovasi' : 'Bemor brauzeri'}. Server o‘lchovni mustaqil tasdiqlamaydi.
                    </p>
                  )}
                  <DoctorExerciseVideoPlayer
                    attemptId={attempt.id}
                    hasVideo={attempt.hasVideo}
                    videoDurationSec={attempt.videoDurationSec}
                    videoExpiresAt={attempt.videoExpiresAt}
                    videoExpired={attempt.videoExpired}
                  />
                  {!attempt.sample && (
                    <ExerciseReview attempt={attempt} isDemo={isDemo} patientId={actor.patientId} />
                  )}
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
