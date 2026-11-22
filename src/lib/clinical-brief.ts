import type { getActivityDashboard } from './activity-store';
import {
  caregiverAckMessage,
  countOpenClinicalAttention,
  extractBpTrend,
  findLatestRealExerciseAttempt,
  type BpTrendPoint,
} from './clinical-triage';
import { exerciseCatalog } from './pose/diagnostics';
import type { ClinicalView } from './clinical-types';
import type { readExerciseAttempts, readExercisePlan } from './exercise-store';

export type ActivityDashboardData =
  | (Omit<NonNullable<Awaited<ReturnType<typeof getActivityDashboard>>>, 'dailyStepGoal'> & {
      dailyStepGoal?: number | null;
    })
  | null;
export type ExercisePlanData = Awaited<ReturnType<typeof readExercisePlan>>;
export type ExerciseAttemptsData = Awaited<ReturnType<typeof readExerciseAttempts>>;

export type ClinicalBriefInput = {
  patientName: string;
  view: ClinicalView;
  activity: ActivityDashboardData;
  exercisePlan: ExercisePlanData;
  exerciseAttempts: ExerciseAttemptsData;
  generatedAt?: string;
};

export type ClinicalBrief = {
  generatedAt: string;
  headline: string;
  metrics: {
    openUrgent: number;
    openWarning: number;
    openExerciseFlags: number;
    reviewedCount: number;
    latestBp: string | null;
    latestBpTone: 'ok' | 'warn' | 'urgent' | null;
    adherencePercent: number | null;
    stepsToday: number | null;
    maxSystolic: number | null;
    warnSystolic: number | null;
  };
  bpTrend: BpTrendPoint[];
  lines: string[];
  plainText: string;
};

const tashkentDateTime = new Intl.DateTimeFormat('uz-Latn-UZ', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Tashkent',
});

export function buildClinicalBrief({
  patientName,
  view,
  activity,
  exercisePlan,
  exerciseAttempts,
  generatedAt = new Date().toISOString(),
}: ClinicalBriefInput): ClinicalBrief {
  const reviewedFlags = view.flags.filter(({ evidence }) => evidence.review !== null);
  const urgentSymptoms = view.urgentSymptoms ?? [];
  const reviewedSymptoms = urgentSymptoms.filter(({ review }) => review !== null);
  const reviewedExercises = exerciseAttempts.filter(({ review }) => review !== null);

  const attention = countOpenClinicalAttention({ view, exerciseAttempts });
  const { openUrgent, openWarning, openExerciseFlags, followupEscalations } = attention;
  const reviewedCount = reviewedFlags.length + reviewedSymptoms.length + reviewedExercises.length;
  const approvedL4Count =
    reviewedFlags.filter(({ evidence }) => evidence.level === 4).length +
    reviewedSymptoms.filter(({ level }) => level === 4).length;

  const bpTrend = extractBpTrend(view);
  let latestBp: string | null = null;
  let latestBpTone: 'ok' | 'warn' | 'urgent' | null = null;

  const latestPoint = bpTrend.at(-1);
  if (latestPoint) {
    if (latestPoint.systolic !== null && latestPoint.diastolic !== null) {
      latestBp = `${latestPoint.systolic}/${latestPoint.diastolic} mmHg`;
      latestBpTone = view.plan ? latestPoint.tone : null;
    } else if (latestPoint.chestPain) {
      latestBp = 'Ko‘krak og‘rig‘i';
      latestBpTone = 'urgent';
    }
  }

  const week = activity?.adherence.week;
  const adherencePercent =
    week && week.scheduled > 0 ? Math.round((week.completed / week.scheduled) * 100) : null;
  const stepsToday = activity?.steps?.count ?? null;

  const lines: string[] = [];

  if (view.plan) {
    const strength =
      view.plan.medicationStrengthMg === null ? 'kuchi belgilanmagan' : `${view.plan.medicationStrengthMg} mg`;
    lines.push(
      `Reja: ${view.plan.medicationName} (${strength}, ${view.plan.medicationTime}) · Bosim chegaralari ${view.plan.targets.warnSystolic}/${view.plan.targets.warnDiastolic} (kuzatuv) va ${view.plan.targets.maxSystolic}/${view.plan.targets.maxDiastolic} mmHg (yuqori).`,
    );
  } else {
    lines.push('Uy rejasi hali biriktirilmagan.');
  }

  if (week && week.scheduled > 0) {
    lines.push(
      `Oxirgi 7 kunlik ijro: ${week.completed}/${week.scheduled} vazifa bajarildi (${adherencePercent}%), ${week.answered}/${week.scheduled} tasiga javob berildi.`,
    );
  } else {
    lines.push('Oxirgi 7 kunlik reja bo‘yicha muddati kelgan vazifa hali yo‘q.');
  }

  if (latestBp) {
    lines.push(`Oxirgi qon bosimi qaydi: ${latestBp}.`);
  }

  const reviewedSummary =
    approvedL4Count > 0
      ? `${reviewedCount} ta ko‘rib chiqilgan (${approvedL4Count} ta L4 tasdiqlangan)`
      : `${reviewedCount} ta ko‘rib chiqilgan qayd`;
  lines.push(
    `Navbat holati: ${openUrgent} ta shoshilinch, ${openWarning} ta tekshirish, ${reviewedSummary}.`,
  );

  const followupsCount = view.flags.reduce((sum, f) => sum + (f.evidence.followups?.length ?? 0), 0);
  if (followupsCount > 0) {
    const acknowledgedCount = view.flags.reduce(
      (sum, f) => sum + (f.evidence.followups?.filter((item) => Boolean(item.acknowledgedAt)).length ?? 0),
      0,
    );
    const resolvedSupply = view.flags.some((f) =>
      f.evidence.followups?.some((item) => item.kind === 'supply_resolved'),
    );
    const escalationNote =
      followupEscalations.length > 0
        ? ` (${followupEscalations.length} tasi qayta nazorat talab qiladi)`
        : acknowledgedCount > 0 && resolvedSupply
          ? ` (dori ta’minoti tasdiqlangan, ${acknowledgedCount} tasi shifokor tomonidan ko‘rilgan)`
          : acknowledgedCount > 0
            ? ` (${acknowledgedCount} tasi shifokor tomonidan ko‘rilgan)`
            : resolvedSupply
              ? ' (dori ta’minoti tasdiqlangan)'
              : '';
    lines.push(`Bemordan ${followupsCount} ta qayta murojaat kelgan${escalationNote}.`);
  }

  if (exercisePlan) {
    const latestAttempt = findLatestRealExerciseAttempt(exerciseAttempts);
    if (latestAttempt) {
      const reps = latestAttempt.validReps === null ? '' : ` · ${latestAttempt.validReps} to‘liq takror`;
      lines.push(`${exerciseCatalog[latestAttempt.movement].title}: oxirgi qayd L${latestAttempt.level}${reps}.`);
    } else {
      lines.push(`Mashq rejasi: ${exerciseCatalog[exercisePlan.movement].shortTitle.toLowerCase()} (${exercisePlan.targetReps} takror), hali qayd yo‘q.`);
    }
  }

  if (activity?.steps) {
    const sourceLabel = activity.steps.source === 'device_sensor'
      ? 'telefon sensori'
      : activity.steps.source === 'demo_sim'
        ? 'simulyatsiya'
        : 'qo‘lda';
    const goal = activity.dailyStepGoal ?? view.plan?.dailyStepGoal ?? null;
    const goalNote = goal !== null
      ? ` / maqsad ${goal} (${activity.steps.count >= goal ? 'bajarildi' : 'jarayonda'})`
      : '';
    lines.push(`Bugungi qadamlar: ${activity.steps.count}${goalNote} (${sourceLabel} · L${activity.steps.level}).`);
  }

  if (view.caregiverAck) {
    lines.push(caregiverAckMessage(view.caregiverAck, 'brief'));
  }

  const headline =
    openUrgent > 0
      ? `${patientName}: ${openUrgent} ta shoshilinch qayd e’tibor talab qiladi`
      : openWarning > 0
        ? `${patientName}: ${openWarning} ta qayd tekshiruv navbatida`
        : `${patientName}: ochiq ogohlantirishlar yo‘q`;

  const plainText = [
    `ShifoHalqa · 7 kunlik klinik xulosa (sintetik demo)`,
    `Bemor: ${patientName}`,
    `Vaqt: ${tashkentDateTime.format(new Date(generatedAt))} (Toshkent)`,
    `Holat: ${headline}`,
    ...lines.map((line) => `- ${line}`),
    `Eslatma: Klinik qarorni shifokor qabul qiladi; AI faqat o‘lchov va matn tayyorlashda yordam beradi.`,
  ].join('\n');

  return {
    generatedAt,
    headline,
    metrics: {
      openUrgent,
      openWarning,
      openExerciseFlags,
      reviewedCount,
      latestBp,
      latestBpTone,
      adherencePercent,
      stepsToday,
      maxSystolic: view.plan?.targets.maxSystolic ?? null,
      warnSystolic: view.plan?.targets.warnSystolic ?? null,
    },
    bpTrend,
    lines,
    plainText,
  };
}
