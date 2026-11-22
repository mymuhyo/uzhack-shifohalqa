import { z } from 'zod';
import type { PoseMovement } from './engine';

export const exerciseCatalog: Record<PoseMovement, {
  id: PoseMovement;
  direction: 'flex' | 'extend';
  title: string;
  shortTitle: string;
  jointLabel: string;
  pointsLabel: string;
  startCue: string;
  cycleCue: string;
  defaultTargetAngle: number;
  angleBounds: { min: number; max: number };
}> = {
  chair_stand: {
    id: 'chair_stand',
    direction: 'flex',
    title: 'O‘tirib-turish mashqi',
    shortTitle: 'O‘tirib-turish',
    jointLabel: 'Tizza',
    pointsLabel: 'Son, tizza va to‘piq',
    startCue: 'tik turing',
    cycleCue: 'O‘tirib yana tik turing.',
    defaultTargetAngle: 100,
    angleBounds: { min: 60, max: 140 },
  },
  elbow_bend: {
    id: 'elbow_bend',
    direction: 'flex',
    title: 'Tirsakni bukib-yozish mashqi',
    shortTitle: 'Tirsakni bukish',
    jointLabel: 'Tirsak',
    pointsLabel: 'Yelka, tirsak va bilak',
    startCue: 'qo‘lingizni yozing',
    cycleCue: 'Tirsakni bukib, qo‘lingizni yana yozing.',
    defaultTargetAngle: 95,
    angleBounds: { min: 60, max: 125 },
  },
  knee_lift: {
    id: 'knee_lift',
    direction: 'flex',
    title: 'Tik turib tizzani ko‘tarish',
    shortTitle: 'Tizzani ko‘tarish',
    jointLabel: 'Son-chanaq',
    pointsLabel: 'Yelka, son va tizza',
    startCue: 'tik turing',
    cycleCue: 'Tizzani ko‘tarib, yana tushiring.',
    defaultTargetAngle: 110,
    angleBounds: { min: 60, max: 135 },
  },
  shoulder_raise: {
    id: 'shoulder_raise',
    direction: 'extend',
    title: 'Qo‘lni yelkadan ko‘tarish',
    shortTitle: 'Qo‘lni ko‘tarish',
    jointLabel: 'Yelka',
    pointsLabel: 'Son, yelka va tirsak',
    startCue: 'qo‘lingizni pastga tushiring',
    cycleCue: 'Qo‘lni yuqoriga ko‘tarib, yana pastga tushiring.',
    defaultTargetAngle: 90,
    angleBounds: { min: 70, max: 130 },
  },
  seated_knee_ext: {
    id: 'seated_knee_ext',
    direction: 'extend',
    title: 'O‘tirib oyoqni tekislash',
    shortTitle: 'Oyoqni tekislash',
    jointLabel: 'Tizza',
    pointsLabel: 'Son, tizza va to‘piq',
    startCue: 'stulda tizzani bukib o‘tiring',
    cycleCue: 'Tizzani oldinga tekislab, yana tushiring.',
    defaultTargetAngle: 155,
    angleBounds: { min: 140, max: 170 },
  },
};

export const exerciseErrorCodeSchema = z.enum([
  'pain_reported',
  'shallow_range',
  'too_fast',
  'too_slow',
  'interrupted_tracking',
  'below_target_reps',
  'similar_motion',
  'trunk_lean',
  'elbow_drift',
  'shoulder_asymmetry',
  'tempo_irregular',
]);

export type ExerciseErrorCode = z.infer<typeof exerciseErrorCodeSchema>;

export const formMetricsSchema = z.object({
  trunkLeanMaxDeg: z.number().min(0).max(90).nullable().optional(),
  elbowDriftMaxDeg: z.number().min(0).max(180).nullable().optional(),
  shoulderTiltMaxDeg: z.number().min(0).max(90).nullable().optional(),
  compensationCycles: z.int().min(0).max(999).optional(),
  tempoSpreadSeconds: z.number().min(0).max(60).nullable().optional(),
});

export type FormMetrics = z.infer<typeof formMetricsSchema>;

export const exerciseDiagnosticsSchema = z.object({
  errorCodes: z.array(exerciseErrorCodeSchema).default([]),
  severity: z.enum(['ok', 'yellow', 'red']).default('ok'),
  needsDoctorReview: z.boolean().default(false),
  avgCycleSeconds: z.number().nullable().default(null),
  formScore: z.number().int().min(0).max(100).default(100),
  focusCueUz: z.string().default(''),
  patientCoachingUz: z.string().default(''),
  doctorSummaryUz: z.string().default(''),
});

export type ExerciseDiagnostics = z.infer<typeof exerciseDiagnosticsSchema>;

export type DiagnosticsInput = {
  movement: PoseMovement;
  reason: 'manual' | 'pain' | 'measured' | 'timer';
  targetAngle: number;
  targetReps: number;
  maxShallow: number;
  painColor: 'yellow' | 'red';
  validReps: number | null;
  shallowReps: number | null;
  minAngle: number | null;
  avgCycleSeconds?: number | null;
  interruptedCycles?: number;
  incompleteCycles?: number;
  similarMotion?: boolean;
  sample?: boolean;
  formMetrics?: FormMetrics | null;
};

/**
 * Compute deterministic biomechanical coaching, form score (0-100), and clinical triage summaries.
 * Never diagnoses or alters prescribed targets; reports observed movement mechanics only.
 */
export function analyzeExerciseDiagnostics(input: DiagnosticsInput): ExerciseDiagnostics {
  const info = exerciseCatalog[input.movement];
  const avgCycleSeconds = input.avgCycleSeconds != null && Number.isFinite(input.avgCycleSeconds)
    ? Math.round(input.avgCycleSeconds * 10) / 10
    : null;

  if (input.reason === 'pain') {
    return {
      errorCodes: ['pain_reported'],
      severity: input.painColor,
      needsDoctorReview: true,
      avgCycleSeconds,
      formScore: 0,
      focusCueUz: 'Mashqni darhol to‘xtating va dam oling.',
      patientCoachingUz: 'Mashq paytida og‘riq bildirildi — harakatni darhol to‘xtating. Qayd shifokor navbatiga yuborildi. Agar og‘riq kuchli bo‘lsa, 103 ga murojaat qiling.',
      doctorSummaryUz: `${info.shortTitle}: bemor mashq paytida og‘riq bildirdi.`,
    };
  }

  const errorCodes: ExerciseErrorCode[] = [];
  const patientTips: string[] = [];
  const doctorNotes: string[] = [];
  const focusCues: string[] = [];
  let severity: 'ok' | 'yellow' | 'red' = 'ok';
  let needsDoctorReview = false;
  let score = 100;

  const valid = input.validReps ?? 0;
  const shallow = input.shallowReps ?? 0;
  const interrupted = (input.interruptedCycles ?? 0) + (input.incompleteCycles ?? 0);
  const fm = input.formMetrics;

  if (shallow > input.maxShallow || (!input.sample && valid === 0 && shallow > 0)) {
    errorCodes.push('shallow_range');
    severity = 'yellow';
    needsDoctorReview = true;
    score -= Math.min(35, shallow * 12);
    const minAngleText = input.minAngle !== null ? `${Math.round(input.minAngle)}°` : 'aniqlanmadi';
    const cue = info.direction === 'extend'
      ? `${info.jointLabel} burchagini kamida ${input.targetAngle}° gacha yozib/ko‘tarib bajaring`
      : `${info.jointLabel} burchagini ${input.targetAngle}° gacha chuqurroq buking`;
    focusCues.push(cue);
    patientTips.push(`${shallow} ta harakatda ${info.jointLabel.toLowerCase()} burchagi maqsadga (${input.targetAngle}°) yetmadi (kuzatilgan burchak ${minAngleText}). Agar og‘riq sabab bo‘lsa, «Og‘riq bor» tugmasini bosing.`);
    doctorNotes.push(`${shallow} chala takror (kuzatilgan ${minAngleText}, maqsad ${input.targetAngle}°)`);
  }

  const trunkLimit = input.movement === 'chair_stand' ? 35 : input.movement === 'knee_lift' ? 25 : input.movement === 'seated_knee_ext' ? 28 : 90;
  if (fm?.trunkLeanMaxDeg != null && fm.trunkLeanMaxDeg > trunkLimit) {
    errorCodes.push('trunk_lean');
    if (!input.sample) {
      severity = 'yellow';
      needsDoctorReview = true;
    }
    score -= 18;
    const deg = Math.round(fm.trunkLeanMaxDeg);
    focusCues.push('Gavdani tik tutib, belni oldinga yoki orqaga og‘dirmang');
    patientTips.push(`Harakat paytida gavda ${deg}° ga og‘di (kompensatsiya). Belni tik tutib, tayanchga suyangan holda bajaring.`);
    doctorNotes.push(`gavda og‘ishi ${deg}°`);
  }

  if (input.movement === 'elbow_bend' && fm?.elbowDriftMaxDeg != null && fm.elbowDriftMaxDeg > 35) {
    errorCodes.push('elbow_drift');
    if (!input.sample) {
      severity = 'yellow';
      needsDoctorReview = true;
    }
    score -= 16;
    const deg = Math.round(fm.elbowDriftMaxDeg);
    focusCues.push('Yuqori qo‘l va tirsakni tanangiz yonida mahkam tuting');
    patientTips.push(`Tirsak tanadan ${deg}° ga uzoqlashdi. Yelka va tirsakni qimirlatmasdan faqat bilakni buking.`);
    doctorNotes.push(`tirsak siljishi ${deg}°`);
  }

  if (input.movement === 'shoulder_raise' && fm?.shoulderTiltMaxDeg != null && fm.shoulderTiltMaxDeg > 14) {
    errorCodes.push('shoulder_asymmetry');
    if (!input.sample) {
      severity = 'yellow';
      needsDoctorReview = true;
    }
    score -= 16;
    const deg = Math.round(fm.shoulderTiltMaxDeg);
    focusCues.push('Ikkala yelkani bir tekisda tutib, yelkani qismang');
    patientTips.push(`Yelka chizig‘ida ${deg}° og‘ish kuzatildi — bo‘yinni bo‘sh qo‘yib, gavdani bir tekisda tuting.`);
    doctorNotes.push(`yelka assimetriyasi ${deg}°`);
  }

  if (avgCycleSeconds !== null && avgCycleSeconds < 1.2) {
    errorCodes.push('too_fast');
    score -= 12;
    focusCues.push('Har takrorni 2–3 soniyada ohista bajaring');
    patientTips.push(`Harakat juda tez bajarildi (o‘rtacha ${avgCycleSeconds} s/sikl). Bo‘g‘imga zarba tushmasligi uchun 2–3 soniyada ohista bajaring.`);
    doctorNotes.push(`tez sur’at (${avgCycleSeconds} s/sikl)`);
  } else if (avgCycleSeconds !== null && avgCycleSeconds > 6.5) {
    errorCodes.push('too_slow');
    score -= 8;
    focusCues.push('Charchoq sezilsa, qisqa dam olib davom eting');
    patientTips.push(`Harakat juda sekin kechdi (o‘rtacha ${avgCycleSeconds} s/sikl). Charchoq sezilsa, dam olib bajaring.`);
    doctorNotes.push(`sekin sur’at (${avgCycleSeconds} s/sikl)`);
  }

  if (fm?.tempoSpreadSeconds != null && fm.tempoSpreadSeconds > 2.5) {
    errorCodes.push('tempo_irregular');
    score -= 8;
    focusCues.push('Barcha takrorlarni bir xil maromda bajaring');
    patientTips.push(`Takrorlar orasidagi tezlik farqi katta (${fm.tempoSpreadSeconds} s). Bir xil maromda bajarishga harakat qiling.`);
    doctorNotes.push(`notekis marom (±${fm.tempoSpreadSeconds} s)`);
  }

  if (interrupted > 0) {
    errorCodes.push('interrupted_tracking');
    score -= Math.min(15, interrupted * 5);
    focusCues.push('Kameraga yon tomondan to‘liq ko‘rinishda turing');
    patientTips.push(`${interrupted} ta harakat kadr uzilishi yoki yarim to‘xtash sababli tugallanmadi — kamera yon tomondan to‘liq ko‘rinishiga ishonch hosil qiling.`);
    doctorNotes.push(`${interrupted} uzilgan harakat`);
  }

  if (input.similarMotion) {
    errorCodes.push('similar_motion');
    severity = 'yellow';
    needsDoctorReview = true;
    score -= 10;
    patientTips.push('Harakat izi avvalgi qaydga juda o‘xshash — shifokor tekshiruviga qo‘shildi.');
    doctorNotes.push('o‘xshash harakat signali');
  }

  if (!input.sample && valid < input.targetReps) {
    errorCodes.push('below_target_reps');
    const ratio = input.targetReps > 0 ? Math.max(0, input.targetReps - valid) / input.targetReps : 0;
    score -= Math.round(ratio * 20);
    patientTips.push(`Rejadagi ${input.targetReps} takrordan ${valid} tasi to‘liq bajarildi.`);
    doctorNotes.push(`${valid}/${input.targetReps} to‘liq takror`);
  }

  const formScore = Math.max(15, Math.min(100, score));

  if (patientTips.length === 0) {
    const angleNote = input.minAngle !== null
      ? ` (${info.direction === 'extend' ? 'eng katta' : 'eng chuqur'} burchak ${Math.round(input.minAngle)}°)`
      : '';
    return {
      errorCodes,
      severity: 'ok',
      needsDoctorReview: false,
      avgCycleSeconds,
      formScore,
      focusCueUz: 'Shu bir xil marom va to‘g‘ri qomatni saqlang.',
      patientCoachingUz: `${info.shortTitle}: ${valid} ta to‘liq harakat me’yorda bajarildi${angleNote}. Texnika bahosi ${formScore}/100. Barakalla!`,
      doctorSummaryUz: `${info.shortTitle}: ${valid} to‘liq, ${shallow} chala${angleNote}, texnika ${formScore}/100.`,
    };
  }

  return {
    errorCodes,
    severity,
    needsDoctorReview,
    avgCycleSeconds,
    formScore,
    focusCueUz: focusCues[0] ?? 'Harakatni ohista va to‘g‘ri qomat bilan bajaring.',
    patientCoachingUz: patientTips.join(' '),
    doctorSummaryUz: `${info.shortTitle}: ${doctorNotes.join('; ')} (texnika ${formScore}/100).`,
  };
}
