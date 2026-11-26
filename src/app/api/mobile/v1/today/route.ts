import { getActivityDashboard } from '../../../../../lib/activity-store';
import { resolveMobilePatientActor } from '../../../../../lib/auth';
import { getClinicalView } from '../../../../../lib/clinical-store';
import type { ClinicalTask } from '../../../../../lib/clinical-types';
import { mobileJson, mobileToday } from '../../../../../lib/mobile-demo';

function vitalsRecord(task: ClinicalTask) {
  const entry = task.evidence;
  if (!entry || entry.payload.kind !== 'vitals') return null;
  const reply = entry.review && {
    body: entry.review.reply,
    decision: entry.review.decision,
    reviewedAt: entry.review.reviewedAt,
  };
  return {
    id: entry.id,
    systolic: entry.payload.systolic,
    diastolic: entry.payload.diastolic,
    chestPain: entry.payload.chestPain,
    ...(entry.payload.repeatOfEvidenceId ? { repeatOfEvidenceId: entry.payload.repeatOfEvidenceId } : {}),
    level: entry.level,
    reply,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await resolveMobilePatientActor(request);
    if (!auth.ok) return mobileJson({ error: auth.error }, auth.status);
    const [view, activity] = await Promise.all([
      getClinicalView(auth.actor),
      getActivityDashboard(auth.actor).catch(() => null),
    ]);
    const base = mobileToday(auth.patientName, view, undefined, activity);
    const taskById = new Map(view.tasks.map((task) => [task.id, task]));

    const tasks = base.tasks.map((item) => {
      const full = taskById.get(item.id);
      const hasItemStrength = full?.strength !== undefined ? full.strength !== null : undefined;
      return {
        ...item,
        ...(full?.planItemId ? { planItemId: full.planItemId } : {}),
        strength: full?.strength ?? null,
        strengthUnit: full?.strengthUnit ?? 'mg',
        boxAvailable: hasItemStrength ?? item.boxAvailable ?? false,
      };
    });

    const todayVitals = view.tasks.find((task) => task.type === 'vitals' && task.date === base.date) ?? null;
    const vitalsTask = todayVitals
      ? {
          id: todayVitals.id,
          ...(todayVitals.planItemId ? { planItemId: todayVitals.planItemId } : {}),
          title: todayVitals.title,
          time: todayVitals.dueTime,
          status: todayVitals.status,
          record: vitalsRecord(todayVitals),
        }
      : null;

    const vitalsReplies = view.tasks.flatMap((task) => {
      if (task.type !== 'vitals') return [];
      const record = vitalsRecord(task);
      return record?.reply
        ? [{ recordId: record.id, taskTitle: task.title, date: task.date, ...record.reply }]
        : [];
    });
    const replies = [...base.replies, ...vitalsReplies].sort(
      (a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt),
    );
    const bpHistory = view.tasks
      .flatMap((task) => {
        if (task.type !== 'vitals') return [];
        const entry = task.evidence;
        if (!entry || entry.payload.kind !== 'vitals') return [];
        return [{
          id: entry.id,
          date: task.date,
          createdAt: entry.createdAt,
          systolic: entry.payload.systolic,
          diastolic: entry.payload.diastolic,
          chestPain: entry.payload.chestPain,
          level: entry.level,
          reviewed: entry.review !== null,
        }];
      })
      .sort((a, b) => a.date.localeCompare(b.date) || Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .map((point) => ({
        id: point.id,
        date: point.date,
        systolic: point.systolic,
        diastolic: point.diastolic,
        chestPain: point.chestPain,
        level: point.level,
        reviewed: point.reviewed,
      }));

    return mobileJson({
      ...base,
      isDemo: auth.actor.isDemo === true,
      replies,
      tasks,
      medications: view.plan?.medications ?? [],
      medicationAdherence: activity?.medicationAdherence ?? [],
      bpTargets: view.plan?.targets ?? null,
      vitalsTask,
      bpHistory,
      steps: {
        ...base.steps,
        bySource: activity?.todayStepsBySource ?? {
          deviceSensor: null,
          selfReport: null,
          demoSim: null,
        },
        trend: activity?.stepTrend ?? [],
      },
    });
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
