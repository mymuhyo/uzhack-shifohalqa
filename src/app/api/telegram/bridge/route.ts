import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getActivityDashboard, saveStepCount } from '../../../../lib/activity-store';
import { stepCountSchema } from '../../../../lib/adherence';
import { evidenceJsonInput, prepareEvidence } from '../../../../lib/clinical-inputs';
import { getClinicalView, getTaskContext, saveEvidence } from '../../../../lib/clinical-store';
import { exerciseDate } from '../../../../lib/exercise-store';
import { mobileJson, readMobileBody } from '../../../../lib/mobile-demo';
import { telegramApprovedBrief, telegramDoses } from '../../../../lib/telegram-patient';
import { getTelegramPatientLink, type TelegramPatientLink } from '../../../../lib/telegram-store';

const actionSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('dose'), taskId: z.uuid(), medicationStatus: z.enum(['taken', 'missed']),
    reason: z.enum(['out_of_supply', 'side_effects', 'forgot', 'other']).optional(),
  }),
  z.strictObject({ action: z.literal('bp'), systolic: z.int(), diastolic: z.int() }),
  z.strictObject({ action: z.literal('steps'), count: stepCountSchema }),
]);

function sha(value: string) {
  return createHash('sha256').update(value).digest();
}

async function requireLink(request: Request): Promise<{ link: TelegramPatientLink } | { response: Response }> {
  const expected = process.env.TELEGRAM_BOT_SERVICE_SECRET?.trim();
  if (!expected || expected.length < 32) return { response: mobileJson({ error: 'unavailable' }, 503) };
  const token = /^Bearer ([^\s]{1,1024})$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token || !timingSafeEqual(sha(token), sha(expected))) return { response: mobileJson({ error: 'unauthorized' }, 401) };
  const rawChat = request.headers.get('x-telegram-chat-id') ?? '';
  const chatId = Number(rawChat);
  if (!/^[1-9]\d{0,15}$/.test(rawChat) || chatId > 4503599627370495) {
    return { response: mobileJson({ error: 'invalid' }, 400) };
  }
  const link = await getTelegramPatientLink(chatId);
  return link ? { link } : { response: mobileJson({ error: 'not_linked' }, 404) };
}

export async function GET(request: Request) {
  try {
    const auth = await requireLink(request);
    if ('response' in auth) return auth.response;
    const { actor, detailsEnabled } = auth.link;
    if (!detailsEnabled) return mobileJson({ detailsEnabled });
    const view = await getClinicalView(actor);
    const [activity, brief] = await Promise.all([getActivityDashboard(actor), telegramApprovedBrief(actor)]);
    return mobileJson({
      detailsEnabled, doses: telegramDoses(view, exerciseDate()),
      adherence: activity?.medicationAdherence ?? [], brief,
    });
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireLink(request);
    if ('response' in auth) return auth.response;
    const { actor, detailsEnabled } = auth.link;
    const raw = await readMobileBody(request);
    if (!raw.ok) return mobileJson({ error: 'invalid' }, raw.status);
    const parsed = actionSchema.safeParse(raw.body);
    if (!parsed.success) return mobileJson({ error: 'invalid' }, 400);
    const input = parsed.data;
    if (input.action === 'steps') {
      const status = await saveStepCount(actor, { count: input.count, source: 'self_report' });
      return status === 'not_found' ? mobileJson({ error: status }, 404) : mobileJson({ status });
    }
    if (input.action === 'dose' && !detailsEnabled) return mobileJson({ error: 'private_mode' }, 403);

    let payload: unknown;
    if (input.action === 'bp') {
      const view = await getClinicalView(actor);
      const task = view.tasks.find((item) => item.type === 'vitals' && item.date === exerciseDate());
      if (!task) return mobileJson({ error: 'not_found' }, 404);
      payload = { taskId: task.id, systolic: input.systolic, diastolic: input.diastolic };
    } else {
      const { taskId, medicationStatus, reason } = input;
      payload = { taskId, medicationStatus, ...(reason ? { reason } : {}) };
    }
    const evidenceInput = evidenceJsonInput.safeParse(payload);
    if (!evidenceInput.success) return mobileJson({ error: 'invalid' }, 400);
    const command = evidenceInput.data.command;
    const task = await getTaskContext(actor, command.taskId);
    if (!task || task.date !== exerciseDate()) return mobileJson({ error: 'not_found' }, 404);
    const evidence = prepareEvidence(command, task);
    if (!evidence) return mobileJson({ error: 'not_found' }, 404);
    const status = await saveEvidence(actor, evidence);
    return status === 'not_found' ? mobileJson({ error: status }, 404) : mobileJson({
      status,
      queued: status === 'saved' && evidence.flag?.ruleKey === 'medication_out_of_supply',
    });
  } catch {
    return mobileJson({ error: 'unavailable' }, 503);
  }
}
