import { z } from 'zod';
import { isPatientSideRole, type ClinicalActor } from '../clinical-types';
import { getDatabase, type SqlAdapter } from '../db';
import {
  cachedClinicalBriefRowSchema,
  computePromptHash,
  findCachedClinicalBrief,
  reserveAiRequestQuota,
  type CachedClinicalBriefRow,
} from './ai-quota-cache';
import {
  aiClinicalBriefOutputSchema,
  buildDeterministicSevenDayBrief,
  doctorClinicalBriefViewSchema,
  patientClinicalBriefViewSchema,
  strengthUnitSchema,
  validateBriefCitations,
  type AiClinicalBriefOutput,
  type BriefFallbackReason,
  type CitedRecordRef,
  type DoctorClinicalBriefView,
  type PatientClinicalBriefView,
  type SevenDayBriefMetrics,
  type SevenDayClinicalContext,
  type bpReadingSummarySchema,
  type dailyStepPointSchema,
  type medicationAdherenceSummarySchema,
} from './clinical-brief-schema';
import { requestSupervisedCompletion, type SupervisedCompletionResult } from './completion-fallback';
import { configuredSupervisedAiTargets, type SupervisedAiTarget } from './provider-config';

export * from './clinical-brief-schema';

const briefVersion = 'clinical-brief-v1';
const briefDeadlineMs = 15_000;

export type ClinicalBriefDependencies = {
  sql?: SqlAdapter | null;
  targets?: readonly SupervisedAiTarget[];
  complete?: (
    targets: readonly SupervisedAiTarget[],
    input: {
      name: string;
      prompt: string;
      schema: Record<string, unknown>;
      maxOutputTokens: number;
    },
    signal: AbortSignal,
  ) => Promise<SupervisedCompletionResult<AiClinicalBriefOutput> | null>;
};

const aiBriefJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['narrativeUz', 'highlights', 'doctorDraftUz', 'citedRecordIds'],
  properties: {
    narrativeUz: { type: 'string', description: 'Plain Latin Uzbek 7-day clinical summary grounded strictly in the provided data.' },
    highlights: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 6,
      description: 'Short Uzbek clinical highlights (adherence, BP, steps, exercises, open alerts).',
    },
    doctorDraftUz: {
      type: 'string',
      description: 'Respectful, clinician-editable Uzbek draft message for the patient. No diagnosis or autonomous prescription changes.',
    },
    citedRecordIds: { type: 'array', items: { type: 'string' }, maxItems: 12, description: 'Exact UUIDs chosen ONLY from the allowedRecords list.' },
  },
};

const patientRowSchema = z.object({ id: z.uuid(), name: z.string(), briefDate: z.iso.date(), dailyStepGoal: z.number().int().nullable() });
const dueMedicationRowSchema = z.object({
  planItemId: z.uuid(),
  title: z.string(),
  strength: z.number().nullable(),
  strengthUnit: strengthUnitSchema.catch('mg'),
  status: z.enum(['pending', 'taken', 'missed', 'recorded']).nullable(),
  missedReason: z.string().nullable(),
});
const evidenceFlagRowSchema = z.object({
  evidenceId: z.uuid(),
  date: z.iso.date(),
  entryKind: z.enum(['task', 'medication_box']),
  itemType: z.enum(['medication', 'vitals']),
  itemTitle: z.string(),
  level: z.int(),
  payload: z.record(z.string(), z.unknown()),
  flagId: z.uuid().nullable(),
  flagColor: z.enum(['red', 'yellow']).nullable(),
  ruleKey: z.string().nullable(),
  flagDecision: z.enum(['approved', 'retake']).nullable(),
});
const symptomRowSchema = z.object({
  id: z.uuid(),
  date: z.iso.date(),
  symptom: z.enum(['chest_pain', 'dizziness', 'shortness_of_breath', 'severe_headache']),
  reviewDecision: z.enum(['approved', 'retake']).nullable(),
});
const stepRowSchema = z.object({ date: z.iso.date(), stepCount: z.int().min(0), source: z.enum(['device_sensor', 'self_report', 'demo_sim']) });
const exerciseRowSchema = z.object({
  id: z.uuid(),
  date: z.iso.date(),
  movement: z.string(),
  level: z.int(),
  validReps: z.int().nullable(),
  flagColor: z.enum(['red', 'yellow']).nullable(),
  reviewDecision: z.enum(['reviewed', 'retake']).nullable(),
});
const patientBriefRowSchema = z.object({
  id: z.uuid(),
  briefDate: z.iso.date(),
  level: z.literal(4),
  approvedReplyUz: z.string().min(1),
  approvedAt: z.iso.datetime(),
});

const symptomLabelsUz: Record<z.infer<typeof symptomRowSchema>['symptom'], string> = {
  chest_pain: 'Ko‘krak og‘rig‘i',
  dizziness: 'Bosh aylanishi',
  shortness_of_breath: 'Nafas qisishi',
  severe_headache: 'Kuchli bosh og‘rig‘i',
};

/**
 * Gathers scoped 7-day clinical context for a doctor's assigned patient.
 * SECURITY: NEVER selects `doctor_note` or `acknowledged_note`.
 */
export async function gatherSevenDayClinicalContext(
  actor: ClinicalActor,
  sqlOverride?: SqlAdapter | null,
): Promise<SevenDayClinicalContext | null> {
  if (actor.role !== 'doctor' || !actor.doctorId || !actor.patientId) return null;
  const sql = sqlOverride !== undefined ? sqlOverride : getDatabase();
  if (!sql) return null;

  const [patientRaw] = await sql`
    SELECT p.id, p.name, to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date, 'YYYY-MM-DD') AS "briefDate",
           plan.daily_step_goal AS "dailyStepGoal"
    FROM public.patients AS p
    LEFT JOIN public.plans AS plan
      ON plan.workspace_id = p.workspace_id AND plan.patient_id = p.id AND plan.doctor_id IS NOT DISTINCT FROM p.doctor_id
    WHERE p.workspace_id = ${actor.workspaceId} AND p.id = ${actor.patientId} AND p.doctor_id = ${actor.doctorId}::uuid
    LIMIT 1
  `;
  if (!patientRaw) return null;
  const patient = patientRowSchema.parse(patientRaw);

  const [dueMedRowsRaw, evidenceFlagRowsRaw, symptomRowsRaw, stepRowsRaw, exerciseRowsRaw] = await Promise.all([
    sql`
      WITH clock AS (SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent' AS local_now)
      SELECT item.id AS "planItemId", item.title, item.box_strength_mg::float8 AS strength,
             COALESCE(item.strength_unit, 'mg') AS "strengthUnit", task.status, evidence.payload->>'reason' AS "missedReason"
      FROM public.plans AS plan
      JOIN public.plan_items AS item ON item.workspace_id = plan.workspace_id AND item.plan_id = plan.id AND item.type = 'medication'
      CROSS JOIN clock
      CROSS JOIN LATERAL (SELECT clock.local_now::date - day_number AS calendar_date FROM generate_series(0, 6) AS day_number) AS days
      LEFT JOIN public.task_instances AS task
        ON task.workspace_id = item.workspace_id AND task.plan_item_id = item.id AND task.scheduled_date = days.calendar_date
      LEFT JOIN public.evidence_logs AS evidence
        ON evidence.workspace_id = task.workspace_id AND evidence.task_instance_id = task.id AND evidence.entry_kind = 'task'
      WHERE plan.workspace_id = ${actor.workspaceId} AND plan.patient_id = ${actor.patientId}
        AND plan.doctor_id = ${actor.doctorId}::uuid AND days.calendar_date >= plan.start_date
        AND days.calendar_date + item.due_time <= clock.local_now
      ORDER BY item.sort_order ASC, item.due_time ASC, item.title ASC
    `,
    sql`
      WITH local_date AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date AS today)
      SELECT evidence.id AS "evidenceId", to_char(task.scheduled_date, 'YYYY-MM-DD') AS date,
             evidence.entry_kind AS "entryKind", item.type AS "itemType", item.title AS "itemTitle",
             evidence.level, evidence.payload, flag.id AS "flagId", flag.color AS "flagColor",
             flag.rule_key AS "ruleKey", flag.decision AS "flagDecision"
      FROM public.plans AS plan
      JOIN public.plan_items AS item ON item.workspace_id = plan.workspace_id AND item.plan_id = plan.id
      JOIN public.task_instances AS task ON task.workspace_id = item.workspace_id AND task.plan_item_id = item.id
      JOIN public.evidence_logs AS evidence ON evidence.workspace_id = task.workspace_id AND evidence.task_instance_id = task.id
      LEFT JOIN public.flags AS flag ON flag.workspace_id = evidence.workspace_id AND flag.evidence_log_id = evidence.id
      CROSS JOIN local_date
      WHERE plan.workspace_id = ${actor.workspaceId} AND plan.patient_id = ${actor.patientId} AND plan.doctor_id = ${actor.doctorId}::uuid
        AND (task.scheduled_date >= local_date.today - 6 OR (flag.id IS NOT NULL AND flag.decision IS NULL))
      ORDER BY task.scheduled_date DESC, evidence.created_at DESC
      LIMIT 60
    `,
    sql`
      WITH local_date AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date AS today)
      SELECT symptom.id, to_char((symptom.created_at AT TIME ZONE 'Asia/Tashkent')::date, 'YYYY-MM-DD') AS date,
             symptom.symptom, symptom.review_decision AS "reviewDecision"
      FROM public.urgent_symptoms AS symptom
      JOIN public.patients AS patient ON patient.workspace_id = symptom.workspace_id AND patient.id = symptom.patient_id
      CROSS JOIN local_date
      WHERE symptom.workspace_id = ${actor.workspaceId} AND patient.id = ${actor.patientId} AND patient.doctor_id = ${actor.doctorId}::uuid
        AND ((symptom.created_at AT TIME ZONE 'Asia/Tashkent')::date >= local_date.today - 6 OR symptom.review_decision IS NULL)
      ORDER BY symptom.created_at DESC
      LIMIT 20
    `,
    sql`
      WITH local_date AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date AS today)
      SELECT to_char(step.activity_date, 'YYYY-MM-DD') AS date, step.step_count AS "stepCount", step.source
      FROM public.daily_step_counts AS step
      JOIN public.patients AS patient ON patient.workspace_id = step.workspace_id AND patient.id = step.patient_id
      CROSS JOIN local_date
      WHERE step.workspace_id = ${actor.workspaceId} AND patient.id = ${actor.patientId}
        AND patient.doctor_id = ${actor.doctorId}::uuid AND step.activity_date >= local_date.today - 6
      ORDER BY step.activity_date DESC
    `,
    sql`
      WITH local_date AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tashkent')::date AS today)
      SELECT attempt.id, to_char(attempt.scheduled_date, 'YYYY-MM-DD') AS date, attempt.movement, attempt.level,
             attempt.valid_reps AS "validReps", attempt.flag_color AS "flagColor", attempt.review_decision AS "reviewDecision"
      FROM public.exercise_attempts AS attempt
      JOIN public.exercise_prescriptions AS plan ON plan.workspace_id = attempt.workspace_id AND plan.id = attempt.prescription_id
      CROSS JOIN local_date
      WHERE attempt.workspace_id = ${actor.workspaceId} AND plan.patient_id = ${actor.patientId} AND plan.doctor_id = ${actor.doctorId}::uuid
        AND (attempt.scheduled_date >= local_date.today - 6 OR (attempt.flag_color IS NOT NULL AND attempt.review_decision IS NULL))
      ORDER BY attempt.created_at DESC
      LIMIT 30
    `,
  ]);

  const dueMedRows = z.array(dueMedicationRowSchema).parse(dueMedRowsRaw);
  const evidenceFlagRows = z.array(evidenceFlagRowSchema).parse(evidenceFlagRowsRaw);
  const symptomRows = z.array(symptomRowSchema).parse(symptomRowsRaw);
  const stepRows = z.array(stepRowSchema).parse(stepRowsRaw);
  const exerciseRows = z.array(exerciseRowSchema).parse(exerciseRowsRaw);

  const medBuckets = new Map<string, z.infer<typeof medicationAdherenceSummarySchema>>();
  let totalDue = 0;
  let totalTaken = 0;
  let totalMissed = 0;
  let totalUnanswered = 0;

  for (const row of dueMedRows) {
    const key = `${row.title.toLowerCase()}::${row.strength ?? 'none'}::${row.strengthUnit}`;
    let bucket = medBuckets.get(key);
    if (!bucket) {
      bucket = { title: row.title, strength: row.strength, strengthUnit: row.strengthUnit, dueCount: 0, takenCount: 0, missedCount: 0, unansweredCount: 0, outOfSupplyCount: 0 };
      medBuckets.set(key, bucket);
    }
    bucket.dueCount += 1;
    totalDue += 1;
    if (row.status === 'taken') {
      bucket.takenCount += 1;
      totalTaken += 1;
    } else if (row.status === 'missed') {
      bucket.missedCount += 1;
      totalMissed += 1;
      if (row.missedReason === 'out_of_supply') bucket.outOfSupplyCount += 1;
    } else {
      bucket.unansweredCount += 1;
      totalUnanswered += 1;
    }
  }

  const allowlist = new Map<string, CitedRecordRef>();
  const redPriorityIds: string[] = [];
  const yellowPriorityIds: string[] = [];
  const normalPriorityIds: string[] = [];
  const bpReadings: z.infer<typeof bpReadingSummarySchema>[] = [];
  let openUrgentCount = 0;
  let openWarningCount = 0;

  for (const row of evidenceFlagRows) {
    const evId = row.evidenceId.toLowerCase();
    const isVitals = row.entryKind === 'task' && row.itemType === 'vitals';
    const systolic = typeof row.payload.systolic === 'number' ? row.payload.systolic : null;
    const diastolic = typeof row.payload.diastolic === 'number' ? row.payload.diastolic : null;
    const chestPain = row.payload.chestPain === true;

    const evidenceLabel = isVitals
      ? systolic !== null && diastolic !== null
        ? `Qon bosimi ${systolic}/${diastolic} mmHg (${row.date})`
        : chestPain ? `Ko‘krak og‘rig‘i qaydi (${row.date})` : `Bosim qaydi (${row.date})`
      : row.entryKind === 'medication_box'
        ? `DoriMos qaydi · ${row.itemTitle} (${row.date})`
        : `Dori qaydi · ${row.itemTitle} (${row.date})`;

    allowlist.set(evId, { id: evId, kind: 'evidence_log', date: row.date, labelUz: evidenceLabel });
    normalPriorityIds.push(evId);

    if (row.flagId && row.flagColor) {
      const fId = row.flagId.toLowerCase();
      allowlist.set(fId, {
        id: fId,
        kind: 'flag',
        date: row.date,
        labelUz: `${row.flagColor === 'red' ? 'Shoshilinch' : 'Tekshiruv'} bayrog‘i · ${row.ruleKey ?? row.itemTitle} (${row.date})`,
      });
      if (row.flagDecision === null) {
        if (row.flagColor === 'red') {
          openUrgentCount += 1;
          redPriorityIds.push(fId);
        } else {
          openWarningCount += 1;
          yellowPriorityIds.push(fId);
        }
      } else {
        normalPriorityIds.push(fId);
      }
    }

    if (isVitals) {
      bpReadings.push({
        evidenceId: evId, date: row.date, systolic, diastolic, chestPain,
        flagId: row.flagId ? row.flagId.toLowerCase() : null, flagColor: row.flagColor, ruleKey: row.ruleKey,
      });
    }
  }

  let openUrgentSymptomsCount = 0;
  for (const row of symptomRows) {
    const sId = row.id.toLowerCase();
    allowlist.set(sId, { id: sId, kind: 'urgent_symptom', date: row.date, labelUz: `Shoshilinch belgi · ${symptomLabelsUz[row.symptom]} (${row.date})` });
    if (row.reviewDecision === null) {
      openUrgentSymptomsCount += 1;
      redPriorityIds.push(sId);
    } else {
      normalPriorityIds.push(sId);
    }
  }

  let openFlaggedAttempts = 0;
  for (const row of exerciseRows) {
    const exId = row.id.toLowerCase();
    allowlist.set(exId, {
      id: exId,
      kind: 'exercise_attempt',
      date: row.date,
      labelUz: `Mashq (${row.movement}) · L${row.level}${row.validReps !== null ? ` · ${row.validReps} takror` : ''} (${row.date})`,
    });
    if (row.flagColor && row.reviewDecision === null) {
      openFlaggedAttempts += 1;
      if (row.flagColor === 'red') redPriorityIds.push(exId);
      else yellowPriorityIds.push(exId);
    } else {
      normalPriorityIds.push(exId);
    }
  }

  const stepsByDate = new Map<string, { sensor: number | null; manual: number | null; demoSim: number | null }>();
  for (const row of stepRows) {
    if (row.source === 'demo_sim' && actor.isDemo !== true) continue;
    const entry = stepsByDate.get(row.date) ?? { sensor: null, manual: null, demoSim: null };
    if (row.source === 'device_sensor') entry.sensor = row.stepCount;
    else if (row.source === 'self_report') entry.manual = row.stepCount;
    else entry.demoSim = row.stepCount;
    stepsByDate.set(row.date, entry);
  }
  const steps7d: z.infer<typeof dailyStepPointSchema>[] = [...stepsByDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, entry]) =>
      entry.sensor !== null
        ? { date, preferredCount: entry.sensor, preferredSource: 'device_sensor' as const, sensorSteps: entry.sensor, manualSteps: entry.manual }
        : entry.manual !== null
          ? { date, preferredCount: entry.manual, preferredSource: 'self_report' as const, sensorSteps: null, manualSteps: entry.manual }
          : { date, preferredCount: entry.demoSim ?? 0, preferredSource: 'demo_sim' as const, sensorSteps: null, manualSteps: null },
    );

  const avgDailySteps = steps7d.length > 0
    ? Math.round(steps7d.reduce((sum, item) => sum + item.preferredCount, 0) / steps7d.length)
    : null;
  const latestExercise = exerciseRows[0] ?? null;

  const metrics: SevenDayBriefMetrics = {
    briefDate: patient.briefDate,
    patientName: patient.name,
    medications: [...medBuckets.values()],
    totalDue,
    totalTaken,
    totalMissed,
    totalUnanswered,
    adherencePercent: totalDue > 0 ? Math.round((totalTaken / totalDue) * 100) : null,
    bpReadings: bpReadings.slice(0, 14),
    openUrgentCount,
    openWarningCount,
    openUrgentSymptomsCount,
    steps7d,
    avgDailySteps,
    dailyStepGoal: patient.dailyStepGoal,
    exercise: {
      totalAttempts: exerciseRows.length,
      openFlaggedAttempts,
      latestMovement: latestExercise?.movement ?? null,
      latestLevel: latestExercise?.level ?? null,
      latestValidReps: latestExercise?.validReps ?? null,
    },
  };

  return {
    briefDate: patient.briefDate,
    patientName: patient.name,
    metrics,
    allowlist,
    priorityRecordIds: [...new Set([...redPriorityIds, ...yellowPriorityIds, ...normalPriorityIds])],
  };
}

function buildBriefPrompt(context: SevenDayClinicalContext): string {
  const allowedRecords = [...context.allowlist.values()].slice(0, 40);
  return [
    'Siz ShifoHalqa shifokori uchun 7 kunlik klinik xulosa va bemorga yuboriladigan tahrirlanuvchi javob qoralamasini tayyorlovchi yordamchisiz.',
    'QAT’IY QOIDALAR:',
    '1. Faqat lotin yozuvidagi sodda va aniq o‘zbek tilida yozing.',
    '2. Tashxis qo‘ymang, dori dozasini o‘zgartirishni mustaqil tavsiya qilmang — klinik qarorni faqat shifokor qabul qiladi.',
    '3. Faqat quyidagi JSON faktlariga tayaning. Yo‘q sonlar yoki yozuvlarni o‘ylab topmang.',
    '4. citedRecordIds massiviga FAQAT allowedRecords ro‘yxatidagi aniq UUID qiymatlarni kiriting. Agar allowedRecords bo‘sh bo‘lsa, citedRecordIds bo‘sh massiv ([]) bo‘lsin.',
    '5. Matn ichida allowedRecords ro‘yxatida bo‘lmagan birorta ham UUID ishlatmang.',
    `DATA: ${JSON.stringify({ metrics: context.metrics, allowedRecords })}`,
  ].join('\n');
}

function toDoctorBriefView(
  row: CachedClinicalBriefRow,
  allowlist?: ReadonlyMap<string, CitedRecordRef>,
): DoctorClinicalBriefView {
  const citedRecords: CitedRecordRef[] = [];
  for (const id of row.citedRecordIds) {
    const ref = allowlist?.get(id.toLowerCase());
    if (ref) citedRecords.push(ref);
  }
  return doctorClinicalBriefViewSchema.parse({
    id: row.id,
    briefDate: row.briefDate,
    level: row.level,
    sourceMode: row.sourceMode,
    provider: row.provider,
    model: row.model,
    deterministicMetrics: row.deterministicMetrics,
    narrativeUz: row.narrativeUz,
    highlights: row.highlights,
    citedRecordIds: row.citedRecordIds,
    citedRecords,
    doctorDraftUz: row.doctorDraftUz,
    approvedReplyUz: row.approvedReplyUz,
    approvedAt: row.approvedAt,
    approvedByDoctorId: row.approvedByDoctorId,
    createdAt: row.createdAt,
  });
}

export type GenerateClinicalBriefResult =
  | {
      ok: true;
      cached: boolean;
      brief: DoctorClinicalBriefView;
      fallbackReason?: BriefFallbackReason;
      rejectedCitationIds?: string[];
    }
  | { ok: false; status: 403 | 404 | 503; error: string };

export async function generateClinicalBrief(
  actor: ClinicalActor,
  options: { forceRefresh?: boolean; maxCacheAgeMinutes?: number } = {},
  deps: ClinicalBriefDependencies = {},
): Promise<GenerateClinicalBriefResult> {
  if (actor.role !== 'doctor' || !actor.doctorId || !actor.patientId) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  const sql = deps.sql !== undefined ? deps.sql : getDatabase();
  if (!sql) return { ok: false, status: 503, error: 'unavailable' };

  const context = await gatherSevenDayClinicalContext(actor, sql);
  if (!context) return { ok: false, status: 404, error: 'not_found' };

  const promptHash = computePromptHash({
    version: briefVersion,
    briefDate: context.briefDate,
    metrics: context.metrics,
    recordIds: [...context.allowlist.keys()].sort(),
  });

  if (!options.forceRefresh) {
    const cached = await findCachedClinicalBrief({
      workspaceId: actor.workspaceId,
      patientId: actor.patientId,
      promptHash,
      maxAgeMinutes: options.maxCacheAgeMinutes,
      sql,
    });
    if (cached) {
      return { ok: true, cached: true, brief: toDoctorBriefView(cached, context.allowlist) };
    }
  }

  let finalOutput: AiClinicalBriefOutput = buildDeterministicSevenDayBrief(context);
  let sourceMode: 'ai' | 'deterministic_fallback' = 'deterministic_fallback';
  let provider: string | null = null;
  let model: string | null = 'deterministic-uz-v1';
  let fallbackReason: BriefFallbackReason | undefined;
  let rejectedCitationIds: string[] | undefined;

  const targets = deps.targets ?? configuredSupervisedAiTargets();
  if (targets.length === 0) {
    fallbackReason = 'unconfigured';
  } else {
    const quota = await reserveAiRequestQuota({ workspaceId: actor.workspaceId, feature: 'clinical_brief', sql });
    if (!quota.allowed) {
      fallbackReason = 'rate_limited';
    } else {
      const prompt = buildBriefPrompt(context);
      const signal = AbortSignal.timeout(briefDeadlineMs);
      const runCompletion = deps.complete
        ? () => deps.complete!(targets, { name: 'clinical_brief_7d', prompt, schema: aiBriefJsonSchema, maxOutputTokens: 1200 }, signal)
        : () => requestSupervisedCompletion(targets, { name: 'clinical_brief_7d', prompt, schema: aiBriefJsonSchema, maxOutputTokens: 1200 }, aiClinicalBriefOutputSchema, signal);

      try {
        const aiResult = await runCompletion();
        if (!aiResult) {
          fallbackReason = 'provider_error';
        } else {
          const citationCheck = validateBriefCitations(
            aiResult.data.citedRecordIds,
            context.allowlist,
            [aiResult.data.narrativeUz, aiResult.data.doctorDraftUz, ...aiResult.data.highlights],
          );
          if (!citationCheck.valid) {
            fallbackReason = 'invalid_citations';
            if (citationCheck.rejectedIds.length > 0) rejectedCitationIds = citationCheck.rejectedIds;
          } else {
            finalOutput = { ...aiResult.data, citedRecordIds: citationCheck.validIds };
            sourceMode = 'ai';
            provider = aiResult.provider;
            model = aiResult.model;
          }
        }
      } catch {
        fallbackReason = 'provider_error';
      }
    }
  }

  const [inserted] = await sql`
    INSERT INTO public.ai_clinical_briefs (
      workspace_id, patient_id, doctor_id, brief_date, source_mode, provider, model,
      deterministic_metrics, narrative_uz, highlights, cited_record_ids, doctor_draft_uz,
      approved_reply_uz, approved_at, approved_by_doctor_id, level, prompt_hash
    )
    VALUES (
      ${actor.workspaceId}, ${actor.patientId}, ${actor.doctorId}::uuid, ${context.briefDate}::date,
      ${sourceMode}, ${provider}, ${model}, ${sql.json(context.metrics)}::jsonb,
      ${finalOutput.narrativeUz}, ${sql.json(finalOutput.highlights)}::jsonb, ${sql.json(finalOutput.citedRecordIds)}::jsonb,
      ${finalOutput.doctorDraftUz}, NULL, NULL, NULL, 0, ${promptHash}
    )
    RETURNING id, to_char(brief_date, 'YYYY-MM-DD') AS "briefDate", source_mode AS "sourceMode", provider, model,
              deterministic_metrics AS "deterministicMetrics", narrative_uz AS "narrativeUz", highlights,
              cited_record_ids AS "citedRecordIds", doctor_draft_uz AS "doctorDraftUz",
              approved_reply_uz AS "approvedReplyUz",
              to_char(approved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "approvedAt",
              approved_by_doctor_id AS "approvedByDoctorId", level, prompt_hash AS "promptHash",
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
  `;

  if (!inserted) return { ok: false, status: 503, error: 'unavailable' };
  const saved = cachedClinicalBriefRowSchema.parse(inserted);
  return {
    ok: true,
    cached: false,
    brief: toDoctorBriefView(saved, context.allowlist),
    ...(fallbackReason ? { fallbackReason } : {}),
    ...(rejectedCitationIds ? { rejectedCitationIds } : {}),
  };
}

export type ApproveClinicalBriefResult =
  | { ok: true; brief: DoctorClinicalBriefView }
  | { ok: false; status: 400 | 403 | 404 | 503; error: string };

/**
 * Doctor-only L4 approval for a 7-day clinical brief reply.
 * Only doctor approval promotes `level` to 4, populates `approved_reply_uz`, and records an audit event atomically.
 */
export async function approveClinicalBriefReply(
  actor: ClinicalActor,
  input: { briefId: string; replyUz: string },
  deps: Pick<ClinicalBriefDependencies, 'sql'> = {},
): Promise<ApproveClinicalBriefResult> {
  if (actor.role !== 'doctor' || !actor.doctorId || !actor.patientId) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  const parsed = z.strictObject({
    briefId: z.uuid(),
    replyUz: z.string().trim().min(5).max(1200),
  }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, status: 400, error: 'invalid' };
  }

  const sql = deps.sql !== undefined ? deps.sql : getDatabase();
  if (!sql) return { ok: false, status: 503, error: 'unavailable' };

  const [updated] = await sql`
    WITH updated AS (
      UPDATE public.ai_clinical_briefs AS brief
      SET approved_reply_uz = ${parsed.data.replyUz},
          approved_at = CURRENT_TIMESTAMP,
          approved_by_doctor_id = ${actor.doctorId}::uuid,
          level = 4
      FROM public.patients AS patient
      WHERE brief.workspace_id = ${actor.workspaceId}
        AND brief.id = ${parsed.data.briefId}
        AND brief.patient_id = ${actor.patientId}
        AND patient.workspace_id = brief.workspace_id
        AND patient.id = brief.patient_id
        AND patient.doctor_id = ${actor.doctorId}::uuid
      RETURNING brief.id,
                brief.workspace_id,
                brief.patient_id,
                to_char(brief.brief_date, 'YYYY-MM-DD') AS "briefDate",
                brief.source_mode AS "sourceMode",
                brief.provider,
                brief.model,
                brief.deterministic_metrics AS "deterministicMetrics",
                brief.narrative_uz AS "narrativeUz",
                brief.highlights,
                brief.cited_record_ids AS "citedRecordIds",
                brief.doctor_draft_uz AS "doctorDraftUz",
                brief.approved_reply_uz AS "approvedReplyUz",
                to_char(brief.approved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "approvedAt",
                brief.approved_by_doctor_id AS "approvedByDoctorId",
                brief.level,
                brief.prompt_hash AS "promptHash",
                to_char(brief.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
    ), audited AS (
      INSERT INTO public.audit_events (workspace_id, brief_id, actor_id, action, metadata)
      SELECT workspace_id,
             id,
             ${actor.doctorId}::uuid,
             'approve_clinical_brief',
             jsonb_build_object('patientId', patient_id, 'sourceMode', "sourceMode", 'level', 4)
      FROM updated
    )
    SELECT id, "briefDate", "sourceMode", provider, model, "deterministicMetrics",
           "narrativeUz", highlights, "citedRecordIds", "doctorDraftUz",
           "approvedReplyUz", "approvedAt", "approvedByDoctorId", level, "promptHash", "createdAt"
    FROM updated
  `;

  if (!updated) return { ok: false, status: 404, error: 'not_found' };
  const saved = cachedClinicalBriefRowSchema.parse(updated);
  return { ok: true, brief: toDoctorBriefView(saved) };
}

/**
 * Role-scoped latest clinical brief reader:
 * - Doctor: full latest brief including draft, narrative, highlights, citedRecordIds, and approval status.
 * - Patient / Individual: strictly L4 doctor-approved reply ONLY (`approvedReplyUz`, `approvedAt`, `briefDate`, `level: 4`).
 *   Unapproved drafts (`level = 0`), internal narratives, citations, and notes are NEVER exposed.
 * - Caregiver: always returns `null`.
 */
export async function readLatestClinicalBrief(
  actor: ClinicalActor,
  deps: Pick<ClinicalBriefDependencies, 'sql'> = {},
): Promise<DoctorClinicalBriefView | PatientClinicalBriefView | null> {
  if (actor.role === 'caregiver' || !actor.patientId) return null;
  const sql = deps.sql !== undefined ? deps.sql : getDatabase();
  if (!sql) return null;

  if (isPatientSideRole(actor.role)) {
    const [row] = await sql`
      SELECT brief.id, to_char(brief.brief_date, 'YYYY-MM-DD') AS "briefDate", brief.level,
             brief.approved_reply_uz AS "approvedReplyUz",
             to_char(brief.approved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "approvedAt"
      FROM public.ai_clinical_briefs AS brief
      JOIN public.patients AS patient ON patient.workspace_id = brief.workspace_id AND patient.id = brief.patient_id
      WHERE brief.workspace_id = ${actor.workspaceId} AND brief.patient_id = ${actor.patientId}
        AND patient.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
        AND brief.level = 4 AND brief.approved_reply_uz IS NOT NULL AND brief.approved_at IS NOT NULL
      ORDER BY brief.approved_at DESC, brief.created_at DESC, brief.id DESC
      LIMIT 1
    `;
    if (!row) return null;
    const parsed = patientBriefRowSchema.safeParse(row);
    return parsed.success ? patientClinicalBriefViewSchema.parse(parsed.data) : null;
  }

  if (actor.role !== 'doctor' || !actor.doctorId) return null;

  const [row] = await sql`
    SELECT brief.id, to_char(brief.brief_date, 'YYYY-MM-DD') AS "briefDate", brief.source_mode AS "sourceMode",
           brief.provider, brief.model, brief.deterministic_metrics AS "deterministicMetrics",
           brief.narrative_uz AS "narrativeUz", brief.highlights, brief.cited_record_ids AS "citedRecordIds",
           brief.doctor_draft_uz AS "doctorDraftUz", brief.approved_reply_uz AS "approvedReplyUz",
           to_char(brief.approved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "approvedAt",
           brief.approved_by_doctor_id AS "approvedByDoctorId", brief.level, brief.prompt_hash AS "promptHash",
           to_char(brief.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
    FROM public.ai_clinical_briefs AS brief
    JOIN public.patients AS patient ON patient.workspace_id = brief.workspace_id AND patient.id = brief.patient_id
    WHERE brief.workspace_id = ${actor.workspaceId} AND brief.patient_id = ${actor.patientId} AND patient.doctor_id = ${actor.doctorId}::uuid
    ORDER BY brief.created_at DESC, brief.id DESC
    LIMIT 1
  `;
  if (!row) return null;
  const parsed = cachedClinicalBriefRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const context = await gatherSevenDayClinicalContext(actor, sql).catch(() => null);
  return toDoctorBriefView(parsed.data, context?.allowlist);
}
