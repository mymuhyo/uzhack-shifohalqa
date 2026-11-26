import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { isPatientSideRole, type ClinicalActor } from './clinical-types';
import { getDatabase } from './db';
import { isDemoEnabled } from './demo-session';
import { ensureDemoWorkspace } from './seed';

const telegramInitDataMaxBytes = 8192;
const telegramInitDataMaxAgeSec = 3600;
const telegramInitDataFutureSkewSec = 60;
const telegramBearerTtlSec = 30 * 60;
const telegramBearerPrefix = 'tgm1.';
const telegramBearerDomain = 'shifohalqa-tg-bearer-v1.';

const telegramUserSchema = z.object({
  id: z.int().min(1).max(Number.MAX_SAFE_INTEGER),
  first_name: z.string().max(128).optional(),
  last_name: z.string().max(128).optional(),
  username: z.string().max(64).optional(),
  language_code: z.string().max(16).optional(),
});

export type TelegramInitDataUser = z.infer<typeof telegramUserSchema>;

export type VerifyInitDataResult =
  | { ok: true; user: TelegramInitDataUser; authDate: number; queryId: string | null }
  | { ok: false; error: 'invalid_init_data' | 'expired_init_data' };

const telegramBearerClaimsSchema = z
  .strictObject({
    v: z.literal(1),
    kind: z.enum(['linked', 'demo']),
    role: z.enum(['patient', 'doctor']),
    workspaceId: z.uuid(),
    actorId: z.uuid(),
    chatId: z.int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
    linkId: z.uuid().optional(),
    isDemo: z.boolean(),
    exp: z.int().positive(),
  })
  .refine(
    (claims) => claims.kind !== 'linked' || (claims.chatId !== undefined && claims.linkId !== undefined),
    { message: 'Linked Telegram token must include chatId and linkId.' },
  );

export type TelegramBearerClaims = z.infer<typeof telegramBearerClaimsSchema>;

export type TelegramBearerActorResult =
  | {
      ok: true;
      kind: 'linked' | 'demo';
      actor: ClinicalActor;
      patientName: string | null;
      doctorName: string | null;
      detailsEnabled: boolean;
      chatId: number | null;
      linkId: string | null;
    }
  | { ok: false; status: 401 | 503; error: 'unauthorized' | 'unavailable' };

const linkedPatientRowSchema = z.object({
  workspaceId: z.uuid(),
  patientId: z.uuid(),
  doctorId: z.uuid().nullable(),
  roleKind: z.enum(['patient', 'individual']),
  patientName: z.string(),
  isDemo: z.boolean(),
  detailsEnabled: z.boolean(),
  linkId: z.uuid(),
  chatId: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});

const linkedDoctorRowSchema = z.object({
  workspaceId: z.uuid(),
  doctorId: z.uuid(),
  doctorName: z.string(),
  isDemo: z.boolean(),
  linkId: z.uuid(),
  chatId: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
});

function getTelegramSigningSecret(): string | null {
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (sessionSecret && sessionSecret.length >= 32) return sessionSecret;
  const serviceSecret = process.env.TELEGRAM_BOT_SERVICE_SECRET?.trim();
  if (serviceSecret && serviceSecret.length >= 32) return serviceSecret;
  return null;
}

export function getTelegramBotToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token && /^[0-9]+:[A-Za-z0-9_-]{30,128}$/.test(token) ? token : null;
}

export function getTelegramBotServiceSecret(): string | null {
  const secret = process.env.TELEGRAM_BOT_SERVICE_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

export function verifyTelegramBotServiceSecret(
  request: Request,
): { ok: true } | { ok: false; status: 401 | 503; error: 'unauthorized' | 'unavailable' } {
  const expected = getTelegramBotServiceSecret();
  if (!expected) return { ok: false, status: 503, error: 'unavailable' };

  const headerSecret = request.headers.get('x-shifo-bot-secret')?.trim() ?? '';
  const authHeader = request.headers.get('authorization')?.trim() ?? '';
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
  const candidate = headerSecret || (bearerMatch ? bearerMatch[1]!.trim() : '');
  if (!candidate) return { ok: false, status: 401, error: 'unauthorized' };

  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  const candidateDigest = createHash('sha256').update(candidate, 'utf8').digest();
  if (!timingSafeEqual(expectedDigest, candidateDigest)) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  return { ok: true };
}

export function parseTelegramChatIdHeader(request: Request): number | null {
  const raw = request.headers.get('x-telegram-chat-id')?.trim() ?? '';
  if (!/^\d{1,16}$/.test(raw)) return null;
  const num = Number(raw);
  return Number.isSafeInteger(num) && num >= 1 && num <= 2 ** 52 - 1 ? num : null;
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): VerifyInitDataResult {
  if (!initData || Buffer.byteLength(initData, 'utf8') > telegramInitDataMaxBytes) {
    return { ok: false, error: 'invalid_init_data' };
  }

  const params = new URLSearchParams(initData);
  const hashes = params.getAll('hash');
  const authDates = params.getAll('auth_date');
  if (hashes.length !== 1 || authDates.length !== 1) {
    return { ok: false, error: 'invalid_init_data' };
  }

  const receivedHex = hashes[0]!.trim();
  const authDateRaw = authDates[0]!.trim();
  if (!/^[0-9a-f]{64}$/i.test(receivedHex) || !/^\d{1,12}$/.test(authDateRaw)) {
    return { ok: false, error: 'invalid_init_data' };
  }

  const authDate = Number(authDateRaw);
  if (!Number.isSafeInteger(authDate) || authDate <= 0) {
    return { ok: false, error: 'invalid_init_data' };
  }

  const pairs: Array<[string, string]> = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    pairs.push([key, value]);
  }
  if (pairs.length === 0) {
    return { ok: false, error: 'invalid_init_data' };
  }

  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken, 'utf8').digest();
  const expectedDigest = createHmac('sha256', secretKey).update(dataCheckString, 'utf8').digest();
  const receivedDigest = Buffer.from(receivedHex, 'hex');
  if (receivedDigest.length !== expectedDigest.length || !timingSafeEqual(receivedDigest, expectedDigest)) {
    return { ok: false, error: 'invalid_init_data' };
  }

  if (authDate < nowSec - telegramInitDataMaxAgeSec || authDate > nowSec + telegramInitDataFutureSkewSec) {
    return { ok: false, error: 'expired_init_data' };
  }

  const rawUser = params.get('user');
  if (!rawUser) {
    return { ok: false, error: 'invalid_init_data' };
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawUser);
  } catch {
    return { ok: false, error: 'invalid_init_data' };
  }
  const user = telegramUserSchema.safeParse(parsedJson);
  if (!user.success) {
    return { ok: false, error: 'invalid_init_data' };
  }

  return {
    ok: true,
    user: user.data,
    authDate,
    queryId: params.get('query_id')?.trim() || null,
  };
}

function signTelegramBearerPayload(payloadB64: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(`${telegramBearerDomain}${payloadB64}`, 'utf8').digest();
}

export function issueTelegramBearerToken(
  input: Omit<TelegramBearerClaims, 'v' | 'exp'>,
  nowSec: number = Math.floor(Date.now() / 1000),
): { token: string; expiresAt: string } | null {
  const secret = getTelegramSigningSecret();
  if (!secret) return null;

  const claims: TelegramBearerClaims = telegramBearerClaimsSchema.parse({
    ...input,
    v: 1,
    exp: nowSec + telegramBearerTtlSec,
  });
  const payloadB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const sigB64 = signTelegramBearerPayload(payloadB64, secret).toString('base64url');
  return {
    token: `${telegramBearerPrefix}${payloadB64}.${sigB64}`,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  };
}

export function verifyTelegramBearerToken(
  token: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): TelegramBearerClaims | null {
  if (!token.startsWith(telegramBearerPrefix) || token.length > 1024) return null;
  const secret = getTelegramSigningSecret();
  if (!secret) return null;

  const rest = token.slice(telegramBearerPrefix.length);
  const parts = rest.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64 = '', sigB64 = ''] = parts;
  if (!/^[A-Za-z0-9_-]{1,768}$/.test(payloadB64) || !/^[A-Za-z0-9_-]{43}$/.test(sigB64)) {
    return null;
  }

  const receivedSig = Buffer.from(sigB64, 'base64url');
  if (receivedSig.toString('base64url') !== sigB64) return null;
  const expectedSig = signTelegramBearerPayload(payloadB64, secret);
  if (receivedSig.length !== expectedSig.length || !timingSafeEqual(receivedSig, expectedSig)) {
    return null;
  }

  const payloadBuf = Buffer.from(payloadB64, 'base64url');
  if (payloadBuf.toString('base64url') !== payloadB64) return null;

  try {
    const parsed = telegramBearerClaimsSchema.safeParse(JSON.parse(payloadBuf.toString('utf8')));
    if (!parsed.success) return null;
    if (parsed.data.exp <= nowSec) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function resolveTelegramLinkedChat(
  chatId: number,
  preferredFocus?: 'patient' | 'doctor' | null,
): Promise<TelegramBearerActorResult | null> {
  const sql = getDatabase();
  if (!sql) return { ok: false, status: 503, error: 'unavailable' };

  const loadPatient = async (): Promise<TelegramBearerActorResult | null> => {
    const [row] = await sql`
      SELECT link.workspace_id AS "workspaceId",
             p.id AS "patientId",
             p.doctor_id AS "doctorId",
             p.role_kind AS "roleKind",
             p.name AS "patientName",
             w.is_demo AS "isDemo",
             link.details_enabled AS "detailsEnabled",
             link.link_id AS "linkId",
             link.chat_id AS "chatId"
      FROM public.telegram_patient_links AS link
      JOIN public.patients AS p
        ON p.workspace_id = link.workspace_id AND p.id = link.patient_id
      JOIN public.workspaces AS w
        ON w.id = p.workspace_id
      WHERE link.chat_id = ${chatId}
      LIMIT 1
    `;
    if (!row) return null;
    const parsed = linkedPatientRowSchema.safeParse(row);
    if (!parsed.success) return null;
    return {
      ok: true,
      kind: 'linked',
      actor: {
        workspaceId: parsed.data.workspaceId,
        doctorId: parsed.data.doctorId,
        patientId: parsed.data.patientId,
        role: parsed.data.roleKind === 'individual' ? 'individual' : 'patient',
        isDemo: parsed.data.isDemo,
      },
      patientName: parsed.data.patientName,
      doctorName: null,
      detailsEnabled: parsed.data.detailsEnabled,
      chatId: parsed.data.chatId,
      linkId: parsed.data.linkId,
    };
  };

  const loadDoctor = async (): Promise<TelegramBearerActorResult | null> => {
    const [row] = await sql`
      SELECT link.workspace_id AS "workspaceId",
             d.id AS "doctorId",
             d.name AS "doctorName",
             w.is_demo AS "isDemo",
             link.link_id AS "linkId",
             link.chat_id AS "chatId"
      FROM public.telegram_doctor_links AS link
      JOIN public.doctors AS d
        ON d.workspace_id = link.workspace_id AND d.id = link.doctor_id
      JOIN public.workspaces AS w
        ON w.id = d.workspace_id
      WHERE link.chat_id = ${chatId}
      LIMIT 1
    `;
    if (!row) return null;
    const parsed = linkedDoctorRowSchema.safeParse(row);
    if (!parsed.success) return null;
    return {
      ok: true,
      kind: 'linked',
      actor: {
        workspaceId: parsed.data.workspaceId,
        doctorId: parsed.data.doctorId,
        patientId: null,
        role: 'doctor',
        isDemo: parsed.data.isDemo,
      },
      patientName: null,
      doctorName: parsed.data.doctorName,
      detailsEnabled: false,
      chatId: parsed.data.chatId,
      linkId: parsed.data.linkId,
    };
  };

  if (preferredFocus === 'doctor') {
    return (await loadDoctor()) ?? (await loadPatient());
  }
  return (await loadPatient()) ?? (await loadDoctor());
}

export async function resolveTelegramBearerActor(token: string): Promise<TelegramBearerActorResult> {
  const claims = verifyTelegramBearerToken(token);
  if (!claims) return { ok: false, status: 401, error: 'unauthorized' };

  if (claims.kind === 'demo') {
    if (!isDemoEnabled() || !claims.isDemo) {
      return { ok: false, status: 401, error: 'unauthorized' };
    }
    const workspace = await ensureDemoWorkspace(claims.workspaceId);
    if (!workspace) return { ok: false, status: 503, error: 'unavailable' };

    const expectedActorId = claims.role === 'doctor' ? workspace.doctor.id : workspace.patient.id;
    if (claims.actorId !== expectedActorId) {
      return { ok: false, status: 401, error: 'unauthorized' };
    }

    return {
      ok: true,
      kind: 'demo',
      actor: {
        workspaceId: claims.workspaceId,
        doctorId: workspace.doctor.id,
        patientId: workspace.patient.id,
        role: claims.role,
        isDemo: true,
      },
      patientName: workspace.patient.name,
      doctorName: workspace.doctor.name,
      detailsEnabled: false,
      chatId: null,
      linkId: null,
    };
  }

  const sql = getDatabase();
  if (!sql) return { ok: false, status: 503, error: 'unavailable' };

  if (claims.role === 'patient') {
    const [row] = await sql`
      SELECT link.workspace_id AS "workspaceId",
             p.id AS "patientId",
             p.doctor_id AS "doctorId",
             p.role_kind AS "roleKind",
             p.name AS "patientName",
             w.is_demo AS "isDemo",
             link.details_enabled AS "detailsEnabled",
             link.link_id AS "linkId",
             link.chat_id AS "chatId"
      FROM public.telegram_patient_links AS link
      JOIN public.patients AS p
        ON p.workspace_id = link.workspace_id AND p.id = link.patient_id
      JOIN public.workspaces AS w
        ON w.id = p.workspace_id
      WHERE link.workspace_id = ${claims.workspaceId}
        AND link.patient_id = ${claims.actorId}
        AND link.link_id = ${claims.linkId!}
        AND link.chat_id = ${claims.chatId!}
      LIMIT 1
    `;
    if (!row) return { ok: false, status: 401, error: 'unauthorized' };
    const parsed = linkedPatientRowSchema.safeParse(row);
    if (!parsed.success || parsed.data.isDemo !== claims.isDemo) {
      return { ok: false, status: 401, error: 'unauthorized' };
    }
    return {
      ok: true,
      kind: 'linked',
      actor: {
        workspaceId: parsed.data.workspaceId,
        doctorId: parsed.data.doctorId,
        patientId: parsed.data.patientId,
        role: parsed.data.roleKind === 'individual' ? 'individual' : 'patient',
        isDemo: parsed.data.isDemo,
      },
      patientName: parsed.data.patientName,
      doctorName: null,
      detailsEnabled: parsed.data.detailsEnabled,
      chatId: parsed.data.chatId,
      linkId: parsed.data.linkId,
    };
  }

  const [row] = await sql`
    SELECT link.workspace_id AS "workspaceId",
           d.id AS "doctorId",
           d.name AS "doctorName",
           w.is_demo AS "isDemo",
           link.link_id AS "linkId",
           link.chat_id AS "chatId"
    FROM public.telegram_doctor_links AS link
    JOIN public.doctors AS d
      ON d.workspace_id = link.workspace_id AND d.id = link.doctor_id
    JOIN public.workspaces AS w
      ON w.id = d.workspace_id
    WHERE link.workspace_id = ${claims.workspaceId}
      AND link.doctor_id = ${claims.actorId}
      AND link.link_id = ${claims.linkId!}
      AND link.chat_id = ${claims.chatId!}
    LIMIT 1
  `;
  if (!row) return { ok: false, status: 401, error: 'unauthorized' };
  const parsed = linkedDoctorRowSchema.safeParse(row);
  if (!parsed.success || parsed.data.isDemo !== claims.isDemo) {
    return { ok: false, status: 401, error: 'unauthorized' };
  }
  return {
    ok: true,
    kind: 'linked',
    actor: {
      workspaceId: parsed.data.workspaceId,
      doctorId: parsed.data.doctorId,
      patientId: null,
      role: 'doctor',
      isDemo: parsed.data.isDemo,
    },
    patientName: null,
    doctorName: parsed.data.doctorName,
    detailsEnabled: false,
    chatId: parsed.data.chatId,
    linkId: parsed.data.linkId,
  };
}

export function isTelegramTokenPatient(actor: ClinicalActor): boolean {
  return isPatientSideRole(actor.role);
}
