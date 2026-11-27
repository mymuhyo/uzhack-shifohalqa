# ShifoHalqa Grand Final execution plan (Lean Demo)

**Branch** — `final`. The Task 2 judge demo on `main` is frozen at `bc27a09`, tagged `v1-task2-demo`.

**Target** — Isolated `final` preview on Vercel + Supabase `shifohalqa-final` (`byswnhfcqxjvnallggxj`), private Storage, and a separate preview Telegram bot/worker guarded by `SHIFO_ENV_ID=final-preview`.

**Status** — `[ ]` planned, `[~]` open or in progress, `[x]` verified for the stated scope.

[DECISIONS](DECISIONS.md) is the owner-approved Lean Grand Final scope. [DESIGN](DESIGN.md) is the living interaction and animation contract (`shadcn/ui` + `Motion` + `Lucide`). [ROADMAP_V2](ROADMAP_V2.md) holds the post-Grand-Final clinical pilot and **Fully Agentic** architecture plan. [PROGRESS](PROGRESS.md) records prior M1a/M1b checks and session handoffs.

| Milestone | Scope | Gate |
|---|---|---|
| M1 | Close the 5 P0 security, schema, Storage, and environment-isolation patches | [x] |
| M2 | Story 1 & Story 2 shared backend: multi-drug, low+high BP, steps, supervised AI, signed video | [x] |
| M3 | High-craft Web UI (`shadcn/ui` + `Motion` + `Lucide`), Doctor queue, Patient flows, 3 exercises | [x] |
| M4 | Android patient polish: multi-drug, BP/steps, 3 exercises, `Full`/`Heavy` setting, Dark Mode | [~] |
| M5 | Telegram Mini App (Bearer auth), opt-in privacy chat, new API-backed bot actions | [ ] |
| M6 | Isolated `final` preview deploy, real-device/Telegram smoke, benchmarks, and judge handover | [ ] |

Close M1 before starting M2. Keep changes atomic and verifiable. Move any enterprise, multi-clinic onboarding, conflict-resolution, or autonomous longitudinal agent work strictly to [ROADMAP_V2](ROADMAP_V2.md).

---

## M1 — Close the 5 P0 foundation patches

M1a and M1b were committed in `140860d`, `12cdfde`, `3c6cf8c`, and `6dd8083`. Before M2, close the 5 concrete P0 blockers identified in the audit:

- [x] **M1.1 Direct DB & Realtime lockdown.** Add a forward migration (`20261125000100_lockdown_direct_access_and_fk_fixes.sql`) that:
  - revokes `anon` and `authenticated` table privileges on clinical `public.*` tables (`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated`) and drops permissive direct-client policies on clinical tables so Next.js API (`postgres.js`) is the sole clinical data wall;
  - removes raw clinical tables from `supabase_realtime` publication (closing `doctor_note`/`acknowledged_note` CDC leakage);
  - fixes the 4 composite FKs in `000300` (`teach_back_attempts`, `vitals_ocr_scans`, `evidence_logs`, `ai_clinical_briefs`) to `ON DELETE SET NULL (<nullable_col>)`;
  - removes direct patient `UPDATE` and `DELETE` policies on `storage.objects` (`ocr-scans`, `exercise-segments`) so uploaded evidence is immutable after submission.
- [x] **M1.2 Environment identity guard & deploy tracing.**
  - Add `public.environment_identity` table/row (`final-preview`) and require matching `SHIFO_ENV_ID` before app, bot, or E2E database writes (blocking accidental writes to Task 2 Neon `main`).
  - Add `/api/clinical/dorimos`, `/api/mobile/v1/dorimos`, and `/api/mobile/v1/exercise/sample-ai` to `outputFileTracingIncludes` in `next.config.ts`; fix `isSameOriginPost` in `src/lib/request-body.ts` for reverse-proxy `x-forwarded-proto`.
  - Update `.env.example` and `README.md` to reference Supabase `shifohalqa-final` and `supabase/migrations/` (removing stale Neon/`schema.sql` setup pointers on `final`).
- [x] **M1.3 Auth hardening & clinical source honesty.**
  - Gate public `POST /api/auth/signup` behind `AUTH_SIGNUP_ENABLED=false` (never trusting client-supplied `role: 'doctor'`); fix `allowDoctorWithoutPatient` in `src/lib/auth.ts` so `patientId` is `null` instead of the doctor UUID; add a seed script (`scripts/seed-clinic-demo.ts`) for 1 pre-seeded synthetic clinic doctor + 2–3 patients (`is_demo = false`).
  - Scope DoriMos synthetic `sampleId` scans (`src/lib/dorimos-server.ts`) and `demo_sim` steps (`src/lib/activity-store.ts`) strictly to `isDemo === true` sessions.

**M1 Gate checks.** Applied `20261125000100` & `20261125000200` on `byswnhfcqxjvnallggxj`, regenerated `src/lib/supabase/database.types.ts`, verified `get_advisors` (`0` security lints), passed `npm run verify` + Telegram `pytest`, and verified with a live test against `byswnhfcqxjvnallggxj` that an ordinary authenticated Supabase JWT gets `42501` (`permission denied`) on direct clinical table reads/writes and Storage overwrite/delete is rejected while Next.js API flows succeed.

---

## M2 — Clinical vertical slices, Supervised AI, and signed video API

Freeze shared Zod contracts in `src/lib/*` and update `docs/INTERFACES.md` as each slice lands.

- [x] **M2.1 Multi-medication schedule & units.** Forward migration relaxing `plan_items` single-medication constraint to support 1–3 distinct medications, 1–2 fixed daily times (`Asia/Tashkent`), and `strength_unit` (`mg`, `mcg`, `g`, `iu`). Update `src/lib/clinical-types.ts`, `src/lib/clinical-inputs.ts`, `src/lib/clinical-store.ts`, and `/api/mobile/v1/today` while keeping existing `/api/demo/*` smoke contracts passing.
- [x] **M2.2 Manual BP (high + low) & source-specific steps.**
  - Extend `src/lib/rules/evaluate-rules.ts` and `src/lib/clinical-inputs.ts` with clinician-configured **low BP (hypotension)** thresholds (`minSystolic`, `minDiastolic`), physiological bounds (`systolic > diastolic`, 50–260 / 30–160 mmHg), and optional linked repeat reading.
  - Migrate `daily_step_counts` PK to `(workspace_id, patient_id, activity_date, source)` so `device_sensor` and `self_report` (manual) coexist per day; compute 7-day trend preferring `device_sensor` when available and exposing both values to the doctor.
- [x] **M2.3 Supervised AI core (Vercel AI Gateway + Cloudflare fallback).**
  - Consolidate `src/lib/ai/provider-config.ts` and `src/lib/ai/completion-fallback.ts` around **Vercel AI Gateway** (primary) → **Cloudflare Workers AI** (fallback) → deterministic Uzbek fallback. Add DB-backed per-workspace AI rate limits and `prompt_hash` response caching.
  - **First AI increment — 7-day clinical brief & cited draft (`src/lib/ai/clinical-brief-ai.ts`):** Gather scoped patient context (per-drug adherence, BP trend, steps, exercises, open issues), generate a plain Uzbek summary + doctor reply draft citing exact DB record IDs (validated programmatically before persistence), let the doctor edit and approve (`L4`), and expose the approved reply on Web, Android, and Telegram.
  - **Compact Teach-Back (`src/lib/teach-back-store.ts`):** Persist 1–2 plan-grounded Uzbek comprehension questions per assigned plan with deterministic fallback.
  - **DoriMos update (`src/lib/dorimos-server.ts`):** Match `mg`/`mcg`/`IU` against the selected medication item and support a clear deferred state.
- [x] **M2.4 Three-movement CV, keyframe AI & signed full-attempt video.**
  - Add 1 cleared public sample video for `seated_knee_ext` alongside `chair_stand` and `elbow_bend` (`public/demo/` + `src/lib/exercise-sample.ts`).
  - Extract 3–5 keyframes + timestamps per flagged cycle and run grounded AI visual observation (`src/lib/ai/exercise-video-review.ts`) with uncertainty phrasing and deterministic fallback.
  - Implement server-authorized **signed upload URL** (`POST /api/clinical/exercise/video-upload` + `/api/mobile/v1/exercise/video-upload`) and **finalize** endpoint enforcing `≤ 60 s`, `≤ 20 MiB` (MP4/WebM), per-workspace quota, explicit consent flag, and immutable binding to `exercise_attempts`.
  - Implement authorized short-lived **signed playback URL** (`GET /api/clinical/exercise/[attemptId]/video`) enforcing assigned-doctor/patient scope and lazy expiry (`7 days after doctor response` or `30 days after upload`, whichever comes first).

**M2 Checkpoint.** `npm run verify` + unit/integration tests for multi-drug adherence, high/low BP + invalid reading rejection, dual-source steps, AI citation validation + deterministic fallback on provider outage, and signed video upload/finalize/expiry bounds.

---

## M3 — High-craft Web UI (`shadcn/ui` + `Motion` + `Lucide`)

Iterate freely on [DESIGN](DESIGN.md) to deliver judge-ready visual craft, tactile animations, and clinical clarity.

- [x] **M3.1 Design system & motion setup.** Install `lucide-react`, `motion`, and initialize `shadcn/ui` (`components.json`, `src/components/ui/`) mapped directly onto Clinical Ledger light/dark CSS tokens (`--paper`, `--card`, `--ink`, `--action`, `--urgent`, `--warn`, `--ok`). Wrap with `<MotionConfig reducedMotion="user">`.
- [x] **M3.2 Entry, Auth & Multi-Patient Doctor surface (`src/app/page.tsx`, `src/app/doctor/**`).**
  - Refocus `/` around Story 1 (Medication → Doctor Reply → 7-day Report) + Story 2 (3-movement Exercise CV), with 1-click Judge Demo AND compact **«Klinika hisobiga kirish»** Supabase login.
  - Upgrade `/doctor` to support both Judge Demo and real Supabase clinic sessions: assigned-patient list/switcher, priority queue (`red` → `yellow`), 7-day Supervised AI Brief card (source-record links, edit & L4 approve), and complete-attempt video player with clickable flagged-cycle timestamp markers + single review reply.
- [x] **M3.3 Patient & Caregiver surfaces (`src/app/patient/**`, `src/app/caregiver/**`).**
  - Upgrade `/patient` to support both Demo and Supabase sessions: multi-medication time-grouped schedule (`Ichdim`/`Icha olmadim`/`Dori tugadi`), DoriMos check, compact Teach-Back, manual BP with high/low feedback, 7-day step trend (`Telefon sensori` vs `Qo‘lda`), doctor replies, `Yaqinim` 24-hour share link, and always-reachable `103` + `Og‘riq bor`.
  - Upgrade `/patient/exercise` for all **3 polished movements** (`chair_stand`, `elbow_bend`, `seated_knee_ext`) with lazy-loaded MediaPipe/Mediabunny, prepared-video primary entry, flagged-cycle AI observations, and explicit consent (`Shu urinish videosini shifokorga yuborish`) with upload progress and error/cancel states.

**M3 Checks.** Verified `npm run verify`, full DB-backed `npm run e2e` (`31 passed, 0 failed`), and Chromium headless visual/functional QA across `360×800` & `1280×800`, light/dark modes, `A+ Katta shrift` toggle, keyboard Tab focus, and Supabase Auth clinic sessions.

---

## M4 — Native Android patient polish

Evolve existing `android/` Kotlin Compose code incrementally.

- [x] **M4.1 Theme, Auth & Daily workflows.**
  - Add Dark Mode color scheme parity to `ShifoTheme.kt`.
  - Support existing 1-time demo pairing code AND pre-seeded Supabase Bearer login (reusing `resolveMobilePatientActor`).
  - Upgrade `MobileApi.kt` & patient screens for multi-medication daily doses, manual BP (high + low zone feedback), dual-source steps (`Telefon sensori` + `Qo‘lda`) with 7-day trend, DoriMos, and 7-day report/doctor replies.
- [x] **M4.2 Three movements, `Full`/`Heavy` selector & consented video upload.**
  - Wire `chair_stand`, `elbow_bend`, and `seated_knee_ext` to prepared samples (downloaded/cached on demand to keep APK lean), live camera, and file picker.
  - Default on-device MediaPipe Pose to **`Full`** everywhere, and add a clear settings toggle (**«Aniqlik rejimi: Tezkor (Full) / Yuqori aniqlik (Heavy)»**) for recorded video analysis.
  - Display flagged-cycle AI observations and wire explicit patient consent (`Shu urinish videosini shifokorga yuborish`) to the signed Storage URL upload + finalize flow (with progress, cancel, and offline message).

**M4 Checks.** Verified `cd android && ./gradlew :app:assembleDebug :app:lintDebug :app:testDebugUnitTest`, `npm run verify`, all 9 Light/Dark/Large-Text Compose `@Preview` renders via `compose-preview`, and physical `SM_S928B` `ExerciseRecordedVideoTest` (`OK (2 tests)`, `34.621 s`: `Full` `16 549 ms` vs `Heavy` `17 940 ms`). Remaining paused per owner hold: interactive physical Android phone UI smoke for Story 1 + Story 2.

---

## M5 — Telegram Mini App (Bearer auth) and chat polish

- [x] **M5.1 Iframe-safe Mini App auth (`src/app/api/telegram/auth/route.ts`, `src/app/tg/**`).**
  - Verify Telegram `initData` HMAC, freshness, and binding server-side; return a **scoped short-lived Bearer token** (no `SameSite=Lax` cookie dependency in Telegram Web/Desktop iframes).
  - Reuse the upgraded M3 patient components inside `/tg` with Telegram theme/safe-area tokens, `MainButton`/`SecondaryButton`/`BackButton`, haptics, `enableClosingConfirmation`, and all **3 polished prepared-video exercises** with camera/file fallback.
- [x] **M5.2 Chat privacy opt-in, styled actions & API bridge (`services/telegram_bot/**`).**
  - Add per-patient detail opt-in setting: default notifications stay generic with a deep link to the exact Mini App record; opted-in chats receive drug names, short 7-day summary, and approved doctor replies (`telegram_queue_on_brief_approval`).
  - Style inline buttons (`primary`/`success`/`danger`), update messages in-place (`EditMessageText`) after confirmed actions, and route **new** M2/M5 clinical actions (multi-dose status, manual BP/steps, 7-day summary, opt-in toggle) to Next.js `/api/telegram/bridge` via `TELEGRAM_BOT_SERVICE_SECRET` + `X-Telegram-Chat-Id` instead of adding direct Python SQL.
  - Add `SHIFO_ENV_ID` startup check and `TELEGRAM_BOT_SERVICE_SECRET` validation to `services/telegram_bot/shifo_telegram/config.py`.

**M5 Checks.** Verified locally on `final` with `npm run verify` (`35` files, `313` unit tests), `uv run --project services/telegram_bot --locked --no-sync pytest services/telegram_bot/tests` (`24` passed), `tests/e2e/telegram.spec.ts` (`2/2` passed), and `360×800` Light/Dark Visual QA (`0` console errors, `0` overflow).

---

## M6 — Isolated preview deploy and Grand Final acceptance

- [~] **M6.1 Isolated preview setup.** Deployed `final` (`261eab8`) to Vercel Production `https://shifohalqa-final.vercel.app` (`SHIFO_ENV_ID=final-preview`, Supabase `byswnhfcqxjvnallggxj`, real secrets synced including generated `TELEGRAM_BOT_SERVICE_SECRET`) and verified live endpoints + frozen `main` (`bc27a09`, `https://shifohalqa.vercel.app`); separate Railway `services/telegram_bot` worker (`healthz` `200`, `@muhyo_uzhackbot` webhook `pending: 0`) still needs matching `TELEGRAM_BOT_SERVICE_SECRET` + `TELEGRAM_API_BASE_URL` env sync/redeploy for `/api/telegram/bridge` commands.
- [~] **M6.2 End-to-end judge walkthrough.** Automated Story 1 + Story 2 E2E (`33 passed`, `1 skipped` live DoriMos), Android Gradle (`assembleDebug`/`lintDebug`/`testDebugUnitTest`/`compileDebugAndroidTestKotlin`), live `https://shifohalqa-final.vercel.app` API smoke (demo `/tg` Bearer auth + clinic `/api/mobile/v1/login` -> `today` `isDemo=false`), and physical `SM_S928B` `ExerciseRecordedVideoTest` (`Full` `16 549 ms` vs `Heavy` `17 940 ms`) passed on `final`; interactive Android phone Story 1 + Story 2 UI smoke (paused per owner request) and live Telegram client tap remain pending.
- [x] **M6.3 Honest disclosure & evidence.** Verified deterministic fallbacks and zero `doctor_note` leakage, aligned Android `androidTest` for `Full`/`Heavy`, added SSR hydration click-safety regression tests, authored `docs/GRAND_FINAL_HANDOFF.md`, expanded next-phase Agentic roadmap in `docs/ROADMAP_V2.md`, updated `docs/BENCHMARK.md` with measured checks, and logged final verification runs in `docs/PROGRESS.md`.

**Deferred to [ROADMAP_V2](ROADMAP_V2.md):** Open clinic self-signup & one-time patient enrollment codes, emailsiz Android-only/Telegram-only onboarding & recovery, authenticated caregivers & clinic teams, `individual`/PAR-Q+, dated `plan_versions` & 7-day retroactive edits/conflict UI, doctor amendment revision threads, per-channel reminder schedulers, full 5-movement fixture pack, automated cron Storage expiry cleanup, experimental Telegram chat widgets, DMED/Asl Belgisi, and the **Fully Agentic Clinical Assistant**.
