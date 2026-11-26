import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  approveClinicalBriefReply,
  clinicalBriefPostSchema,
  generateClinicalBrief,
  readLatestClinicalBrief,
} from '../../../../lib/ai/clinical-brief-ai';
import { readVercelOidcTokenFromRequest } from '../../../../lib/ai/provider-config';
import { resolveClinicalRequestActor } from '../../../../lib/auth';
import { readRequestJson } from '../../../../lib/request-body';

const noStore = { 'Cache-Control': 'private, no-store' };

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: noStore });
}

function errorJson(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStore });
}

export async function GET(request: NextRequest) {
  try {
    const rawPatientId = request.nextUrl.searchParams.get('patientId')?.trim();
    let patientId: string | undefined;
    if (rawPatientId) {
      const parsedId = z.uuid().safeParse(rawPatientId);
      if (!parsedId.success) return errorJson('invalid', 400);
      patientId = parsedId.data;
    }

    const resolved = await resolveClinicalRequestActor(request, {
      allowBearer: true,
      allowRoles: ['doctor', 'patient', 'individual'],
      patientId,
    });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);

    const brief = await readLatestClinicalBrief(resolved.actor);
    return json({ role: resolved.actor.role, brief }, 200);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authCheck = await resolveClinicalRequestActor(request, {
      allowBearer: false,
      requireSameOrigin: true,
      allowRoles: ['doctor'],
      allowDoctorWithoutPatient: true,
    });
    if (!authCheck.ok) return errorJson(authCheck.error, authCheck.status);

    const body = await readRequestJson(request, 8192);
    if (!body.ok) {
      return errorJson(body.status === 413 ? 'too_large' : 'invalid', body.status);
    }
    const parsed = clinicalBriefPostSchema.safeParse(body.body);
    if (!parsed.success) return errorJson('invalid', 400);

    const resolved = await resolveClinicalRequestActor(request, {
      allowBearer: false,
      requireSameOrigin: true,
      allowRoles: ['doctor'],
      patientId: parsed.data.patientId,
    });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);

    if (parsed.data.action === 'generate') {
      const generated = await generateClinicalBrief(
        resolved.actor,
        { forceRefresh: parsed.data.forceRefresh },
        { oidcToken: readVercelOidcTokenFromRequest(request) },
      );
      if (!generated.ok) return errorJson(generated.error, generated.status);
      return json({
        status: 'generated',
        cached: generated.cached,
        brief: generated.brief,
        ...(generated.fallbackReason ? { fallbackReason: generated.fallbackReason } : {}),
      }, 200);
    }

    const approved = await approveClinicalBriefReply(resolved.actor, {
      briefId: parsed.data.briefId,
      replyUz: parsed.data.replyUz,
    });
    if (!approved.ok) return errorJson(approved.error, approved.status);
    return json({ status: 'approved', brief: approved.brief }, 200);
  } catch {
    return errorJson('unavailable', 503);
  }
}
