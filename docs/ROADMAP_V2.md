# ShifoHalqa v2+ — Clinical Pilot & Fully Agentic Architecture Blueprint

> **Purpose.** While [DECISIONS](DECISIONS.md) and [PLAN](PLAN.md) define the focused **Lean Grand Final Demo** on `final`, this document preserves the principal-architect roadmap for evolving ShifoHalqa from a winning hackathon demo into a production-grade, hospital-ready, **Fully Agentic** clinical platform in Uzbekistan (starting with Fergana polyclinics) and beyond.

---

## Guiding Principle (Unchanged Across Every Version)

> **AI observes, reasons, and prepares → deterministic clinical rules guard safety boundaries → the assigned clinician approves clinical decisions.**

Even in the **Fully Agentic** architecture (Phase V2.3), autonomy is **strictly bounded**: agents may gather multi-week context, detect subtle adherence/biomechanical/device trends, proactively engage patients within clinician-approved boundaries, and assemble pre-triaged action plans — but **never** diagnose independently, alter prescribed drug dosages, or suppress urgent red-flag escalation.

---

## Phase V2.1 — Production Security, Multi-Tenancy & Hospital Identity

Moves ShifoHalqa from synthetic demo workspaces to real patients and clinics under Uzbekistan Personal Data Law (*Shaxsga doir ma’lumotlar to‘g‘risida* O‘RQ-547) and healthcare privacy expectations.

### 1. Clinic-First, Email-Free Patient Identity
- **Real-world constraint (Uzbekistan):** Elderly hypertension/rehab patients rarely use email. Separate clinician identity from patient identity cleanly:
  - **Clinicians & clinic admins:** Verified email/phone + password/MFA (Supabase Auth or clinic SSO), provisioned strictly via clinic admin approval — never via self-assigned signup roles.
  - **Patients (Android-only or Telegram-only):** Enrolled by their assigned clinic via a **short-lived, single-use enrollment link or 8-character code** showing the verified clinic & doctor name prior to confirmation.
  - **Channel session model:** Issue revocable, Keystore-encrypted device/channel sessions (`patient_channel_sessions` with refresh rotation) linked 1:1 to an active `patients.id` (enforced by partial unique index for active patient enrollment). A patient can bind a second channel (Android ↔ Telegram) using a single-use link code, view/unlink active channels, and recover access at the clinic (which atomically revokes lost-device sessions).
- **Care teams & authenticated caregivers:**
  - Introduce explicit clinic RBAC (`clinic_admin`, `attending_doctor`, `physiotherapist`, `nurse_coordinator`) with audited assignment transfers and cross-cover views.
  - Re-enable authenticated `caregiver` accounts (beyond 24-hour revocable links) with granular patient-controlled consent scopes (`adherence_counts`, `supply_alerts`, `appointment_reminders`) while keeping `doctor_note` and clinical media strictly excluded.
  - Re-enable the `individual` self-guided wellness track gated by a full, validated **PAR-Q+** screening flow (`parq_screenings`).

### 2. Defense-in-Depth Database & API Hardening
- **Least-privilege DB roles:** Provision separate Postgres credentials for Web API (`shifohalqa_web_app`), background workers (`shifohalqa_telegram_worker` limited strictly to delivery queue tables), and migrations (`shifohalqa_migrator`). Retire all legacy direct clinical SQL in `services/telegram_bot` so 100% of clinical operations flow through versioned Next.js HTTP APIs.
- **Anti-abuse & privacy controls:** Eliminate email/phone enumeration in invite endpoints (uniform responses + IP/account rate limits), add per-route rate limiting (Upstash Redis or Postgres sliding window), enforce strict CSP (`default-src`, `script-src`, `frame-ancestors`, `media-src`) and HSTS, and encrypt/redact PHI from application logs.
- **5-tier adversarial security test suite:** Automated CI tests proving direct JWT denial, cross-tenant IDOR immunity, replay rejection on Telegram `initData` & invite codes, Storage immutability, and forged-evidence rejection.

---

## Phase V2.2 — Longitudinal Clinical Depth, Offline Conflict Sync & Reminders

Handles messy real-world outpatient life: changing prescriptions, spotty 3G mobile networks, multi-channel families, and clinician follow-through.

### 1. Immutable Plan Versioning & Complex Schedules
- Replace single-row `plans` overwrite with append-only **`plan_versions`** (`effective_from_date`, `superseded_at`, `created_by_doctor_id`). Editing a drug, dose strength, or time creates a new version for future scheduled days while preserving exact historical plan context for past reports and audits.
- Support selected weekdays (e.g., Mon/Wed/Fri), multi-week tapering schedules, PRN (*zarurat bo‘yicha*) medications, and multi-exercise prescriptions (e.g., upper + lower body on alternating days).

### 2. Full Offline Outbox & Cross-Channel Conflict Protocol
- **Universal Android Room/WorkManager outbox:** Queue **all** patient inputs (`medication_responses`, `manual_bp`, `daily_steps` with midnight carryover preservation, `urgent_symptoms`, `exercise_attempts`) scoped to `(origin, workspace_id, patient_id, session_id)` so account/environment changes never cross-contaminate pending rows.
- **Deterministic conflict vs. correction protocol:**
  - Every dose/reading carries an immutable event log (`evidence_revisions`) plus a `current_revision_id` and monotonically increasing `version`.
  - **Online edit (correction):** Client sends `expectedVersion` → server records a new revision within the 7-day Toshkent window. If the prior revision had clinician `L4` approval, `L4` is explicitly **superseded** (preserved in audit history) and a re-review item opens in the doctor queue.
  - **Offline late sync (conflict):** Client sends `mode: 'offline_sync'`, `baseVersion`, `enteredAt`, and `clientEventId`. If another channel (e.g., Telegram) already recorded a *different* answer after `baseVersion`, the server stores the conflicting candidate (`conflict_pending`), keeps the current server answer in reports, and prompts the patient on both channels to pick the canonical answer. (Equivalent answers deduplicate cleanly.)
- **Clinician reply amendments:** Replace single-column `flags.patient_reply` updates with an immutable **`clinical_responses`** revision table. Amending an approved answer preserves prior text/timestamps in audit history and triggers a fresh notice opening directly to the updated reply.

### 3. Per-Channel Reminder Scheduler & Delivery Operations
- Add `patient_reminder_preferences` (`android`, `telegram`, `both`, `silent`, quiet hours, snooze interval).
- **Android:** Local `AlarmManager` / `WorkManager` notifications (`POST_NOTIFICATIONS`) synced from active plan schedule and automatically cancelled when the dose is marked answered on any channel.
- **Telegram:** Server-side reminder dispatcher (Supabase `pg_cron` or dedicated worker tick) that suppresses reminders for already-answered doses, retries transient Telegram `429 RetryAfter` errors, and surfaces stuck `unknown` delivery states in an operational triage view.

---

## Phase V2.3 — Fully Agentic Clinical Assistant Architecture

This phase evolves ShifoHalqa's Grand Final Supervised AI pipelines into a **Fully Agentic, Longitudinal Clinical Orchestrator** — continuously analyzing patient trajectories and device state over weeks while maintaining strict clinical safety.

```mermaid
flowchart LR
    subgraph Signals["Continuous Signals (Weeks -> Months)"]
        S1["Medication & DoriMos Events"]
        S2["Manual BP & Symptom Trends"]
        S3["Steps & Exercise Biomechanics"]
        S4["Device Telemetry (FPS, RAM, Network, Sensor)"]
    end

    subgraph AgentCore["Bounded Agentic Orchestrator"]
        M["Longitudinal Patient Memory\n(Structured Timeline + Grounded Summaries)"]
        R["Deterministic Clinical Rules\n(Hard Safety Gate — Always Runs First)"]
        P["Agent Planner & Tool Loop\n(Observe -> Reason -> Propose)"]
        V["Citation & Policy Verifier\n(Schema, DB-ID Grounding, Escalation Guard)"]
    end

    subgraph Actions["Human-in-the-Loop & Safe Actions"]
        A1["Autonomous Low-Risk Actions\n(Adaptive Check-in, Timing/CV-Model Tips, Teach-Back)"]
        A2["Clinician Approval Queue\n(Draft Care Adjustments, Triage Briefings, Replies)"]
    end

    Signals --> R
    Signals --> M
    R -->|"Red Flag = Immediate Escalation"| A2
    M --> P
    R --> P
    P --> V
    V -->|"Within Patient Safe Policy"| A1
    V -->|"Clinical / Treatment Impact"| A2
    A2 -->|"Doctor Approves (L4)"| M
```

### 1. Five Core Agentic Capabilities
1. **Proactive Adherence & Risk-Stratified Care Agent:**
   - Learns individual patient rhythm from multi-week miss patterns (e.g., recurring Friday evening medication skips or gradual morning systolic BP drift) and dispatches bounded, timing-adapted Telegram Bot / Android nudges rather than fixed generic alerts.
   - Dynamically escalates cadence from low-friction check-in -> Teach-Back micro-refresher -> clinician pre-visit flag as deterministic risk scores rise.
2. **Multimodal Uzbek Clinical Intake Agent (Photo, Voice & Free-Text):**
   - Accepts Uzbek/Russian voice notes, free-text symptom descriptions, blood-pressure cuff photos, and pillbox scans across Web, Android, and Telegram Mini App.
   - Extracts structured clinical fields (`bp`, `symptom`, `missed_reason`, `medication_box`) and routes every inferred value through explicit **patient confirmation + deterministic L0–L4 rules** — never auto-saving uncertain AI parses as clinical truth.
3. **Longitudinal Clinical Memory & Rehab Progression Agent:**
   - Maintains structured multi-week state (`adherence drift`, `BP trend`, `rehab ROM/tempo/asymmetry`, `prior clinician replies`) behind typed read-only tools (`getAdherenceWindow`, `getBpTrend`, `getBiomechanicsProgression`, `getDeviceHealthMetrics`) so reasoning remains fast, cheap, and citation-exact.
   - Tracks cross-session `chair_stand`, `elbow_bend`, and `seated_knee_ext` joint-angle progression and symmetry: recommends safe progression (`targetReps`/`targetAngle` proposals requiring doctor approval), swaps camera/lighting tips after repeated occlusion, or adapts `Full`/`Heavy` CV model presets to device FPS.
4. **Doctor Pre-Visit Clinical Copilot Agent:**
   - Synthesizes morning triage digests prioritizing red/yellow exceptions, surfaces missing measurements (e.g., *«Oxirgi 5 kunda kechki bosim o‘lchanmagan»*), explains trend shifts with clickable DB record citations, and drafts individualized Uzbek follow-up replies or regimen adjustments awaiting one-tap clinician approval or edit (`AI measures/drafts -> deterministic rules flag -> doctor decides`).
5. **Agentic Evaluation, Security & FinOps Harness:**
   - Runs automated CI evaluations over synthetic Uzbek clinical vignettes (missed-dose streaks, hypotension, chest pain, occluded rehab video, adversarial prompt injection in notes) measuring schema compliance, DB-ID citation accuracy, and diagnostic-claim suppression.
   - Preserves **Vercel AI Gateway** (with per-request `x-vercel-oidc-token`) -> **Cloudflare Workers AI** -> **deterministic Uzbek fallback** routing, tiered model selection, clinic daily spend caps, and full human-in-the-loop audit trails.

### 2. Agentic Safety, Evaluation & FinOps Governance
- **Non-negotiable safety rails:** Deterministic rules always execute *before* and *after* LLM tool loops. Any generated output failing Zod schema validation, DB-ID citation existence checks, or medical-policy classifiers is blocked and replaced with a deterministic fallback.
- **Automated clinical eval suite:** Maintain a regression benchmark of synthetic Uzbek clinical vignettes (missed-dose streaks, hypotension, chest pain, occluded rehab video, adversarial prompt injection via patient notes) run in CI on every prompt or model update.
- **Model routing & cost caps:** Use **Vercel AI Gateway** (primary) + **Cloudflare Workers AI** (fallback) with tiered model routing (fast/cheap models for classification & Teach-Back; stronger multimodal models for complex 4-week briefings & exercise keyframe analysis), hard daily spend ceilings per clinic, and semantic/`prompt_hash` caching.

---

## Phase V2.4 — Full Rehab Catalog, Media Ops, Ecosystem & Observability

### 1. Full 5+ Movement Catalog & Resumable Media Pipeline
- Expand cleared public/clinical exercise fixtures and biomechanical analyzers to `knee_lift`, `shoulder_raise`, and additional orthopedic/cardiac rehab protocols.
- Add on-device client-side video transcoding (Android Media3 Transformer to 480p/720p H.264 target bitrate) and **resumable TUS uploads** for unreliable Uzbekistan mobile networks.
- Automate media retention via scheduled **`pg_cron` + Edge Function** sweeper deleting Storage objects past `min(reviewed_at + 7d, uploaded_at + 30d)` and orphaned incomplete uploads (>24h), while preserving structured measurements and audit logs.
- Optional **short-clip AI video analysis** (3–6 s flagged segments) evaluated against keyframe-only baselines in `docs/BENCHMARK.md` before enabling.

### 2. Telegram & Ecosystem Integrations
- Add Telegram rich chat widgets / enhanced renderers (with graceful classic keyboard fallbacks) once Bot API client coverage stabilizes across Uzbekistan Android/iOS users.
- **Healthcare ecosystem (separate regulatory pilot):**
  - **DMED FHIR** e-prescription import and outpatient summary export.
  - **Asl Belgisi** pharmaceutical Data Matrix barcode scanning alongside DoriMos visual OCR for authoritative package authenticity and strength verification.
  - **Tonometer OCR** (`vitals_ocr_scans`) once real-world Fergana cuff LCD benchmarks meet ≥95% digit accuracy with mandatory patient confirmation.

### 3. Production Observability & Operations
- Replace silent `catch {}` handlers with structured, PHI-redacted JSON logging (`requestId`, `workspaceId`, `route`, `latencyMs`, `aiProvider`, `fallbackUsed`) exported via OpenTelemetry.
- Track real-world KPIs on dashboards: clinician active time-to-review, AI draft acceptance/edit rate, deterministic fallback rate, Telegram delivery latency/`unknown` triage rate, and Android low-end device CV FPS & crash-free sessions.
