# ShifoHalqa engineering guide

Work in `~/Projects/uzhack` on local `main` for submission fixes. The public demo uses synthetic data. A push to remote `main` triggers Vercel and Railway. Get the owner's OK before releasing or merging an `exp/<idea>` experiment. Keep private environment files, user records, share links and service credentials out of Git and logs.

Read [V2_PLAN](docs/V2_PLAN.md) for current work, [SPEC](docs/SPEC.md) for the product contract and [INTERFACES](docs/INTERFACES.md) before changing an engine. [SUBMISSION](tasks/task-2/SUBMISSION.md) is the judge's browser walkthrough.

## Run and verify

- Node ≥22. Run `npm ci`, then `npm run dev`. Set `DEMO_MODE=true` and a random `SESSION_SECRET` of at least 32 characters in ignored `.env.local`. The judge workflow needs a populated schema and an isolated database. With no DB, only role/session navigation is available.
- Use a verified non-production Neon branch. Check its identity before using `psql` with the direct URL and [schema.sql](schema.sql). Use the pooled URL for the web app. A checkout name does not identify its database.
- Run `npm run verify` for types, lint, units and a production build. Run `npm run e2e` for session smoke. Supply the isolated branch as `SHIFO_E2E_DATABASE_URL` for the DB-backed browser suite. The optional live synthetic-box test uses `SHIFO_E2E_LIVE_DORIMOS=1`, `GEMINI_API_KEY` and `OPENROUTER_API_KEY`. Record the actual selection and results.
- For Telegram, run `uv sync --project services/telegram_bot --locked` and `uv run --project services/telegram_bot --locked pytest services/telegram_bot/tests`. Full web E2E uses this service with a mock Telegram transport. After Android changes run `./gradlew :app:assembleDebug :app:lintDebug :app:connectedDebugAndroidTest` in `android/` with a device.
- For the sandboxed agent worktrees, see [DUAL_AGENTS](docs/DUAL_AGENTS.md).
- Before release, complete the [judge checklist](tasks/task-2/README.md) in a fresh browser on the intended URL. Preserve the existing public link through the end of the Grand Final.

## Code map and extension points

| Change | Files and constraints |
|---|---|
| Roles and requests | `src/lib/demo-session.ts` signs the browser workspace and role. `seed.ts` provisions its synthetic actors. Web mutations in `src/app/api/demo` validate role and origin. Scope SQL by workspace, patient and doctor. |
| Task types | Start with `schema.sql`, `src/lib/clinical-types.ts`, `clinical-inputs.ts` and `clinical-store.ts`. Add Zod input/read contracts, idempotent writes, dated instances, doctor/patient views under `src/components`, and explicit adherence/caregiver inclusion rules. The present schema admits one medication and one vitals item per plan. Exercise and steps have separate stores. |
| Rules and evidence | Extend `src/lib/rules`, then `prepareEvidence` and the queue label/details for each new reason. Test both sides of the doctor's threshold, equal values, missing data, retries and workspace isolation. Use the scheduled day in `Asia/Tashkent`. Distinguish completed, reported missed and unanswered. |
| AI and devices | Pose and motion comparison live in `src/lib/pose` and `anticheat`. DoriMos uses Gemini Decisions for the quality check and OpenRouter for synthetic-label OCR. Keep patient confirmation and manual fallback. The public sample AI endpoint accepts only the bundled exercise sample. Android calls `/api/mobile/v1`. Python Telegram runs independently in `services/telegram_bot`. |

## Definition of done

AI measures, deterministic rules flag, the doctor decides. Preserve source and `ai_mode`. Uncertain input gets a retake or manual entry. Uploaded confirmed video is L2, eligible live camera is L3. Only doctor approval of the selected evidence log promotes it to L4. Keep internal notes private. Show all simulations and the limits of measurements in the UI and submission note.

Document typed, Zod-validated public engine exports in [INTERFACES](docs/INTERFACES.md). Add a regression test for changed behavior and benchmark real measurements in [BENCHMARK](docs/BENCHMARK.md). Read installed Next.js guides and use Context7 for library API changes. Commit without AI co-author trailers.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
