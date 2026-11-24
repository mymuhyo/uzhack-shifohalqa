# ShifoHalqa Grand Final execution plan

**Branch** — `final`. The Task 2 judge demo on `main` is frozen at `bc27a09`, tagged `v1-task2-demo`.

**Target** — An isolated `final` preview using `shifohalqa-final` (`byswnhfcqxjvnallggxj`), private Storage, and a separate Telegram bot and webhook.

**Status** — `[ ]` planned, `[~]` open or in progress, `[x]` verified for the stated scope.

[DECISIONS](DECISIONS.md) is the owner-approved scope. [DESIGN](DESIGN.md) defines the interface behavior. [PROGRESS](PROGRESS.md) records earlier checks and subsequent work. Grand Final uses synthetic clinical records and public or cleared samples.

| Milestone | Scope | Gate |
|---|---|---|
| M1 | Close the reopened clinical access, data integrity and environment gate | [~] |
| M2 | Shared API and end-to-end clinical workflows, starting with medication | [ ] |
| M3 | Doctor Web and three patient Web exercises | [ ] |
| M4 | Primary native Android patient experience and five exercises | [ ] |
| M5 | Standalone Telegram bot and Mini App with five exercises | [ ] |
| E2E | Contract and integration track across M1–M5 | [ ] |
| M6 | Verify the complete package on the isolated judge preview | [ ] |

Start M1 closure before M2. Within M2, freeze dose, report, consent, and review interfaces before building their consumers. M3–M5 can use the same contracts as they stabilize. Prioritize the Android patient loop and the Web doctor screens needed to close it. Build the Telegram-only loop against that same clinical API.

## M1 — Reopened foundation gate

M1a and M1b were committed in `140860d`, `12cdfde`, `3c6cf8c` and `6dd8083`. The existing seven migrations, generated types, stores, handlers and prior test results are recorded in [PROGRESS](PROGRESS.md). Their verification covered the original scope. The audit identified additional required checks and changes.

- [ ] **M1.1 Clinical reads and writes.** Review `supabase/migrations/*00400*` and `*00600*`, `src/lib/db.ts` and `src/lib/clinical-handlers.ts`. Add forward migrations to close direct clinical-table grants and raw clinical Realtime access. Verify that authenticated and anonymous users only see authorized DTOs, including when a patient previously received a relevant flag. Prove direct clients cannot read internal notes, set evidence level/decision, mutate a task directly or forge its audit event. Verify normal reads and atomic server writes.
- [ ] **M1.2 Identity and tenant isolation.** Update `src/lib/auth.ts`, `src/app/api/auth/**`, `src/lib/seed.ts`, `src/lib/mobile-demo.ts` and membership constraints. Prove role enrollment, account verification, active assignment, one-time invite consumption and revocation, and isolation among distinct real test accounts and synthetic judge sessions. Cover multiple authorized contexts, expired credentials, and signup recovery after partial failure.
- [ ] **M1.3 Clinical source and media integrity.** Scope sample OCR and simulated steps to synthetic demo sessions. Define honest L2/L3 provenance for device-reported CV. Protect uploaded evidence from direct replacement, unscoped access, unbounded writes and lifetime drift. Correct the composite foreign-key `ON DELETE SET NULL` behavior in `*00300*` using a forward migration. Prove safe deletion with dependent rows, upload quotas, cleanup and permission rechecks.
- [ ] **M1.4 Telegram role and environment isolation.** Provision an explicit worker credential and queue permissions. Test the worker with that credential. Wire clinical bot operations to the authorized API. Correct `README.md` and `.env.example` as part of implementation and require a positive environment identity check before app, bot or E2E writes. Exercise an isolated preview and webhook using a separate bot. Keep production Task 2 credentials and services outside this path.

**Gate checks.** Run `npm run verify` and the Telegram test command below. Verify project identity, applied migrations, generated types and advisors via `supabase_mcp`. Run tests with actual anonymous, patient, caregiver, doctor, app and worker identities as applicable. Exercise the application and direct privilege-denial paths with isolated test data. Record results and reopen any failing item.

## M2 — Clinical vertical slices and API contracts

- [ ] **M2.1 Medication plan and dose ledger.** Extend `supabase/migrations/**`, `src/lib/clinical-types.ts`, `src/lib/clinical-inputs.ts` and `src/lib/clinical-store.ts` for one or more medications, multiple fixed daily times, and dated plan versions. Verify two medications sharing a time, one medication with two times, a plan change, and preservation of Task 2 data contracts as applicable. Each due dose has a unique identity and the correct historical plan through the Toshkent day boundary.
- [ ] **M2.2 Patient response and help loop.** Share mutation semantics between `src/app/api/clinical/**`, `src/app/api/mobile/v1/**` and Telegram. Record original scheduled time, patient entry time, server receipt, actor and channel. Verify `taken`, `missed` with reason and `unanswered`, seven-day late entry/correction, same-answer deduplication and conflicting-answer resolution. Verify new supply/help alerts and reopening of a reviewed record on correction. Add per-channel reminder preferences and suppress repeat reminders for answered doses.
- [ ] **M2.3 DoriMos at package change.** Extend `src/lib/dorimos-server.ts` and `src/lib/dorimos-store.ts` to tie offered verification to the changed plan item or package and preserve a deferred state. Use a synthetic OCR sample with patient confirmation, retake or manual handling. Separate product name and strength comparison from dose intake. Verify same-day packages for different drugs, duplicate confirmation and mismatch routing.
- [ ] **M2.4 Manual BP and source-specific steps.** Extend `src/lib/rules/**`, `src/lib/activity-store.ts`, `src/lib/adherence.ts` and the shared routes. Verify high and low clinician-configured BP thresholds, symptoms, linked repeat, malformed readings and fallback copy. Store manual and sensor steps separately, allow Android/Telegram manual input, and retain origin day after offline sync. Prove one aggregate value per day in the seven-day trend, with sensor preferred when available and manual otherwise. Show both values to the doctor on a day with both, and distinguish missing and simulated values.
- [ ] **M2.5 Deterministic report and clinician responses.** Extend `src/lib/clinical-brief.ts`, the report API, doctor queue and audit data. Verify due counts per medication and scheduled dose, with BP, steps and exercises in their own sections. Include late reports, corrections, related issues, drafts in the doctor view, approved replies, amendments and notice outcomes. Test that a notice opens the exact updated answer and that patient responses exclude internal clinical notes.
- [ ] **M2.6 Embedded AI and Teach-Back.** Add `src/lib/teach-back-store.ts`, `src/lib/ai/clinical-brief-ai.ts` and the task-specific AI contracts. Implement a validated, current patient context and versioned prompt per purpose. Add an example and 1–2 questions grounded in the new or changed plan, contextual questions and answers, BP response drafts, and evidence-linked report explanations. Verify context refresh after correction, rejection of unsupported facts, clinic/patient scoping, provider timeout and deterministic fallback. Apply bounded input, output, concurrency and cost. Clinical advice reaches the patient after assigned-doctor approval.
- [ ] **M2.7 Five-movement CV and complete-attempt review.** Extend `src/lib/pose/**`, `src/lib/exercise-store.ts`, the media routes and `src/lib/ai/exercise-video-review.ts`. Prepare reproducible sample clips containing useful form observations for each movement. Validate CV timestamps and 3–5 keyframes per flagged cycle with test fixtures and grounded AI outputs. Pick the upload transport, limits and codecs against preview platform constraints, then test interrupted, rejected and successful uploads. Verify online consent and private playback of the full attempt, timestamp navigation, one doctor response covering specific repetitions and the 7-day-after-response/30-day maximum expiry. Capture L2/L3 provenance without inferring higher evidence from model output.
- [ ] **M2.8 Publish client contracts.** Update `docs/INTERFACES.md` and applicable `docs/SPEC.md` sections as each slice lands. Document versioning, error and empty states, permissions, idempotency, consent, source metadata and fixtures. Test shared contracts from Web, Android and Telegram. Keep repo setup instructions current.

**First AI increment.** Start in the doctor's seven-day report. Use a synthetic week with one unanswered dose and one supply issue. Generate a draft that links both observations to the correct records. Let the doctor edit and approve it, then open the published response from the patient's notice. Repeat after a correction and with the provider unavailable. Use that context, provenance and approval pattern for the remaining AI workflows.

**Checkpoint.** Demonstrate a synthetic medication report → supply issue → doctor response → corrected seven-day report over the API. Confirm both clients can exercise the same contract with isolated test identities. Run `npm run verify`, DB-backed contract tests, and coverage for media expiry and AI failure paths.

## M3 — Web doctor and patient surfaces

- [ ] **M3.1 Multi-patient doctor queue.** Build the assigned-patient queue in `src/app/doctor/**` and `src/components/doctor/**`. Show patient, exact record, responsible clinician, reported time, received time, source and history. Open the specific item from a deep link. Cover reply, amendment, report and full-video review with timestamp navigation.
- [ ] **M3.2 Patient flows.** Update `src/app/patient/**`, patient components and shared auth screens. Show dose schedules, report, contextual AI, Teach-Back, manual BP/steps, doctor replies and caregiver sharing. Implement chair stand, elbow bend and seated knee extension using the shared components. Show outcomes after server acknowledgment and preserve fallback states when AI or optional motion data are unavailable.
- [ ] **M3.3 Design and performance.** Apply [DESIGN](DESIGN.md) to shared primitives, Clinical Ledger theme, keyboard focus, dark mode and reduced motion. Keep pose and decoding off the initial route. Check at narrow widths and with increased text size. Measure critical path and sample analysis on the isolated preview.

**Checks.** `npm run verify` and `npm run e2e`. Run the full isolated DB-backed suite for clinical and privacy paths.

## M4 — Primary Android patient experience

- [ ] **M4.1 Independent entry.** Use the native app link or code to accept a clinic invitation, show the correct plan, link a second channel, unlink and recover sessions. Cover fresh install and Android-only use. Demonstrate the separate Judge Demo and synthetic Auth path.
- [ ] **M4.2 Daily workflows.** Implement the multi-medication plan, reminder channel settings, dose responses, manual BP, sensor/manual steps, contextual AI, reports and replies. Check missing sensor/permission and the full seven-day graph. Retain existing distinctions between measured, reported and simulated values.
- [ ] **M4.3 Offline and reconnect.** Extend the existing Room/WorkManager queue. Check offline input, app/process restart, replay, midnight, identity change and a Telegram conflict. Show specific offline copy for pending records, AI and video. Require an online share action for full media.
- [ ] **M4.4 All five movements.** Wire the Kotlin movement definitions, CameraX/MediaPipe, prepared samples, contextual AI, file picker, and consent to the corresponding assigned exercise. Run device capture and video decode against known fixtures and confirm the doctor gets the exact associated attempt.

**Checks.** From `android/` run `./gradlew :app:assembleDebug :app:lintDebug :app:testDebugUnitTest` and inspect changed Compose previews. Prove the independent Android path on a physical phone, including offline/resume and slow-network analysis. Record device and OS. When possible include a lower-cost phone so the documented limits reflect intended users.

## M5 — Telegram bot and Mini App

- [ ] **M5.1 Telegram-only entry and permissions.** Add `src/app/api/telegram/auth/route.ts` and update `src/app/tg/**` for verified `initData`, scoped sessions, one-time invitations and account binding. Exercise opening the exact authorized record. Verify expired or replayed inputs, unlink and isolated bot behavior.
- [ ] **M5.2 In-chat workflow.** Extend `services/telegram_bot/shifo_telegram/**` for commands, reminder controls, correct per-dose actions, seven-day summary and approved replies. Verify explicit detail opt-in and generic fallback copy. Update messages after confirmed actions. Style buttons, support contextual deep links, and verify rich-message and private widget enhancements with readable classic fallbacks.
- [ ] **M5.3 Mini App workflow.** Reuse the patient Web components with Telegram-specific theme, safe areas and controls. Show the full patient daily workflow and all five prepared exercise videos with AI and review. Test inside an actual Telegram client, including narrow viewport, session renewal, interrupted network, keyboard and camera/file fallback. Exercise a complete Telegram-only patient scenario.
- [ ] **M5.4 Delivery operations.** Verify the restricted worker, delayed retry and detectable delivery-unknown states. Test exact replies, updates and stop behavior. Verify the distinct preview bot, token context and webhook before enabling test notices.

**Checks.** `npm run verify` and `uv run --project services/telegram_bot --locked --no-sync pytest services/telegram_bot/tests`. Include the isolated E2E bot with mock transport for repeatability and a real Telegram preview smoke for the client and webhook.

## E2E — Shared verification track

- [ ] **Tier 1, entry and isolation.** Judge demo, synthetic clinic auth, wrong actor/workspace, expired and replayed invitations, caregiver token expiry/revoke, separate Telegram and Android entry, and wrong environment rejection.
- [ ] **Tier 2, medication and report.** Multiple drugs and times, late response, revision, offline conflict, supply alert, clinician response and amendment, per-drug counts, manual BP, both step sources, and privacy of notes.
- [ ] **Tier 3, exercise and AI.** Five movement fixtures, three Web patient catalog entries, native capture, uncertain observations, a full video with per-attempt consent, authenticated playback/expiry, fallback when providers fail, and exact review reply.
- [ ] **Tier 4, real clients and accessibility.** Full Android-only and Telegram-only workflows, narrow Web and Mini App layout, reduced motion, keyboard, TalkBack where supported, large text, and degraded/offline connectivity.
- [ ] **Tier 5, adversarial boundaries.** Ordinary JWT access to private clinical columns and derived fields, cross-tenant direct API and Storage access, repeated uploads, forged identity, replayed bot link/session, duplicate/late events, and invalid AI output or source references.

Use `npm run e2e` for smoke and `SHIFO_E2E_DATABASE_URL=... npm run e2e` with the approved isolated URL for full DB-backed coverage. Use fixture IDs and report only synthetic logs. Capture the verified test selection and any supported limitations in `TEST_READY.md`.

## M6 — Grand Final acceptance

- [ ] M1 audit gate and all mandatory M2–M5 and E2E checks above pass on the isolated preview. Required capabilities have working, independently checked demonstrations.
- [ ] Android-only and Telegram-only patients each complete the primary medication story, including sign-in, help request, assigned doctor reply and seven-day report with corrections/replies. Confirm records and timestamps match across surfaces.
- [ ] Exercise demos pass for five movements on Android and Telegram and three on patient Web. Doctor Web can review all five, receive the consented full attempt, jump to flagged cycles and send a response. Verify real-device usability and record sample identity, analysis latency, accuracy limits and media behavior in [BENCHMARK](BENCHMARK.md).
- [ ] Verify deterministic and manual fallbacks, accessible status messages, and clear disclosure of synthetic histories and approved public media. Check `main` resolves to `bc27a09` and the preview uses its own DB, Storage and Telegram webhook.
- [ ] Record exact commands, device/Telegram client details, results and limitations in [PROGRESS](PROGRESS.md) and [BENCHMARK](BENCHMARK.md).

**Deferred scope.** Clinical team access, authenticated caregivers, independent exercise and the full PAR-Q+ pathway, selected weekdays or as-needed schedules, wider longitudinal AI and official pharmacy integration. Short-clip AI is an optional addition after the mandatory work and tests pass. See [DECISIONS](DECISIONS.md).
