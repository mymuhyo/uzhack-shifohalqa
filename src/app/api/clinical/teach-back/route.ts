import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { readVercelOidcTokenFromRequest } from '../../../../lib/ai/provider-config';
import { resolveClinicalRequestActor } from '../../../../lib/auth';
import { readRequestJson } from '../../../../lib/request-body';
import {
  getTeachBackStatus,
  submitTeachBackAttempt,
  teachBackSubmissionSchema,
} from '../../../../lib/teach-back-store';

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

    const simplifyWithAi = request.nextUrl.searchParams.get('simplify') === '1';

    const resolved = await resolveClinicalRequestActor(request, {
      allowBearer: true,
      allowRoles: ['doctor', 'patient', 'individual'],
      patientId,
    });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);

    const status = await getTeachBackStatus(
      resolved.actor,
      { simplifyWithAi },
      { oidcToken: readVercelOidcTokenFromRequest(request) },
    );
    if (!status) return errorJson('unavailable', 503);
    return json(status, 200);
  } catch {
    return errorJson('unavailable', 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveClinicalRequestActor(request, {
      allowBearer: true,
      requireSameOrigin: true,
      allowRoles: ['patient', 'individual'],
    });
    if (!resolved.ok) return errorJson(resolved.error, resolved.status);

    const body = await readRequestJson(request, 4096);
    if (!body.ok) {
      return errorJson(body.status === 413 ? 'too_large' : 'invalid', body.status);
    }
    const parsed = teachBackSubmissionSchema.safeParse(body.body);
    if (!parsed.success) return errorJson('invalid', 400);

    const result = await submitTeachBackAttempt(resolved.actor, parsed.data);
    if (!result.ok) return errorJson(result.error, result.status);
    return json({
      status: 'saved',
      attempt: result.attempt,
      feedback: result.feedback,
    }, 200);
  } catch {
    return errorJson('unavailable', 503);
  }
}
