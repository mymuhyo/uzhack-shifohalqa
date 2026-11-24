# ShifoHalqa Grand Final — Cross-Harness Progress & Handoff Log

This append-only log coordinates handoffs across **Codex**, **OpenCode**, and **Antigravity** on branch `final`. Every agent appends an entry before ending a session (never rewriting prior entries).

## Handoff Entry Template

```markdown
## [YYYY-MM-DDTHH:MM:SSZ] <Milestone> — <Harness: Codex | OpenCode | Antigravity>
- **Branch / Commit**: `final` / `<short-sha or pending Gate commit>`
- **Completed**:
  - <file path> — <what changed>
- **Verification**:
  - `<command>` -> <exit code & exact observed summary>
- **Caveats / Blockers**: <missing keys, pending MCP approvals, or "None">
- **Next Concrete Task**: <exact milestone/task & file paths>
```

---

## [2026-11-24T05:08:00Z] M1a (Docs & Supabase Schema Foundation) — Antigravity
- **Branch / Commit**: `final` / `pending Gate commit`
- **Completed**:
  - `AGENTS.md` — Updated as unified cross-harness entry point (Codex, OpenCode, Antigravity) linking `docs/PLAN.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/SPEC.md`, `docs/INTERFACES.md`, `docs/BENCHMARK.md`, preserving `<!-- BEGIN:nextjs-agent-rules --> ... <!-- END:nextjs-agent-rules -->` verbatim.
  - `docs/DECISIONS.md` — Authored `ADR-001` through `ADR-006` (reconciling `ADR-002` to canonical `public` schema for 33 tables + unexposed `private` schema for `SECURITY DEFINER` RLS helpers, `handle_new_user()`, and 5 Telegram triggers, plus explicit column-visibility rule for `doctor_note` / `acknowledged_note`).
  - `docs/PLAN.md` — Authored `M1a`–`M6` execution roadmap with exact 6 migration filenames, file targets, acceptance criteria, and verification commands (`M1a` marked `[~]`).
  - `docs/PROGRESS.md` — Initialized cross-harness handoff log template and M1a entry.
  - `supabase/migrations/20261124000100_core_clinical_schema.sql` — 26 core clinical tables in `public.*` (`workspaces`, `doctors`, `patients`, `plans`, `plan_items`, `task_instances`, `evidence_logs`, `dorimos_scan_limits`, `flags`, `flag_followups`, `urgent_symptoms`, `audit_events`, `exercise_prescriptions`, `exercise_attempts`, `daily_step_counts`, `caregiver_links`, `caregiver_audit_events`, `caregiver_acks`, `android_demo_access`, `telegram_pairings`, `telegram_doctor_links`, `telegram_flag_notices`, `telegram_patient_pairings`, `telegram_patient_links`, `telegram_patient_notices`, `telegram_doctor_events`), composite FKs, and indexes.
  - `supabase/migrations/20261124000200_telegram_triggers_and_grants.sql` — `private` schema, 5 `SECURITY DEFINER SET search_path = ''` Telegram enqueue triggers, and conditional `shifohalqa_telegram_service` grants.
  - `supabase/migrations/20261124000300_r4_auth_and_r5_extensions.sql` — `profiles`, `clinic_memberships`, `on_auth_user_created`, `parq_screenings`, `teach_back_attempts`, `vitals_ocr_scans`, `exercise_segments`, `ai_clinical_briefs`, and R5 extensions on `evidence_logs` & `exercise_attempts`.
  - `supabase/migrations/20261124000400_rls_helpers_and_policies.sql` — `private.*` RLS helpers, RLS enabled on all 33 `public.*` tables, single cohesive initPlan policies per `(table, command, authenticated)`, explicit deny policies on `dorimos_scan_limits` and `android_demo_access`, `anon` revoked.
  - `supabase/migrations/20261124000500_storage_buckets_and_policies.sql` — Private Storage buckets `ocr-scans` (6 MiB) and `exercise-segments` (20 MiB) + `storage.objects` RLS policies.
  - `supabase/migrations/20261124000600_realtime_publications.sql` — Idempotent `supabase_realtime` publication for 7 live clinical tables.
  - `supabase/migrations/20261124000700_covering_fk_indexes.sql` — Covering btree indexes for the 3 composite FKs flagged by `get_advisors` (`clinic_memberships`, `exercise_prescriptions`, `plans`).
  - `src/lib/supabase/database.types.ts` — Generated via `supabase_mcp` `generate_typescript_types` (1,633 lines, 48,313 bytes; all 33 `public` tables typed).
- **Verification**:
  - `supabase_mcp` `list_migrations` on `byswnhfcqxjvnallggxj` -> 6 migrations (`20261124000100`..`20261124000600`) applied; `20261124000700_covering_fk_indexes.sql` authored and awaiting parent/Sentinel apply + advisor re-check.
  - `supabase_mcp` `list_tables` (`public`) -> 33 tables, all `rls_enabled: true`.
  - `supabase_mcp` `get_advisors` (after `000600`) -> Security: 0 lints; Performance: 0 `auth_rls_initplan`, 0 `multiple_permissive_policies`, 3 `unindexed_foreign_keys` (addressed in `000700`).
  - `npm run typecheck && npm run lint && npm test` -> pending final run after `000700` verification.
- **Caveats / Blockers**:
  - `supabase_mcp/apply_migration` and `get_advisors` trigger user confirmation prompts that time out in subagent context; `20261124000700_covering_fk_indexes.sql` escalated to parent/Sentinel to apply and re-verify `get_advisors`.
- **Next Concrete Task**: Apply `20261124000700_covering_fk_indexes.sql` on `byswnhfcqxjvnallggxj`, re-verify `get_advisors` (`0` security, `0` unindexed FKs), finalize M1a Gate commit, and proceed to **M1b** (`package.json`, `src/lib/supabase/{client,server,admin,middleware}.ts`, `src/lib/db.ts`, `src/proxy.ts`, `next.config.ts`, 8 stores + Dual Auth).

## [2026-11-24T06:45:39Z] M1a (Verified & Closed) — Antigravity
- **Branch / Commit**: `final` / `pending M1a Gate commit`
- **Completed**:
  - `docs/PLAN.md` — Fixed migration count typo at line 13 (`"6 Supabase SQL migrations"` -> `"7 Supabase SQL migrations"`) and marked all M1a checklist/status markers `[x]` after verification checks passed.
  - `docs/PROGRESS.md` — Appended M1a Gate completion entry (prior `[2026-11-24T05:08:00Z]` entry preserved untouched).
  - Verified M1a baseline artifacts: `AGENTS.md` (Next.js rules block intact, all relative doc links resolve cleanly), `docs/DECISIONS.md` (`ADR-001`–`ADR-006`), 7 ordered SQL migrations (`20261124000100`..`20261124000700`) applied & verified on `byswnhfcqxjvnallggxj` (`33` RLS-enabled `public.*` tables, `0` security lints, `0` unindexed FK lints), and `src/lib/supabase/database.types.ts` (`1,633` lines, all `33` `public` tables typed).
- **Verification**:
  - `node -e "console.log('hasCurrentAgentRules:', require('./node_modules/next/dist/server/lib/generate-agent-files.js').hasCurrentAgentRules('.'))"` -> exit 0 (`hasCurrentAgentRules: true`).
  - `npm run typecheck` (`next typegen && tsc --noEmit`) -> exit 0 (`Generating route types... ✓ Types generated successfully`).
  - `npm run lint` (`eslint .`) -> exit 0 (0 errors, 0 warnings).
  - `npm test` (`vitest run tests/unit`) -> exit 0 (`Test Files 22 passed (22)`, `Tests 202 passed (202)`, Duration `2.56s`).
- **Caveats / Blockers**: None (AI & Telegram provider keys remain blank placeholders in `.env.local` for later milestones).
- **Next Concrete Task**: M1b — install `@supabase/supabase-js`, `@supabase/ssr`, `postgres`; remove `@neondatabase/serverless`; implement `src/lib/supabase/{client,server,admin,middleware}.ts`, `src/proxy.ts`, `next.config.ts` CSP, `src/lib/db.ts`, store migrations (including `site-telemetry.ts`) & Dual Auth (`src/lib/auth*.ts`, `/api/auth/*`).

## [2026-11-24T12:49:48Z] M1b-3 (Dual Auth, Hard Tenant Isolation, Unified Clinical/Mobile Parity & `patients.created_at` Fix) — Antigravity
- **Branch / Commit**: `final` / `(pending atomic commit on final)`
- **Completed**:
  - `src/lib/clinical-types.ts`, `src/lib/clinical-store.ts`, `src/lib/exercise-store.ts`, `src/lib/caregiver-store.ts`, `src/lib/activity-store.ts`, `src/lib/dorimos-store.ts`, `src/lib/telegram-store.ts`, `src/lib/mobile-demo.ts`, `src/lib/clinical-post.ts` — Added `AppRole`, `isPatientSideRole()`, nullable `doctorId: string | null`, and `isDemo?: boolean` on `ClinicalActor`; updated 17 patient/shared SQL clauses to `IS NOT DISTINCT FROM ${actor.doctorId}::uuid`; hardened doctor-only mutations (`!actor.doctorId`) and `telegram-store.ts` (`'caregiver'` guard + `'individual'` parity); refactored `caregiver-store.ts` with `readCaregiverSummaryByPatient` / `acknowledgeCaregiverHelpByPatient` and authenticated caregiver summary/ack helpers; updated `mobile-demo.ts` `accessRow.doctorId` to nullable.
  - `src/lib/auth-types.ts`, `src/lib/auth.ts`, `src/app/api/auth/{signup,login,logout,session}/route.ts`, `src/app/api/demo/login/route.ts` — Implemented `SessionContext` (`supabase` `isDemo: false` vs `demo` `isDemo: true`), `createSupabaseRouteClient`, `getAuthenticatedSupabaseUser`, `resolveWebSessionContext` (strict `is_demo = false` & `X-Workspace-Id` validation), `resolveClinicalActor` (`patientId` ownership, single-patient fallback ordered by `ORDER BY p.name ASC, p.id ASC`, early `allowDoctorWithoutPatient` return for 0-patient clinic doctors on `/api/clinical/telegram`, `400 patient_required`, entity-ID ownership check, `403` for `caregiver`), `resolveMobilePatientActor`, mutually exclusive cookie cleanup (`shifohalqa_demo` vs `sb-*`), `patient` placeholder doctor provisioning, and atomic signup rollback.
  - `src/lib/clinical-inputs.ts`, `src/lib/exercise-inputs.ts`, `src/lib/adherence.ts`, `src/lib/clinical-handlers.ts`, `src/app/api/clinical/{view,plan,evidence,review,followup,followup-ack,symptom,symptom-review,steps,dorimos,exercise-plan,exercise,exercise-review,exercise-coach,caregiver,caregiver-invite,telegram,patients}/route.ts` — Added native JSON Zod schemas (preserving all `*Form` exports and all 21 `/api/demo/*` routes intact) and 18 unified `/api/clinical/*` JSON routes including clinic doctor↔patient creation/linking (`patients`) and authenticated `caregiver` invite/accept/revoke/summary/ack flow; fixed `handleClinicalViewGet` (`:223`) and `handleClinicalPatientsGet` (`:804`) from nonexistent `p.created_at` to `ORDER BY p.name ASC, p.id ASC` (resolving live-DB `503` / Postgres `42703` on clinic doctor `/api/clinical/view`).
  - `src/app/api/mobile/v1/{today,evidence,steps,dorimos,exercise,exercise-coach,exercise/sample-ai}/route.ts` — Removed top-level `isAndroidDemoEnabled()` blocks and switched auth to `resolveMobilePatientActor(request)` so Supabase Bearer JWTs work when `DEMO_ANDROID_ENABLED=false` while preserving 64-hex demo token gating (`404` when disabled) and `401` on anonymous requests.
  - `tests/unit/auth-isolation.test.ts` — Added unit tests covering real-vs-demo `is_demo` isolation, mutually exclusive cookies & signup rollback, nullable `doctorId` (`individual`), multi-patient doctor IDOR (`400 patient_required` / `404`), caregiver invite/summary/`403`, mobile Bearer JWT parity, `doctor_note` / `acknowledged_note` DTO omission, `mockSql` `42703` schema-guard rejecting `p.created_at`/`patients.created_at`, and full clinic doctor live sequence (`GET /api/clinical/view?patientId=...` with open `160/100` `bp_max` red flag, `GET /api/clinical/patients`, `GET /api/clinical/telegram`, and `POST /api/clinical/plan` single-patient fallback).
  - `docs/PLAN.md`, `docs/INTERFACES.md`, `docs/PROGRESS.md` — Marked M1b `[x]` in `docs/PLAN.md`, documented Dual Auth & `/api/clinical/*` contracts in `docs/INTERFACES.md`, and logged M1b-3 sandboxed + live verification & M1 completion status.
- **Verification**:
  - **Sandboxed checks**:
    - `npm run verify` (`next typegen && tsc --noEmit && eslint . && vitest run tests/unit && next build`) -> exit `0` (`✓ Types generated successfully`, `0` ESLint errors/warnings, `Test Files 25 passed (25)`, `Tests 239 passed (239)`, `next build` `✓ Generating static pages (57/57)`).
    - `uv run --project services/telegram_bot --locked --no-sync pytest services/telegram_bot/tests` -> exit `0` (`22 passed in 10.07s`).
    - `grep -rn "p\.created_at\|patients\.created_at" src/ tests/` -> exit `0` (`0` matches in `src/`, only the negative `42703` schema guard and regression test title in `tests/unit/auth-isolation.test.ts`).
    - `grep -rn "doctor_note\|acknowledged_note\|SELECT \*\|\.select(" src/ services/telegram_bot/` -> exit `0` (`0` `SELECT *`, `0` Supabase `.select(` calls, `doctor_note`/`acknowledged_note` write-only in `src/lib/clinical-store.ts`).
  - **Parent-session live checks against `byswnhfcqxjvnallggxj` (`2026-11-24T12:49:48Z`)**:
    - `SHIFO_E2E_DATABASE_URL="$DATABASE_URL" npm run e2e` -> exit `0` (**31 passed, 1 skipped, 0 failed**, `2.4m`; 1 skipped = optional live-AI cloud exercise test).
    - Self-cleaning Live Supabase Auth/DB Roundtrip (`PORT=3199 HOSTNAME=127.0.0.1 DEMO_MODE=true DEMO_ANDROID_ENABLED=false npm run start`) -> exit `0` — all 9 steps passed: 4-role signup/logout/login/session (`isDemo: false` for doctor/patient/individual; `session: null` for unlinked caregiver), 0-patient `telegram`/`patients`/`view`, doctor-patient link `create`/`accept` -> `plan` -> `evidence` `160/100` -> `review` `L4` + zero `SECRET_NOTE_CHECK`/`doctor_note` leak, `caregiver` invite/accept/summary/ack + `403` on `/plan` (zero `doctor_note`/`acknowledged_note` leak), `individual` (`doctor_id IS NULL`) `/view` + `/steps`, mobile Bearer JWT `200` while `DEMO_ANDROID_ENABLED=false` + 64-hex `404`, cross-`is_demo` isolation + `clinic_memberships(is_demo=true)==0`, teardown `cleaned workspaces: 4 users: 4`.
- **Caveats / Blockers**: None (`final` M1b-3 atomic commit pending final verification wave; `main` at `bc27a09` untouched).
- **Next Concrete Task**: **M1 (`M1a` + `M1b-1/2/3`) Complete — Ready for M2 (Owner Checkpoint Pause)**: After the M1b-3 verification wave and atomic commit on `final`, pause cleanly per owner checkpoint before starting **M2** (`Tonometr OCR`, persisted `Teach-Back`, `AI 7-Day Clinical Brief`, `PAR-Q+ individual`, and `Deep AI/CV 720p & Suspicious Segments` + `docs/INTERFACES.md` updates). Cross-harness continuity docs (`AGENTS.md`, `docs/PLAN.md` with `M1a`/`M1b` `[x]`, `docs/DECISIONS.md`, `docs/INTERFACES.md`, `docs/PROGRESS.md`) are current on `final`.

## [2026-11-24T19:00:09Z] Grand Final owner checkpoint — Codex

- **Branch / baseline** — `final` / `6dd8083`. `main` resolved to `bc27a09`.
- **Completed** — Recorded the agreed scope in [DECISIONS](DECISIONS.md), reopened the M1 audit gate and ordered M2–M6 in [PLAN](PLAN.md), and added shared interaction requirements in [DESIGN](DESIGN.md). The first planned AI increment is a seven-day report draft linked to source records and reviewed by the assigned doctor.
- **Verification** — Markdown relative links, tables, ADR order and milestone coverage checked. `git diff --check` passed. `npm run verify` passed typecheck, lint and 239 unit tests in 25 files. The sandboxed production build remained in compilation and was interrupted, exiting 130. `timeout 120s npm run build` on the host exited 0 and generated 57/57 pages.
- **Next concrete task** — M1.1 in [PLAN](PLAN.md). Verify clinical table grants, raw Realtime access, note privacy and derived-field mutation boundaries with actual scoped identities in the isolated Supabase project. Keep the M1 audit gate open until its required checks pass.
