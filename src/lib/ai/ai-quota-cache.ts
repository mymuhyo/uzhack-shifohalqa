import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getDatabase, type SqlAdapter } from '../db';

const featureKeySchema = z.string().regex(/^[a-z0-9_-]{1,40}$/);
const promptHashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export type AiQuotaReservation =
  | { allowed: true }
  | { allowed: false; reason: 'db_unavailable' | 'rate_limited'; scope?: string };

export const cachedClinicalBriefRowSchema = z.object({
  id: z.uuid(),
  briefDate: z.iso.date(),
  sourceMode: z.enum(['ai', 'deterministic_fallback']),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  deterministicMetrics: z.record(z.string(), z.unknown()),
  narrativeUz: z.string(),
  highlights: z.array(z.string()),
  citedRecordIds: z.array(z.uuid()),
  doctorDraftUz: z.string(),
  approvedReplyUz: z.string().nullable(),
  approvedAt: z.iso.datetime().nullable(),
  approvedByDoctorId: z.uuid().nullable(),
  level: z.union([z.literal(0), z.literal(4)]),
  promptHash: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type CachedClinicalBriefRow = z.infer<typeof cachedClinicalBriefRowSchema>;

function canonicalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeValue(item));
  }
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) {
        sorted[key] = canonicalizeValue(entry);
      }
    }
    return sorted;
  }
  return value;
}

/** Deterministic SHA-256 hex digest over canonical sorted-key JSON. */
export function computePromptHash(payload: unknown): string {
  const serialized = JSON.stringify(canonicalizeValue(payload));
  return createHash('sha256').update(serialized).digest('hex');
}

export type ReserveAiQuotaOptions = {
  workspaceId: string;
  feature: string;
  workspaceLimit?: number;
  globalLimit?: number;
  windowSeconds?: number;
  sql?: SqlAdapter | null;
};

/**
 * DB-backed per-workspace (+ global) AI rate limiter using `public.ai_rate_limits`.
 * Fails closed (`allowed: false`) when DB is unavailable or errors, so callers
 * cleanly degrade to deterministic Uzbek fallbacks without leaking unmetered AI calls.
 */
export async function reserveAiRequestQuota(
  options: ReserveAiQuotaOptions,
): Promise<AiQuotaReservation> {
  const workspaceId = z.uuid().safeParse(options.workspaceId);
  const feature = featureKeySchema.safeParse(options.feature);
  if (!workspaceId.success || !feature.success) {
    return { allowed: false, reason: 'rate_limited' };
  }

  const workspaceLimit = Math.max(1, Math.min(500, Math.trunc(options.workspaceLimit ?? 20)));
  const globalLimit = Math.max(workspaceLimit, Math.min(2000, Math.trunc(options.globalLimit ?? 120)));
  const windowSeconds = Math.max(10, Math.min(86_400, Math.trunc(options.windowSeconds ?? 60)));

  const sql = options.sql !== undefined ? options.sql : getDatabase();
  if (!sql) return { allowed: false, reason: 'db_unavailable' };

  const scopes: ReadonlyArray<readonly [string, number]> = [
    [`ws:${workspaceId.data}:${feature.data}`, workspaceLimit],
    [`global:${feature.data}`, globalLimit],
  ];

  try {
    for (const [scope, limit] of scopes) {
      const rows = await sql`
        INSERT INTO public.ai_rate_limits AS quota (scope, window_ends_at, requests)
        VALUES (${scope}, CURRENT_TIMESTAMP + make_interval(secs => ${windowSeconds}), 1)
        ON CONFLICT (scope) DO UPDATE SET
          window_ends_at = CASE
            WHEN quota.window_ends_at <= CURRENT_TIMESTAMP THEN EXCLUDED.window_ends_at
            ELSE quota.window_ends_at
          END,
          requests = CASE
            WHEN quota.window_ends_at <= CURRENT_TIMESTAMP THEN 1
            ELSE quota.requests + 1
          END
        WHERE quota.window_ends_at <= CURRENT_TIMESTAMP OR quota.requests < ${limit}
        RETURNING requests
      `;
      if (!rows.length) {
        return { allowed: false, reason: 'rate_limited', scope };
      }
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'db_unavailable' };
  }
}

export type FindCachedBriefOptions = {
  workspaceId: string;
  patientId: string;
  promptHash: string;
  maxAgeMinutes?: number;
  sql?: SqlAdapter | null;
};

export async function findCachedClinicalBrief(
  options: FindCachedBriefOptions,
): Promise<CachedClinicalBriefRow | null> {
  const workspaceId = z.uuid().safeParse(options.workspaceId);
  const patientId = z.uuid().safeParse(options.patientId);
  const promptHash = promptHashSchema.safeParse(options.promptHash);
  if (!workspaceId.success || !patientId.success || !promptHash.success) return null;

  const maxAgeMinutes = Math.max(1, Math.min(10_080, Math.trunc(options.maxAgeMinutes ?? 360)));
  const sql = options.sql !== undefined ? options.sql : getDatabase();
  if (!sql) return null;

  try {
    const [row] = await sql`
      SELECT id,
             to_char(brief_date, 'YYYY-MM-DD') AS "briefDate",
             source_mode AS "sourceMode",
             provider,
             model,
             deterministic_metrics AS "deterministicMetrics",
             narrative_uz AS "narrativeUz",
             highlights,
             cited_record_ids AS "citedRecordIds",
             doctor_draft_uz AS "doctorDraftUz",
             approved_reply_uz AS "approvedReplyUz",
             to_char(approved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "approvedAt",
             approved_by_doctor_id AS "approvedByDoctorId",
             level,
             prompt_hash AS "promptHash",
             to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
      FROM public.ai_clinical_briefs
      WHERE workspace_id = ${workspaceId.data}
        AND patient_id = ${patientId.data}
        AND prompt_hash = ${promptHash.data}
        AND created_at >= CURRENT_TIMESTAMP - make_interval(mins => ${maxAgeMinutes})
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `;
    if (!row) return null;
    const parsed = cachedClinicalBriefRowSchema.safeParse(row);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
