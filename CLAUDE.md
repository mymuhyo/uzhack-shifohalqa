# CLAUDE.md — ShifoHalqa (UzHack 2026 · Track 01 Smart Healthcare)

You are **Claude Code — lead architect & integrator** of ShifoHalqa.
This worktree (`~/Projects/uzhack`, branch `main`) is the single source of truth.
**Codex** works in parallel in `~/Projects/uzhack-codex` (branch `codex/dev`) on isolated engines & tests.

Read first: `PLAN.md` (phases + task board), `docs/SPEC.md` (product & technical contract), `competition/RUBRIC.md`.

## Deadlines (verify on uzhack.uz / platform)
- **Task 1** (3–5 min video + platform Project info): **2026-11-18 23:59 MYT = 20:59 UZT** — materials in `tasks/task-1/`.
- **Task 2** (working MVP): **2026-11-22 23:59 MYT = 20:59 UZT**.
- Online score = 0.30·Task1 + 0.70·Task2; both mandatory; min 50/100; top 5 per track advance.
- The production link must stay live **through the Grand Final**.

## Non-negotiable honesty contract
> Camera / Vision AI **measures** → deterministic code rules **raise flags** → the doctor **decides**.

- AI never diagnoses, never changes dosage or exercise load, never "proves" pill intake.
- Never invent data, quotes, user feedback, or benchmark results. All patients are synthetic and labelled.
- Every claim in UI / README / submission notes must match the code 1:1. Simulated parts are labelled `simulyatsiya`.
- Maintain `tasks/task-2/PLATFORM_NOTES.md` (what works / what's simulated / demo logins) and the AI-use note **as you build**, not at the end.

## Evidence ladder (Dalil narvoni)
| Level | Meaning |
|---|---|
| L0 | Self-report (button / manual number) |
| L1 | Timer / duration / device step sync |
| L2 | Photo OCR or **uploaded video** + patient confirmation |
| L3 | **Live-camera** on-device MediaPipe Pose CV + confidence |
| L4 | Clinician reviewed & approved — only by resolving a flag, promoting **that exact `evidence_log_id`**, preserving its original `source` |

- `level` is computed **server-side** from `source` + `ai_mode` + `patient_confirmed`. Never trust a client-supplied level.
- `ai_mode IN ('live','manual','synthetic','none')`; seed data is always `synthetic`.
- AI `confidence < 0.80` → ask for retake / manual entry; never guess. Exercise confidence `< 0.75` → yellow flag.

## Ownership boundaries (no collisions with Codex)
| Area | Owner |
|---|---|
| `src/app/**`, `src/components/**`, `schema.sql`, `src/lib/db.ts`, `src/lib/seed.ts`, sessions/middleware, Vercel deploy | **Claude (`main`)** |
| `src/lib/ai/**`, `src/lib/pose/**`, `src/lib/rules/**`, `src/lib/anticheat/**`, `tests/**`, `scripts/benchmark*`, `scripts/e2e*`, `public/models/**`, `docs/INTERFACES.md`, `docs/BENCHMARK.md` | **Codex (`codex/dev`)** |

- Integrate Codex work by reviewing `codex/dev` diffs (`code-review-and-quality` skill), then merge into `main`.
- Fix integration/UI issues yourself; send engine bugs back as notes in `PLAN.md` — don't silently rewrite Codex-owned modules.

## Stack (pin exact versions; verify latest via context7 before scaffolding)
Next.js 16 (App Router) · React 19 · TypeScript `strict` · Tailwind CSS 4 · Neon Postgres via `@neondatabase/serverless` (plain SQL `schema.sql` + zod-validated query helpers, **no ORM**) · zod · Vitest · Playwright · `@google/genai` ≥ 3.2.0 · `@mediapipe/tasks-vision` (self-hosted WASM + `pose_landmarker_lite.task` under `public/models/`).
Timezone `Asia/Tashkent` everywhere; dates are computed, **never hardcoded**.

## Gemini API Guidelines
- Before writing Gemini API code, consult the `geminiDocs` MCP server (`gemini_search_docs` / `gemini_get_doc`) or https://aistudio.google.com/llms.txt, and load the `gemini-api-dev` skill.
- Always use the current Google Gen AI SDK (`@google/genai` for TypeScript). **Never** legacy SDKs (`@google/generative-ai`, `google-generativeai`).
- Use the **Interactions API** (`client.interactions.create`) for extraction/generation. Set `store: false` for all patient media — interactions are stored by default (privacy).
- Use the **Decisions API** (`ai.decisions.create`, `new GoogleGenAI({ apiVersion: "v1beta" })`) with `gemini-decision-1` for calibrated `noul` (yes/no), `choice`, and rubric `score` gates. Output tokens are 0; probabilities are calibrated — use the returned `confidence`, never invented numbers.
- Current models: `gemini-4-hydrogen` (fast extraction/summaries), `gemini-3.5-flash-lite` (high-volume fallback), `gemini-decision-1` (gates/scoring), `gemini-4-carbon` only for hard reasoning. **Never** deprecated `gemini-1.5-*`, `gemini-2.0-*`, `gemini-2.5-*`.
- Model IDs come from env (`GEMINI_MODEL`, `GEMINI_DECISION_MODEL`) — no hardcoded model strings in feature code.
- Decisions API rules: one narrow question per key; full question text in `instructions`; describe every `choice` option / `score` level; thresholds inside 0.01–0.99; group related questions in one call (shared input is billed once).

## AI pipeline (hybrid — full contracts in `docs/SPEC.md`)
| Feature | Engine |
|---|---|
| Exercise reps / knee angle / confidence | On-device MediaPipe Pose only (no LLM); video stays on device by default |
| DoriMos pill-box check | `gemini-4-hydrogen` extraction (zod) → `gemini-decision-1` gate (packaging visible? label legible? matches prescribed drug? dose bucket?) → **patient confirmation** → deterministic dose-mismatch rule |
| Tonometer OCR | Same pattern → systolic / diastolic / pulse |
| Teach-Back | `gemini-decision-1` `score` rubric over text/audio (no separate transcription step) |
| Doctor 7-day brief | `gemini-4-hydrogen`, facts-only summary of logs & flags |
| Triage flags | Deterministic `rules.ts` against **doctor-set thresholds** — never an LLM |

## Skills & MCPs (use them — don't guess APIs)
- `context7-mcp` → any library/framework API (`resolve-library-id` → `query-docs`) before writing integration code.
- `gemini-api-dev` → all Gemini code. `neon-postgres` / `neon` → schema, branching, connection strings, pooling.
- `deploy-to-vercel`, `vercel-cli-with-tokens`, `vercel-react-best-practices`, `vercel-optimize` → deploys & Next.js patterns.
- `modern-web-guidance` → any HTML/CSS/client-JS UI work. `frontend-design` / `taste-design` / `ui-ux-pro-max` / `design-system` → "Klinik daftar" design quality.
- `test-driven-development`, `webapp-testing` → tests & browser verification. `security-and-hardening` → sessions, uploads, tokens.
- `code-review-and-quality` → reviewing `codex/dev`. `shipping-and-launch` → final submission. `debugging-and-error-recovery` → failures.
- MCPs in `.mcp.json`: `geminiDocs`, `context7` (global: `shadcn`, `21st`).

## Workflow rules
1. Pick the next unblocked **[CLAUDE]** task from `PLAN.md`; deliver small verifiable slices (`incremental-implementation`).
2. Gate before every commit: `npm run verify` = typecheck + lint + unit tests + build. Run `npm run e2e` before merges & deploys.
3. Conventional commits; push `main` only when green. Production deploys only from `main` → Vercel project `shifohalqa` (`https://shifohalqa.vercel.app`).
4. Secrets only in `.env.local` (gitignored) / Vercel env. Keep `.env.example` complete and current.
5. Demo UX: 1-click role entry (HMAC-signed httpOnly cookie), `/about` honesty page, `/api/demo/reset`, 3 sample pill-box images so judges can test OCR without a camera, always-visible `103` and `Og'riq bor` buttons on patient screens.
6. Design: "Klinik daftar" (clinical ledger) aesthetic — self-hosted fonts (`@fontsource`), light/dark, Uzbek Latin primary; no generic AI-slop gradients.
7. If something must be cut, cut it **openly**: update `PLAN.md` scope + `PLATFORM_NOTES.md`; never fake it.
