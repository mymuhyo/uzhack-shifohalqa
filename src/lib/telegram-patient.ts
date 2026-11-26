import { getActivityDashboard } from './activity-store';
import { readLatestClinicalBrief } from './ai/clinical-brief-ai';
import { getClinicalView } from './clinical-store';
import type { ClinicalActor, ClinicalView } from './clinical-types';
import { exerciseDate, readExerciseAttempts, readExercisePlan } from './exercise-store';
import type { TelegramPatientLink } from './telegram-store';

export function telegramDoses(view: ClinicalView, date: string) {
  return view.tasks
    .filter((task) => task.type === 'medication' && task.status === 'pending' && task.date === date)
    .sort((a, b) => a.dueTime.localeCompare(b.dueTime) || a.title.localeCompare(b.title))
    .map((task) => ({ id: task.id, title: task.title, time: task.dueTime, strength: task.strength, unit: task.strengthUnit }));
}

export async function telegramApprovedBrief(actor: ClinicalActor) {
  const brief = await readLatestClinicalBrief(actor);
  return brief?.level === 4 && !('doctorDraftUz' in brief) ? brief : null;
}

export async function readTelegramDashboard(link: TelegramPatientLink) {
  const { actor, patientName, detailsEnabled } = link;
  const today = exerciseDate();
  const view = await getClinicalView(actor);
  const [activity, plan, attempts, brief] = await Promise.all([
    getActivityDashboard(actor), readExercisePlan(actor), readExerciseAttempts(actor), telegramApprovedBrief(actor),
  ]);
  const replies = view.tasks.flatMap((task) => [task.evidence, task.boxEvidence].flatMap((entry) =>
    entry?.review ? [{ id: entry.id, title: task.title, date: task.date, body: entry.review.reply }] : []));
  for (const symptom of view.urgentSymptoms ?? []) {
    if (symptom.review) replies.push({
      id: symptom.id, title: 'Yordam so‘rovi', date: symptom.createdAt.slice(0, 10), body: symptom.review.reply,
    });
  }
  return {
    patientName, today, detailsEnabled, isDemo: Boolean(actor.isDemo),
    targets: view.plan?.targets ?? null, tasks: view.tasks.filter((task) => task.date === today),
    replies, activity, brief, plan, attempts,
  };
}

export type TelegramDashboard = Awaited<ReturnType<typeof readTelegramDashboard>>;
