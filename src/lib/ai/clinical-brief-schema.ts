import { z } from 'zod';

const uuidInTextPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export const strengthUnitSchema = z.enum(['mg', 'mcg', 'g', 'iu']);

export const citedRecordKindSchema = z.enum([
  'evidence_log',
  'flag',
  'urgent_symptom',
  'exercise_attempt',
]);

export const citedRecordRefSchema = z.object({
  id: z.uuid(),
  kind: citedRecordKindSchema,
  date: z.iso.date(),
  labelUz: z.string().trim().min(1).max(200),
});

export type CitedRecordKind = z.infer<typeof citedRecordKindSchema>;
export type CitedRecordRef = z.infer<typeof citedRecordRefSchema>;

export const medicationAdherenceSummarySchema = z.object({
  title: z.string(),
  strength: z.number().nullable(),
  strengthUnit: strengthUnitSchema,
  dueCount: z.int().min(0),
  takenCount: z.int().min(0),
  missedCount: z.int().min(0),
  unansweredCount: z.int().min(0),
  outOfSupplyCount: z.int().min(0),
});

export const bpReadingSummarySchema = z.object({
  evidenceId: z.uuid(),
  date: z.iso.date(),
  systolic: z.number().nullable(),
  diastolic: z.number().nullable(),
  chestPain: z.boolean(),
  flagId: z.uuid().nullable(),
  flagColor: z.enum(['red', 'yellow']).nullable(),
  ruleKey: z.string().nullable(),
});

export const dailyStepPointSchema = z.object({
  date: z.iso.date(),
  preferredCount: z.int().min(0),
  preferredSource: z.enum(['device_sensor', 'self_report', 'demo_sim']),
  sensorSteps: z.int().min(0).nullable(),
  manualSteps: z.int().min(0).nullable(),
});

export const exerciseSummarySchema = z.object({
  totalAttempts: z.int().min(0),
  openFlaggedAttempts: z.int().min(0),
  latestMovement: z.string().nullable(),
  latestLevel: z.int().nullable(),
  latestValidReps: z.int().nullable(),
});

export const sevenDayBriefMetricsSchema = z.object({
  briefDate: z.iso.date(),
  patientName: z.string(),
  medications: z.array(medicationAdherenceSummarySchema),
  totalDue: z.int().min(0),
  totalTaken: z.int().min(0),
  totalMissed: z.int().min(0),
  totalUnanswered: z.int().min(0),
  adherencePercent: z.int().min(0).max(100).nullable(),
  bpReadings: z.array(bpReadingSummarySchema),
  openUrgentCount: z.int().min(0),
  openWarningCount: z.int().min(0),
  openUrgentSymptomsCount: z.int().min(0),
  steps7d: z.array(dailyStepPointSchema),
  avgDailySteps: z.int().min(0).nullable(),
  dailyStepGoal: z.int().nullable(),
  exercise: exerciseSummarySchema,
});

export type SevenDayBriefMetrics = z.infer<typeof sevenDayBriefMetricsSchema>;

export const aiClinicalBriefOutputSchema = z.strictObject({
  narrativeUz: z.string().trim().min(20).max(1800),
  highlights: z.array(z.string().trim().min(4).max(240)).min(1).max(6),
  doctorDraftUz: z.string().trim().min(15).max(1200),
  citedRecordIds: z.array(z.uuid()).max(12),
});

export type AiClinicalBriefOutput = z.infer<typeof aiClinicalBriefOutputSchema>;

export const doctorClinicalBriefViewSchema = z.object({
  id: z.uuid(),
  briefDate: z.iso.date(),
  level: z.union([z.literal(0), z.literal(4)]),
  sourceMode: z.enum(['ai', 'deterministic_fallback']),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  deterministicMetrics: z.record(z.string(), z.unknown()),
  narrativeUz: z.string(),
  highlights: z.array(z.string()),
  citedRecordIds: z.array(z.uuid()),
  citedRecords: z.array(citedRecordRefSchema),
  doctorDraftUz: z.string(),
  approvedReplyUz: z.string().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  approvedByDoctorId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
});

export type DoctorClinicalBriefView = z.infer<typeof doctorClinicalBriefViewSchema>;

export const patientClinicalBriefViewSchema = z.strictObject({
  id: z.uuid(),
  briefDate: z.iso.date(),
  level: z.literal(4),
  approvedReplyUz: z.string().min(1),
  approvedAt: z.iso.datetime(),
});

export type PatientClinicalBriefView = z.infer<typeof patientClinicalBriefViewSchema>;

export const generateBriefInputSchema = z.strictObject({
  action: z.literal('generate'),
  patientId: z.uuid().optional(),
  forceRefresh: z.boolean().optional().default(false),
});

export const approveBriefInputSchema = z.strictObject({
  action: z.literal('approve'),
  patientId: z.uuid().optional(),
  briefId: z.uuid(),
  replyUz: z.string().trim().min(5).max(1200),
});

export const clinicalBriefPostSchema = z.discriminatedUnion('action', [
  generateBriefInputSchema,
  approveBriefInputSchema,
]);

export type CitationValidationResult = {
  valid: boolean;
  validIds: string[];
  rejectedIds: string[];
};

export type SevenDayClinicalContext = {
  briefDate: string;
  patientName: string;
  metrics: SevenDayBriefMetrics;
  allowlist: Map<string, CitedRecordRef>;
  priorityRecordIds: string[];
};

export type BriefFallbackReason =
  | 'unconfigured'
  | 'rate_limited'
  | 'provider_error'
  | 'invalid_citations';

const unitLabelsUz: Record<z.infer<typeof strengthUnitSchema>, string> = {
  mg: 'mg',
  mcg: 'mkg',
  g: 'g',
  iu: 'IU',
};

function formatMedicationLabel(title: string, strength: number | null, unit: z.infer<typeof strengthUnitSchema>) {
  return strength !== null ? `${title} (${strength} ${unitLabelsUz[unit]})` : title;
}

/**
 * Programmatically validates every cited DB record ID against the scoped allowlist.
 * Also scans free-text fields for any forged/hallucinated UUID not present in the allowlist.
 */
export function validateBriefCitations(
  candidateIds: readonly string[],
  allowlist: ReadonlySet<string> | ReadonlyMap<string, CitedRecordRef>,
  textFragments: readonly string[] = [],
): CitationValidationResult {
  const hasId = (id: string) => allowlist.has(id);
  const validIds: string[] = [];
  const validSeen = new Set<string>();
  const rejectedIds: string[] = [];
  const rejectedSeen = new Set<string>();

  for (const rawId of candidateIds) {
    const id = rawId.trim().toLowerCase();
    if (!id) continue;
    if (hasId(id)) {
      if (!validSeen.has(id)) {
        validSeen.add(id);
        validIds.push(id);
      }
    } else if (!rejectedSeen.has(id)) {
      rejectedSeen.add(id);
      rejectedIds.push(id);
    }
  }

  for (const text of textFragments) {
    const matches = text.match(uuidInTextPattern);
    if (!matches) continue;
    for (const match of matches) {
      const id = match.toLowerCase();
      if (!hasId(id) && !rejectedSeen.has(id)) {
        rejectedSeen.add(id);
        rejectedIds.push(id);
      }
    }
  }

  const valid = rejectedIds.length === 0 && (allowlist.size === 0 || validIds.length > 0);
  return { valid, validIds, rejectedIds };
}

export function buildDeterministicSevenDayBrief(
  context: SevenDayClinicalContext,
): AiClinicalBriefOutput {
  const { metrics, priorityRecordIds } = context;
  const highlights: string[] = [];
  const narrativeParts: string[] = [];

  if (metrics.medications.length > 0 && metrics.totalDue > 0) {
    const medLines = metrics.medications.map((med) => {
      const label = formatMedicationLabel(med.title, med.strength, med.strengthUnit);
      const supplyNote = med.outOfSupplyCount > 0 ? `, dori tugagan: ${med.outOfSupplyCount}` : '';
      return `${label}: ${med.takenCount}/${med.dueCount} ichildi, ${med.missedCount} qoldirildi, ${med.unansweredCount} javobsiz${supplyNote}`;
    });
    const pctText = metrics.adherencePercent !== null ? ` (${metrics.adherencePercent}%)` : '';
    highlights.push(`Dori ijrosi (7 kun): ${metrics.totalTaken}/${metrics.totalDue} doza ichildi${pctText}.`);
    narrativeParts.push(`Oxirgi 7 kunda dori rejasi bo‘yicha natijalar: ${medLines.join('; ')}.`);
  } else {
    highlights.push('Oxirgi 7 kunda muddati kelgan dori vazifasi qayd etilmagan.');
    narrativeParts.push('Oxirgi 7 kun ichida rejalashtirilgan dori vazifalari bo‘yicha qayd mavjud emas.');
  }

  const latestBp = metrics.bpReadings[0] ?? null;
  if (latestBp) {
    const bpText = latestBp.systolic !== null && latestBp.diastolic !== null
      ? `${latestBp.systolic}/${latestBp.diastolic} mmHg`
      : latestBp.chestPain
        ? 'ko‘krak og‘rig‘i qaydi'
        : 'qayd mavjud';
    highlights.push(`Qon bosimi: oxirgi o‘lchov ${bpText} (${latestBp.date}).`);
    narrativeParts.push(`Oxirgi qon bosimi ko‘rsatkichi ${latestBp.date} sanasida ${bpText} sifatida qayd etilgan.`);
  } else {
    highlights.push('Oxirgi 7 kunda qon bosimi qaydi kiritilmagan.');
  }

  if (metrics.openUrgentCount > 0 || metrics.openWarningCount > 0 || metrics.openUrgentSymptomsCount > 0) {
    highlights.push(
      `Ochiq ogohlantirishlar: ${metrics.openUrgentCount} ta shoshilinch, ${metrics.openWarningCount} ta tekshirish, ${metrics.openUrgentSymptomsCount} ta shoshilinch belgi.`,
    );
    narrativeParts.push(
      `Shifokor e’tiborini talab qiluvchi ${metrics.openUrgentCount + metrics.openUrgentSymptomsCount} ta shoshilinch va ${metrics.openWarningCount} ta tekshiruv qaydi ochiq qolmoqda.`,
    );
  } else {
    highlights.push('Ochiq shoshilinch yoki tekshiruv bayrog‘i yo‘q.');
  }

  if (metrics.steps7d.length > 0 && metrics.avgDailySteps !== null) {
    const latestDay = metrics.steps7d[0];
    const dualSourceNote = latestDay && latestDay.sensorSteps !== null && latestDay.manualSteps !== null
      ? ` (sensor: ${latestDay.sensorSteps}, qo‘lda: ${latestDay.manualSteps})`
      : '';
    highlights.push(`Qadamlar: 7 kunlik o‘rtacha ${metrics.avgDailySteps} qadam/kun${dualSourceNote}.`);
  }

  if (metrics.exercise.totalAttempts > 0) {
    const flagNote = metrics.exercise.openFlaggedAttempts > 0
      ? `, ${metrics.exercise.openFlaggedAttempts} ta urinish tekshiruv kutmoqda`
      : '';
    highlights.push(`Mashqlar (7 kun): ${metrics.exercise.totalAttempts} ta urinish${flagNote}.`);
  }

  const outOfSupply = metrics.medications.some((med) => med.outOfSupplyCount > 0);
  const draftSentences: string[] = [
    `Assalomu alaykum, ${metrics.patientName}. Oxirgi 7 kunlik uy kuzatuvi qaydlaringizni ko‘rib chiqdim.`,
  ];

  if (metrics.totalDue > 0) {
    draftSentences.push(`Dori jadvali bo‘yicha ${metrics.totalTaken}/${metrics.totalDue} ta qabul qayd etilgan.`);
  }
  if (outOfSupply) {
    draftSentences.push(
      'Dori tugagani haqidagi xabaringizni ko‘rdim — iltimos, dorini qayta olgach ilovada tasdiqlab qo‘ying.',
    );
  }
  if (metrics.openUrgentCount > 0 || metrics.openUrgentSymptomsCount > 0) {
    draftSentences.push(
      'Yuqori/past bosim yoki noxush belgilar qayd etilgani sababli holatingizni tinch holatda qayta o‘lchang; ko‘krak og‘rig‘i, kuchli bosh aylanishi yoki nafas qisishi bo‘lsa darhol 103 ga qo‘ng‘iroq qiling.',
    );
  } else if (metrics.openWarningCount > 0) {
    draftSentences.push('Kuzatuv chegarasidagi qaydlar bo‘yicha ertangi o‘lchovni ham o‘z vaqtida kiritib boring.');
  } else {
    draftSentences.push('Rejangiz bo‘yicha dori va bosim qaydlarini o‘z vaqtida davom ettiring.');
  }
  draftSentences.push('Ushbu xulosa shifokor tomonidan ko‘rib chiqilgach tasdiqlanadi.');

  return {
    narrativeUz: narrativeParts.join(' '),
    highlights: highlights.slice(0, 6),
    doctorDraftUz: draftSentences.join(' '),
    citedRecordIds: priorityRecordIds.slice(0, 8),
  };
}
