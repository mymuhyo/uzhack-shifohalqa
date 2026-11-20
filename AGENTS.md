# AGENTS.md — ShifoHalqa · Codex development

You are **Codex**, responsible for building, integrating, and verifying ShifoHalqa (UzHack 2026 · Track 01 Smart Healthcare) in `~/Projects/uzhack-codex` on **`codex/dev`**. Delegate independent work to Codex subagents when useful and retain responsibility for integration.

Read first: `PLAN.md` (use the A–I board and take the next unblocked Codex-owned task), `docs/SPEC.md` (contract), and `docs/INTERFACES.md` (public engine interfaces). Use [PLAN.md §10](PLAN.md#codex-workflow) to choose skills and MCP tools and prepare handoffs.

## Hard rules
- **Never push to `main`, never deploy, never touch Vercel project settings.** Push `codex/dev` only.
- Own the application scaffold, dependencies, UI, sessions, schema, seed, engines, tests, and documentation needed for cards A–I on `codex/dev`. The project team handles integration to `main` and the production release.
- Export typed, Zod-validated engine interfaces and document each public engine export in `docs/INTERFACES.md` for integration.
- Honesty contract: AI measures → deterministic rules flag → doctor decides. No invented data or benchmark numbers. Label `ai_mode` (`live/manual/synthetic/none`) on every evidence path. Low confidence → explicit retake/manual fallback, never a guessed value.
- Evidence levels are computed server-side; L4 only via doctor resolve of a specific `evidence_log_id`. **Uploaded video = L2, live camera = L3.**

## Gemini API Guidelines
- Before writing Gemini API code, consult the `geminiDocs` MCP server (`gemini_search_docs` / `gemini_get_doc`) or https://aistudio.google.com/llms.txt, and load the `gemini-api-dev` skill.
- Always use the current Google Gen AI SDK (`@google/genai` ≥ 3.2.0 for TypeScript). **Never** legacy SDKs (`@google/generative-ai`, `google-generativeai`).
- Use the **Interactions API** (`client.interactions.create`) for extraction/generation; set `store: false` for all patient media (privacy).
- Use the **Decisions API** (`ai.decisions.create`, `new GoogleGenAI({ apiVersion: "v1beta" })`, model `gemini-decision-1`) for calibrated `noul` / `choice` / `score` gates — 0 output tokens; use the returned `confidence`.
- Current models: `gemini-4-hydrogen` (default extraction), `gemini-3.5-flash-lite` (fallback), `gemini-decision-1` (gates/scoring). **Never** deprecated `gemini-1.5-*` / `2.0-*` / `2.5-*`. Read model IDs from env (`GEMINI_MODEL`, `GEMINI_DECISION_MODEL`).
- Decisions API: one narrow question per key; full question text in `instructions` (keys are invisible to the model); describe every `choice` option and ordered `score` level; thresholds inside 0.01–0.99; group related questions into one call; no context caching / batch support.

## Engines you build (study the archive, port the good parts, modernize + test)
Reference archive (read-only): `~/Projects/uzhack-reference-20261117.tar.zst` — extract into a temp dir to study the old lanes:
- `uzhack-agent-opencode/src/lib/pose.ts` + `src/components/ExerciseClient.tsx` — MediaPipe state machine (5-frame smoothing, hysteresis `WAITING→STANDING→DESCENDING→BOTTOM→ASCENDING→STANDING`), valid vs shallow reps, confidence, hip–knee–ankle angle on the better-visible side.
- `uzhack-agent-opencode/src/app/api/ai/ocr/route.ts` — OCR flow (client downscale 1600px, rate limit, model fallback, patient confirmation).
- `uzhack-agent-pi/src/components/patient/TaskCards.tsx` — tonometer OCR UX (**fix its bug**: unreadable photo must NOT set `ocrOk=true`).
- `uzhack-agent-claude/tests/rules.test.ts` — 25 deterministic rule tests to port & extend.
- `uzhack-agent-claude/schema.sql` — archived normalized schema for reference.

Old bugs you must **not** reproduce: approving the patient's *latest* log instead of the reviewed `logId`; uploaded video marked L3; motion signature stored but never compared; unreadable OCR accepted as a match; hardcoded date strings; doctor thresholds ignored by the rules engine; fake `setInterval` "MediaPipe"; silent fake OCR fallbacks.

Deliverable per engine: implementation + Vitest unit tests + `docs/INTERFACES.md` entry + (where relevant) a **real** benchmark run recorded in `docs/BENCHMARK.md`.

## Database & env for your lane
- Use the **Neon branch `codex-dev`** (isolated from production data). This worktree's `.env.local` `DATABASE_URL` points to it. Never run seeds/migrations against the production branch.
- Skills: `neon-postgres` / `neon` (branch ops), `context7-mcp` (any library API), `test-driven-development`, `webapp-testing`, `debugging-and-error-recovery`, `security-and-hardening`, `source-driven-development`.
- MCPs configured in `~/.codex/config.toml`: `geminiDocs`, `context7`.

## Verify gate before every push
`npm run verify` (typecheck + lint + unit tests + build) and `npm run e2e` smoke must pass. Report **real** results in the commit message / PR description. If a check fails: fix it or report it — never silence, skip, or fake it.

Android kodi o‘zgarganda debug APK, Android lint va native UI testlarini tekshiring.

## Maintaining this file
After a milestone or recurring issue, propose the exact `AGENTS.md` edit and its reason. Apply it only after the user explicitly approves that change.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
