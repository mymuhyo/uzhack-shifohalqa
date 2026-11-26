# ShifoHalqa Grand Final handoff

The Grand Final preview uses a synthetic clinic and demo workspaces. The home page offers one-click patient and doctor roles. The clinic sign-in opens the separate seeded clinic with three synthetic patients. Share clinic access through the approved private channel. [Open the Grand Final preview](https://shifohalqa-final-telegram-preview.vercel.app)

## Medication and clinical review

1. Open **Shifokor sifatida kirish** and assign a plan with two medicines and more than one dose time.
2. Open **Bemor sifatida kirish**, select a dose, and record **Dori tugadi**. Enter a synthetic pressure reading and a manual step count. DoriMos asks for patient confirmation before saving a reading. Manual entry stays available when OCR cannot resolve the box.
3. Return to the doctor queue, review the selected record, and enter a patient-facing reply. The doctor can generate the seven-day draft, inspect the cited records, edit the reply, and approve it. The approved reply is what the patient receives.
4. To try Android, generate a one-time code from the doctor page. In the app, open **Veb-panelga ulash**, enter the preview origin and code, and check **Bugun** and **Javoblar**.
5. To try Telegram, use **Telegramni ulash** from the patient page, then open the bot's **ShifoHalqa** Mini App. Start with the generic notification. Turn on chat details for the synthetic patient to try the time-sorted dose chooser and the three colored actions.

## Exercise and video review

1. Assign **O‘tirib-turish** from the doctor page. From the patient exercise screen, run the prepared clip and confirm the measurement. The cleared chair-stand recording gives two complete repetitions in the demonstrated run.
2. Android and Telegram also offer **Tirsakni bukish** and **O‘tirib oyoqni tekislash**. Choose camera or recorded video. On Android, **Full** is the default and **Heavy** is available for recorded clips. The current prepared knee clip needs a wider source to demonstrate a reliable counted cycle.
3. To demonstrate video sharing, select a cleared file as a synthetic gallery submission. Confirm the measurement and explicitly consent to sharing the full clip. The assigned doctor can open the temporary playback link from the attempt. Exercise measurements and AI observations support the clinician's review.

## Verification

- The deployed Singapore preview passed the medication reply and privacy check, the recorded exercise journey, Android pairing and record visibility, and the unsigned Telegram entry check.
- The refreshed preview passed the desktop checks for caregiver link creation, rotation, revocation and expiry, adherence, accessibility, DoriMos fallback, and the prepared chair-stand and elbow samples. [Verification log](PROGRESS.md)
- The Galaxy S24 Ultra passed eight instrumentation checks and a separate live Android round trip that saved a dose, pressure, and steps and read the doctor's approved seven-day report. [Benchmarks](BENCHMARK.md)
- The dedicated Telegram worker has a healthy HTTPS webhook. Telegram Android verified pairing, opened the signed Mini App, and showed the three scheduled doses. The worker delivered a doctor-approved synthetic reply. The remaining phone checks are deferred to a later session. [Verification log](PROGRESS.md)
- Vercel AI Gateway generated a live supervised report. Deterministic generation and doctor approval also ran successfully. The isolated preview still needs a Cloudflare runtime credential to verify Workers AI as its live fallback. [Milestone status](PLAN.md)

Build the ARM64 demo APK with `./gradlew :app:assembleDebug -PshifoAbi=arm64-v8a` from `android/`. Keep synthetic medication histories and cleared exercise footage in the judge walkthrough.
