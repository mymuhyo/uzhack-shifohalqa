import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { compareMedicationBox, readMedicationBox } from '@/lib/ai/dorimos';
import { medicationBoxLabelSchema } from '@/lib/ai/medication-box';
import { getTaskContext } from '@/lib/clinical-store';
import { getDemoSession, isSameOriginDemoPost } from '@/lib/demo-session';
import { issueBoxConfirmation, readBoxConfirmation } from '@/lib/dorimos-confirmation';
import { boxReading, dorimosInput, dorimosResponse } from '@/lib/dorimos-contract';
import { dorimosPracticePrescription, dorimosSamples } from '@/lib/dorimos-samples';
import { reserveDorimosScan, saveDorimosEvidence } from '@/lib/dorimos-store';
import { readRequestJson } from '@/lib/request-body';
import { ensureDemoWorkspace } from '@/lib/seed';

const maxRequestBytes = 4096;
const localDate = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'Asia/Tashkent' });

function result(data: z.infer<typeof dorimosResponse>, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

async function readInput(request: Request) {
  const body = await readRequestJson(request, maxRequestBytes);
  if (!body.ok) return null;
  const parsed = dorimosInput.safeParse(body.body);
  return parsed.success ? parsed.data : null;
}

export async function POST(request: NextRequest) {
  if (!isSameOriginDemoPost(request)) return result({ status: 'invalid' }, 403);
  const session = await getDemoSession();
  if (session?.role !== 'patient') return result({ status: 'invalid' }, 403);
  const input = await readInput(request);
  if (!input) return result({ status: 'invalid' }, 400);

  try {
    const workspace = await ensureDemoWorkspace(session.workspaceId);
    if (!workspace) return result({ status: 'manual' }, 503);
    const actor = {
      workspaceId: session.workspaceId, role: session.role,
      doctorId: workspace.doctor.id, patientId: workspace.patient.id,
    };
    if (input.action === 'manual') {
      const status = await saveDorimosEvidence(actor, input.taskId, { kind: 'medication_box', result: 'manual' });
      return result({ status }, status === 'not_found' ? 404 : 200);
    }

    const task = await getTaskContext(actor, input.taskId);
    if (task?.type !== 'medication' || task.date !== localDate.format(new Date())) {
      return result({ status: 'not_found' }, 404);
    }
    const secret = process.env.SESSION_SECRET?.trim();
    const prescription = medicationBoxLabelSchema.safeParse({
      drugName: task.plan.medicationName, strength: task.plan.medicationStrengthMg, unit: 'mg',
    });
    if (!prescription.success || !secret) return result({ status: 'manual' });
    const expected = prescription.data;
    const scope = { workspaceId: session.workspaceId, taskId: input.taskId };

    if (input.action === 'confirm') {
      const confirmed = readBoxConfirmation(input.token, scope, secret);
      if (!confirmed) return result({ status: 'expired' }, 422);
      const status = await saveDorimosEvidence(actor, input.taskId, {
        kind: 'medication_box', result: compareMedicationBox(expected, confirmed.reading.label),
        expected, reading: confirmed.reading, sampleId: confirmed.sampleId,
      });
      return result({ status }, status === 'not_found' ? 404 : 200);
    }

    if (!process.env.GEMINI_API_KEY?.trim()) return result({ status: 'manual' });
    if (!await reserveDorimosScan(session.workspaceId)) return result({ status: 'manual' }, 429);

    const sample = dorimosSamples[input.sampleId];
    const image = await readFile(join(process.cwd(), 'public', sample.imagePath));
    // Gemini sees only demo assets and a fixed demo reference. The real plan comparison stays local.
    const measurement = await readMedicationBox({ image, mimeType: 'image/png', expected: dorimosPracticePrescription });
    if (measurement.status !== 'needs_confirmation') return result({ status: measurement.status });

    const reading = boxReading.parse(measurement);
    const token = issueBoxConfirmation({ ...scope, sampleId: sample.id, reading }, secret);
    return result({ status: 'needs_confirmation', reading, token });
  } catch {
    return result({ status: 'manual' }, 503);
  }
}
