# ShifoHalqa Grand Final interaction design

[DECISIONS](DECISIONS.md) defines clinical and platform scope. [PLAN](PLAN.md) defines acceptance.

## One patient record across channels

| Surface | Role in the journey |
|---|---|
| Native Android | Main patient experience, with device steps, local CV, reminders and offline entries |
| Telegram bot | Direct chat actions, short reports, reminders, approved replies and links to exact records |
| Telegram Mini App | Full patient workflows and five prepared-video exercise flows inside Telegram |
| Patient Web | Patient workflows and chair stand, elbow bend and seated knee extension |
| Doctor Web | Assigned-patient queue, history, reports, media from all five movements and replies |
| Yaqinim | Short daily summary and a limited help acknowledgment through a patient-issued link |

Show where the user is before asking them to enroll or link a device. Display the clinic in the confirmation step. Provide the Android invite code field and the Telegram one-time invite entry independently. In either active account, show the secondary-channel linking and disconnect actions. Make the synthetic Judge Demo and sample-media status visible throughout that journey.

## Clinical Ledger

- Use the existing Clinical Ledger tokens for both themes. Keep Uzbek Latin patient copy short, with strong text contrast, large tap targets and text labels for status and source. Use `--paper`, `--card`, `--ink`, `--action`, `--urgent`, `--warn` and `--ok` consistently.
- Pair every severity color with a spoken and visible label. Show a visible focus indicator, predictable keyboard and screen-reader order, large-text support, and a reduced-motion path.
- Keep `103` and `Og‘riq bor` reachable in the applicable patient flow. Show the local guidance immediately for urgent symptoms. Show the actual receipt state of any accompanying report.
- For Telegram, respect the client theme, safe areas, keyboard and Back button. Use the Main button for the action currently shown on the screen. Apply haptics to confirmed, actionable states. Keep primary actions clear when host features vary.
- Make results fast to scan. Load heavy Web/Mini App pose and decoder resources when the user opens capture or selects the sample.

## Patient's daily plan and reporting

1. **Bugun.** Group by scheduled time and show each drug, time and status. «Ichdim» and «Icha olmadim» apply to the named dose. Ask for a reason only as needed. Offer «Dori tugadi» and «Yordam kerak» in context.
2. **Yangi quti.** Offer DoriMos at a package change or a changed drug/strength. Show the read label with name, strength and unit for patient confirmation. Give «Keyinroq», «Qayta oling» or manual review where applicable.
3. **Rejani tushunish.** Show the doctor's own instruction, a short example and 1–2 questions when relevant. Attach the contextual question-and-answer action to the specific plan item. Show the instruction behind an AI explanation. Route new clinical advice to the doctor's queue.
4. **Bosim.** Use labeled manual systolic and diastolic fields and symptom options. Show the result, approved next step and repeat-measurement action. Link the repeat to the original reading. Personal explanations use the patient's verified context with a doctor review state.
5. **Qadamlar.** Show today's goal and source. Label `Telefon sensori` and `Qo‘lda kiritilgan`. Keep manually entered values visible to the doctor alongside sensor values. Show a seven-day plot with the source of the selected total for each day and an explicit state for missing data.
6. **Haftalik hisobot.** Group counts by drug and scheduled dose. Display reported taken, reported missed, and unanswered separately. Keep BP, steps and exercise in their own sections. Show corrections and clarified entries as events. Include the doctor's latest approved advice, prior revisions, send status and open requests.

**Example weekly report.** «7 ta qabul vaqti · 5 ta “Ichdim” · 1 ta “Dori tugadi” · 1 ta javobsiz. Seshanba kungi javob keyin to‘ldirildi. Ta’minot bo‘yicha murojaat ochiq». The doctor can open the exact rows behind the summary. Show doctor-only drafts and internal annotations in the protected doctor view.

### Shared interaction states

| State | Patient-facing behavior |
|---|---|
| Input submitted | Show `Saqlanmoqda` beside the exact dose or report and protect against duplicate taps. |
| Saved on phone | Show `Internet aloqasi yo‘q. Qayd telefonda saqlandi, hali yuborilmadi`. Explain that cloud AI and video sending need an internet connection. |
| Server confirmation | Show `Yuborildi` and update the status across linked channels. |
| Conflicting replies | Show both replies and their channels. Ask the patient which is correct. The report displays the current server answer until the patient resolves the conflict. |
| Waiting for clinician | Show `Shifokor ko‘rigida` with the linked request. |
| Clinician replied | Show `Shifokor javobi tayyor` and link to the exact approved answer. |
| Clinician amended reply | Show `Shifokor avvalgi javobni yangiladi` and show the new current answer. |
| Source is incomplete or AI is unavailable | Show the deterministic report or the approved guidance, and explain the needed input or retry action in the affected section. |

## Exercise and doctor review

- Present the prepared video as the primary entry. Label sample inputs and show visible measurement progress. Offer live capture where supported. Give clear permission, poor-quality, retry and manual states.
- Put each AI observation beside a specific cycle, time range, related frames and CV facts. Use uncertainty text when the view is insufficient. Example `3-takror · 00:12–00:16 · tizza qisman to‘silgan`. Show how to open the marked spot.
- When a doctor review is requested, show a preview of the complete attempt. Use `Shu urinish videosini shifokorga yuborish` for the consent action. Show sharing scope, upload progress, failure or cancellation, and the submitted status. Describe when the attachment will expire.
- Put the duration, flagged cycle markers and CV/AI evidence beside the full player for the assigned doctor. Allow one detailed response with references to several repetitions. Display the response against the original attempt, with short links to the marked times. Preserve the evidence source and measured values.
- If a video has expired, keep the measured history and clinician response visible with a clear expired-media state.

## Doctor queue

Each row identifies patient, request type, affected drug/dose or exercise, channel, submitted time and server receipt time. Put actionable and urgent items first. Open directly to the selected report. Keep unrelated history out of the initial scan path. Let the doctor inspect source records, edit an AI draft, approve a response and correct an earlier approved response with audit history.

## Telegram chat

- Use the menu and ordinary commands for entry, today's schedule, status, exercises, reminder preferences, report and stop. Make enroll, help and unlink understandable in chat without requiring Android.
- Show one clearly labeled row for each due dose. Use action text with styled `primary`, `success` and `danger` buttons where appropriate. Update a message after the server records the action. Clear old actionable state and handle repeated callbacks idempotently.
- Prompt for detail opt-in before sending medication names, times, short weekly summaries or approved doctor replies into chat. Use a generic notice by default. Open the exact authorized item from a button.
- Use rich messages and private chat widgets to improve the same brief, status and action flows on compatible clients. Provide readable text and ordinary keyboards if a renderer is unavailable. Use the Mini App for the full exercise, playback and detailed report interactions.
