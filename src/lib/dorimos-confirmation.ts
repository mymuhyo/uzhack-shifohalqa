import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { boxReading, dorimosBoxSourceIds } from './dorimos-contract';

const lifetimeMs = 10 * 60 * 1000;
const tokenPattern = /^([A-Za-z0-9_-]{1,2200})\.([A-Za-z0-9_-]{43})$/;
const confirmation = z.strictObject({
  workspaceId: z.uuid(),
  taskId: z.uuid(),
  sampleId: z.enum(dorimosBoxSourceIds),
  reading: boxReading,
  expiresAt: z.int().positive(),
});

type Confirmation = z.infer<typeof confirmation>;

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`shifohalqa-dorimos-v1.${payload}`).digest('base64url');
}

export function issueBoxConfirmation(input: Omit<Confirmation, 'expiresAt'>, secret: string): string {
  const value = confirmation.parse({ ...input, expiresAt: Date.now() + lifetimeMs });
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function readBoxConfirmation(token: string, scope: Pick<Confirmation, 'workspaceId' | 'taskId'>, secret: string): Confirmation | null {
  const parts = tokenPattern.exec(token);
  if (!parts || !timingSafeEqual(Buffer.from(parts[2]), Buffer.from(sign(parts[1], secret)))) return null;

  try {
    const value = confirmation.parse(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')));
    if (value.workspaceId !== scope.workspaceId || value.taskId !== scope.taskId || value.expiresAt <= Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}
