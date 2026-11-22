# ShifoHalqa · UzHack Task 2 submission draft

## MVP link and demo access

https://shifohalqa.vercel.app/

Open the link in a private browser window. The demo uses synthetic patient and doctor profiles. Select **Shifokor sifatida kirish** for the doctor role or **Bemor sifatida kirish** for the patient role. Both roles in the same browser share a demo workspace. For a fresh workspace, disable any active **Yaqinim** share in the patient role, then select **Demo haqida → Yangi demo ish joyini boshlash**.

## Rehabilitation walkthrough for the next verified release

As the doctor, assign the chair-stand exercise. In the same browser, switch to the patient and open **O‘tirib-turish mashqi**. Run the public CDC sample, confirm the result and save it. Use **Og‘riq bor** for the synthetic pain scenario. Switch back to the doctor, open that pain report and write a reply. The patient sees the reply on the exercise page. Verify these steps on the submission URL after the owner approves the release.

## What works

1. As the doctor, check that the **Dori tugadi** notification is enabled in the sample plan and select **Rejani biriktirish**.
2. Return to the home page and open the patient role in the same browser (or pair the Android app via the one-time code on the doctor page). Select **Icha olmadim → Dori tugadi → Sababni yuborish**, or scan a medication box (real camera photo or synthetic sample) in **DoriMos**.
3. Switch back to the doctor role. Open **Dori tugadi → Ko‘rib chiqish**, write a reply under **Bemorga javob**, and select **Qaydni tasdiqlash**.
4. Return to the patient role (or Android / Telegram `/holat`). The reply and the reviewed evidence level, L4, appear on that medication report. L4 records the doctor's approval of this report. The patient's clinical outcome is unknown.

Select **Mashq demosini ochish → CDC namunasini sinash** on the home page to try chair-stand measurement without signing in or granting camera access. MediaPipe shows the skeleton overlay, repetitions, knee angles, and bundled Uzbek voice counting. Select **AI murabbiydan batafsil maslahat olish** or **Namunani OpenRouter bilan tahlil qilish** to compare AI observations with the CV result. In the patient workflow, all five rehabilitation movements are available, daily steps sync automatically from Android (`TYPE_STEP_COUNTER` or demo simulation) against the doctor's daily step goal, and the Telegram bot provides `/holat`, inline medication confirmation, and two-way notifications.

## What is simulated

The accounts, care plans and sample DoriMos package images use synthetic examples. The CDC exercise video is prerecorded. Saved reports and replies persist in a separate demo workspace for each browser session. DoriMos supports both real camera/gallery images and supplied synthetic examples; a blurred image prompts a retry, and a mismatched box can be reviewed against the sample plan. Android step tracking uses the device `TYPE_STEP_COUNTER` sensor alongside an indoor demo `+500` simulation button. This demo is designed for synthetic data only.

## AI use

We used Codex to implement, review and test the software. MediaPipe Pose measures movement in the browser. OpenRouter observes the bundled public chair-stand sample or its nine-frame contact sheet. Camera frames and personal videos stay on the device. When configured, Cloudflare Clef checks synthetic package image quality and Clairic Flash extracts the label, with Gemini Decisions and OpenRouter as the fallback. Deterministic application rules compare the confirmed result with the plan and place exceptions in the review queue. The doctor decides how to respond to the selected record.
