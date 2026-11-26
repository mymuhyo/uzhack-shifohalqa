import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { compareMedicationBox, isMedicationBoxAiConfigured, readMedicationBox } from './ai/dorimos';
import { readVercelOidcTokenFromRequest } from './ai/provider-config';
import { medicationBoxLabelSchema } from './ai/medication-box';
import type { ClinicalActor } from './clinical-types';
import { issueBoxConfirmation, readBoxConfirmation } from './dorimos-confirmation';
import { boxReading, dorimosInput, dorimosResponse } from './dorimos-contract';
import { dorimosPracticePrescription, dorimosSamples } from './dorimos-samples';
import { getDorimosMedicationTarget, reserveDorimosScan, saveDorimosEvidence } from './dorimos-store';
import { readRequestJson } from './request-body';

const maxJsonBytes = 4096;
const maxImageBytes = 6 * 1024 * 1024;
const localDate = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'Asia/Tashkent' });
const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const jpegHeader = [0xff, 0xd8, 0xff];

export function detectBoxImageMimeType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | null {
  if (bytes.length > pngHeader.length && pngHeader.every((b, i) => bytes[i] === b)) return 'image/png';
  if (bytes.length > jpegHeader.length && jpegHeader.every((b, i) => bytes[i] === b)) return 'image/jpeg';
  return null;
}

export type DorimosHttpResult = {
  data: z.infer<typeof dorimosResponse>;
  status: number;
};

async function readJsonInput(request: Request) {
  const body = await readRequestJson(request, maxJsonBytes);
  if (!body.ok) return null;
  const parsed = dorimosInput.safeParse(body.body);
  return parsed.success ? parsed.data : null;
}

export async function handleDorimosRequest(actor: ClinicalActor, request: Request): Promise<DorimosHttpResult> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.startsWith('multipart/form-data')) {
    return handleMultipartScan(actor, request);
  }

  const input = await readJsonInput(request);
  if (!input) return { data: { status: 'invalid' }, status: 400 };

  if (input.action === 'manual') {
    const status = await saveDorimosEvidence(actor, input.taskId, { kind: 'medication_box', result: 'manual' });
    return { data: { status }, status: status === 'not_found' ? 404 : 200 };
  }

  if (input.action === 'defer') {
    const status = await saveDorimosEvidence(actor, input.taskId, { kind: 'medication_box', result: 'deferred' });
    if (status === 'not_found') return { data: { status: 'not_found' }, status: 404 };
    if (status === 'already_saved') return { data: { status: 'already_saved' }, status: 200 };
    return { data: { status: 'deferred' }, status: 200 };
  }

  if (input.action === 'scan' && actor.isDemo !== true) {
    return { data: { status: 'invalid' }, status: 403 };
  }

  const target = await getDorimosMedicationTarget(actor, input.taskId);
  if (!target || target.date !== localDate.format(new Date())) {
    return { data: { status: 'not_found' }, status: 404 };
  }
  const secret = process.env.SESSION_SECRET?.trim();
  const prescription = medicationBoxLabelSchema.safeParse({
    drugName: target.drugName,
    strength: target.strength,
    unit: target.strengthUnit,
  });
  if (!prescription.success || !secret) return { data: { status: 'manual' }, status: 200 };
  const expected = prescription.data;
  const scope = { workspaceId: actor.workspaceId, taskId: input.taskId };

  if (input.action === 'confirm') {
    const confirmed = readBoxConfirmation(input.token, scope, secret);
    if (!confirmed) return { data: { status: 'expired' }, status: 422 };
    if (confirmed.sampleId !== 'camera_photo' && actor.isDemo !== true) {
      return { data: { status: 'invalid' }, status: 403 };
    }
    const status = await saveDorimosEvidence(actor, input.taskId, {
      kind: 'medication_box',
      result: compareMedicationBox(expected, confirmed.reading.label),
      expected,
      reading: confirmed.reading,
      sampleId: confirmed.sampleId,
    });
    return { data: { status }, status: status === 'not_found' ? 404 : 200 };
  }

  const oidcToken = readVercelOidcTokenFromRequest(request);
  if (!isMedicationBoxAiConfigured(oidcToken)) return { data: { status: 'manual' }, status: 200 };
  if (!await reserveDorimosScan(actor.workspaceId)) return { data: { status: 'manual' }, status: 429 };

  const sample = dorimosSamples[input.sampleId];
  const image = await readFile(join(process.cwd(), 'public', sample.imagePath));
  const measurement = await readMedicationBox({
    image,
    mimeType: 'image/png',
    expected: dorimosPracticePrescription,
  }, { oidcToken });
  if (measurement.status !== 'needs_confirmation') return { data: { status: measurement.status }, status: 200 };

  const reading = boxReading.parse(measurement);
  const token = issueBoxConfirmation({ ...scope, sampleId: sample.id, reading }, secret);
  return { data: { status: 'needs_confirmation', reading, token }, status: 200 };
}

async function handleMultipartScan(actor: ClinicalActor, request: Request): Promise<DorimosHttpResult> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { data: { status: 'invalid' }, status: 400 };
  }
  const taskIdRaw = form.get('taskId');
  const file = form.get('image');
  const parsedTaskId = z.uuid().safeParse(taskIdRaw);
  if (!parsedTaskId.success || !(file instanceof File) || file.size === 0 || file.size > maxImageBytes) {
    return { data: { status: 'invalid' }, status: 400 };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectBoxImageMimeType(bytes);
  if (!mimeType) return { data: { status: 'invalid' }, status: 400 };

  const target = await getDorimosMedicationTarget(actor, parsedTaskId.data);
  if (!target || target.date !== localDate.format(new Date())) {
    return { data: { status: 'not_found' }, status: 404 };
  }
  const secret = process.env.SESSION_SECRET?.trim();
  const prescription = medicationBoxLabelSchema.safeParse({
    drugName: target.drugName,
    strength: target.strength,
    unit: target.strengthUnit,
  });
  const oidcToken = readVercelOidcTokenFromRequest(request);
  if (!prescription.success || !secret || !isMedicationBoxAiConfigured(oidcToken)) {
    return { data: { status: 'manual' }, status: 200 };
  }
  if (!await reserveDorimosScan(actor.workspaceId)) return { data: { status: 'manual' }, status: 429 };

  const measurement = await readMedicationBox({
    image: bytes,
    mimeType,
    expected: prescription.data,
  }, { oidcToken });
  if (measurement.status !== 'needs_confirmation') return { data: { status: measurement.status }, status: 200 };

  const reading = boxReading.parse(measurement);
  const token = issueBoxConfirmation(
    { workspaceId: actor.workspaceId, taskId: parsedTaskId.data, sampleId: 'camera_photo', reading },
    secret,
  );
  return { data: { status: 'needs_confirmation', reading, token }, status: 200 };
}
