# ShifoHalqa engineering guide

Submission fixes use `~/Projects/uzhack` on local `main`. Agents on the parallel experiment use the assigned worktree and branch below. The public demo uses synthetic data. A push to remote `main` triggers Vercel and Railway. Get the owner's OK before releasing or merging an `exp/<idea>` experiment. Keep private environment files, user records, share links and service credentials out of Git and logs.

## Parallel Codex and Antigravity work

- Codex owns `~/Projects/shifohalqa-codex` on `exp/dual-codex`. Antigravity owns `~/Projects/shifohalqa-antigravity` on `exp/dual-antigravity`. Start a fresh session in your assigned folder. Run `npm run lane -- check` before using local services. Keep edits, commits and cleanup within that worktree. The owner handles merging, pushing and deployment.
- Use the lane launcher for web, E2E, database schema and Android commands. Codex owns host ports 3030–3099 plus emulator ports 5580–5581. Antigravity owns 3100–3199 plus 5582–5583. Leave the original checkout’s port 3000 available. Keep the lane’s own web hostname in the browser so session cookies stay separate. Use the assigned emulator serial for all device operations.
- Keep all database writes on your assigned Neon branch. Development uses `neondb` and browser tests use `shifo_e2e`. Use `npm run lane -- db-apply` for the two assigned schemas. Use the lane’s own ignored environment and synthetic fixtures. Playwright uses offline providers and a mock Telegram transport. Ask the owner for lane-specific credentials when a task needs a live service.
- Before adding a resource, check both agents’ reservations in [DUAL_AGENTS](docs/DUAL_AGENTS.md), verify the resource is free and record its owner, endpoint/port, data scope and cleanup command in your local `.lane/resources.md`. Name new external resources `shifo-codex-*` or `shifo-antigravity-*`. If a tool cannot isolate its data, credentials or device, coordinate exclusive use with the owner. Keep credentials out of the registry.
- At handoff, report your branch and commit, what changed, test and benchmark results, and resources or migrations the owner must reproduce. Use the common start tag in the comparison guide.

Read [V2_PLAN](docs/V2_PLAN.md) for current work, [SPEC](docs/SPEC.md) for the product contract and [INTERFACES](docs/INTERFACES.md) before changing an engine. [SUBMISSION](tasks/task-2/SUBMISSION.md) is the judge's browser walkthrough.

## Run and verify

- Node ≥22. Run `npm ci`, then `npm run dev`. Set `DEMO_MODE=true` and a random `SESSION_SECRET` of at least 32 characters in ignored `.env.local`. The judge workflow needs a populated schema and an isolated database. With no DB, only role/session navigation is available.
- Use a verified non-production Neon branch. Check its identity before using `psql` with the direct URL and [schema.sql](schema.sql). Use the pooled URL for the web app. A checkout name does not identify its database.
- Run `npm run verify` for types, lint, units and a production build. Run `npm run e2e` for session smoke. Supply the isolated branch as `SHIFO_E2E_DATABASE_URL` for the DB-backed browser suite. Add `SHIFO_E2E_LIVE_GEMINI=1` and a Gemini key for the optional live synthetic-box test. Record the actual selection and results.
- For Telegram, run `uv sync --project services/telegram_bot --locked` and `uv run --project services/telegram_bot --locked pytest services/telegram_bot/tests`. Full web E2E uses this service with a mock Telegram transport. After Android changes run `./gradlew :app:assembleDebug :app:lintDebug :app:connectedDebugAndroidTest` in `android/` with a device.
- Before release, complete the [judge checklist](tasks/task-2/README.md) in a fresh browser on the intended URL. Preserve the existing public link through the end of the Grand Final.

## Code map and extension points

| Change | Files and constraints |
|---|---|
| Roles and requests | `src/lib/demo-session.ts` signs the browser workspace and role. `seed.ts` provisions its synthetic actors. Web mutations in `src/app/api/demo` validate role and origin. Scope SQL by workspace, patient and doctor. |
| Task types | Start with `schema.sql`, `src/lib/clinical-types.ts`, `clinical-inputs.ts` and `clinical-store.ts`. Add Zod input/read contracts, idempotent writes, dated instances, doctor/patient views under `src/components`, and explicit adherence/caregiver inclusion rules. The present schema admits one medication and one vitals item per plan. Exercise and steps have separate stores. |
| Rules and evidence | Extend `src/lib/rules`, then `prepareEvidence` and the queue label/details for each new reason. Test both sides of the doctor's threshold, equal values, missing data, retries and workspace isolation. Use the scheduled day in `Asia/Tashkent`. Distinguish completed, reported missed and unanswered. |
| AI and devices | Pose and motion comparison live in `src/lib/pose` and `anticheat`. DoriMos uses `src/lib/ai` with synthetic fixtures. Read current Gemini docs and the Gemini API skill before changing it. Use the pinned Google Gen AI SDK, quality gate, extraction with `store: false`, patient confirmation and manual fallback. Android calls `/api/mobile/v1`. Python Telegram runs independently in `services/telegram_bot`. |

## Definition of done

AI measures, deterministic rules flag, the doctor decides. Preserve source and `ai_mode`. Uncertain input gets a retake or manual entry. Uploaded confirmed video is L2, eligible live camera is L3. Only doctor approval of the selected evidence log promotes it to L4. Keep internal notes private. Show all simulations and the limits of measurements in the UI and submission note.

Document typed, Zod-validated public engine exports in [INTERFACES](docs/INTERFACES.md). Add a regression test for changed behavior and benchmark real measurements in [BENCHMARK](docs/BENCHMARK.md). Read installed Next.js guides and use Context7 for library API changes. Commit without AI co-author trailers.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
