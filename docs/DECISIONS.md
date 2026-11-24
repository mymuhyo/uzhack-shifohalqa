# ShifoHalqa Grand Final architecture decisions

**Scope accepted 2026-11-25 MYT.** This record defines the agreed Grand Final scope on `final`. [PLAN](PLAN.md) owns implementation status and acceptance checks. [DESIGN](DESIGN.md) owns the cross-platform interaction contract. [SPEC](SPEC.md), [INTERFACES](INTERFACES.md), and [BENCHMARK](BENCHMARK.md) include Task 2 contracts and historical evidence. Update the applicable contract when implementing each changed flow.

ADR-001 through ADR-006 were first accepted on 2026-11-24. The revisions below incorporate the M1 audit and owner decisions. Acceptance of an ADR means the design is agreed. M1 remains open until its audit gate passes.

## ADR-001 — Platform roles and shared Web implementation

**Status** — Accepted, revised.

Android is the primary patient app. A patient can complete the medication loop with Android alone or Telegram alone. The primary Grand Final story is daily medication reporting, a supply or help request, a doctor response, and a seven-day report. Exercise demonstration and doctor video review form the second story.

| Surface | Grand Final scope |
|---|---|
| Android | Native patient plan, reminders, medication, manual BP, sensor and manual steps, report and doctor replies, and all five exercise flows |
| Telegram Mini App | Patient plan, medication, manual BP and steps, report and doctor replies, and all five exercises with prepared-video analysis |
| Telegram bot | Standalone chat entry, summaries, reminders, callbacks, settings, and links to the corresponding Mini App record |
| Patient Web | Patient plan, medication, manual BP and steps, report and doctor replies, and three exercises |
| Doctor Web | Assigned-patient queue, reports, review and reply, and evidence from all five movements |
| Caregiver Web | Patient-issued, revocable, 24-hour summary and help acknowledgment link |

Patient Web exposes chair stand, elbow bend, and seated knee extension. Android and the Mini App add knee lift and shoulder raise. The Web and Mini App share the exercise components and data contracts. Surface-specific catalogs control which movements appear. Prepared videos are the default demo entry. Live camera is optional on supported devices.

Keep Next.js App Router, React, Zod, Tailwind v4 and the Clinical Ledger visual language. Use shadcn/ui, Motion with user reduced-motion support, and Lucide where they serve the agreed interactions. Use optimistic feedback for ordinary inputs and show a confirmed state when the server acknowledges them. Load CV and video decoders on demand. Reserve the urgent actions for clear, consistent positions on patient screens.

## ADR-002 — Clinical API authority, database and environment isolation

**Status** — Accepted, revised.

- Next.js owns clinical reads, writes, validation, authorization and transaction boundaries for all clients. Use Supabase Auth and Postgres behind that API. The `postgres.js` adapter continues to own atomic multi-statement operations. The Telegram worker can consume its delivery queue with a narrowly scoped credential. Clinical bot actions go through the same API as other clients.
- Keep the ordered Supabase migrations as the schema source for `final`. Review and close the direct authenticated clinical-table grants exposed by M1. Enforce note privacy and derived-field write restrictions through privileges and server authorization. Use RLS as defense in depth. Preserve an unexposed `private` schema for narrowly scoped helpers and triggers. Serve UI refresh through authorized DTOs. Any later Realtime event exposed to clients carries a minimal invalidation signal and is covered by the same access tests.
- Derive actor, workspace, patient, and authorized doctor from verified identity and assignment. Store access, signed media URLs and review actions enforce that scope. Apply least privilege to Web and bot credentials. Check environment identity before judges or test workers can write. Use isolated `final` DB, Storage, preview deploy, bot and webhook settings. Keep `main` at the frozen Task 2 release boundary. Any future promotion to `main` requires explicit owner approval.
- Before applying release migrations, prove grants, constraints, cleanup and worker permissions against an isolated Supabase database using their actual roles. M1's app-level verification and advisor results remain historical evidence.

## ADR-003 — Test identities, patient enrollment and caregiver access

**Status** — Accepted, revised.

- Grand Final activity uses synthetic clinical records and public or cleared sample media. A real person may operate a test account or run local camera practice. Prepare sample material for transmitted demo evidence. Demonstrate both 1-click Judge Demo and Supabase Auth using synthetic users. A real-patient pilot follows a separate privacy and clinical readiness review.
- Keep the signed judge session and Supabase identity as separate `SessionContext` variants. The server confirms the workspace class and uses an explicit authorized patient context. Reserve doctor access for an assigned user with verified identity. Signup input and email claims alone grant no clinic role. Check one active patient identity per enrollment, alongside expiration, replay prevention, revocation, and safe recovery for invitations and sessions.
- The assigned doctor enrolls a patient using a short-lived, one-time invitation. An Android-only patient accepts in the app using a link or typed code. A Telegram-only patient accepts in Telegram after server verification of `initData`. Show the clinic before confirmation. A patient with an active session may add the second channel using a single-use code tied to the same identity. The patient can see and unlink connected channels. The clinic handles recovery when the patient has lost all sessions.
- Among clinical staff, only the assigned doctor may access the patient's clinical record, review queue, reports and video during Grand Final. A patient may issue and revoke a 24-hour caregiver link. It exposes the daily aggregate and limited help acknowledgment, with access auditing and `no-store`, `noindex` and `no-referrer`.
- Later versions may add explicit clinic-team permissions and authenticated caregiver accounts. Preserve the consent and minimum-data model when implementing those roles.

## ADR-004 — Android-first patient experience

**Status** — Accepted, revised.

- Make the existing Kotlin pose engine, CameraX, MediaPipe, step sensor, Room/WorkManager and Keystore-backed session storage the starting point. Organize the changed paths around data, domain, UI, CV and sync as implementation proceeds. Prefer incremental extraction with regression checks on existing capture and recovery behavior.
- Connect all five movements to the assigned plan, prepared sample, per-cycle measurements, AI observations and doctor review. Keep CV local for live capture and clearly show when a device lacks a camera permission, sensor or adequate measurement. Choose camera and model settings from real-device measurements.
- Allow Android-only enrollment, reminders, medication and BP, steps, report and replies. Cache the minimum context for offline work. Queue medication, manual BP, steps and exercise measurements under the verified account, patient and environment. Show the saved-on-phone state and reconcile on reconnect. Video sending requires a connection and the patient's explicit confirmation of the full attempt. Explain that cloud AI and media sending need internet.
- Use the instrumented device and slow-network checks in [PLAN](PLAN.md), alongside the existing Gradle checks. Validate that signing out, changing the patient or linking another environment keeps pending records scoped to their original identity.

## ADR-005 — Telegram as a patient channel

**Status** — Accepted, revised.

- Verify `initData` HMAC, freshness, replay policy and the current patient binding on the server. Exchange the result for a scoped session. Resolve link context server-side. Keep the Judge Demo and authenticating test-account paths separate.
- The Mini App uses the common Web components for plan, record details, reports, and the five prepared-video exercise flows. Add Telegram theme and safe-area behavior, Main/Back controls and contextual haptics. Test on an actual Telegram client. Provide file or prepared sample and a clear alternative when live capture is unavailable.
- Make chat useful on its own. Maintain `/start`, `/bugun`, `/holat`, `/ilova`, `/mashq`, `/help` and `/stop` workflows. Provide on-demand seven-day summaries, reminder settings and inline medication actions scoped to the exact scheduled dose. Use styled `primary`, `success` and `danger` buttons according to their meaning. Update action messages after the server acknowledges them. Use scoped links to open the exact record.
- With express opt-in, patient chat can show medication name and time, today's status, a short seven-day summary and the doctor's approved reply. Explain what may appear in lock-screen previews and chat history. Use the generic reminder/reply copy for the default presentation. Keep internal notes and private attachments available through their authorized clinical views.
- Preserve the aiogram webhook, delivery worker and retry behavior. Track delivery outcomes and make indeterminate sends visible for triage. Use rich messages and private chat widgets where supported when they improve the same flows, with readable text and keyboard fallbacks. Verify SDK and client behavior before enabling new Bot API settings or renderers. [Telegram Bot API](https://core.telegram.org/bots/api#recent-changes) · [Mini Apps](https://core.telegram.org/bots/webapps) · [Widgets](https://core.telegram.org/bots/widgets)

## ADR-006 — Embedded, evidence-grounded AI and exercise video

**Status** — Accepted, revised.

AI is triggered by a clinical workflow, with a versioned system prompt and structured output for each purpose. Build the input from the permitted, current patient profile, plan version, recent events and doctor responses. Send the smallest slice relevant to that action. Tie observations and suggestions to actual events and time windows. Validate fields and source references, flag missing or inconsistent input, and provide a deterministic fallback. Store provenance and approval state. Code evaluates clinical flags and permissions. The doctor approves clinical recommendations before publication.

### Grand Final AI baseline

| Workflow trigger | AI output and control |
|---|---|
| New or changed plan | A plain Uzbek explanation, worked example, 1–2 Teach-Back questions and questions about the specific plan item. Cite the approved plan instruction and route new clinical questions to the doctor. |
| New package | DoriMos OCR reads the label. The patient confirms the observed fields. Rules compare them to the prescribed label and route discrepancies for review. Use a manual option when needed. |
| Manual BP entry | Code checks the assigned limits, symptom rules and approved immediate guidance. The AI uses relevant profile and measurements to summarize a trend, identify missing facts and draft a patient-specific response for the doctor. |
| Seven-day review or a material correction | Code computes counts, dates, sources and open issues. AI explains them in Uzbek, supplies an evidence-based draft response, and points to source records. The reviewer can inspect, edit, approve or revise it. |
| Exercise completed | Device CV measures cycles. AI examines 3–5 keyframes and CV measurements for each flagged cycle of a prepared sample. Return time range, measured facts, visible observation and uncertainty so the user can open the relevant moment. |

The Grand Final shows these actions inside the plan, task, report and review screens. Recompute affected views from current records when the patient corrects a reply or the doctor changes the plan. After Grand Final, extend to multi-week context, retrieval of prior grounded question-and-answer threads, and wider longitudinal assistance. Add short-clip AI analysis before Grand Final only if the mandatory work and acceptance tests are complete. Otherwise deliver it later.

### Complete-attempt video review

- When a cycle needs review, show the patient the complete attempt and what will be shared. On connected confirmation, upload that full attempt to private Storage for the assigned doctor. Preserve every repetition when compressing the video. Authorize a bounded upload on the server and bind the resulting object to the specific attempt. Prepared public or cleared media is used in the judge flow. Keep any local live-camera practice media on the device until an allowed sharing action.
- AI uses the approved sample keyframes and CV metrics for the baseline. The doctor can play the entire submitted attempt and jump to CV/AI timestamps. They send one final response covering the relevant repetitions. Store it as the completed review against the exact attempt and preserve the original evidence source and level. Any L4 approval elsewhere continues to require an explicit doctor action on the selected evidence record.
- Expire the submitted video 7 days after the doctor's response or 30 days after upload, whichever comes first. Preserve approved measurements, timestamps and response history under the clinical record policy. Authorize playback per request, use short-lived access and clean up incomplete uploads. Record the scope of consent and apply revocation to further access.

## ADR-007 — Medication, manual BP, steps and reports

**Status** — Accepted.

- A plan supports one or more distinct medications, each with its own start date, optional end date and one or more fixed daily times in `Asia/Tashkent`. Use stable identifiers for the plan version, medication and scheduled dose. Use the new plan version for future doses and preserve prior context. Selected weekdays and as-needed schedules are later work.
- For each due dose, preserve `taken`, `missed` with reason, and `unanswered` as distinct states. Android, Telegram and Web act on the same scheduled dose. A patient can add a missing response or correct their response inside the latest seven Toshkent calendar days. Record scheduled time, entry time, server receipt, actor and channel. Preserve corrections in history. Reopen review when a previously reviewed entry changes. Deduplicate equivalent submits. For conflicting Android and Telegram answers, show both and ask the patient to choose. Keep the current server answer in the report until resolved.
- Per-channel reminder preferences allow Android, Telegram, both, or silence. Resolve status by scheduled dose and stop repeat reminders when the dose has a recorded response. Route supply and explicit help events promptly to the assigned doctor's queue. Summarize ordinary unanswered doses in the weekly report. Show submitter, patient, channel and timing on the exact record.
- Offer DoriMos package verification for a new package or a changed drug or package strength, with a clear deferred state. Keep package checks, dispensing and patient-reported intake as distinct facts. Treat a different brand or a strength discrepancy as an item for clinician review. For Grand Final use synthetic OCR fixtures and the existing comparison flow. Consider DMED e-prescription and Asl Belgisi Data Matrix integration in a separately scoped pilot.
- Record BP as manual L0 intake with approved thresholds and symptom guidance. Support positive identification of missing or erroneous values and a linked repeat reading. Include high and low handling from the patient's approved plan. Send urgent deterministic guidance independently of AI availability. Tonometer OCR is outside Grand Final scope.
- Keep source-specific Android sensor and manual step records. Accept manual steps from Android or Telegram and make both visible to the doctor. In the seven-day total, use one value per day, preferring an available sensor observation and using manual on other days. Show source and missing-day coverage. Use a daily goal plus a seven-day trend.
- Build a rolling seven-day report with medication counts for each drug and scheduled dose separately from BP, steps and exercise. Include late entries, correction or clarification events, AI drafts in the doctor's view, approved answers, amendments, pending issues and notice status. An amended answer triggers a new notice that opens the updated response.

## ADR-008 — Grand Final acceptance and later work

**Status** — Accepted.

The judge package is ready when all mandatory work in [PLAN](PLAN.md) passes on the isolated preview. Verify the entire medication loop independently with Android alone and Telegram alone. Verify Web doctor review, the three Web exercises and all five Android and Mini App exercises, including patient-approved full-attempt review and reply. Include an actual Android device and real Telegram client. Use synthetic histories and disclose fixture inputs, fallback paths and what was measured.

Keep clinician team access, authenticated caregivers, independent exercise and the full PAR-Q+ pathway, selected weekdays and as-needed medication schedules, external pharmacy integration, and wider longitudinal AI in later scope. Optional short-clip AI follows the rule in ADR-006. Keep the public Task 2 entry point on `main` protected throughout.
