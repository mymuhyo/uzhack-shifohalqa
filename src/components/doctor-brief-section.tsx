import { getActivityDashboard } from '@/lib/activity-store';
import { readLatestClinicalBrief, type DoctorClinicalBriefView } from '@/lib/ai/clinical-brief-ai';
import {
  buildClinicalBrief,
  type ActivityDashboardData,
  type ExerciseAttemptsData,
  type ExercisePlanData,
} from '@/lib/clinical-brief';
import type { ClinicalActor, ClinicalView } from '@/lib/clinical-types';
import { readExerciseAttempts, readExercisePlan } from '@/lib/exercise-store';
import { DoctorBriefCard } from './doctor-brief-card';

export async function DoctorBriefSection({
  actor,
  view,
  patientName,
  activity,
  exercisePlan,
  exerciseAttempts,
  initialAiBrief,
}: {
  actor: ClinicalActor;
  view: ClinicalView;
  patientName: string;
  activity?: ActivityDashboardData;
  exercisePlan?: ExercisePlanData;
  exerciseAttempts?: ExerciseAttemptsData;
  initialAiBrief?: DoctorClinicalBriefView | null;
}) {
  const [resolvedActivity, resolvedPlan, resolvedAttempts, resolvedAiBrief] = await Promise.all([
    activity !== undefined ? Promise.resolve(activity) : getActivityDashboard(actor).catch(() => null),
    exercisePlan !== undefined ? Promise.resolve(exercisePlan) : readExercisePlan(actor).catch(() => null),
    exerciseAttempts !== undefined ? Promise.resolve(exerciseAttempts) : readExerciseAttempts(actor).catch(() => []),
    initialAiBrief !== undefined
      ? Promise.resolve(initialAiBrief)
      : readLatestClinicalBrief(actor).then((b) => (b && 'doctorDraftUz' in b ? b : null)).catch(() => null),
  ]);

  const brief = buildClinicalBrief({
    patientName,
    view,
    activity: resolvedActivity,
    exercisePlan: resolvedPlan,
    exerciseAttempts: resolvedAttempts,
  });

  return (
    <DoctorBriefCard
      brief={brief}
      initialAiBrief={resolvedAiBrief}
      patientId={actor.patientId}
    />
  );
}
