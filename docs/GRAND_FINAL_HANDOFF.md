# ShifoHalqa — Grand Final Judge Handoff

> **Core safety invariant:** **AI measures, deterministic rules flag, the doctor decides.** AI never diagnoses, prescribes, or overrides doctor decisions. Every record carries its explicit `source`, `ai_mode`, and Evidence Ladder level (`L0`–`L4`).

---

## 1. Environments & Isolation Guardrails

- **Frozen Task 2 live demo (`main`, `bc27a09`, tag `v1-task2-demo`):** Connected to Neon `shifohalqa/main`, Vercel `shifohalqa.vercel.app`, and `@shifohalqa_bot`. **Do not modify or merge without owner approval.**
- **Grand Final development branch (`final`):** Configured for isolated Supabase `shifohalqa-final` (`byswnhfcqxjvnallggxj`, `ap-southeast-1`) with `SHIFO_ENV_ID=final-preview`, Next.js web/API, `/tg` Telegram Mini App, `services/telegram_bot/` (`aiogram==3.31.0`), and native Android (`android/`).

---

## 2. Two Judge Walkthrough Stories

### Story 1 — Instant 1-Click Judge Demo (Web + Android + Telegram Mini App)

1. **Web Doctor (`/doctor`):**
   - Open `/` and click **«Shifokor sifatida kirish»** (creates an isolated `workspaces.is_demo = true` sandbox).
   - Assign **1–3 medications** with custom units (`mg`, `mcg`, `g`, `iu`) and **1–2 Asia/Tashkent scheduled times**, set High + optional Low BP thresholds, daily step goal, and one of **3 rehabilitation movements** (`chair_stand`, `elbow_bend`, `seated_knee_ext`).
   - Optionally generate an **AI 7-day clinical brief** (`Vercel AI Gateway` primary -> `Cloudflare Workers AI` fallback -> deterministic Uzbek fallback), verify DB-ID citation chips, edit draft reply, and click **«Tahrirlash va L4 tasdiqlash»**.
2. **Web Patient (`/patient` & `/patient/exercise`):**
   - Switch to **«Bemor sifatida kirish»** (same isolated demo workspace).
   - Record doses (`Ichdim` / `Icha olmadim`), run **DoriMos** medication-box verification with patient confirmation (`L2`), enter BP (`50–260` / `30–160` mmHg) seeing instant High/Low zone feedback, complete **Teach-Back** comprehension quiz, test `/patient/exercise` (prepared sample first, live camera/upload fallback), and generate an anonymous 24-hour **Yaqinim (Caregiver)** aggregate link (`/caregiver/[token]`, `405` on writes, zero medication names or `doctor_note` leakage).
3. **Android Companion (`android/`):**
   - On desktop `/doctor`, generate a 1-time **Android pairing code** (`POST /api/demo/android/pairing`) or test **Standalone Demo** mode.
   - Sign in on Android (Dark/Light `Rethink Clinical` theme + `A+` large text toggle), sync multi-dose schedule, log manual steps + `Hardware` sensor steps separately (`demo_sim` available only when `isDemo === true`), run all 3 MediaPipe movements (`Full` default / user-selectable `Heavy`), extract problem-cycle keyframes for AI observation, and upload consented video (`≤ 60 s`, `≤ 20 MiB`) via signed URL.
4. **Telegram Mini App & Bot (`/tg` & `services/telegram_bot/`):**
   - Open `/tg` directly in browser (1-click Demo via iframe-safe short-lived `tgm1.` Bearer token — no cookies required) OR pair a Telegram chat from `/doctor` or `/patient`.
   - Test `/bugun` (time-sorted multi-dose picker with semantic `success`/`primary`/`danger` inline buttons and in-place `EditMessageText`), `/bosim 135/85`, `/qadam 4800`, `/hisobot`, and `/maxfiylik`.
   - Observe **Privacy-by-Default**: un-opted chats mask drug names, BP/step numbers, and reply text; toggling **«Chatda batafsil xabarlarni yoqish»** in the Mini App `Maxfiylik` tab or bot enables detailed summaries and full L4 brief reply notifications. Unlinking immediately revokes the Bearer token (`401`).

---

## 3. Story 2 — Pre-Seeded Clinic Authentication (`is_demo = false`)

1. Seed the isolated clinic workspace idempotently (public signup stays disabled via `AUTH_SIGNUP_ENABLED="false"`):
   ```bash
   node --env-file=.env.local --experimental-strip-types scripts/seed-clinic-demo.ts
   ```
2. Available pre-seeded accounts in workspace `d0000000-0000-4000-8000-000000000001`:
   - Doctor: `shifokor@demo.shifohalqa.uz` (`Dr. Kamola Karimova`)
   - Patients: `anvar@demo.shifohalqa.uz`, `malika@demo.shifohalqa.uz`, `rustam@demo.shifohalqa.uz`
   *(Use the clinic password configured during Supabase Auth seeding; never commit credentials to Git.)*
3. Log in on web (`/` clinic login) and/or Android (`POST /api/mobile/v1/login` stateless Supabase JWT), verify doctor-patient isolation, generate & approve a 7-day brief (`L4`), confirm Android offline/real `device_sensor` + `self_report` step separation (`demo_sim` hidden when `isDemo === false`), and verify doctor internal `doctor_note` and `acknowledged_note` never appear in patient/caregiver/mobile responses.

---

## 4. Evidence Ladder (`L0`–`L4`) & Honest Disclosure

| Level | Meaning | Source / Example |
|---|---|---|
| `L0` | Unverified self-report | Medication taken/missed, manual BP, manual rehab rep count, deferred DoriMos |
| `L1` | Passive / hardware telemetry | Android `TYPE_STEP_COUNTER` (`device_sensor`) |
| `L2` | User-confirmed sample or AI extraction | Confirmed DoriMos photo OCR (`photo_ocr`), uploaded/sample rehab video (`uploaded_video`) |
| `L3` | Live interactive CV stream | Eligible real-time camera MediaPipe rep analysis (`live_camera`) |
| `L4` | Clinician-verified record | Doctor-approved flag review, symptom review, exercise review, or 7-day clinical brief |

### Disclosed Limitations & Simulations
- **What runs live:** Supabase Auth + Postgres (`byswnhfcqxjvnallggxj`, `final-preview`), Next.js 16 SSR/API routes, `tgm1.` HMAC-SHA256 iframe Bearer auth, on-device Web/Android MediaPipe Pose (`Full` & `Heavy`), Mediabunny/Media3 frame extraction, signed Storage video uploads, deterministic clinical/triage rules, `aiogram==3.31.0` bot + bridge, and live Vercel AI Gateway / Cloudflare Workers AI / Gemini when keys/OIDC are present.
- **What is simulated or fixture-backed in demos:** Pre-seeded clinic fixtures (`scripts/seed-clinic-demo.ts`), 1-click sandbox workspaces (`workspaces.is_demo = true`), bundled CDC/James City County exercise clips and synthetic pillbox samples (`isDemo === true` only), `demo_sim` step helper (`isDemo === true` only), and Playwright's `OfflineTelegramSession` mock transport (`tests/e2e/telegram.spec.ts` avoids hitting external `api.telegram.org` during CI).
- **Medical disclaimer:** Not a diagnostic device or emergency service. Urgent red flags and persistent **"Tez yordam · 103"** controls instruct users to seek immediate medical attention.
