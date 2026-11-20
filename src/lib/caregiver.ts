import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

export const caregiverActionSchema = z.strictObject({ action: z.enum(['enable', 'disable']) });

const caregiverTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/).refine((token) => (
  Buffer.from(token, 'base64url').toString('base64url') === token
));

export function createCaregiverToken(): string {
  return randomBytes(32).toString('base64url');
}

export function digestCaregiverToken(input: unknown): string | null {
  const token = caregiverTokenSchema.safeParse(input);
  return token.success ? createHash('sha256').update(token.data).digest('hex') : null;
}
