# ShifoHalqa Grand Final — Execution Plan (`M1`–`M6`)

**Branch**: `final` (`main` tagged `v1-task2-demo` is frozen and MUST NOT be touched)  
**Target Supabase Project**: `shifohalqa-final` (`byswnhfcqxjvnallggxj`, `ap-southeast-1`, Postgres `17.12`)  
**Status Legend**: `[ ]` Todo · `[~]` In Progress / Ready for Gate · `[x]` Verified Done

---

## Milestone Overview

| Milestone | Scope | Status | Dependencies |
|---|---|---|---|
| **M1a** | Cross-harness docs (`AGENTS.md`, `DECISIONS.md`, `PLAN.md`, `PROGRESS.md`), 7 Supabase SQL migrations, RLS, Storage, Realtime, `database.types.ts` | `[x]` | `supabase_mcp` (`byswnhfcqxjvnallggxj`) |
| **M1b** | `@supabase/supabase-js` + `@supabase/ssr` + `postgres` driver, `src/proxy.ts`, CSP, 8 stores migrated off Neon, Dual Auth (`supabase` vs `demo`) & isolation | `[ ]` | M1a |
| **M2** | Tonometr OCR, persisted Teach-Back, AI 7-Day Clinical Brief, PAR-Q+ `individual`, deep AI/CV video analysis & suspicious segment extraction, `INTERFACES.md` | `[ ]` | M1b |
| **M3** | Web UI/UX overhaul (Tailwind v4, shadcn/ui, Motion, Lucide), optimistic JSON mutations, lazy CV/video, interactive exemplars, segment review queue | `[ ]` | M1b, M2 |
| **M4** | Android clean-architecture rewrite (`data`, `domain`, `ui`, `cv`, `sync`), Compose M3 + animations, Supabase Auth + 1-click Demo, Tonometr, PAR-Q+, segments | `[ ]` | M1b, M2 |
| **M5** | Interactive Telegram Mini App (`/tg` with HMAC `initData` auth) + `services/telegram_bot` synced to Supabase Postgres | `[ ]` | M1b, M2 |
| **E2E Track** | Opaque-box Playwright & integration suite (Tiers 1–4) -> `TEST_READY.md` | `[ ]` | M1b |
| **M6** | 100% E2E Tiers 1–4 pass, Tier 5 adversarial hardening, independent UX/animation/performance rubric, `BENCHMARK.md`, final `PROGRESS.md` | `[ ]` | M3, M4, M5, E2E |

---

## M1a — Cross-Harness Docs, ADRs & Supabase Schema/RLS/Storage/Realtime/Types (`[x]`)

- [x] **R6 Cross-Harness Continuity Docs**
  - **Files**: `AGENTS.md`, `docs/DECISIONS.md`, `docs/PLAN.md`, `docs/PROGRESS.md`
  - **Acceptance Criteria**: `AGENTS.md` links all continuity docs and preserves `<!-- BEGIN:nextjs-agent-rules --> ... <!-- END:nextjs-agent-rules -->` verbatim; `docs/DECISIONS.md` documents `ADR-001` through `ADR-006` with `public` + `private` reconciliation and explicit column-visibility rule for `flags.doctor_note`, `urgent_symptoms.doctor_note`, `flag_followups.acknowledged_note`; `docs/PLAN.md` covers `M1a`–`M6`; `docs/PROGRESS.md` provides template + initial M1a entry.
  - **Verify**: `git diff AGENTS.md` confirms Next.js block untouched; all relative doc links resolve cleanly.
- [x] **R3 Ordered Supabase Migrations (`supabase/migrations/`)**
  - **Files**:
    1. `supabase/migrations/20261124000100_core_clinical_schema.sql` (26 core tables in `public.*`, `workspaces` with `is_demo`/`kind`, nullable `doctor_id` on `patients`/`plans`/`exercise_prescriptions`, composite FKs + FK/partial indexes, `UNIQUE (workspace_id, id)` on `exercise_attempts`)
    2. `supabase/migrations/20261124000200_telegram_triggers_and_grants.sql` (`private` schema, 5 `SECURITY DEFINER SET search_path = ''` Telegram enqueue triggers + conditional `shifohalqa_telegram_service` grants)
    3. `supabase/migrations/20261124000300_r4_auth_and_r5_extensions.sql` (`profiles`, `clinic_memberships`, `private.handle_new_user()` + `on_auth_user_created`, `parq_screenings`, `teach_back_attempts`, `vitals_ocr_scans`, `exercise_segments`, `ai_clinical_briefs`, and R5 extensions on `evidence_logs` & `exercise_attempts`)
    4. `supabase/migrations/20261124000400_rls_helpers_and_policies.sql` (`private.*` `SECURITY DEFINER` helpers, RLS enabled on all 33 `public.*` tables, 1 cohesive `(select ...)` initPlan policy per `(table, command, authenticated)`, explicit deny policies on `dorimos_scan_limits` and `android_demo_access`, `anon` revoked)
    5. `supabase/migrations/20261124000500_storage_buckets_and_policies.sql` (private buckets `ocr-scans` 6 MiB & `exercise-segments` 20 MiB + `SELECT`/`INSERT`/`UPDATE`/`DELETE` policies on `storage.objects`)
    6. `supabase/migrations/20261124000600_realtime_publications.sql` (idempotent `supabase_realtime` publication for `flags`, `exercise_attempts`, `urgent_symptoms`, `task_instances`, `flag_followups`, `teach_back_attempts`, `daily_step_counts`)
    7. `supabase/migrations/20261124000700_covering_fk_indexes.sql` (covering btree indexes for the 3 composite FKs on `clinic_memberships`, `exercise_prescriptions`, and `plans` flagged by performance advisor)
  - **Acceptance Criteria**: All 7 migrations applied to `byswnhfcqxjvnallggxj` via `supabase_mcp` `apply_migration`; `list_tables` confirms 33 `public` tables with `rls_enabled = true`; `get_advisors` (`security` + `performance`) returns zero security errors, zero RLS/function warnings, and zero unindexed FK notices.
  - **Verify**: `supabase_mcp` `list_migrations`, `list_tables`, `execute_sql` (buckets, realtime publication, triggers), `get_advisors`.
- [x] **Generated Supabase TypeScript Types & Baseline Checks**
  - **Files**: `src/lib/supabase/database.types.ts`
  - **Acceptance Criteria**: Generated via `supabase_mcp` `generate_typescript_types({"project_id": "byswnhfcqxjvnallggxj"})`, non-empty, includes all 33 `Database['public']['Tables']` entries; TypeScript/lint/unit tests pass cleanly.
  - **Verify**: `npm run typecheck && npm run lint && npm test` (exit 0, 202+ unit tests).

---

## M1b — Supabase Client Layer, Store Migration & Dual Auth + Isolation (`[ ]`)

- [ ] **Packages & Supabase Client Helpers**
  - **Files**: `package.json`, `package-lock.json`, `src/lib/supabase/{client,server,admin,middleware}.ts`, `src/proxy.ts`, `next.config.ts`
  - **Acceptance Criteria**: Install `@supabase/supabase-js`, `@supabase/ssr`, `postgres`; remove `@neondatabase/serverless`; compose `/caregiver/:path*` `405` guard with `@supabase/ssr` session refresh in `src/proxy.ts`; update `next.config.ts` CSP `connect-src` for `https://*.supabase.co` and `wss://*.supabase.co`.
  - **Verify**: `npm run typecheck && npm run lint`.
- [ ] **Database Driver & Store Migration off Neon**
  - **Files**: `src/lib/db.ts`, `src/lib/seed.ts`, `src/lib/clinical-store.ts`, `src/lib/exercise-store.ts`, `src/lib/caregiver-store.ts`, `src/lib/activity-store.ts`, `src/lib/dorimos-store.ts`, `src/lib/mobile-demo.ts`, `src/lib/telegram-store.ts`, `services/telegram_bot/shifo_telegram/store.py`, `tests/e2e/{clinical,caregiver,telegram}.spec.ts`
  - **Acceptance Criteria**: Replace `@neondatabase/serverless` with `postgres` behind `getDatabase()` preserving `sql.transaction()` + `ReadCommitted` + `FOR NO KEY UPDATE` semantics; update `shifohalqa.` -> `public.` and `demo_workspaces` -> `workspaces`; omit `doctor_note`/`acknowledged_note` from patient/caregiver DTOs; decouple valid caregiver share tokens in `caregiver-store.ts` from `isDemoEnabled()`.
  - **Verify**: `npm run verify` + `uv run --project services/telegram_bot --locked --no-sync pytest services/telegram_bot/tests`.
- [ ] **Dual Auth (`supabase` vs `demo`) & Hard Tenant Isolation**
  - **Files**: `src/lib/auth-types.ts`, `src/lib/auth.ts`, `src/lib/demo-session.ts`, `src/app/api/auth/{login,signup,logout,session}/route.ts`, `tests/unit/auth-isolation.test.ts`
  - **Acceptance Criteria**: Real users (`doctor`, `patient`, `caregiver`, `individual`) authenticate via Supabase Auth (`@supabase/ssr` / Bearer JWT) and resolve `SessionContext` (`isDemo: false`); 1-click Judge Demo authenticates via signed `shifohalqa_demo` cookie or `android_demo_access` (`isDemo: true`); zero cross-access between `is_demo = true` and `is_demo = false` workspaces.
  - **Verify**: `npm run verify` (with new unit tests covering real vs demo isolation).

---

## M2 — Clinical, OCR & Deep AI/CV Engines + Contracts (`[ ]`)

- [ ] **Tonometr OCR (`L2` `vitals`)**
  - **Files**: `src/lib/ai/tonometr.ts`, `src/lib/tonometr-contract.ts`, `src/app/api/clinical/tonometr/route.ts`, `src/app/api/mobile/v1/tonometr/route.ts`, `tests/unit/tonometr.test.ts`
  - **Acceptance Criteria**: Validates PNG/JPEG/WebP `<= 6 MiB`, enforces `0.80` confidence & quality gate, persists `vitals_ocr_scans`, requires patient confirmation -> `L2` `vitals` + deterministic `evaluateRules` BP/chest-pain flags, routes illegible images to `retake` and provider outages to `L0` manual entry.
- [ ] **Persisted Teach-Back & AI 7-Day Clinical Brief**
  - **Files**: `src/lib/teach-back-store.ts`, `src/app/api/clinical/teach-back/route.ts`, `src/lib/ai/clinical-brief-ai.ts`, `src/app/api/clinical/brief/route.ts`, `tests/unit/{teach-back,clinical-brief-ai}.test.ts`
  - **Acceptance Criteria**: Teach-Back attempts persisted in `teach_back_attempts` and exposed to both patient and doctor without changing adherence denominators; AI 7-Day Clinical Brief strictly grounded on `buildClinicalBrief` deterministic metrics with instant fallback to `deterministic_fallback`.
- [ ] **PAR-Q+ `individual` Role & Self-Guided Plans**
  - **Files**: `src/lib/parq.ts`, `src/lib/parq-store.ts`, `src/app/api/clinical/parq/route.ts`, `src/app/api/mobile/v1/parq/route.ts`, `tests/unit/parq.test.ts`
  - **Acceptance Criteria**: 7-question PAR-Q+ screening persisted in `parq_screenings`; deterministic risk classification (`cleared`, `caution`, `medical_clearance_required`) creates safe self-guided plans (`doctor_id IS NULL`) or blocks intense exercise with medical-clearance guidance.
- [ ] **Deep AI/CV Video Analysis, Interactive Exemplars & Suspicious Segment Extraction**
  - **Files**: `src/lib/pose/{engine,diagnostics,segments,exemplars}.ts`, `src/lib/ai/exercise-video-review.ts`, `src/lib/exercise-store.ts`, `src/app/api/clinical/exercise/analyze/route.ts`, `src/app/api/mobile/v1/exercise/analyze/route.ts`, `docs/INTERFACES.md`, `tests/unit/{pose-segments,exercise-video-review}.test.ts`
  - **Acceptance Criteria**: `PoseTracker` emits per-cycle `SuspiciousSegment[]` (`cycleIndex`, `fromMs`, `toMs`, `severity`, `errorCodes`, `peakAngleDeg`, `summaryUz`) across all 5 movements; generalized patient-video/keyframe AI review runs without overriding `evaluateRules` or `L0`–`L3` levels; suspicious segments upload to `exercise-segments` private bucket and surface in the Doctor Exception Queue; `docs/INTERFACES.md` updated with all new Zod contracts.
  - **Verify**: `npm run verify`.

---

## M3 — Web UI/UX Overhaul, Animations & Optimization (`[ ]`)

- [ ] **Tailwind v4 + shadcn/ui + Motion + Lucide Foundation**
  - **Files**: `components.json`, `package.json`, `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/**`
  - **Acceptance Criteria**: Clinical Ledger design tokens preserved in light/dark modes with accessible contrast, `@fontsource/golos-text` + `@fontsource/literata`, `<MotionConfig reducedMotion="user">`, GPU-only animations (`transform`/`opacity`).
- [ ] **Dual Auth, Optimistic Clinical Flows, Lazy CV & Interactive Exemplars**
  - **Files**: `src/app/page.tsx`, `src/app/{login,signup,doctor,patient,individual,about,caregiver/[token],demo/mashq}/**`, `src/components/{auth,doctor,patient,exercise,caregiver}/**`
  - **Acceptance Criteria**: Real login/signup alongside 1-click Judge Demo cards; primary mutations use optimistic JSON API updates instead of `303` reloads; Supabase Realtime live updates on Doctor Queue & Patient Notices; MediaPipe/Mediabunny strictly lazy-loaded; interactive correct-execution movement exemplars; Doctor Queue renders suspicious exercise segments (signed URLs) + AI 7-Day Brief + Teach-Back status; `103` & `Og‘riq bor` always visible for patients; `doctor_note` never sent to patient/caregiver UI.
  - **Verify**: `npm run verify`.

---

## M4 — Android Clean-Architecture Rewrite (`[ ]`)

- [ ] **Clean 5-Layer Rewrite (`data/`, `domain/`, `ui/`, `cv/`, `sync/`)**
  - **Files**: `android/app/src/main/java/uz/shifohalqa/android/{data,domain,ui,cv,sync}/**`, `android/app/src/test/**`
  - **Acceptance Criteria**: Modular Compose Material 3 rewrite with Clinical Ledger theme & smooth animations; Supabase Auth + 1-click Judge Demo pairing; Room `2.8.5` + WorkManager `2.12.0` outbox scoped to `(baseUrl, workspaceId)`; CameraX + MediaPipe Full/Heavy + Media3 frame inspector preserving `tests/fixtures/chair-stand/live.tsv` parity; per-cycle suspicious segment extraction; interactive exemplars; DoriMos + Tonometr OCR; Teach-Back; PAR-Q+ individual mode; Uzbek audio coach (`res/raw/rep_1..20.mp3`).
  - **Verify**: `cd android && ./gradlew :app:assembleDebug :app:lintDebug :app:testDebugUnitTest`.

---

## M5 — Interactive Telegram Mini App (`/tg`) & Bot Sync (`[ ]`)

- [ ] **Telegram Mini App (`/tg`) with `initData` HMAC Verification**
  - **Files**: `src/lib/telegram-auth.ts`, `src/app/api/telegram/auth/route.ts`, `src/app/tg/**`, `src/components/telegram/**`, `tests/unit/telegram-auth.test.ts`
  - **Acceptance Criteria**: Server-side HMAC-SHA256 verification of Telegram `initData` (`WebAppData`) + `auth_date` freshness; full role-aware clinical UI inside `/tg` (Patient daily tasks, DoriMos/Tonometr OCR, steps, Teach-Back, exercise launch; Doctor queue triage, suspicious segment inspection, AI brief, L4 review; Individual PAR-Q+); `HapticFeedback` & `MainButton`/`BackButton` integration; camera fallback when WebView blocks `getUserMedia`.
- [ ] **Python `aiogram` Bot Synced to Supabase Postgres**
  - **Files**: `services/telegram_bot/shifo_telegram/**`, `services/telegram_bot/tests/**`
  - **Acceptance Criteria**: Queries target `public.*` tables in Supabase Postgres; new notifications/deep links for Tonometr red flags & suspicious exercise segments while keeping `doctor_note` private.
  - **Verify**: `npm run verify` + `uv run --project services/telegram_bot --locked --no-sync pytest services/telegram_bot/tests`.

---

## E2E Track — Opaque-Box E2E Suite (Tiers 1–4 -> `TEST_READY.md`) (`[ ]`)

- [ ] **Requirement-Driven Playwright & Integration Suite**
  - **Files**: `playwright.config.ts`, `tests/e2e/{auth,judge-isolation,clinical,dorimos,tonometr,teach-back,parq,exercise-segments,caregiver,telegram,android-api}.spec.ts`
  - **Acceptance Criteria**: Covers real Auth + 1-click Judge Demo isolation, DoriMos & Tonometr OCR (confirmed + retake + manual), persisted Teach-Back, PAR-Q+ `individual`, suspicious exercise segment extraction -> Doctor Queue -> L4 approval, `/caregiver/[token]` `405`/`noindex`/`no-store`, `/tg` HMAC `initData`, and `/api/mobile/v1/*` contracts against isolated `SHIFO_E2E_DATABASE_URL`.
  - **Verify**: `npm run e2e` (session smoke) and `SHIFO_E2E_DATABASE_URL=... npm run e2e` (full DB-backed suite).

---

## M6 — Final Verification, Tier 5 Adversarial Hardening & Independent UX Rubric (`[ ]`)

- [ ] **Tier 5 Adversarial Hardening & Full Suite Pass**
  - **Files**: `tests/e2e/adversarial-security.spec.ts`, `docs/BENCHMARK.md`, `docs/PLAN.md`, `docs/PROGRESS.md`
  - **Acceptance Criteria**: 100% pass across E2E Tiers 1–4 and Tier 5 adversarial checks (cross-tenant IDOR, real-vs-demo leakage, tampered Telegram `initData`, duplicate file SHA-256, `0.75`/`0.80` boundary values, `doctor_note` leak check, offline Android outbox replay); independent UX/animation/performance rubric passed across Web, Android, and `/tg`; real measurements recorded in `docs/BENCHMARK.md`; `main` (`bc27a09`) verified untouched.
  - **Verify**: `npm run verify`, `SHIFO_E2E_DATABASE_URL=... npm run e2e`, `uv run --project services/telegram_bot --locked --no-sync pytest services/telegram_bot/tests`, `cd android && ./gradlew :app:assembleDebug :app:lintDebug :app:testDebugUnitTest`, `git log -1 main`.
