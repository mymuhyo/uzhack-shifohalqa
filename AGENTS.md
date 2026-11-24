# ShifoHalqa engineering guide

Work strictly on `final` (or feature branches off `final`) in `~/Projects/uzhack` for Grand Final development. `main` (`bc27a09`, tagged `v1-task2-demo`) is the **frozen live Task 2 judge demo** connected to Vercel production (`shifohalqa.vercel.app`), Railway (`@shifohalqa_bot`), and Neon `shifohalqa/main`. **Never commit, merge, or push to `main`** without the owner's explicit approval. Keep private environment files, user records, share links, and service credentials out of Git and logs.

This repository is structured for seamless cross-harness continuity across **Codex**, **OpenCode**, and **Antigravity**.

## Cross-harness continuity map

| Document | Purpose |
|---|---|
| [PLAN](docs/PLAN.md) | Active M1–M6 roadmap (`[ ]` / `[~]` / `[x]`), exact file targets, acceptance criteria, and verification commands |
| [DECISIONS](docs/DECISIONS.md) | Architecture Decision Records (`ADR-001` through `ADR-006`) for Web, Supabase, Auth, Android, Telegram, and AI/CV |
| [PROGRESS](docs/PROGRESS.md) | Append-only cross-harness handoff log (commit SHAs, commands run, observed outputs, blockers, next concrete task) |
| [SPEC](docs/SPEC.md) | Product contract, roles, four clinical pillars, L0–L4 evidence ladder, and the Golden Rule |
| [INTERFACES](docs/INTERFACES.md) | Zod-validated engine, DB, API, Android, and Telegram contracts |
| [BENCHMARK](docs/BENCHMARK.md) | Measured OCR, CV, AI, and animation baselines (never fabricate measurements) |

## Session start & handoff protocol

- **On session start**: Read `AGENTS.md`, `docs/PLAN.md`, the latest entry in `docs/PROGRESS.md`, and the relevant ADRs in `docs/DECISIONS.md`.
- **MCP & skill discipline**: Actively use configured MCP servers (`supabase_mcp` for `byswnhfcqxjvnallggxj`, `context7` for library/framework docs, `shadcn` for UI primitives, `gemini-api` for Gemini SDK/Decisions) and domain skills (`supabase`, `supabase-postgres-best-practices`, `frontend-design`, `emil-design-eng`, `react-best-practices`, `frontend-ui-engineering`, `modern-web-guidance`, `android-cli`, `compose-preview`, `gemini-api-dev`, `test-driven-development`, `code-review-and-quality`). If a required MCP server is disconnected or unauthenticated, **stop and ask the user to connect/sign in** — never silently bypass with local mocks.
- **Before ending a session**: Run the required checks for modified targets, update checkboxes in `docs/PLAN.md`, append a factual entry to `docs/PROGRESS.md`, review the staged diff, and create focused atomic commit(s) on `final` without `Co-authored-by` AI trailers. If no completed changes exist, report remaining work without creating an empty commit.

## Run and verify

- **Web**: Node `>=22`. Run `npm ci`, then `npm run dev`. Configure `.env.local` for the isolated non-production Supabase project `shifohalqa-final` (`byswnhfcqxjvnallggxj`, `ap-southeast-1`), with `DEMO_MODE=true` and a random `SESSION_SECRET` (`>=32` chars).
- **Web checks**: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run verify` (`typecheck` -> `lint` -> `test` -> `build`). Run `npm run e2e` (`playwright test`) for browser smoke, or supply isolated non-prod `SHIFO_E2E_DATABASE_URL` for the DB-backed suite (optional live DoriMos check: `SHIFO_E2E_LIVE_DORIMOS=1`). Record the exact selection and results.
- **Supabase migrations**: Ordered SQL migrations live in `supabase/migrations/` (`20261124000100_*` .. `20261124000700_*`). Apply and verify via `supabase_mcp` (`apply_migration`, `list_tables`, `get_advisors`, `generate_typescript_types` -> `src/lib/supabase/database.types.ts`) against `byswnhfcqxjvnallggxj`.
- **Telegram**: Run `uv sync --project services/telegram_bot --locked` and `uv run --project services/telegram_bot --locked pytest services/telegram_bot/tests`. Full web E2E uses this service with a mock Telegram transport.
- **Android**: Run `cd android && ./gradlew :app:assembleDebug :app:lintDebug :app:testDebugUnitTest` (plus Compose `@Preview` verification).
- **Release rule**: Preserve the existing public `main` link through the end of the Grand Final. Any future release to `main` requires explicit owner approval and prior verification on an isolated preview/staging URL.

## Code map and extension points

| Change | Files and constraints |
|---|---|
| Supabase & data layer | `supabase/migrations/*.sql` (33 tables in `public`, `SECURITY DEFINER` helpers & triggers in unexposed `private`), `src/lib/supabase/{client,server,admin,middleware,database.types}.ts`, `src/lib/db.ts` (`postgres.js` pooled adapter), `src/proxy.ts` (`/caregiver/:path*` `405` guard + `@supabase/ssr` session refresh), `next.config.ts` CSP. |
| Dual auth & sessions | `src/lib/auth.ts`, `src/lib/auth-types.ts`, `src/app/api/auth/**` (Supabase Auth for `doctor`, `patient`, `caregiver`, `individual`) alongside isolated 1-click Judge Demo (`src/lib/demo-session.ts`, `src/lib/seed.ts`, `src/app/api/demo/**`) enforced by `workspaces.is_demo` + RLS. |
| Clinical tasks & rules | `src/lib/clinical-types.ts`, `src/lib/clinical-inputs.ts`, `src/lib/clinical-store.ts`, `src/lib/rules/`, `src/lib/parq.ts`, `src/lib/teach-back-store.ts`, `src/lib/caregiver-store.ts`. Scope SQL by workspace/patient/doctor; use `Asia/Tashkent` scheduled days; distinguish completed, reported missed, and unanswered; keep internal `doctor_note` and `acknowledged_note` out of patient/caregiver DTOs and client `select(...)` lists. |
| AI, OCR & deep CV | `src/lib/pose/` (`createPoseTracker`, `analyzeExerciseDiagnostics`, per-cycle suspicious segments), `src/lib/anticheat/`, `src/lib/ai/` (`dorimos.ts`, `tonometr.ts`, `clinical-brief-ai.ts`, `exercise-video-review.ts`, `exercise-coach.ts`). Keep patient confirmation & manual/deterministic fallbacks; keep heavy MediaPipe/Mediabunny bundles lazy-loaded. |
| Web UI/UX | `components.json`, `src/components/ui/` (shadcn/ui), `src/components/{auth,doctor,patient,exercise,caregiver,telegram}/`, `src/app/**`. Use Clinical Ledger tokens + Tailwind v4 + Motion (`reducedMotion="user"`) + Lucide + optimistic JSON mutations. |
| Android & Telegram | Android clean rewrite in `android/app/src/main/java/uz/shifohalqa/android/{data,domain,ui,cv,sync}/` calling `/api/mobile/v1/*` + Supabase Auth. Interactive Mini App at `src/app/tg/` (`POST /api/telegram/auth` `initData` HMAC verification) + Python `aiogram` worker in `services/telegram_bot/`. |

## Definition of done

**AI measures, deterministic rules flag, the doctor decides.** Preserve `source` and `ai_mode`. Uncertain input gets a retake or manual entry. Confirmed OCR photo or uploaded video is `L2`; eligible live camera is `L3`. Only doctor approval of the selected evidence log promotes it to `L4`. Keep `doctor_note` and `acknowledged_note` private. Disclose all simulations and measurement limits in the UI and submission notes.

Document typed, Zod-validated public engine exports in [INTERFACES](docs/INTERFACES.md), add regression tests for changed behavior, and benchmark real measurements in [BENCHMARK](docs/BENCHMARK.md). Read installed Next.js guides and use Context7 for library API changes. Commit without AI co-author trailers.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
