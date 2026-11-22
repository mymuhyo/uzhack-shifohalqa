import { getActivityDashboard } from '@/lib/activity-store';
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
}: {
  actor: ClinicalActor;
  view: ClinicalView;
  patientName: string;
  activity?: ActivityDashboardData;
  exercisePlan?: ExercisePlanData;
  exerciseAttempts?: ExerciseAttemptsData;
}) {
  const [resolvedActivity, resolvedPlan, resolvedAttempts] = await Promise.all([
    activity !== undefined ? Promise.resolve(activity) : getActivityDashboard(actor).catch(() => null),
    exercisePlan !== undefined ? Promise.resolve(exercisePlan) : readExercisePlan(actor).catch(() => null),
    exerciseAttempts !== undefined ? Promise.resolve(exerciseAttempts) : readExerciseAttempts(actor).catch(() => []),
  ]);

  const brief = buildClinicalBrief({
    patientName,
    view,
    activity: resolvedActivity,
    exercisePlan: resolvedPlan,
    exerciseAttempts: resolvedAttempts,
  });

  return <DoctorBriefCard brief={brief} />;
}
