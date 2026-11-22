import { z } from 'zod';

export const fallbackAiProvider = z.enum(['vercel', 'opencode_go', 'gemini']);

export const fallbackAiProviderNames = {
  vercel: 'Vercel AI Gateway',
  opencode_go: 'OpenCode Go',
  gemini: 'Gemini API',
};
