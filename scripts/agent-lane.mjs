import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const lanes = {
  codex: { host: 'codex.localhost', dev: 3030, webTest: 3040, telegramTest: 3041, emulator: 5580 },
  antigravity: { host: 'antigravity.localhost', dev: 3130, webTest: 3140, telegramTest: 3141, emulator: 5582 },
};
const managedEnv = /^(?:DATABASE_URL(?:_UNPOOLED)?$|SHIFO_|DEMO_|SESSION_SECRET$|NEXT_PUBLIC_APP_URL$|PORT$|PG[A-Z_]|NEON_|GEMINI_|CLOUDFLARE_|DORIMOS_PROVIDER$|AI_COMPLETION_PROVIDER$|AI_GATEWAY_API_KEY$|VERCEL_OIDC_TOKEN$|OPENROUTER_|OPENCODE_|EXERCISE_|TELEGRAM_|UV_PROJECT_ENVIRONMENT$|ANDROID_SERIAL$|ANDROID_AVD_HOME$|ANDROID_ADB_SERVER_PORT$|ADB_SERVER_SOCKET$)/;

function launch(command, args, { cwd = root, env, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit' });
    let output = '';
    child.stdout?.setEncoding('utf8').on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve(output);
      else reject(new Error(`${command} exited with ${signal ?? code}`));
    });
  });
}

function verifyDatabase(local, expectedHost, name, database, pooled) {
  let url;
  try {
    url = new URL(local[name]);
  } catch {
    throw new Error(`Configure ${name} in this lane's .env.local`);
  }
  const host = pooled ? expectedHost.replace('.', '-pooler.') : expectedHost;
  if (!expectedHost || url.protocol !== 'postgresql:' || url.hostname !== host ||
      url.pathname !== `/${database}` || url.searchParams.get('sslmode') !== 'require') {
    throw new Error(`${name} must use this lane's assigned Neon endpoint and ${database} database`);
  }
}

async function main() {
  const [action, ...options] = process.argv.slice(2);
  const args = options[0] === '--' ? options.slice(1) : options;
  if (!action || action === '--help') {
    console.log('npm run lane -- check | dev [--live] | smoke [Playwright args] | e2e [Playwright args] | db-apply | emulator | android-test');
    return;
  }

  const laneConfig = parseEnv(readFileSync(join(root, '.env.lane'), 'utf8'));
  const name = laneConfig.SHIFO_LANE;
  if (!Object.hasOwn(lanes, name) || basename(root) !== `shifohalqa-${name}`) {
    throw new Error('Run the lane command from its assigned ShifoHalqa worktree');
  }
  const branch = (await launch('git', ['branch', '--show-current'], { capture: true })).trim();
  if (branch !== `exp/dual-${name}`) throw new Error('Check out your assigned agent branch before using its resources');
  const config = lanes[name];
  const local = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'));
  const url = `http://${config.host}:${config.dev}`;
  const serial = `emulator-${config.emulator}`;
  const avd = `Shifo-${name}`;
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !managedEnv.test(key))),
    DEMO_MODE: 'true',
    DEMO_ANDROID_ENABLED: 'true',
    SESSION_SECRET: local.SESSION_SECRET,
    NEXT_PUBLIC_APP_URL: url,
    NEXT_TELEMETRY_DISABLED: '1',
    DATABASE_URL: '',
    GEMINI_API_KEY: '',
    CLOUDFLARE_ACCOUNT_ID: '',
    CLOUDFLARE_API_TOKEN: '',
    OPENROUTER_API_KEY: '',
    OPENCODE_API_KEY: '',
    AI_GATEWAY_API_KEY: '',
    VERCEL_OIDC_TOKEN: '',
    OPENCODE_GO_API_KEY: '',
    EXERCISE_OPENROUTER_DEMO: 'false',
    EXERCISE_COACH_OPENROUTER_DEMO: 'false',
    EXERCISE_OPENCODE_DEMO: 'false',
    EXERCISE_COACH_OPENCODE_DEMO: 'false',
    EXERCISE_AI_DEMO: 'false',
    EXERCISE_COACH_AI_DEMO: 'false',
    TELEGRAM_DATABASE_URL: '',
    TELEGRAM_BOT_TOKEN: '',
    UV_NO_CACHE: '1',
    SHIFO_E2E_WEB_PORT: String(config.webTest),
    SHIFO_E2E_TELEGRAM_PORT: String(config.telegramTest),
  };
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('Set a lane-specific SESSION_SECRET');

  const checkDevDb = () => {
    verifyDatabase(local, laneConfig.SHIFO_NEON_HOST, 'DATABASE_URL', 'neondb', true);
    verifyDatabase(local, laneConfig.SHIFO_NEON_HOST, 'DATABASE_URL_UNPOOLED', 'neondb', false);
  };
  const checkTestDb = () => {
    verifyDatabase(local, laneConfig.SHIFO_NEON_HOST, 'SHIFO_E2E_DATABASE_URL', 'shifo_e2e', true);
    verifyDatabase(local, laneConfig.SHIFO_NEON_HOST, 'SHIFO_E2E_DATABASE_URL_UNPOOLED', 'shifo_e2e', false);
  };

  const cloudflareConfigured = local.DORIMOS_PROVIDER?.trim().toLowerCase() !== 'gemini' &&
    Boolean(local.CLOUDFLARE_ACCOUNT_ID && local.CLOUDFLARE_API_TOKEN);
  const completionProvider = local.AI_COMPLETION_PROVIDER?.trim();
  const autoKey = local.AI_GATEWAY_API_KEY || local.OPENCODE_GO_API_KEY || local.OPENCODE_API_KEY || local.GEMINI_API_KEY;
  const completionKey = completionProvider === 'auto'
    ? autoKey
    : completionProvider === 'opencode' ? local.OPENCODE_API_KEY : local.OPENROUTER_API_KEY;
  const runLive = async ([command, ...commandArgs]) => {
    for (const key of ['DORIMOS_PROVIDER', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN',
      'CLOUDFLARE_DECISION_MODEL', 'CLOUDFLARE_EXTRACTION_MODEL', 'GEMINI_API_KEY', 'GEMINI_DECISION_MODEL', 'OPENROUTER_API_KEY', 'OPENROUTER_OCR_MODEL',
      'OPENROUTER_OCR_FALLBACK_MODEL', 'EXERCISE_OPENROUTER_DEMO', 'EXERCISE_COACH_OPENROUTER_DEMO', 'OPENROUTER_EXERCISE_MODEL',
      'AI_COMPLETION_PROVIDER', 'OPENCODE_API_KEY', 'EXERCISE_OPENCODE_DEMO', 'EXERCISE_COACH_OPENCODE_DEMO',
      'AI_GATEWAY_API_KEY', 'OPENCODE_GO_API_KEY', 'EXERCISE_AI_DEMO', 'EXERCISE_COACH_AI_DEMO']) {
      if (local[key] !== undefined) env[key] = local[key];
    }
    if (laneConfig.SHIFO_LIVE_ISOLATED === 'true') return launch(command, commandArgs, { env });
    const commonGitDir = (await launch('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { capture: true })).trim();
    try {
      await launch('flock', ['-n', '-E', '74', join(commonGitDir, 'shifohalqa-live-api.lock'), command, ...commandArgs], { env });
    } catch (error) {
      if (error.message === 'flock exited with 74') throw new Error('The other lane already holds the live API quota lock');
      throw error;
    }
  };

  switch (action) {
    case 'check':
      checkDevDb();
      checkTestDb();
      console.log(`${name} · ${branch}\nWeb ${url} · tests ${config.webTest} · Telegram mock ${config.telegramTest}\nNeon ${laneConfig.SHIFO_NEON_HOST} · neondb / shifo_e2e\nAndroid ${avd} · ${serial}\nLive API keys: ${[cloudflareConfigured && 'Cloudflare', local.GEMINI_API_KEY && 'Gemini', local.OPENROUTER_API_KEY && 'OpenRouter'].filter(Boolean).join(', ') || 'none'}`);
      break;
    case 'dev': {
      checkDevDb();
      if (args.length && (args.length !== 1 || args[0] !== '--live')) throw new Error('Use lane dev or lane dev --live');
      env.DATABASE_URL = local.DATABASE_URL;
      const command = ['npm', 'run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(config.dev)];
      console.log(url);
      if (args[0] === '--live') {
        if (!cloudflareConfigured && !local.GEMINI_API_KEY && !completionKey) throw new Error('Add this lane’s own API key to .env.local');
        await runLive(command);
      } else {
        await launch(command[0], command.slice(1), { env });
      }
      break;
    }
    case 'smoke':
    case 'e2e': {
      env.NEXT_PUBLIC_APP_URL = `http://127.0.0.1:${config.webTest}`;
      env.SHIFO_E2E_DATABASE_URL = '';
      if (action === 'e2e') {
        checkTestDb();
        env.DATABASE_URL = local.SHIFO_E2E_DATABASE_URL;
        env.SHIFO_E2E_DATABASE_URL = local.SHIFO_E2E_DATABASE_URL;
        await launch('npm', ['run', 'build'], { env });
      }
      const command = ['npm', 'run', 'e2e', '--', ...args];
      const liveOcr = action === 'e2e' && process.env.SHIFO_E2E_LIVE_DORIMOS === '1';
      const liveOpenRouter = process.env.SHIFO_E2E_EXERCISE_OPENROUTER === '1';
      const liveOpenCode = process.env.SHIFO_E2E_EXERCISE_OPENCODE === '1';
      const liveAuto = process.env.SHIFO_E2E_EXERCISE_AUTO === '1';
      if (liveOcr || liveOpenRouter || liveOpenCode || liveAuto) {
        const ocrKey = liveOpenRouter ? local.OPENROUTER_API_KEY
          : liveOpenCode ? local.OPENCODE_API_KEY : liveAuto ? autoKey : completionKey;
        if ((liveOpenRouter && !local.OPENROUTER_API_KEY) || (liveOpenCode && !local.OPENCODE_API_KEY) ||
          (liveAuto && !autoKey) ||
          (liveOcr && !cloudflareConfigured && !(local.GEMINI_API_KEY && ocrKey))) {
          throw new Error('Add the required lane-specific API keys to .env.local');
        }
        if (liveOcr) env.SHIFO_E2E_LIVE_DORIMOS = '1';
        if (liveOpenRouter) env.SHIFO_E2E_EXERCISE_OPENROUTER = '1';
        if (liveOpenCode) env.SHIFO_E2E_EXERCISE_OPENCODE = '1';
        if (liveAuto) env.SHIFO_E2E_EXERCISE_AUTO = '1';
        await runLive(command);
      } else {
        await launch(command[0], command.slice(1), { env });
      }
      break;
    }
    case 'db-apply':
      checkDevDb();
      checkTestDb();
      for (const key of ['DATABASE_URL_UNPOOLED', 'SHIFO_E2E_DATABASE_URL_UNPOOLED']) {
        const database = new URL(local[key]);
        await launch('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', 'schema.sql'], {
          env: {
            ...env,
            PGHOST: database.hostname,
            PGPORT: database.port || '5432',
            PGDATABASE: database.pathname.slice(1),
            PGUSER: decodeURIComponent(database.username),
            PGPASSWORD: decodeURIComponent(database.password),
            PGSSLMODE: 'require',
          },
        });
      }
      break;
    case 'emulator':
    case 'android-test':
      await android({ action, config, serial, avd, env });
      break;
    default:
      throw new Error('Unknown lane action. Run npm run lane -- --help');
  }
}

async function android({ action, config, serial, avd, env }) {
  const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || join(homedir(), 'Android/Sdk');
  env.ANDROID_HOME = sdk;
  env.ANDROID_SDK_ROOT = sdk;
  env.ANDROID_AVD_HOME = join(root, '.lane/avd');
  if (action === 'emulator') {
    await launch(join(sdk, 'emulator/emulator'), [
      `@${avd}`, '-port', String(config.emulator), '-no-snapshot', '-no-boot-anim', '-no-window', '-no-audio', '-gpu', 'swiftshader',
    ], { env });
    return;
  }
  const adb = (args, capture = false) => launch(join(sdk, 'platform-tools/adb'), ['-s', serial, ...args], { env, capture });
  const deviceName = (await adb(['emu', 'avd', 'name'], true)).split(/\r?\n/)[0].trim();
  if (deviceName !== avd) throw new Error(`Expected ${avd} at ${serial}. Start it with npm run lane -- emulator`);
  await adb(['reverse', 'tcp:3000', `tcp:${config.dev}`]);
  await launch('./gradlew', [':app:assembleDebug', ':app:assembleDebugAndroidTest'], { cwd: join(root, 'android'), env });
  await adb(['install', '-r', 'android/app/build/outputs/apk/debug/app-debug.apk']);
  await adb(['install', '-r', 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk']);
  const result = await adb(['shell', 'am', 'instrument', '-w', 'uz.shifohalqa.android.demo.test/androidx.test.runner.AndroidJUnitRunner'], true);
  console.log(result.trim());
  if (!/^OK \(\d+ tests?\)$/m.test(result)) throw new Error('Android instrumentation did not report success');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
