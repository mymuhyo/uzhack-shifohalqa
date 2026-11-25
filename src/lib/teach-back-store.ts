import { z } from 'zod';
import { reserveAiRequestQuota } from './ai/ai-quota-cache';
import { requestSupervisedCompletion, type SupervisedCompletionResult } from './ai/completion-fallback';
import { configuredSupervisedAiTargets, type SupervisedAiTarget } from './ai/provider-config';
import { isPatientSideRole, type ClinicalActor } from './clinical-types';
import { getDatabase, type SqlAdapter } from './db';

const simplifyDeadlineMs = 8_000;

export const teachBackStrengthUnitSchema = z.enum(['mg', 'mcg', 'g', 'iu']);

export const teachBackOptionSchema = z.strictObject({
  id: z.enum(['a', 'b', 'c']),
  labelUz: z.string().trim().min(1).max(240),
});

export const teachBackQuestionSchema = z.strictObject({
  id: z.enum(['med_schedule', 'safety_target']),
  promptUz: z.string().trim().min(10).max(400),
  options: z.array(teachBackOptionSchema).length(3),
  correctOptionId: z.enum(['a', 'b', 'c']),
  explanationUz: z.string().trim().min(10).max(400),
  requiredFacts: z.array(z.string().min(1)).max(8),
});

export const publicTeachBackQuestionSchema = teachBackQuestionSchema.omit({
  correctOptionId: true,
  explanationUz: true,
  requiredFacts: true,
});

export type TeachBackQuestion = z.infer<typeof teachBackQuestionSchema>;
export type PublicTeachBackQuestion = z.infer<typeof publicTeachBackQuestionSchema>;

export const teachBackAnswerInputSchema = z.strictObject({
  questionId: z.enum(['med_schedule', 'safety_target']),
  selectedOptionId: z.enum(['a', 'b', 'c']),
});

export const teachBackSubmissionSchema = z.strictObject({
  answers: z.array(teachBackAnswerInputSchema).min(1).max(2),
});

export type TeachBackSubmissionInput = z.infer<typeof teachBackSubmissionSchema>;

export const teachBackPlanMedicationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/),
  strength: z.number().positive().nullable(),
  strengthUnit: teachBackStrengthUnitSchema.catch('mg'),
});

export const teachBackPlanContextSchema = z.object({
  planId: z.uuid(),
  medications: z.array(teachBackPlanMedicationSchema),
  targets: z.object({
    maxSystolic: z.number(),
    maxDiastolic: z.number(),
    warnSystolic: z.number(),
    warnDiastolic: z.number(),
    minSystolic: z.number().optional(),
    minDiastolic: z.number().optional(),
  }),
  supplyFollowUp: z.boolean(),
});

export type TeachBackPlanContext = z.infer<typeof teachBackPlanContextSchema>;

export const teachBackAttemptSummarySchema = z.object({
  id: z.uuid(),
  planId: z.uuid().nullable(),
  activityDate: z.iso.date(),
  score: z.int().min(0),
  totalQuestions: z.int().min(1),
  passed: z.boolean(),
  createdAt: z.iso.datetime(),
});

export type TeachBackAttemptSummary = z.infer<typeof teachBackAttemptSummarySchema>;

export type TeachBackQuestionFeedback = {
  questionId: TeachBackQuestion['id'];
  selectedOptionId: 'a' | 'b' | 'c';
  correct: boolean;
  explanationUz: string;
};

export type TeachBackStatus = {
  hasPlan: boolean;
  planId: string | null;
  sourceMode: 'ai' | 'deterministic_fallback';
  questions: PublicTeachBackQuestion[];
  latestAttempt: TeachBackAttemptSummary | null;
  attemptsCount: number;
};

export type TeachBackDependencies = {
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
  ) => Promise<SupervisedCompletionResult<{ prompts: Array<{ id: 'med_schedule' | 'safety_target'; promptUz: string }> }> | null>;
};

const aiSimplifyOutputSchema = z.strictObject({
  prompts: z.array(z.strictObject({
    id: z.enum(['med_schedule', 'safety_target']),
    promptUz: z.string().trim().min(12).max(360),
  })).min(1).max(2),
});

const aiSimplifyJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['prompts'],
  properties: {
    prompts: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'promptUz'],
        properties: {
          id: { type: 'string', enum: ['med_schedule', 'safety_target'] },
          promptUz: { type: 'string' },
        },
      },
    },
  },
};

const unitDisplayUz: Record<z.infer<typeof teachBackStrengthUnitSchema>, string> = {
  mg: 'mg',
  mcg: 'mkg',
  g: 'g',
  iu: 'IU',
};

const planRowSchema = z.object({
  planId: z.uuid(),
  targets: z.object({
    maxSystolic: z.number(),
    maxDiastolic: z.number(),
    warnSystolic: z.number(),
    warnDiastolic: z.number(),
    minSystolic: z.number().optional(),
    minDiastolic: z.number().optional(),
  }),
  supplyFollowUp: z.boolean(),
});

const planMedRowSchema = z.object({
  title: z.string(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/),
  strength: z.number().nullable(),
  strengthUnit: teachBackStrengthUnitSchema.catch('mg'),
});

const attemptCountRowSchema = z.object({
  attemptsCount: z.coerce.number().int().min(0),
});

function shiftHour(hhmm: string, deltaHours: number): string {
  const [rawH, rawM] = hhmm.split(':').map(Number);
  const nextHour = ((rawH ?? 8) + deltaHours + 24) % 24;
  return `${String(nextHour).padStart(2, '0')}:${String(rawM ?? 0).padStart(2, '0')}`;
}

/**
 * Deterministic generator producing 1–2 compact plan-grounded Uzbek comprehension questions
 * tied strictly to the patient's assigned medications, strengths/units, times, and BP targets.
 */
export function buildTeachBackQuestions(plan: TeachBackPlanContext): TeachBackQuestion[] {
  const questions: TeachBackQuestion[] = [];
  const primaryMed = plan.medications[0];

  if (primaryMed) {
    const sameDrugTimes = [
      ...new Set(
        plan.medications
          .filter((item) => item.title.toLowerCase() === primaryMed.title.toLowerCase())
          .map((item) => item.dueTime),
      ),
    ];
    const scheduleLabel = sameDrugTimes.join(' va ');
    const strengthLabel = primaryMed.strength !== null
      ? ` (${primaryMed.strength} ${unitDisplayUz[primaryMed.strengthUnit]})`
      : '';
    const wrongTime1 = shiftHour(primaryMed.dueTime, 6);
    const wrongTime2 = shiftHour(primaryMed.dueTime, 12);

    const correctLabel = `Har kuni ${scheduleLabel} da, rejadagidek${strengthLabel ? ` ${primaryMed.strength} ${unitDisplayUz[primaryMed.strengthUnit]}` : ''}`;
    const distractor1 = `Faqat o‘zimni yomon his qilsam, taxminan ${wrongTime1} da`;
    const distractor2 = `Haftada bir marta ${wrongTime2} da ikki hissa miqdorda`;

    const requiredFacts = [primaryMed.title];
    if (primaryMed.strength !== null) requiredFacts.push(String(primaryMed.strength));

    questions.push({
      id: 'med_schedule',
      promptUz: `Rejangizdagi ${primaryMed.title}${strengthLabel} dorisini qachon va qanday ichishingiz kerak?`,
      options: [
        { id: 'a', labelUz: distractor1 },
        { id: 'b', labelUz: correctLabel },
        { id: 'c', labelUz: distractor2 },
      ],
      correctOptionId: 'b',
      explanationUz: `To‘g‘ri javob: ${primaryMed.title}${strengthLabel} har kuni ${scheduleLabel} da shifokor rejasiga muvofiq ichiladi.`,
      requiredFacts,
    });
  }

  const { maxSystolic, maxDiastolic, minSystolic, minDiastolic } = plan.targets;
  const lowBpClause = minSystolic !== undefined && minDiastolic !== undefined
    ? ` yoki ${minSystolic}/${minDiastolic} mmHg dan pastga tushsa`
    : '';
  const requiredTargetFacts = [String(maxSystolic), String(maxDiastolic)];
  if (minSystolic !== undefined) requiredTargetFacts.push(String(minSystolic));

  questions.push({
    id: 'safety_target',
    promptUz: `Qon bosimingiz ${maxSystolic}/${maxDiastolic} mmHg ga yetsa${lowBpClause} yoki ko‘krak og‘rig‘i paydo bo‘lsa, nima qilasiz?`,
    options: [
      { id: 'a', labelUz: 'Qaydni ilovaga kiritib shifokorga yuboraman, shoshilinch holatda darhol 103 ga qo‘ng‘iroq qilaman' },
      { id: 'b', labelUz: 'Shifokorga aytmasdan dori dozasini o‘zim o‘zgartiraman' },
      { id: 'c', labelUz: 'Hech narsa qilmayman va bir necha kun kutaman' },
    ],
    correctOptionId: 'a',
    explanationUz: `Bosim ${maxSystolic}/${maxDiastolic} mmHg chegarasiga yetganda${lowBpClause} qayd shifokor navbatiga yuboriladi; ko‘krak og‘rig‘i yoki og‘ir belgilarda 103 ga murojaat qiling.`,
    requiredFacts: requiredTargetFacts,
  });

  return questions.slice(0, 2);
}

/**
 * Optional AI plain-language simplification for Teach-Back prompts.
 * Preserves every required clinical fact token (drug name, strength, BP thresholds);
 * automatically falls back to deterministic Uzbek prompts on outage, quota limit, or fact drift.
 */
export async function simplifyTeachBackQuestionsWithAi(
  workspaceId: string,
  questions: readonly TeachBackQuestion[],
  deps: TeachBackDependencies = {},
): Promise<{ questions: TeachBackQuestion[]; sourceMode: 'ai' | 'deterministic_fallback' }> {
  const targets = deps.targets ?? configuredSupervisedAiTargets();
  if (targets.length === 0 || questions.length === 0) {
    return { questions: [...questions], sourceMode: 'deterministic_fallback' };
  }

  const quota = await reserveAiRequestQuota({
    workspaceId,
    feature: 'teach_back',
    workspaceLimit: 30,
    sql: deps.sql,
  });
  if (!quota.allowed) {
    return { questions: [...questions], sourceMode: 'deterministic_fallback' };
  }

  const prompt = [
    'Quyidagi bemor uchun 1–2 ta tekshiruv savolini yanada tushunarli, yumshoq va sodda lotin o‘zbek tilida qayta yozing.',
    'MUHIM: dori nomi, kuchi va qon bosimi sonlarini AYNAN saqlang, yangi tibbiy tavsiya yoki tashxis qo‘shmang.',
    JSON.stringify(questions.map((q) => ({ id: q.id, promptUz: q.promptUz, requiredFacts: q.requiredFacts }))),
  ].join('\n');

  const signal = AbortSignal.timeout(simplifyDeadlineMs);
  try {
    const result = deps.complete
      ? await deps.complete(
          targets,
          { name: 'teach_back_simplify', prompt, schema: aiSimplifyJsonSchema, maxOutputTokens: 512 },
          signal,
        )
      : await requestSupervisedCompletion(
          targets,
          { name: 'teach_back_simplify', prompt, schema: aiSimplifyJsonSchema, maxOutputTokens: 512 },
          aiSimplifyOutputSchema,
          signal,
        );

    if (!result) {
      return { questions: [...questions], sourceMode: 'deterministic_fallback' };
    }

    const byId = new Map(result.data.prompts.map((item) => [item.id, item.promptUz]));
    const updated: TeachBackQuestion[] = [];
    for (const q of questions) {
      const candidate = byId.get(q.id);
      if (!candidate) {
        return { questions: [...questions], sourceMode: 'deterministic_fallback' };
      }
      const lower = candidate.toLowerCase();
      const preservesAllFacts = q.requiredFacts.every((fact) => lower.includes(fact.toLowerCase()));
      if (!preservesAllFacts) {
        return { questions: [...questions], sourceMode: 'deterministic_fallback' };
      }
      updated.push({ ...q, promptUz: candidate });
    }
    return { questions: updated, sourceMode: 'ai' };
  } catch {
    return { questions: [...questions], sourceMode: 'deterministic_fallback' };
  }
}

export function toPublicTeachBackQuestions(questions: readonly TeachBackQuestion[]): PublicTeachBackQuestion[] {
  return questions.map(({ id, promptUz, options }) => ({ id, promptUz, options }));
}

export function gradeTeachBackSubmission(
  questions: readonly TeachBackQuestion[],
  answers: TeachBackSubmissionInput['answers'],
): {
  ok: true;
  score: number;
  totalQuestions: number;
  passed: boolean;
  feedback: TeachBackQuestionFeedback[];
  persistedAnswers: Array<{ questionId: string; selectedOptionId: string; correct: boolean }>;
} | { ok: false; error: 'invalid' } {
  if (questions.length === 0) return { ok: false, error: 'invalid' };
  const byQuestionId = new Map<string, 'a' | 'b' | 'c'>();
  for (const answer of answers) {
    if (byQuestionId.has(answer.questionId)) return { ok: false, error: 'invalid' };
    byQuestionId.set(answer.questionId, answer.selectedOptionId);
  }
  if (byQuestionId.size !== questions.length) return { ok: false, error: 'invalid' };

  let score = 0;
  const feedback: TeachBackQuestionFeedback[] = [];
  const persistedAnswers: Array<{ questionId: string; selectedOptionId: string; correct: boolean }> = [];

  for (const question of questions) {
    const selected = byQuestionId.get(question.id);
    if (!selected) return { ok: false, error: 'invalid' };
    const correct = selected === question.correctOptionId;
    if (correct) score += 1;
    feedback.push({
      questionId: question.id,
      selectedOptionId: selected,
      correct,
      explanationUz: question.explanationUz,
    });
    persistedAnswers.push({
      questionId: question.id,
      selectedOptionId: selected,
      correct,
    });
  }

  const totalQuestions = questions.length;
  return {
    ok: true,
    score,
    totalQuestions,
    passed: score === totalQuestions,
    feedback,
    persistedAnswers,
  };
}

async function loadActivePlanForTeachBack(
  actor: ClinicalActor,
  sql: SqlAdapter,
): Promise<TeachBackPlanContext | null> {
  const [planRaw] = await sql`
    SELECT plan.id AS "planId",
           plan.vitals_target AS targets,
           plan.supply_follow_up AS "supplyFollowUp"
    FROM public.plans AS plan
    WHERE plan.workspace_id = ${actor.workspaceId}
      AND plan.patient_id = ${actor.patientId}
      AND plan.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
    LIMIT 1
  `;
  if (!planRaw) return null;
  const plan = planRowSchema.parse(planRaw);

  const medRowsRaw = await sql`
    SELECT item.title,
           left(item.due_time::text, 5) AS "dueTime",
           item.box_strength_mg::float8 AS strength,
           COALESCE(item.strength_unit, 'mg') AS "strengthUnit"
    FROM public.plan_items AS item
    WHERE item.workspace_id = ${actor.workspaceId}
      AND item.plan_id = ${plan.planId}
      AND item.type = 'medication'
    ORDER BY item.sort_order ASC, item.due_time ASC, item.id ASC
  `;
  const medications = z.array(planMedRowSchema).parse(medRowsRaw);

  return {
    planId: plan.planId,
    medications,
    targets: plan.targets,
    supplyFollowUp: plan.supplyFollowUp,
  };
}

export async function getTeachBackStatus(
  actor: ClinicalActor,
  options: { simplifyWithAi?: boolean } = {},
  deps: TeachBackDependencies = {},
): Promise<TeachBackStatus | null> {
  if (actor.role === 'caregiver' || (actor.role === 'doctor' && !actor.doctorId) || !actor.patientId) {
    return null;
  }
  const sql = deps.sql !== undefined ? deps.sql : getDatabase();
  if (!sql) return null;

  const plan = await loadActivePlanForTeachBack(actor, sql);
  const [latestRows, countRows] = await Promise.all([
    sql`
      SELECT attempt.id,
             attempt.plan_id AS "planId",
             to_char(attempt.activity_date, 'YYYY-MM-DD') AS "activityDate",
             attempt.score,
             attempt.total_questions AS "totalQuestions",
             attempt.passed,
             to_char(attempt.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM public.teach_back_attempts AS attempt
      JOIN public.patients AS patient
        ON patient.workspace_id = attempt.workspace_id
       AND patient.id = attempt.patient_id
      WHERE attempt.workspace_id = ${actor.workspaceId}
        AND attempt.patient_id = ${actor.patientId}
        AND patient.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
      ORDER BY attempt.created_at DESC, attempt.id DESC
      LIMIT 1
    `,
    sql`
      SELECT COUNT(*)::int AS "attemptsCount"
      FROM public.teach_back_attempts AS attempt
      JOIN public.patients AS patient
        ON patient.workspace_id = attempt.workspace_id
       AND patient.id = attempt.patient_id
      WHERE attempt.workspace_id = ${actor.workspaceId}
        AND attempt.patient_id = ${actor.patientId}
        AND patient.doctor_id IS NOT DISTINCT FROM ${actor.doctorId}::uuid
    `,
  ]);

  const latestAttempt = latestRows[0] ? teachBackAttemptSummarySchema.parse(latestRows[0]) : null;
  const attemptsCount = countRows[0] ? attemptCountRowSchema.parse(countRows[0]).attemptsCount : 0;

  if (!plan) {
    return {
      hasPlan: false,
      planId: null,
      sourceMode: 'deterministic_fallback',
      questions: [],
      latestAttempt,
      attemptsCount,
    };
  }

  const deterministicQuestions = buildTeachBackQuestions(plan);
  const resolved = options.simplifyWithAi
    ? await simplifyTeachBackQuestionsWithAi(actor.workspaceId, deterministicQuestions, deps)
    : { questions: deterministicQuestions, sourceMode: 'deterministic_fallback' as const };

  return {
    hasPlan: true,
    planId: plan.planId,
    sourceMode: resolved.sourceMode,
    questions: toPublicTeachBackQuestions(resolved.questions),
    latestAttempt,
    attemptsCount,
  };
}

export type SubmitTeachBackResult =
  | {
      ok: true;
      attempt: TeachBackAttemptSummary;
      feedback: TeachBackQuestionFeedback[];
    }
  | { ok: false; status: 400 | 403 | 404 | 503; error: string };

export async function submitTeachBackAttempt(
  actor: ClinicalActor,
  input: TeachBackSubmissionInput,
  deps: Pick<TeachBackDependencies, 'sql'> = {},
): Promise<SubmitTeachBackResult> {
  if (!isPatientSideRole(actor.role) || !actor.patientId) {
    return { ok: false, status: 403, error: 'forbidden' };
  }
  const parsedInput = teachBackSubmissionSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, status: 400, error: 'invalid' };
  }

  const sql = deps.sql !== undefined ? deps.sql : getDatabase();
  if (!sql) return { ok: false, status: 503, error: 'unavailable' };

  const plan = await loadActivePlanForTeachBack(actor, sql);
  if (!plan) return { ok: false, status: 404, error: 'not_found' };

  const questions = buildTeachBackQuestions(plan);
  const graded = gradeTeachBackSubmission(questions, parsedInput.data.answers);
  if (!graded.ok) return { ok: false, status: 400, error: 'invalid' };

  const [savedRaw] = await sql`
    INSERT INTO public.teach_back_attempts (
      workspace_id,
      patient_id,
      plan_id,
      answers,
      score,
      total_questions,
      passed
    )
    VALUES (
      ${actor.workspaceId},
      ${actor.patientId},
      ${plan.planId},
      ${sql.json(graded.persistedAnswers)}::jsonb,
      ${graded.score},
      ${graded.totalQuestions},
      ${graded.passed}
    )
    RETURNING id,
              plan_id AS "planId",
              to_char(activity_date, 'YYYY-MM-DD') AS "activityDate",
              score,
              total_questions AS "totalQuestions",
              passed,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
  `;

  if (!savedRaw) return { ok: false, status: 503, error: 'unavailable' };
  return {
    ok: true,
    attempt: teachBackAttemptSummarySchema.parse(savedRaw),
    feedback: graded.feedback,
  };
}
