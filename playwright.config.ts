import { randomBytes, randomInt } from 'node:crypto';
import { defineConfig } from 'playwright/test';

function readPort(name: string, fallback: number) {
  const value = process.env[name] ?? String(fallback);
  if (!/^\d{1,5}$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return Number(value);
}

const webPort = readPort('SHIFO_E2E_WEB_PORT', 3419);
const baseURL = `http://127.0.0.1:${webPort}`;
const databaseUrl = process.env.SHIFO_E2E_DATABASE_URL ?? '';
const serverScript = databaseUrl ? 'start' : 'dev';
const useLiveOcr = Boolean(databaseUrl) && process.env.SHIFO_E2E_LIVE_DORIMOS === '1';
const useExerciseOpenRouter = process.env.SHIFO_E2E_EXERCISE_OPENROUTER === '1';
const telegramPort = readPort('SHIFO_E2E_TELEGRAM_PORT', 3420);
const telegramChatId = (process.env.SHIFO_E2E_TELEGRAM_CHAT_ID ??= String(randomInt(100_000_000_000, 900_000_000_000)));

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: databaseUrl ? '**/*.spec.ts' : ['**/demo.spec.ts', '**/exercise-preview.spec.ts'],
  testIgnore: useLiveOcr ? [] : '**/dorimos-live.spec.ts',
  use: { baseURL, trace: 'retain-on-failure' },
  webServer: [{
    command: `npm run ${serverScript} -- --hostname 127.0.0.1 --port ${webPort}`,
    url: baseURL,
    env: {
      DATABASE_URL: databaseUrl,
      DEMO_MODE: 'true',
      DEMO_ANDROID_ENABLED: databaseUrl ? 'true' : 'false',
      ...(useLiveOcr ? {} : { GEMINI_API_KEY: '', CLOUDFLARE_ACCOUNT_ID: '', CLOUDFLARE_API_TOKEN: '' }),
      ...(useLiveOcr || useExerciseOpenRouter ? {} : { OPENROUTER_API_KEY: '' }),
      EXERCISE_OPENROUTER_DEMO: String(useExerciseOpenRouter),
      EXERCISE_COACH_OPENROUTER_DEMO: 'false',
      TELEGRAM_BOT_USERNAME: 'shifohalqa_e2e_bot',
      NEXT_TELEMETRY_DISABLED: '1',
      SESSION_SECRET: randomBytes(32).toString('hex'),
    },
  }, ...(databaseUrl ? [{
    command: 'uv run --locked --no-sync python -m tests.e2e_server',
    cwd: 'services/telegram_bot',
    url: `http://127.0.0.1:${telegramPort}/healthz`,
    env: {
      TELEGRAM_DATABASE_URL: databaseUrl,
      TELEGRAM_BOT_TOKEN: '123456789:shifohalqa_e2e_not_a_live_telegram_token',
      TELEGRAM_BOT_USERNAME: 'shifohalqa_e2e_bot',
      TELEGRAM_WEBHOOK_SECRET: 'shifohalqa-e2e-webhook-secret',
      TELEGRAM_APP_URL: 'https://shifohalqa.example.test/',
      TELEGRAM_HOST: '127.0.0.1',
      TELEGRAM_PORT: String(telegramPort),
      SHIFO_E2E_TELEGRAM_CHAT_ID: telegramChatId,
    },
  }] : [])],
});
