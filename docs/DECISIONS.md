# ShifoHalqa Grand Final — Architecture Decision Records

This document records the core architectural decisions (`ADR-001` through `ADR-006`) for the ShifoHalqa Grand Final on branch `final`. Every decision preserves the frozen Task 2 judge demo on `main` (`bc27a09`, `v1-task2-demo`) and enforces the product Golden Rule in [SPEC](SPEC.md): **AI measures, deterministic rules flag, the doctor decides.**

---

# ADR-001: Web Stack, UI/UX Architecture, Animations & Optimistic Mutations (R1)

## Status
Accepted

## Date
2026-11-24

## Context
The Task 2 Web application runs on Next.js `16.4.6`, React `19.3.1`, TypeScript `5.9.3`, Zod `4.6.7`, and Tailwind CSS `4.3.5`, styled with hand-written CSS Modules (`*.module.css` + 711-line `src/app/globals.css`) and HTML `<form method="post">` endpoints (`src/lib/clinical-post.ts`) returning HTTP `303` redirects. Full-page `303` reloads reset scroll position, interrupt visual continuity, feel sluggish on clinic mobile networks, and lack accessible composable primitives (dialogs, drawers, tabs, toasts, trend displays). At the same time, `@mediapipe/tasks-vision` (`1.2.3`) and `mediabunny` (`1.63.0`) are heavy client bundles that must remain lazy-loaded so initial page loads stay fast on low-end mobile devices.

## Decision
1. **Core Framework Retained**: Keep **Next.js 16.4.6 (App Router) + React 19.3.1 + TypeScript 5.9.3 + Zod 4.6.7 + Tailwind CSS v4** (`4.3.5`).
2. **Design System & Component Primitives**: Adopt **shadcn/ui** (`components.json`, accessible Radix-backed primitives in `src/components/ui/`) styled with the **Clinical Ledger** design tokens (`--paper`, `--card`, `--ink`, `--action`, `--urgent`, `--warn`, `--ok`, self-hosted `@fontsource/golos-text` + `@fontsource/literata`, light/dark mode, large patient tap targets, and persistent `103` & `Og‘riq bor` controls).
3. **Motion & Iconography**: Adopt **Motion** (`motion/react`) wrapped in `<MotionConfig reducedMotion="user">` for calm, tactile state transitions (queue triage, task completion, drawers/sheets, progress indicators) using GPU-composited properties (`transform`, `opacity`) without layout thrashing, paired with **Lucide** (`lucide-react`) icons.
4. **Optimistic JSON Mutations**: Replace `303` form-POST reloads on primary clinical mutations with **optimistic client/API JSON mutations** (`fetch` + `useOptimistic` / `useTransition` + `router.refresh()` reconciliation) backed by Zod-validated Route Handlers (`/api/clinical/*`, `/api/demo/*`, `/api/auth/*`).
5. **Lazy Heavy CV Bundles**: Keep `@mediapipe/tasks-vision` and `mediabunny` strictly lazy-loaded (`next/dynamic` / on-demand `import()`) only when the user opens exercise capture or chooses a recorded video.

## Alternatives Considered
- **Alternative A: Keep CSS Modules + HTTP 303 form POSTs**
  - *Pros*: Zero new npm dependencies.
  - *Cons*: Full-page reloads discard scroll and animation state, degrade perceived responsiveness, and force bespoke accessible dialog/drawer boilerplate.
  - *Rejected*: Does not meet R1 UI/UX, animation, and optimization bar.
- **Alternative B: Rewrite Web as a Vite SPA / TanStack Start / Remix app**
  - *Pros*: Pure client-side routing.
  - *Cons*: Loses verified App Router Route Handlers, SSR `/caregiver/[token]` security headers and `src/proxy.ts` `405` guard, `outputFileTracingIncludes` for demo fixtures, and zero-config Vercel parity with high migration risk.
  - *Rejected*: Unnecessary churn with lower security/SSR cohesion.
- **Alternative C: Heavy enterprise UI suites (MUI, Ant Design, GSAP)**
  - *Pros*: Pre-built widgets.
  - *Cons*: Large bundle weight on low-end mobile devices and friction against Tailwind v4 Clinical Ledger tokens.
  - *Rejected*: Hurts Core Web Vitals and visual cohesion.

## Consequences
- Install `lucide-react`, `motion`, and shadcn/ui utilities (`clsx`, `tailwind-merge`, `class-variance-authority`, Radix primitives via `shadcn` MCP) and initialize `components.json` in M3.
- Preserve SSR security headers (`Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`) on `/caregiver/:path*`.
- Cover optimistic mutations, keyboard navigation, and `prefers-reduced-motion` in Playwright E2E tests.

## References
- [SPEC](SPEC.md), [INTERFACES](INTERFACES.md), `package.json`, `next.config.ts`, `src/proxy.ts`

---

# ADR-002: Database Migration from Neon to Supabase Platform (R3)

## Status
Accepted

## Date
2026-11-24

## Context
`schema.sql` defines 26 clinical/Telegram tables and 5 PL/pgSQL triggers inside schema `shifohalqa`. Twelve TypeScript/Playwright files currently depend on `@neondatabase/serverless` (`src/lib/db.ts`), executing atomic multi-CTE SQL statements and `sql.transaction((tx) => [...], { isolationLevel: 'ReadCommitted' })` with `FOR NO KEY UPDATE` / `FOR SHARE` row locks (`clinical-store.ts`, `exercise-store.ts`, `caregiver-store.ts`, `telegram-store.ts`, `activity-store.ts`, `dorimos-store.ts`, `seed.ts`, `mobile-demo.ts`). Meanwhile, `services/telegram_bot` uses `psycopg_pool` with `FOR UPDATE ... SKIP LOCKED`. R3 requires migrating from Neon to Supabase Postgres, Auth, Storage, and Realtime on isolated non-production project `shifohalqa-final` (`byswnhfcqxjvnallggxj`, `ap-southeast-1`, Postgres 17.12).

Additionally, `supabase_mcp` `generate_typescript_types` accepts strictly `{"project_id": string}` (with no `included_schemas` parameter, defaulting to `public`), and exposing custom schemas in PostgREST via `ALTER ROLE authenticator` disables Supabase Dashboard schema management.

## Decision
1. **Canonical `public` + Unexposed `private` Schema Layout**:
   - Place all **33 application tables** (26 migrated core tables with `workspaces` replacing `demo_workspaces` and nullable `doctor_id` on `patients`/`plans`/`exercise_prescriptions` for `individual` PAR-Q+ users, plus 7 R4/R5 tables: `profiles`, `clinic_memberships`, `parq_screenings`, `teach_back_attempts`, `vitals_ocr_scans`, `exercise_segments`, `ai_clinical_briefs`) in **`public`**.
   - Place all `SECURITY DEFINER SET search_path = ''` RLS helper functions, `handle_new_user()`, and the 5 Telegram enqueue trigger functions in an unexposed **`private`** schema (`REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;`, granting `USAGE` and targeted helper `EXECUTE` to `authenticated` only for RLS policy evaluation, while keeping trigger functions revoked from `authenticated`).
   - Update `shifohalqa.` -> `public.` and `demo_workspaces` -> `workspaces` across the 12 TS/E2E files in M1b and `services/telegram_bot/shifo_telegram/store.py` in M1b/M5.
2. **Ordered SQL Migrations (`supabase/migrations/`)**:
   1. `20261124000100_core_clinical_schema.sql`
   2. `20261124000200_telegram_triggers_and_grants.sql`
   3. `20261124000300_r4_auth_and_r5_extensions.sql`
   4. `20261124000400_rls_helpers_and_policies.sql`
   5. `20261124000500_storage_buckets_and_policies.sql`
   6. `20261124000600_realtime_publications.sql`
   7. `20261124000700_covering_fk_indexes.sql`
3. **Strict Row-Level Security & Column Visibility Discipline**:
   - Enable RLS on all 33 `public.*` tables; revoke all table privileges from `anon`; enforce `(select auth.uid())` / initPlan-friendly expressions and 1 cohesive permissive policy per `(table, command, authenticated)`; apply explicit deny policies (`USING (false) WITH CHECK (false)`) on server-only `dorimos_scan_limits` and `android_demo_access`.
   - **Critical Column Privacy Rule**: Because PostgreSQL RLS operates at row granularity across the shared `authenticated` Postgres role rather than per app-role column (`doctor` vs `patient`), Next.js stores, API routes, and any client `supabase-js` `select(...)` lists MUST explicitly omit `flags.doctor_note`, `urgent_symptoms.doctor_note`, and `flag_followups.acknowledged_note` from patient and caregiver responses.
4. **Private Storage & Realtime**:
   - Create private Storage buckets `ocr-scans` (6 MiB, PNG/JPEG/WebP) and `exercise-segments` (20 MiB, PNG/JPEG/WebP/MP4/WebM) with `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies on `storage.objects` scoped to `<workspace_id>/<patient_id>/...`.
   - Add `flags`, `exercise_attempts`, `urgent_symptoms`, `task_instances`, `flag_followups`, `teach_back_attempts`, and `daily_step_counts` to the `supabase_realtime` publication.
5. **Dual-Driver Next.js Data Layer (for M1b)**:
   - Use `@supabase/supabase-js` + `@supabase/ssr` (`src/lib/supabase/{client,server,admin,middleware}.ts`) for Auth, Storage, Realtime, and typed RLS-scoped queries (`src/lib/supabase/database.types.ts`).
   - Replace `@neondatabase/serverless` in `src/lib/db.ts` with `postgres` (`postgres.js`) behind the existing Neon-compatible tagged-template + `sql.transaction()` adapter (`DATABASE_URL`) so multi-CTE ACID transactions and `FOR NO KEY UPDATE` locks retain exact semantics.
   - Compose `@supabase/ssr` session refresh with the `/caregiver/:path*` `405` guard inside Next.js 16 `src/proxy.ts`, and update `next.config.ts` CSP `connect-src` for `https://*.supabase.co` and `wss://*.supabase.co`.

## Alternatives Considered
- **Alternative A: Keep `shifohalqa` schema in Supabase**
  - *Pros*: Zero table-prefix edits in stores.
  - *Cons*: `supabase_mcp` `generate_typescript_types` cannot specify `included_schemas` and only generates `public` types; exposing `shifohalqa` via `ALTER ROLE authenticator` disables Supabase Studio schema management; PostgreSQL forbids `INSERT ... ON CONFLICT` on views.
  - *Rejected*: Breaks native Supabase typegen, Realtime, and Studio integration.
- **Alternative B: Rewrite all 8 store modules to PostgREST (`supabase.from(...)`)**
  - *Pros*: Single JS client dependency.
  - *Cons*: PostgREST cannot express atomic multi-CTE `WITH ... FOR NO KEY UPDATE ... INSERT ... UPDATE` statements without rewriting every clinical workflow into dozens of custom SQL RPCs.
  - *Rejected*: High regression risk against existing ACID guarantees and tests.
- **Alternative C: Keep Neon Postgres alongside Supabase Auth/Storage**
  - *Pros*: Minimal DB driver diff.
  - *Cons*: Violates R3, duplicates database operations, and breaks RLS/Realtime integration with `auth.users`.
  - *Rejected*.

## Consequences
- `@neondatabase/serverless` is completely removed in M1b.
- `supabase_mcp` `get_advisors` (`security` and `performance`) must pass cleanly after every schema/RLS migration.
- `services/telegram_bot` points its `TELEGRAM_DATABASE_URL` at Supabase Postgres (`public.*` tables).

## References
- `schema.sql`, `supabase/migrations/*.sql`, `src/lib/db.ts`, [Supabase RLS Guide](https://supabase.com/docs/guides/database/postgres/row-level-security)

---

# ADR-003: Dual Authentication & Judge Demo Workspace Isolation (R4)

## Status
Accepted

## Date
2026-11-24

## Context
R4 requires full real-user authentication for `doctor`, `patient`, `caregiver`, and `individual` roles while preserving the frictionless 1-click Grand Final Judge Demo (`doctor`, `patient`, `individual`, Android pairing, Telegram Mini App) with strict isolation so judge sessions and real clinics never cross-contaminate. Furthermore, `src/lib/caregiver-store.ts` (`lines 91, 194`) currently gates `readCaregiverSummary` and `acknowledgeCaregiverHelp` behind `isDemoEnabled()`, which would block real clinic caregiver links when `DEMO_MODE=false`.

## Decision
1. **Discriminated `SessionContext` (`src/lib/auth-types.ts`, `src/lib/auth.ts`)**:
   - `kind: 'supabase'` -> `{ userId, workspaceId, role: 'doctor' | 'patient' | 'caregiver' | 'individual', actorId, isDemo: false }` resolved from `@supabase/ssr` cookie session (Web) or Supabase Bearer JWT (Android) + `public.clinic_memberships` (`status = 'active'`).
   - `kind: 'demo'` -> `{ workspaceId, role: 'doctor' | 'patient' | 'individual', actorId, isDemo: true }` resolved from signed `shifohalqa_demo` HMAC-SHA256 cookie (Web, gated by `DEMO_MODE=true` and `SESSION_SECRET >= 32` chars), `android_demo_access` Bearer token (Android), or verified Telegram Mini App demo link.
2. **Hard Database & RLS Partitioning**:
   - `public.workspaces` enforces `is_demo boolean` + `UNIQUE (id, is_demo)`.
   - `public.clinic_memberships` enforces `is_demo boolean NOT NULL DEFAULT false CHECK (is_demo = false)` with composite `FOREIGN KEY (workspace_id, is_demo) REFERENCES public.workspaces(id, is_demo)`, making it structurally impossible for real `auth.users` accounts to bind to `is_demo = true` judge workspaces.
   - Real auth routes reject `is_demo = true` workspaces; Demo routes reject `is_demo = false` workspaces; RLS helper functions (`private.*`) explicitly verify `w.is_demo = false` and `cm.is_demo = false`.
3. **Internal Note Protection Across Dual Auth**:
   - Consistent with ADR-002, because RLS uses the shared `authenticated` role, Next.js stores/routes and client `select(...)` queries MUST omit `flags.doctor_note`, `urgent_symptoms.doctor_note`, and `flag_followups.acknowledged_note` from patient and caregiver views/DTOs.
4. **Decoupled Caregiver Share Links**:
   - Remove the `isDemoEnabled()` hard-block in `src/lib/caregiver-store.ts` so valid unrevoked, unexpired SHA-256 caregiver tokens work for real clinic patients even when `DEMO_MODE=false`, while preserving `noindex`, `no-store`, `no-referrer`, `405` on non-GET/HEAD via `src/proxy.ts`, and `caregiver_audit_events`.

## Alternatives Considered
- **Alternative A: Separate deployments for real users vs judge demo**
  - *Rejected*: Violates R4 unified product requirement and doubles operational overhead.
- **Alternative B: Single shared demo workspace**
  - *Rejected*: Concurrent judges overwrite each other's clinical plans, flags, and reset state.
- **Alternative C: Custom password table bypassing Supabase Auth**
  - *Rejected*: Reinvents password hashing/sessions and breaks native Supabase `auth.uid()` RLS and `@supabase/ssr` integration.

## Consequences
- Dedicated `/login` and `/signup` routes (`/api/auth/*`) coexist cleanly with non-intrusive 1-click Judge Demo entry points on `/` and `/tg`.
- Both Android (`/api/mobile/v1/*`) and Telegram (`/tg`) support real Supabase Auth tokens alongside isolated 1-click Judge Demo flows.

## References
- `supabase/migrations/20261124000300_r4_auth_and_r5_extensions.sql`, `supabase/migrations/20261124000400_rls_helpers_and_policies.sql`, `src/lib/demo-session.ts`, `src/lib/caregiver-store.ts`

---

# ADR-004: Android Application Clean-Architecture Rewrite (R2)

## Status
Accepted

## Date
2026-11-24

## Context
`android/` currently contains 12 flat Kotlin files in `uz.shifohalqa.android` coupled to `PatientDemo` `SharedPreferences`, legacy demo-only endpoints, minimal animations, and no support for Supabase Auth, Tonometr OCR, Teach-Back persistence, PAR-Q+ individual mode, interactive movement exemplars, or per-cycle suspicious segment capture.

## Decision
1. **5-Layer Clean Architecture Rewrite (`android/app/src/main/java/uz/shifohalqa/android/`)**:
   - `data/` — Supabase Auth client + `/api/mobile/v1/*` API client, Room `2.8.5` local database + outbox queue, secure token storage.
   - `domain/` — Immutable domain models, deterministic pose angle/cycle parity matching `src/lib/pose/engine.ts` (`tests/fixtures/chair-stand/live.tsv`), and deterministic idempotency keys (`clientAttemptId` + `clientRequestHash`).
   - `ui/` — Jetpack Compose Material 3 (Compose BOM `2026.09.00`), Clinical Ledger light/dark theme, smooth spring/shared-element animations (`androidx.compose.animation`), Uzbek localization, accessible large buttons, persistent `103` & `Og‘riq bor` emergency actions, interactive movement exemplars, DoriMos + Tonometr OCR, Teach-Back quiz, PAR-Q+ individual flow, and Uzbek audio coach (`res/raw/rep_1..20.mp3`).
   - `cv/` — CameraX `1.6.2` + MediaPipe `tasks-vision:1.2.3` (`pose_landmarker_full.task` for live camera, `pose_landmarker_heavy.task` for recorded video) + Media3 `1.11.1` frame inspector + per-cycle suspicious segment/keyframe extraction.
   - `sync/` — WorkManager `2.12.0` outbox synchronization strictly scoped to `(baseUrl, workspaceId)`.
2. **Verification Baseline**: Verify Android changes via `./gradlew :app:assembleDebug :app:lintDebug :app:testDebugUnitTest` + Compose `@Preview` inspection (no physical device `connectedDebugAndroidTest` required for automated gate).

## Alternatives Considered
- **Alternative A: Incremental patches to existing flat `MainActivity.kt`**
  - *Rejected*: Violates R2 clean rewrite requirement and leaves UI, networking, and CV tightly coupled.
- **Alternative B: Cross-platform rewrite in Flutter or React Native**
  - *Rejected*: Discards verified MediaPipe Full/Heavy native pipeline, Media3 frame inspector, and existing Kotlin pose-fixture parity.

## Consequences
- Preserves raw camera/video frames on-device by default, uploading only user-confirmed suspicious keyframes/short segments.
- Supports both real Supabase Bearer JWT and 1-click Judge Demo pairing.

## References
- `android/app/build.gradle.kts`, `tests/fixtures/chair-stand/live.tsv`, [BENCHMARK](BENCHMARK.md)

---

# ADR-005: Interactive Telegram Mini App (`/tg`) & Bot Architecture (R2)

## Status
Accepted

## Date
2026-11-24

## Context
`src/components/telegram-mini-app.tsx` currently renders only a demo login form and link without verifying Telegram `initData` or providing in-Mini-App clinical workflows. Meanwhile, `services/telegram_bot` (`aiogram 3.31.0`, `aiohttp`, `psycopg_pool`) already runs webhook handling (`/start`, `/bugun`, `/holat`, `/ilova`, `/mashq`, `/help`, `/stop`, inline callbacks) and durable delivery workers (`FOR UPDATE ... SKIP LOCKED` + `RetryAfter`) backed by 5 PostgreSQL triggers and 22 passing `pytest` tests.

## Decision
1. **Verified Role-Aware Mini App (`/tg`)**:
   - Client integrates `window.Telegram.WebApp` (`initData`, `themeParams`, `MainButton`, `BackButton`, `HapticFeedback`, `viewportStableHeight`) and authenticates via `POST /api/telegram/auth`.
   - Server verifies Telegram `initData` HMAC-SHA256 using `TELEGRAM_BOT_TOKEN` (`WebAppData` key derivation) and `auth_date` freshness, resolving either the linked Supabase clinic user (`telegram_doctor_links` / `telegram_patient_links`) or an isolated Judge Demo session.
   - Inside `/tg`, Patients complete medication, DoriMos/Tonometr OCR, BP/symptoms, steps, Teach-Back, and exercise launch; Doctors triage the exception queue, inspect suspicious exercise segments, review AI 7-day briefs, and issue L4 approvals; Individual users complete PAR-Q+ and self-guided plans.
2. **Synchronized Python `aiogram` Service (`services/telegram_bot`)**:
   - Point `TELEGRAM_DATABASE_URL` at Supabase Postgres (`public.*` tables + `private.queue_telegram_*` triggers).
   - Extend bot commands, inline actions, and notification templates for Tonometr red flags, suspicious exercise segments, and Mini App deep links while never leaking `doctor_note` or `acknowledged_note`.

## Alternatives Considered
- **Alternative A: Trust `initDataUnsafe` on client**
  - *Rejected*: Severe authentication spoofing vulnerability.
- **Alternative B: Replace Python `aiogram` worker with Next.js serverless webhook**
  - *Rejected*: Loses durable `FOR UPDATE ... SKIP LOCKED` + `RetryAfter` queue processing and 22 existing `pytest` tests.

## Consequences
- Live `initData` auth requires `TELEGRAM_BOT_TOKEN`; unit and Playwright E2E suites use deterministic HMAC-signed test `initData` fixtures.
- Camera fallback UX (`getUserMedia` unavailable in restricted Telegram WebViews) routes smoothly to file upload or manual entry.

## References
- `src/components/telegram-mini-app.tsx`, `services/telegram_bot/shifo_telegram/`, `supabase/migrations/20261124000200_telegram_triggers_and_grants.sql`

---

# ADR-006: AI, OCR & Deep CV Video Analysis Pipeline (R5)

## Status
Accepted

## Date
2026-11-24

## Context
Task 2 delivered DoriMos OCR (Cloudflare Clef + Clairic Flash -> Gemini Decisions -> OpenRouter/OpenCode/Vercel fallback, `>= 0.80` confidence gate), 5-movement MediaPipe Pose tracking (`createPoseTracker` + `analyzeExerciseDiagnostics`), anti-cheat (`compareAttempt`), and CDC sample clip observation. R5 requires adding Tonometr OCR, persisted Teach-Back, AI 7-Day Clinical Brief, PAR-Q+ individual mode, interactive correct-execution exemplars, and generalized patient-video AI/CV analysis with automatic suspicious/incorrect segment extraction routed to the Doctor Exception Queue.

## Decision
Enforce the Golden Rule (*"AI measures, deterministic rules flag, the doctor decides"*) across every R5 capability:
1. **Tonometr OCR (`src/lib/ai/tonometr.ts`, `vitals_ocr_scans`)**: Validates PNG/JPEG/WebP (`<= 6 MiB`), runs quality/legibility gate + multi-provider structured extraction (`systolic`, `diastolic`, `pulse`, `confidence >= 0.80`) -> patient confirmation -> `L2` `vitals` evidence + deterministic `evaluateRules` BP/chest-pain rules; `< 0.80` or illegible triggers `retake`; provider outage falls back to `L0` manual entry.
2. **Persisted Teach-Back (`src/lib/teach-back-store.ts`, `teach_back_attempts`)**: Persists patient comprehension attempts, answers, and score in Postgres (visible to both patient and doctor) without altering medication/vitals adherence denominators.
3. **AI 7-Day Clinical Brief (`src/lib/ai/clinical-brief-ai.ts`, `ai_clinical_briefs`)**: Deterministic `buildClinicalBrief` (`src/lib/clinical-brief.ts`) computes all counts, BP trends, and adherence %; the AI provider chain (`vercel` -> `opencode_go` -> `gemini` / `openrouter`) synthesizes a concise Uzbek summary strictly grounded in those numbers, falling back instantaneously to deterministic `plainText`.
4. **PAR-Q+ Individual Role (`src/lib/parq.ts`, `parq_screenings`)**: 7-question screening -> deterministic risk stratification (`cleared`, `caution`, `medical_clearance_required`) -> self-guided exercise/step plan or clear medical-clearance warning.
5. **Deep AI/CV Video Analysis, Interactive Exemplars & Suspicious Segment Extraction**:
   - Extend `createPoseTracker` / `analyzeExerciseDiagnostics` (`src/lib/pose/`) to emit per-cycle `SuspiciousSegment` descriptors (`cycleIndex`, `fromMs`, `toMs`, `severity`, `errorCodes`, `peakAngleDeg`, `summaryUz`, keyframe/clip references) across all 5 movements (`chair_stand`, `elbow_bend`, `knee_lift`, `shoulder_raise`, `seated_knee_ext`).
   - Ship interactive **correct-execution reference exemplars** (animated joint/angle guides, target cues, Uzbek audio coaching) per movement across Web, Android, and `/tg`.
   - Generalized patient-video AI analyzer (`src/lib/ai/exercise-video-review.ts`) analyzes extracted suspicious segment keyframes (and optional user-confirmed short clip) to produce Uzbek form observations without altering deterministic `L0`–`L3` levels or `evaluateRules`.
   - Persist suspicious segments in `public.exercise_segments` + private Storage bucket `exercise-segments` (`20 MiB`) and surface them in the Doctor Exception Queue for `L4` approval or `retake`.

## Alternatives Considered
- **Alternative A: Upload every full raw exercise video to external LLMs**
  - *Rejected*: Violates on-device privacy-by-default, triggers payload/402 cost limits, and degrades mobile clinic bandwidth.
- **Alternative B: Allow LLM output to grant L4 approval or modify prescribed targets**
  - *Rejected*: Violates the [SPEC](SPEC.md) Golden Rule and clinical safety boundaries.

## Consequences
- Update [INTERFACES](INTERFACES.md) with Zod schemas for all new R5 engines and API routes in M2.
- Record real measured Tonometr OCR, AI Brief, and Segment Extraction timings in [BENCHMARK](BENCHMARK.md) in M6.

## References
- [SPEC](SPEC.md), [INTERFACES](INTERFACES.md), [BENCHMARK](BENCHMARK.md), `src/lib/pose/diagnostics.ts`, `src/lib/clinical-brief.ts`
