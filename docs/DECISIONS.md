# ShifoHalqa Grand Final architecture decisions

**Scope accepted 2026-11-25 MYT (revised after `/grill-me` audit).** This record defines the agreed **Lean Grand Final Demo** scope on `final`. [PLAN](PLAN.md) owns active execution status and acceptance checks. [DESIGN](DESIGN.md) owns the living cross-platform interaction and motion contract (iterated up to Grand Final and into v2). [ROADMAP_V2](ROADMAP_V2.md) owns the post-Grand-Final clinical pilot and **Fully Agentic** production architecture blueprint. [SPEC](SPEC.md), [INTERFACES](INTERFACES.md), and [BENCHMARK](BENCHMARK.md) contain Task 2 contracts and historical measurements and are updated as changed slices land.

Acceptance of an ADR means the design is agreed. M1 remains open until its five P0 security and isolation patches pass verification.

## ADR-001 — Lean Grand Final demo scope, platforms, and UI stack

**Status** — Accepted, revised.

ShifoHalqa on `final` is a **high-craft, end-to-end Grand Final judge demo** running on synthetic clinical histories and cleared public sample media. Rather than shipping half-finished hospital-scale administration, Grand Final focuses on two complete, reliable clinical stories across Web, Android, and Telegram:

1. **Primary story — Medication, vitals, and clinician-reviewed 7-day AI report:** Multi-medication daily schedule (1–3 drugs, 1–2 fixed times), `Ichdim` / `Icha olmadim` (`Dori tugadi` escalation), DoriMos package verification, manual BP (high + low thresholds), source-specific steps, and a supervised AI 7-day clinical brief + editable draft reply that the doctor approves (`L4`) and the patient sees across Web, Android, and Telegram.
2. **Secondary story — Three-movement rehabilitation CV and complete-attempt video review:** Three deeply polished movements (`chair_stand`, `elbow_bend`, `seated_knee_ext`) across **every** surface, with prepared public samples (plus optional live camera), on-device MediaPipe Pose CV, flagged-cycle keyframe AI observations, patient-consented full-attempt video upload via signed Storage URL, and doctor full-player timestamp navigation + review reply.

| Surface | Grand Final scope |
|---|---|
| Native Android | Patient daily schedule, medication, DoriMos, manual BP, sensor + manual steps, 7-day report & replies, all 3 polished exercises (`Full` default + user-selectable `Heavy` setting for recorded video), dark mode |
| Telegram Mini App | Patient daily flow, manual BP/steps, 7-day report & replies, and all 3 polished exercises with prepared-video CV/AI inside Telegram via Bearer auth |
| Telegram bot | Chat commands, opt-in detail privacy, styled inline dose actions, 7-day summary, approved doctor replies, and Mini App deep links |
| Patient Web | Full patient workflow, compact Teach-Back, caregiver 24-hour share link, and all 3 polished exercises |
| Doctor Web | Multi-patient clinic queue (via pre-seeded clinic login) + 1-click Judge Demo, 7-day AI report draft & L4 approval, and full-video timestamp review for all 3 movements |
| Caregiver Web (`Yaqinim`) | Patient-issued, revocable 24-hour daily aggregate & help acknowledgment link (`no-store`, `noindex`, `no-referrer`) |

**UI & Motion stack:** Keep Next.js App Router, React, Zod, Tailwind v4, and the Clinical Ledger visual identity. Upgrade Web components with **`shadcn/ui`**, **`Motion`** (`reducedMotion="user"`), and **`Lucide`** for crisp, high-craft UI and tactile animations; treat [DESIGN](DESIGN.md) as a living document that can be refined through Grand Final and evolved in v2. Load heavy MediaPipe/Mediabunny bundles strictly on demand.

## ADR-002 — Clinical API authority, database lockdown, and environment isolation

**Status** — Accepted, revised.

- **Single server authority:** Next.js API routes own all clinical reads, writes, validation, authorization, and transaction boundaries behind `postgres.js` + Supabase Auth/Postgres.
- **M1 P0 lockdown (no direct PostgREST/Realtime):** Close the direct `authenticated`/`anon` table exposure from M1a by revoking direct table privileges on clinical `public.*` tables (`REVOKE ALL ... FROM anon, authenticated`, default-deny RLS) and removing raw clinical tables from `supabase_realtime`. This eliminates direct column leakage (`doctor_note`, `acknowledged_note`) and forged `level=4` / `decision` / `audit_events` writes in a single forward migration. UI refreshes use authorized Next.js DTO polling/refresh.
- **Schema integrity & Storage hardening:** Fix the four composite FK `ON DELETE SET NULL` declarations in `000300` using Postgres column-list syntax (`ON DELETE SET NULL (<nullable_col>)`). Remove direct patient `UPDATE`/`DELETE` policies on private clinical Storage buckets so submitted evidence cannot be overwritten or deleted after review.
- **Deployment & environment guard:** Add `outputFileTracingIncludes` in `next.config.ts` for `/api/clinical/dorimos`, `/api/mobile/v1/dorimos`, and `/api/mobile/v1/exercise/sample-ai` so Vercel Serverless never hits `ENOENT` on bundled demo assets. Require a positive environment identity check (`SHIFO_ENV_ID` matched against `public.environment_identity`) before app, bot, or E2E writes so `final` can never accidentally write to the frozen Task 2 Neon `main` database.
- **Frozen `main` rule:** `main` (`bc27a09`, `shifohalqa.vercel.app`, `@shifohalqa_bot`, Neon `shifohalqa/main`) remains untouched throughout Grand Final. Dedicated least-privilege Postgres worker roles and full multi-clinic adversarial RBAC matrices move to [ROADMAP_V2](ROADMAP_V2.md).

## ADR-003 — Demo-first entry with pre-seeded clinic login

**Status** — Accepted, revised.

- **Primary judge path — 1-click Judge Demo:** Keep the isolated signed-cookie Judge Demo (`is_demo = true`) for instant 10-second Web role switching, paired with the existing 1-time Android pairing code (`32-hex`, 10 min) and Telegram `/start <code>` link. Disclose synthetic patient/sample status clearly in the UI.
- **Real Auth & multi-patient proof — Pre-seeded clinic login:** Provide a compact **«Klinika hisobiga kirish»** login screen backed by Supabase Auth (`is_demo = false`) with 1 pre-seeded synthetic clinic doctor and 2–3 synthetic patients so `/doctor` demonstrates real multi-patient queue scoping, tenant isolation, and Bearer mobile auth without requiring judges to register accounts.
- **Close self-assigned doctor loophole:** Gate public `POST /api/auth/signup` behind `AUTH_SIGNUP_ENABLED=false` in demo/preview environments (and never allow untrusted signup payloads to mint active `doctor` clinic memberships).
- **Explicitly deferred to [ROADMAP_V2](ROADMAP_V2.md):** Open clinic self-registration, short-lived one-time patient enrollment invite codes, phone/email-less Android-only & Telegram-only onboarding, channel unlink/recovery workflows, authenticated caregiver accounts (`caregiver-invite`), clinic care teams, and the `individual` / PAR-Q+ pathway.

## ADR-004 — Android patient experience and selectable CV accuracy

**Status** — Accepted, revised.

- Evolve the existing Kotlin Compose app (`CameraX`, `MediaPipe`, `StepTracker`, `Room`/`WorkManager`, `Keystore` session store) incrementally rather than rewriting from scratch. Add **Dark Mode** parity in `ShifoTheme.kt` to match Clinical Ledger light/dark tokens.
- **Selectable CV model accuracy (`Full` default, `Heavy` opt-in):** Default live camera and recorded video analysis to **`pose_landmarker_full.task`** for fast, reliable performance on mid/low-end Uzbekistan Android phones (avoiding the 60s+ emulator latency observed with `Heavy`). Expose a user-facing settings option (**«Aniqlik rejimi: Tezkor (Full) / Yuqori aniqlik (Heavy)»**) so users or judges on capable devices can choose `Heavy` for recorded video analysis. Cache extra prepared sample videos on demand instead of bloating the APK with large bundled media.
- **Three polished exercises:** Wire `chair_stand`, `elbow_bend`, and `seated_knee_ext` end-to-end (prepared sample, optional live camera, file picker, per-cycle measurements, flagged-cycle AI observations, explicit consent + signed URL full-video upload, and doctor reply).
- **Daily workflows & existing offline queue:** Support multi-medication doses, manual BP (high/low thresholds), sensor + manual steps (with 7-day trend), DoriMos, and doctor replies. Preserve the existing Room/WorkManager offline queue for exercises and keep clear offline copy for AI/video actions. Full offline Room outbox for medications/BP/steps, midnight step carryover sync, Android↔Telegram conflict resolution, and native `POST_NOTIFICATIONS` reminder scheduling move to [ROADMAP_V2](ROADMAP_V2.md).

## ADR-005 — Telegram Mini App (Bearer auth) and standalone chat

**Status** — Accepted, revised.

- **Iframe-safe Mini App authentication:** Because Telegram Web/Desktop renders Mini Apps inside cross-site `<iframe>` containers where `SameSite=Lax` cookies fail, `POST /api/telegram/auth` verifies Telegram `initData` HMAC, freshness, and replay bounds server-side and returns a **scoped short-lived Bearer token** (kept in client memory/session state for `/tg` API calls). Keep Judge Demo and linked clinic contexts cleanly separated.
- **Mini App surface:** Share the upgraded Web patient components (`shadcn/ui` + `Motion` + `Lucide`) with Telegram theme/safe-area adaptation, `MainButton`/`BackButton`, haptics, and all 3 polished prepared-video exercise flows (with file/sample fallback when WebView restricts camera access).
- **Chat privacy & API bridge:** Preserve `/start`, `/bugun`, `/holat`, `/ilova`, `/mashq`, `/help`, `/stop`, styled inline action buttons (`primary`/`success`/`danger`), and confirmed message updates. Add an explicit **detail opt-in** toggle: default chat notices use generic privacy-safe copy with a deep link to the exact record; only opted-in patients receive drug names, short 7-day summaries, or approved doctor replies in chat. Route **new** M2/M5 clinical bot mutations through Next.js API authenticated with a shared bot-service secret instead of expanding direct Python SQL.
- **Preview isolation & deferrals:** Run a dedicated preview Telegram bot and separate Railway worker pointing strictly to `final` / `shifohalqa-final` (`SHIFO_ENV_ID`). Experimental Telegram private chat widgets, full legacy Python SQL retirement, and server-side daily reminder schedulers move to [ROADMAP_V2](ROADMAP_V2.md).

## ADR-006 — Supervised Clinical AI (Vercel AI Gateway + Cloudflare fallback) and complete-attempt video review

**Status** — Accepted, revised.

**Golden Rule:** AI measures and drafts; deterministic code evaluates thresholds and flags; **the doctor decides**.

### Provider stack and guardrails

- **Primary provider:** **Vercel AI Gateway** (unified routing, structured JSON output, observability, and spend caps).
- **Fallback provider:** **Cloudflare Workers AI** (Clef + Clairic Flash for DoriMos quality/extraction, plus Workers AI text/vision fallback).
- **Offline / outage fallback:** Deterministic Uzbek templates and manual entry so no clinical workflow ever dead-ends.
- Remove the fragile multi-provider free-tier chain (`OpenRouter :free`, `OpenCode Console/Go`) from the Grand Final critical path. Enforce per-workspace rate limits, `prompt_hash` deduplication caching, bounded token budgets, and programmatic **DB-ID citation validation** (rejecting any AI claim referencing non-existent record IDs).

### Grand Final Supervised Clinical Agent workflows

| Workflow | Supervised AI role and clinician control |
|---|---|
| **7-day clinical report & draft reply (primary AI increment)** | Code computes deterministic per-drug counts, BP trend, steps, and open issues. A multi-step server pipeline gathers the scoped patient context, flags missing/inconsistent facts, explains the week in plain Uzbek, and drafts an evidence-linked reply citing exact DB record IDs. The assigned doctor inspects, edits, and approves (`L4`) before it reaches the patient. |
| **Exercise keyframe review** | On-device MediaPipe CV measures cycles and flags problematic reps. For each flagged cycle, 3–5 extracted keyframes + CV metrics are analyzed to return time range, visible observation, and uncertainty (`3-takror · 00:12–00:16 · tizza qisman to‘silgan`). |
| **DoriMos package check** | Cloudflare Clef/Clairic (or Vercel AI Gateway vision fallback) reads drug name, strength, and unit (`mg`/`mcg`/`IU`). Patient confirms observed fields; deterministic rules compare against prescribed box strength and raise a red mismatch flag. |
| **Compact Teach-Back** | Plan-grounded 1–2 question Uzbek comprehension check tied to the assigned medication plan (deterministic with optional AI plain-language simplification). |

**Fully Agentic Clinical Assistant (v2):** Longitudinal multi-week memory, device/sensor/CV-FPS self-adaptation, event-driven proactive check-ins, and safe bounded patient Q&A with deterministic medical-escalation rails are architected in [ROADMAP_V2](ROADMAP_V2.md).

### Complete-attempt video review

- When a cycle is flagged (or patient requests review), show the full attempt preview and sharing scope. On explicit connected consent (`Shu urinish videosini shifokorga yuborish`), request a **server-authorized signed upload URL** to private Supabase Storage (bypassing Vercel's 4.5 MiB body limit), enforce **≤ 60 s and ≤ 20 MiB** (MP4/WebM), and call a server finalize endpoint that verifies object metadata, enforces per-workspace upload quotas, and binds the immutable object path to `exercise_attempts`.
- Keep all 3 polished movements (`chair_stand`, `elbow_bend`, `seated_knee_ext`) backed by cleared public sample videos for the judge flow; local live-camera captures stay on-device unless explicitly shared.
- The assigned doctor opens authenticated short-lived signed playback of the complete attempt, jumps directly to CV/AI flagged timestamps, and sends one review response covering specific repetitions while preserving original `source` and `L2`/`L3` provenance.
- Enforce **7 days after doctor response or 30 days after upload (whichever comes first)** lazily at playback/authorization time while preserving measured metrics and doctor replies. Automated cron storage sweeping and client-side transcoding move to [ROADMAP_V2](ROADMAP_V2.md).

## ADR-007 — Medication, manual BP (high + low), source-specific steps, and 7-day report

**Status** — Accepted, revised.

- **Multi-medication & fixed daily times:** Relax the single-item plan constraint so a plan supports **1–3 distinct medications**, each with **1–2 fixed daily times** in `Asia/Tashkent` and explicit strength + unit (`mg`, `mcg`, `g`, `iu`). Each due dose gets a stable `task_instance` identity. Preserve compatibility with existing `/api/demo/*` tests while using `/api/clinical/*` and `/api/mobile/v1/*` for Grand Final UIs.
- **Dose status & supply escalation:** Preserve `taken`, `missed` (with reason), and `unanswered` separately. Route `out_of_supply` and explicit help/urgent symptom alerts immediately to the doctor queue. Scope synthetic DoriMos samples and simulated steps (`demo_sim`) strictly to `is_demo = true` workspaces.
- **Manual BP with high + low thresholds & validation:** Extend clinician-configured BP targets to support both **high** (`warnSystolic`/`maxSystolic`, `warnDiastolic`/`maxDiastolic`) and **low / hypotension** (`minSystolic`, `minDiastolic`) thresholds. Enforce physiological sanity bounds (`systolic > diastolic`, realistic mmHg ranges) with clear Uzbek error copy and linked repeat measurements. Immediate urgent symptom guidance works offline/deterministically independent of AI.
- **Source-specific steps:** Store Android `device_sensor` and `self_report` (manual) steps separately per Toshkent day (removing the overwriting PK) and restrict `demo_sim` to demo sessions. In the 7-day trend, display one daily total preferring `device_sensor` when available and `self_report` otherwise, while showing both values to the doctor on days with both.
- **7-day report:** Show per-medication due/taken/missed/unanswered counts separately from BP, steps, and exercises, plus open issues, doctor AI draft (doctor-only), and approved patient replies.
- **Deferred to [ROADMAP_V2](ROADMAP_V2.md):** Immutable dated `plan_versions` history, 7-day retroactive edits with L4 reopening, Android↔Telegram conflict resolution UI, doctor reply amendment revision threads, per-channel reminder scheduler, selected weekdays/PRN schedules, and DMED/Asl Belgisi integration.

## ADR-008 — Grand Final acceptance and v2 handoff

**Status** — Accepted, revised.

The Grand Final judge package is complete when the 5 P0 M1 patches and the Lean M2–M6 acceptance criteria in [PLAN](PLAN.md) pass on the isolated `final` preview:

- **Story 1 verified end-to-end** on Web (1-click Demo + pre-seeded multi-patient clinic login), Android, and Telegram (bot + Mini App): multi-medication dose reporting → `Dori tugadi` / BP alert → DoriMos → source-specific steps → supervised AI 7-day draft → doctor L4 approval → patient sees reply on all channels.
- **Story 2 verified end-to-end** for all **3 polished movements** (`chair_stand`, `elbow_bend`, `seated_knee_ext`) across Web, Android (`Full` default + `Heavy` setting), and Telegram Mini App: on-device CV → flagged-cycle keyframes AI observation → consented signed-URL full-attempt upload → doctor timestamp playback & reply.
- **Honesty & safety verified:** Deterministic fallbacks on AI outage, zero `doctor_note`/`acknowledged_note` leakage, clear disclosure of synthetic histories and public sample media, `main` verified untouched at `bc27a09`, and isolated `final` DB/Storage/Telegram preview verified with `SHIFO_ENV_ID`.
- **Professional v2 blueprint preserved:** All production clinical pilot, security hardening, longitudinal sync, and **Fully Agentic** architecture plans live cleanly in [ROADMAP_V2](ROADMAP_V2.md).
