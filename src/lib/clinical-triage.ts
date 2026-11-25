import type {
  BloodPressureTargets,
  CaregiverAckView,
  ClinicalFlag,
  ClinicalView,
  FlagFollowup,
} from './clinical-types';
import type { ExerciseAttempt } from './exercise-store';
import {
  BP_DIASTOLIC_MAX,
  BP_DIASTOLIC_MIN,
  BP_SYSTOLIC_MAX,
  BP_SYSTOLIC_MIN,
  evaluateRules,
} from './rules/evaluate-rules';

export type BpZoneAssessment = {
  tone: 'ok' | 'warn' | 'urgent';
  labelUz: string;
  textUz: string;
  invalid?: boolean;
};

export type FollowupEscalation = {
  followupId: string;
  flagId: string;
  severity: 'red' | 'yellow';
  kind: 'still_need_help' | 'retake_vitals' | 'retake_medication';
  titleUz: string;
  summaryUz: string;
  createdAt: string;
};

export type BpTrendPoint = {
  id: string;
  createdAt: string;
  systolic: number | null;
  diastolic: number | null;
  chestPain: boolean;
  tone: 'ok' | 'warn' | 'urgent';
  isRetake: boolean;
  level: 0 | 2 | 4;
};

type OpenExerciseAttemptSummary = Pick<ExerciseAttempt, 'id' | 'flagColor' | 'review'>;

function readPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 999) {
    return value;
  }
  if (typeof value === 'string' && /^\d{1,3}$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

/**
 * Deterministic BP & chest-pain zone classification backed by `evaluateRules`.
 * Always reads thresholds from the doctor's assigned plan targets.
 */
export function evaluateBpZone({
  systolic,
  diastolic,
  chestPain,
  targets,
}: {
  systolic: number | string | null;
  diastolic: number | string | null;
  chestPain: boolean;
  targets: BloodPressureTargets | null;
}): BpZoneAssessment | null {
  if (chestPain) {
    return {
      tone: 'urgent',
      labelUz: 'Shoshilinch',
      textUz: 'Ko‘krak og‘rig‘i belgilandi — qaydni yuboring va ahvolingiz og‘irlashsa darhol 103 ga qo‘ng‘iroq qiling.',
    };
  }

  const sys = readPositiveInt(systolic);
  const dia = readPositiveInt(diastolic);
  if (sys === null || dia === null || !targets) return null;

  if (sys < BP_SYSTOLIC_MIN || sys > BP_SYSTOLIC_MAX) {
    return {
      tone: 'urgent',
      labelUz: 'Qiymatni tekshiring',
      textUz: `Yuqori (sistolik) bosim ${BP_SYSTOLIC_MIN}–${BP_SYSTOLIC_MAX} mmHg oralig‘ida bo‘lishi kerak.`,
      invalid: true,
    };
  }
  if (dia < BP_DIASTOLIC_MIN || dia > BP_DIASTOLIC_MAX) {
    return {
      tone: 'urgent',
      labelUz: 'Qiymatni tekshiring',
      textUz: `Pastki (diastolik) bosim ${BP_DIASTOLIC_MIN}–${BP_DIASTOLIC_MAX} mmHg oralig‘ida bo‘lishi kerak.`,
      invalid: true,
    };
  }
  if (sys <= dia) {
    return {
      tone: 'urgent',
      labelUz: 'Qiymatni tekshiring',
      textUz: 'Yuqori bosim pastki bosimdan katta bo‘lishi kerak.',
      invalid: true,
    };
  }

  const flag = evaluateRules({
    kind: 'vitals',
    chest_pain: false,
    reading: { systolic: sys, diastolic: dia, targets },
  });

  if (flag?.color === 'red' && flag.rule_key === 'bp_low') {
    const lowTarget = targets.minSystolic !== undefined && targets.minDiastolic !== undefined
      ? `${targets.minSystolic}/${targets.minDiastolic} mmHg`
      : `${flag.threshold} mmHg`;
    return {
      tone: 'urgent',
      labelUz: 'Past chegara',
      textUz: `Past chegara (${lowTarget}) dan tushdi — shifokorga shoshilinch navbatga tushadi. Bosh aylansa o‘tiring va 103 ga qo‘ng‘iroq qiling.`,
    };
  }
  if (flag?.color === 'red') {
    return {
      tone: 'urgent',
      labelUz: 'Yuqori chegara',
      textUz: `Yuqori chegara (${targets.maxSystolic}/${targets.maxDiastolic} mmHg) dan oshdi — shifokorga shoshilinch navbatga tushadi.`,
    };
  }
  if (flag?.color === 'yellow') {
    return {
      tone: 'warn',
      labelUz: 'Kuzatuv chegarasi',
      textUz: `Kuzatuv chegarasi (${targets.warnSystolic}/${targets.warnDiastolic} mmHg) da — shifokor tekshiruv navbatiga chiqadi.`,
    };
  }
  return {
    tone: 'ok',
    labelUz: 'Me’yor',
    textUz: `Shifokor belgilagan me’yor ichida (< ${targets.warnSystolic}/${targets.warnDiastolic} mmHg).`,
  };
}

/**
 * Check whether patient follow-ups on an already-reviewed flag require renewed doctor attention.
 */
export function evaluateFlagFollowupAttention(
  flag: ClinicalFlag,
  targets: BloodPressureTargets | null,
): FollowupEscalation | null {
  const followups = flag.evidence.followups ?? [];
  if (followups.length === 0) return null;

  const sorted = [...followups].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id),
  );
  const candidates: FollowupEscalation[] = [];

  // Supply loop: escalate if the latest supply update is still_need_help and not yet acknowledged by doctor.
  const supplyUpdates = sorted.filter(
    (item) => item.kind === 'supply_resolved' || item.kind === 'still_need_help',
  );
  const latestSupply = supplyUpdates.at(-1);
  if (latestSupply?.kind === 'still_need_help' && !latestSupply.acknowledgedAt) {
    candidates.push({
      followupId: latestSupply.id,
      flagId: flag.id,
      severity: 'yellow',
      kind: 'still_need_help',
      titleUz: 'Dori ta’minoti: bemor hali yordam so‘ramoqda',
      summaryUz: 'Shifokor javobidan keyin bemor «Hali yordam kerak» deb bildirdi.',
      createdAt: latestSupply.createdAt,
    });
  }

  // Retake vitals loop: escalate if latest retake is still above doctor's thresholds or has chest pain and unacknowledged.
  const retakeVitals = sorted.filter((item) => item.kind === 'retake_vitals');
  const latestRetakeVitals = retakeVitals.at(-1);
  if (latestRetakeVitals && !latestRetakeVitals.acknowledgedAt) {
    const sys = readPositiveInt(latestRetakeVitals.payload.systolic);
    const dia = readPositiveInt(latestRetakeVitals.payload.diastolic);
    const chestPain = latestRetakeVitals.payload.chestPain === true;
    const zone = evaluateBpZone({ systolic: sys, diastolic: dia, chestPain, targets });
    if (zone && zone.tone !== 'ok') {
      const readingText = sys !== null && dia !== null ? `${sys}/${dia} mmHg` : '';
      const painText = chestPain ? 'Ko‘krak og‘rig‘i bor' : '';
      const detail = [readingText, painText].filter(Boolean).join(' · ');
      candidates.push({
        followupId: latestRetakeVitals.id,
        flagId: flag.id,
        severity: zone.tone === 'urgent' ? 'red' : 'yellow',
        kind: 'retake_vitals',
        titleUz: chestPain
          ? 'Qayta o‘lchovda ko‘krak og‘rig‘i bildirildi'
          : zone.tone === 'urgent'
            ? 'Qayta bosim yuqori chegarada'
            : 'Qayta bosim kuzatuv chegarasida',
        summaryUz: `Qayta o‘lchov: ${detail} (${zone.labelUz}).`,
        createdAt: latestRetakeVitals.createdAt,
      });
    }
  }

  // Retake medication loop: escalate if latest retake reports still missed and unacknowledged.
  const retakeMed = sorted.filter((item) => item.kind === 'retake_medication');
  const latestRetakeMed = retakeMed.at(-1);
  if (latestRetakeMed && latestRetakeMed.payload.status === 'missed' && !latestRetakeMed.acknowledgedAt) {
    candidates.push({
      followupId: latestRetakeMed.id,
      flagId: flag.id,
      severity: 'yellow',
      kind: 'retake_medication',
      titleUz: 'Qayta dori qaydi: dori hali ichilmagan',
      summaryUz: 'Bemor qayta murojaatda dorini icha olmaganini bildirdi.',
      createdAt: latestRetakeMed.createdAt,
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const rank = (severity: 'red' | 'yellow') => (severity === 'red' ? 0 : 1);
    return (
      rank(a.severity) - rank(b.severity)
      || Date.parse(b.createdAt) - Date.parse(a.createdAt)
      || a.followupId.localeCompare(b.followupId)
    );
  });
  return candidates[0];
}

export function isFollowupSuperseded(
  followups: readonly FlagFollowup[],
  target: FlagFollowup,
): boolean {
  const isNewer = (candidate: FlagFollowup) => {
    const delta = Date.parse(candidate.createdAt) - Date.parse(target.createdAt);
    return delta > 0 || (delta === 0 && candidate.id > target.id);
  };

  if (target.kind === 'still_need_help') {
    return followups.some(
      (item) => (item.kind === 'supply_resolved' || item.kind === 'still_need_help') && isNewer(item),
    );
  }
  if (target.kind === 'retake_medication' && target.payload.status === 'missed') {
    return followups.some((item) => item.kind === 'retake_medication' && isNewer(item));
  }
  if (target.kind === 'retake_vitals') {
    return followups.some((item) => item.kind === 'retake_vitals' && isNewer(item));
  }
  return false;
}

export function extractBpTrend(view: ClinicalView): BpTrendPoint[] {
  const targets = view.plan?.targets ?? null;
  const points: BpTrendPoint[] = [];

  for (const task of view.tasks) {
    const evidence = task.evidence;
    if (!evidence || evidence.payload.kind !== 'vitals') continue;
    const { systolic, diastolic, chestPain } = evidence.payload;
    if ((systolic !== null && diastolic !== null) || chestPain) {
      const zone = evaluateBpZone({ systolic, diastolic, chestPain, targets });
      points.push({
        id: evidence.id,
        createdAt: evidence.createdAt,
        systolic,
        diastolic,
        chestPain,
        tone: zone?.tone ?? (chestPain ? 'urgent' : 'ok'),
        isRetake: false,
        level: evidence.level,
      });
    }

    for (const followup of evidence.followups ?? []) {
      if (followup.kind !== 'retake_vitals') continue;
      const sys = readPositiveInt(followup.payload.systolic);
      const dia = readPositiveInt(followup.payload.diastolic);
      const pain = followup.payload.chestPain === true;
      if ((sys === null || dia === null) && !pain) continue;
      const retakeZone = evaluateBpZone({ systolic: sys, diastolic: dia, chestPain: pain, targets });
      points.push({
        id: followup.id,
        createdAt: followup.createdAt,
        systolic: sys,
        diastolic: dia,
        chestPain: pain,
        tone: retakeZone?.tone ?? (pain ? 'urgent' : 'ok'),
        isRetake: true,
        level: 0,
      });
    }
  }

  // Sort oldest-to-newest for chronological reading, keep up to last 10 points.
  return points
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-10);
}

export function countOpenClinicalAttention({
  view,
  exerciseAttempts = [],
}: {
  view: ClinicalView;
  exerciseAttempts?: readonly OpenExerciseAttemptSummary[];
}) {
  const openFlags = view.flags.filter(({ evidence }) => evidence.review === null);
  const reviewedFlags = view.flags.filter(({ evidence }) => evidence.review !== null);
  const openSymptoms = (view.urgentSymptoms ?? []).filter(({ review }) => review === null);
  const openExercises = exerciseAttempts.filter(
    (attempt) => attempt.flagColor !== null && attempt.review === null,
  );

  const followupEscalations = reviewedFlags
    .map((flag) => evaluateFlagFollowupAttention(flag, view.plan?.targets ?? null))
    .filter((item): item is FollowupEscalation => item !== null)
    .sort((a, b) => {
      const rank = (s: 'red' | 'yellow') => (s === 'red' ? 0 : 1);
      return rank(a.severity) - rank(b.severity) || Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });

  const openUrgent =
    openFlags.filter(({ color }) => color === 'red').length +
    openSymptoms.length +
    openExercises.filter(({ flagColor }) => flagColor === 'red').length +
    followupEscalations.filter(({ severity }) => severity === 'red').length;

  const openWarning =
    openFlags.filter(({ color }) => color === 'yellow').length +
    openExercises.filter(({ flagColor }) => flagColor === 'yellow').length +
    followupEscalations.filter(({ severity }) => severity === 'yellow').length;

  return {
    openUrgent,
    openWarning,
    openExerciseFlags: openExercises.length,
    followupEscalations,
    totalOpen: openUrgent + openWarning,
  };
}

export function caregiverAckMessage(
  ack: CaregiverAckView,
  audience: 'patient' | 'doctor' | 'brief',
): string {
  if (ack.kind === 'supply_on_the_way') {
    if (audience === 'patient') {
      return 'Yaqiningiz xabaringizni ko‘rdi: dori yetkazish bo‘yicha yordam yo‘lda';
    }
    if (audience === 'doctor') {
      return 'Yaqinim xabardor bo‘ldi: oila a’zosi bugun dori ta’minotida yordam tayyorlayotganini tasdiqladi';
    }
    return 'Yaqinim: oila a’zosi bugun dori yetkazishda yordam berishini tasdiqlagan.';
  }

  if (audience === 'patient') {
    return 'Yaqiningiz xabaringizni ko‘rdi va siz bilan bog‘lanishini tasdiqladi';
  }
  if (audience === 'doctor') {
    return 'Yaqinim xabardor bo‘ldi: oila a’zosi bemor bilan bog‘lanishini tasdiqladi';
  }
  return 'Yaqinim: oila a’zosi bugungi holatni ko‘rib bog‘lanishini tasdiqlagan.';
}

/**
 * Pick the chronologically latest non-sample exercise attempt regardless of DB triage sort order.
 */
export function findLatestRealExerciseAttempt<T extends { sample: boolean; createdAt: string }>(
  attempts: readonly T[],
): T | null {
  let latest: T | null = null;
  let latestMs = -Infinity;
  for (const attempt of attempts) {
    if (attempt.sample) continue;
    const ms = Date.parse(attempt.createdAt);
    const comparable = Number.isNaN(ms) ? -Infinity : ms;
    if (!latest || comparable > latestMs) {
      latest = attempt;
      latestMs = comparable;
    }
  }
  return latest;
}

export function describeRetakeVitalsFollowup(
  followup: FlagFollowup,
  targets: BloodPressureTargets | null,
  unit: 'mm sim. ust.' | 'mmHg' = 'mm sim. ust.',
): { text: string; tone: 'ok' | 'warn' | 'urgent' | null; labelUz: string | null } {
  const sys = readPositiveInt(followup.payload.systolic);
  const dia = readPositiveInt(followup.payload.diastolic);
  const chestPain = followup.payload.chestPain === true;
  const zone = evaluateBpZone({ systolic: sys, diastolic: dia, chestPain, targets });
  const reading = sys !== null && dia !== null ? `${sys}/${dia} ${unit}` : null;
  const parts = [reading, chestPain ? 'Ko‘krak og‘rig‘i bor' : null].filter(Boolean).join(' · ');
  const prefix = unit === 'mmHg' ? 'Qayta o‘lchov' : 'Qayta o‘lchov yuborildi';
  return {
    text: `${prefix}: ${parts || 'ma’lumot kiritilmagan'}`,
    tone: zone?.tone ?? null,
    labelUz: zone?.labelUz ?? null,
  };
}
