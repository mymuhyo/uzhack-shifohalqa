# ShifoHalqa engineering guide

## Working approach

ShifoHalqa is a working beta demo. The current experience, product scope, architecture, frameworks, languages and AI providers are open to revision. Base proposals on what the current code actually does and what users need. Present alternatives and a recommendation, then follow the owner's choice. Update this guide and the relevant project contracts as the experiment evolves.

The public demo uses synthetic data. Keep private environment files, user records, share links and service credentials out of Git and logs. The owner approves merges and releases. A push to remote `main` triggers Vercel and Railway.

## Parallel Codex and Antigravity work

- Codex owns `~/Projects/shifohalqa-codex` on `exp/dual-codex`. Antigravity owns `~/Projects/shifohalqa-antigravity` on `exp/dual-antigravity`. Start a fresh session in your assigned folder. Run `npm run lane -- check` before using local services. Keep edits, commits and cleanup within that worktree. The owner handles merging, pushing and deployment.
- Use the lane launcher for services it supports. Adapt or replace it when a chosen change requires different tooling and carry forward the resource reservations. Codex owns host ports 3030–3099 plus emulator ports 5580–5581. Antigravity owns 3100–3199 plus 5582–5583. Leave the original checkout’s port 3000 available. Keep the lane’s own web hostname in the browser so session cookies stay separate. Use the assigned emulator serial for device operations.
- Use only data stores assigned to your worktree. The current Neon setup uses `neondb` for development and `shifo_e2e` for browser tests. `npm run lane -- db-apply` applies their schemas. Keep development and tests separate if you change the storage technology. Use your ignored environment and synthetic fixtures. Playwright currently uses offline providers and a mock Telegram transport. Ask the owner for lane-specific credentials when a task needs a live service.
- Before adding a resource, check both agents’ reservations in [DUAL_AGENTS](docs/DUAL_AGENTS.md), verify the resource is free and record its owner, endpoint/port, data scope and cleanup command in your local `.lane/resources.md`. Name new external resources `shifo-codex-*` or `shifo-antigravity-*`. If a tool cannot isolate its data, credentials or device, coordinate exclusive use with the owner. Keep credentials out of the registry.
- At handoff, report your branch and commit, what changed, test and benchmark results, and resources or migrations the owner must reproduce. Use the common start tag in the comparison guide.

Use [V2_PLAN](docs/V2_PLAN.md), [SPEC](docs/SPEC.md), [INTERFACES](docs/INTERFACES.md) and the [judge walkthrough](tasks/task-2/SUBMISSION.md) to orient yourself. Check them against the implementation and update the relevant references when an approved direction changes.

## Current run and verification commands

- The current web stack uses Node ≥22, `npm ci`, `npm run lane -- dev`, `npm run verify` and `npm run lane -- e2e`. Use the Telegram pytest suite and `npm run lane -- android-test` when relevant. If the stack changes, document the equivalent commands and record what you verified.
- Verify the affected journey and failure cases with synthetic fixtures. Use the [judge checklist](tasks/task-2/README.md) to check the browser demo before a release.

## Current code map

| Area | Current implementation |
|---|---|
| Roles and requests | `src/lib/demo-session.ts` signs the browser workspace and role. `seed.ts` provisions its synthetic actors. Web mutations in `src/app/api/demo` validate role and origin. Scope SQL by workspace, patient and doctor. |
| Task types | `schema.sql`, `src/lib/clinical-types.ts`, `clinical-inputs.ts` and `clinical-store.ts` define the current flow. The schema currently admits one medication and one vitals item per plan. Exercise and steps have separate stores. |
| Rules and evidence | `src/lib/rules`, `prepareEvidence` and the doctor queue handle flags and review. Scheduled days use `Asia/Tashkent`. Completed, reported missed and unanswered have distinct meanings. |
| AI and devices | Pose and motion comparison live in `src/lib/pose` and `anticheat`. DoriMos and exercise model adapters are in `src/lib/ai`. Android calls `/api/mobile/v1`. Python Telegram runs independently in `services/telegram_bot`. |
| Rehabilitation | The browser and Kotlin chair-stand counters share test traces. Android uses Full for live pose and Heavy for selected videos. Its sample AI API accepts only public CDC requests. Android saves pending summaries in Room and syncs them with WorkManager. Exercise replies bind to one attempt in `src/lib/exercise-store.ts`. Apply `schema.sql` to the assigned databases before running exercise integrations. |

## Safety and evidence

AI measures, deterministic rules flag, the doctor decides. Keep measurement provenance, uncertainty and clinician review distinct even when the evidence model or presentation changes. Keep private notes restricted and label simulations and model limitations.

Document changed contracts, verify the relevant behavior and report measured results. Use Context7 for library API changes. Commit without AI co-author trailers. The generated note below applies to Next.js work.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
