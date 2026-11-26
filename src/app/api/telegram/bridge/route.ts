import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getActivityDashboard, saveStepCount } from '../../../../lib/activity-store';
import { defaultDailyStepGoal, stepCountSchema } from '../../../../lib/adherence';
import { readLatestClinicalBrief } from '../../../../lib/ai/clinical-brief-ai';
import { evidenceJsonInput, prepareEvidence } from '../../../../lib/clinical-inputs';
import { getClinicalView, getTaskContext, saveEvidence } from '../../../../lib/clinical-store';
import { countOpenClinicalAttention, evaluateBpZone } from '../../../../lib/clinical-triage';
import { isPatientSideRole, type ClinicalActor, type MissedReason } from '../../../../lib/clinical-types';
import { getDatabase } from '../../../../lib/db';
import { readExercisePlan } from '../../../../lib/exercise-store';
import { exerciseCatalog } from '../../../../lib/pose/diagnostics';
import { readRequestJson } from '../../../../lib/request-body';
import { BP_DIASTOLIC_MAX, BP_DIASTOLIC_MIN, BP_SYSTOLIC_MAX, BP_SYSTOLIC_MIN } from '../../../../lib/rules/evaluate-rules';
import {
  parseTelegramChatIdHeader,
  resolveTelegramLinkedChat,
  verifyTelegramBotServiceSecret,
} from '../../../../lib/telegram-auth';
import { setPatientTelegramDetails } from '../../../../lib/telegram-store';

const noStoreHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
};

const tashkentDateFormat = new Intl.DateTimeFormat('sv-SE', {
  dateStyle: 'short',
  timeZone: 'Asia/Tashkent',
});

const bridgePostSchema = z.union([
  z.strictObject({
    action: z.literal('medication'),
    taskId: z.uuid(),
    status: z.enum(['taken', 'missed']),
    reason: z.enum(['out_of_supply', 'side_effects', 'forgot', 'other']).optional(),
  }),
  z.strictObject({
    action: z.literal('vitals'),
    systolic: z.number().int().min(BP_SYSTOLIC_MIN).max(BP_SYSTOLIC_MAX),
    diastolic: z.number().int().min(BP_DIASTOLIC_MIN).max(BP_DIASTOLIC_MAX),
    chestPain: z.boolean().optional().default(false),
  }).refine((v) => v.systolic > v.diastolic, {
    path: ['systolic'],
    message: 'Yuqori bosim pastki bosimdan katta bo‘lishi kerak',
  }),
  z.strictObject({
    action: z.literal('steps'),
    count: stepCountSchema,
  }),
  z.strictObject({
    action: z.literal('set_details'),
    enabled: z.boolean(),
  }),
]);

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: noStoreHeaders });
}

function buildPatientSnapshot(
  actor: ClinicalActor,
  patientName: string,
  detailsEnabled: boolean,
) {
  return Promise.all([
    getClinicalView(actor),
    getActivityDashboard(actor).catch(() => null),
    readLatestClinicalBrief(actor).catch(() => null),
    readExercisePlan(actor).catch(() => null),
  ]).then(([view, activity, brief, exercisePlan]) => {
    const today = activity?.localDate ?? tashkentDateFormat.format(new Date());
    const todayTasks = view.tasks.filter((task) => task.date === today);

    const doses = todayTasks
      .filter((task) => task.type === 'medication')
      .map((task) => {
        let reason: MissedReason | null = null;
        if (task.evidence?.payload.kind === 'medication' && task.evidence.payload.status === 'missed') {
          reason = task.evidence.payload.reason;
        }
        return {
          taskId: task.id,
          title: task.title,
          strength: task.strength ?? null,
          strengthUnit: task.strengthUnit ?? 'mg',
          dueTime: task.dueTime,
          status: (task.status === 'taken' || task.status === 'missed' ? task.status : 'pending') as
            | 'pending'
            | 'taken'
            | 'missed',
          reason,
          boxDone: task.boxEvidence !== null,
        };
      })
      .sort((a, b) => a.dueTime.localeCompare(b.dueTime) || a.title.localeCompare(b.title));

    const vitals = todayTasks.find((task) => task.type === 'vitals') ?? null;
    const vitalsPayload =
      vitals?.evidence?.payload.kind === 'vitals' ? vitals.evidence.payload : null;
    const vitalsZone = vitalsPayload
      ? evaluateBpZone({
          systolic: vitalsPayload.systolic,
          diastolic: vitalsPayload.diastolic,
          chestPain: vitalsPayload.chestPain,
          targets: view.plan?.targets ?? null,
        })
      : null;

    const stepGoal = activity?.dailyStepGoal ?? view.plan?.dailyStepGoal ?? defaultDailyStepGoal;
    const todayStepCount = activity?.steps?.count ?? 0;
    const trend = activity?.stepTrend ?? [];
    const weekTotal = trend.reduce((sum, item) => sum + (item.effectiveCount ?? 0), 0);
    const daysRecorded = trend.filter((item) => item.effectiveCount !== null).length;

    const approvedBrief =
      brief && !('doctorDraftUz' in brief)
        ? {
            id: brief.id,
            briefDate: brief.briefDate,
            approvedReplyUz: brief.approvedReplyUz,
            approvedAt: brief.approvedAt,
          }
        : null;

    const replies: Array<{
      taskTitle: string;
      decision: 'approved' | 'retake';
      reply: string;
      reviewedAt: string;
    }> = [];
    for (const task of view.tasks) {
      if (task.evidence?.review) {
        replies.push({
          taskTitle: task.title,
          decision: task.evidence.review.decision,
          reply: task.evidence.review.reply,
          reviewedAt: task.evidence.review.reviewedAt,
        });
      }
    }
    replies.sort((a, b) => Date.parse(b.reviewedAt) - Date.parse(a.reviewedAt));

    return {
      role: actor.role,
      patientName,
      detailsEnabled,
      isDemo: Boolean(actor.isDemo),
      date: today,
      doses,
      vitalsTask: vitals
        ? {
            taskId: vitals.id,
            dueTime: vitals.dueTime,
            status: vitals.status === 'recorded' ? ('recorded' as const) : ('pending' as const),
            systolic: vitalsPayload?.systolic ?? null,
            diastolic: vitalsPayload?.diastolic ?? null,
            chestPain: vitalsPayload?.chestPain ?? false,
            zoneLabelUz: vitalsZone?.labelUz ?? null,
            zoneTone: vitalsZone?.tone ?? null,
          }
        : null,
      bpTargets: view.plan?.targets ?? null,
      steps: {
        todayCount: todayStepCount,
        goal: stepGoal,
        achieved: todayStepCount >= stepGoal,
        source: activity?.steps?.source ?? null,
        weekTotal,
        daysRecorded,
      },
      adherence: {
        today: activity?.adherence.today ?? { scheduled: 0, completed: 0, answered: 0 },
        week: activity?.adherence.week ?? { scheduled: 0, completed: 0, answered: 0 },
        byMedication: activity?.medicationAdherence ?? [],
      },
      approvedBrief,
      latestDoctorReply: replies[0] ?? null,
      exercisePlan: exercisePlan
        ? {
            movement: exercisePlan.movement,
            titleUz: exerciseCatalog[exercisePlan.movement].title,
            targetReps: exercisePlan.targetReps,
            targetAngle: exercisePlan.targetAngle,
          }
        : null,
      doctorSummary: null,
    };
  });
}

async function buildDoctorSnapshot(actor: ClinicalActor, doctorName: string) {
  const today = tashkentDateFormat.format(new Date());
  const sql = getDatabase();
  if (!sql || !actor.doctorId) {
    return null;
  }

  const patients = await sql`
    SELECT p.id, p.name
    FROM public.patients AS p
    WHERE p.workspace_id = ${actor.workspaceId}
      AND p.doctor_id = ${actor.doctorId}
    ORDER BY p.name ASC, p.id ASC
  `;

  let openUrgent = 0;
  let openWarning = 0;
  for (const row of patients) {
    const pid = (row as { id: string }).id;
    const scoped: ClinicalActor = { ...actor, patientId: pid };
    const view = await getClinicalView(scoped);
    const attention = countOpenClinicalAttention({ view });
    openUrgent += attention.openUrgent;
    openWarning += attention.openWarning;
  }

  return {
    role: 'doctor' as const,
    patientName: doctorName,
    detailsEnabled: false,
    isDemo: Boolean(actor.isDemo),
    date: today,
    doses: [],
    vitalsTask: null,
    bpTargets: null,
    steps: null,
    adherence: null,
    approvedBrief: null,
    latestDoctorReply: null,
    exercisePlan: null,
    doctorSummary: {
      doctorName,
      patientCount: patients.length,
      openFlags: openUrgent + openWarning,
      openUrgent,
      openWarning,
    },
  };
}

async function authenticateBridge(request: Request) {
  const secretCheck = verifyTelegramBotServiceSecret(request);
  if (!secretCheck.ok) {
    return { ok: false as const, response: json({ error: secretCheck.error }, secretCheck.status) };
  }
  const chatId = parseTelegramChatIdHeader(request);
  if (!chatId) {
    return { ok: false as const, response: json({ error: 'invalid_chat_id' }, 400) };
  }
  const linked = await resolveTelegramLinkedChat(chatId);
  if (linked === null) {
    return { ok: false as const, response: json({ error: 'not_linked' }, 404) };
  }
  if (!linked.ok) {
    return { ok: false as const, response: json({ error: linked.error }, linked.status) };
  }
  return { ok: true as const, linked };
}

export async function GET(request: Request) {
  try {
    const auth = await authenticateBridge(request);
    if (!auth.ok) return auth.response;
    const { linked } = auth;

    if (linked.actor.role === 'doctor') {
      const doctorData = await buildDoctorSnapshot(linked.actor, linked.doctorName ?? 'Shifokor');
      if (!doctorData) return json({ error: 'unavailable' }, 503);
      return json(doctorData, 200);
    }

    const patientData = await buildPatientSnapshot(
      linked.actor,
      linked.patientName ?? 'Bemor',
      linked.detailsEnabled,
    );
    return json(patientData, 200);
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authenticateBridge(request);
    if (!auth.ok) return auth.response;
    const { linked } = auth;

    if (!isPatientSideRole(linked.actor.role) || !linked.actor.patientId) {
      return json({ error: 'forbidden' }, 403);
    }

    const body = await readRequestJson(request, 4096);
    if (!body.ok) {
      return json({ error: body.status === 413 ? 'too_large' : 'invalid' }, body.status);
    }

    const parsed = bridgePostSchema.safeParse(body.body);
    if (!parsed.success) {
      return json({ error: 'invalid' }, 400);
    }

    const input = parsed.data;
    if (input.action === 'set_details') {
      const updated = await setPatientTelegramDetails(linked.actor, input.enabled);
      if (!updated) return json({ error: 'not_linked' }, 404);
      return json({ status: 'saved', detailsEnabled: updated.detailsEnabled }, 200);
    }

    if (input.action === 'steps') {
      const status = await saveStepCount(linked.actor, { count: input.count, source: 'self_report' });
      if (status === 'not_found') return json({ error: 'not_found' }, 404);
      const dashboard = await getActivityDashboard(linked.actor).catch(() => null);
      const goal = dashboard?.dailyStepGoal ?? defaultDailyStepGoal;
      return json({
        status,
        count: input.count,
        goal,
        achieved: input.count >= goal,
      }, 200);
    }

    if (input.action === 'medication') {
      const context = await getTaskContext(linked.actor, input.taskId);
      if (!context || context.type !== 'medication') {
        return json({ error: 'not_found' }, 404);
      }
      const evidencePayload =
        input.status === 'taken'
          ? { taskId: input.taskId, payload: { kind: 'medication' as const, status: 'taken' as const } }
          : {
              taskId: input.taskId,
              payload: {
                kind: 'medication' as const,
                status: 'missed' as const,
                reason: input.reason ?? 'other',
              },
            };
      const evidence = prepareEvidence(evidencePayload, context);
      if (!evidence) return json({ error: 'invalid' }, 400);
      const result = await saveEvidence(linked.actor, evidence);
      if (result === 'not_found') return json({ error: 'not_found' }, 404);
      const snapshot = await buildPatientSnapshot(
        linked.actor,
        linked.patientName ?? 'Bemor',
        linked.detailsEnabled,
      );
      return json({
        status: result,
        flagColor: evidence.flag?.color ?? null,
        snapshot,
      }, 200);
    }

    // action === 'vitals'
    const view = await getClinicalView(linked.actor);
    const today = tashkentDateFormat.format(new Date());
    const vitalsTask = view.tasks.find((task) => task.date === today && task.type === 'vitals');
    if (!vitalsTask) {
      return json({ error: 'not_found' }, 404);
    }
    const parsedCmd = evidenceJsonInput.safeParse({
      taskId: vitalsTask.id,
      systolic: input.systolic,
      diastolic: input.diastolic,
      chestPain: input.chestPain,
    });
    if (!parsedCmd.success) {
      return json({ error: 'invalid' }, 400);
    }
    const context = await getTaskContext(linked.actor, vitalsTask.id);
    const evidence = context ? prepareEvidence(parsedCmd.data.command, context) : null;
    if (!evidence) return json({ error: 'not_found' }, 404);
    const result = await saveEvidence(linked.actor, evidence);
    if (result === 'not_found') return json({ error: 'not_found' }, 404);
    const zone = evaluateBpZone({
      systolic: input.systolic,
      diastolic: input.diastolic,
      chestPain: input.chestPain,
      targets: context?.plan.targets ?? null,
    });
    return json({
      status: result,
      systolic: input.systolic,
      diastolic: input.diastolic,
      chestPain: input.chestPain,
      zone,
      flagColor: evidence.flag?.color ?? null,
    }, 200);
  } catch {
    return json({ error: 'unavailable' }, 503);
  }
}
