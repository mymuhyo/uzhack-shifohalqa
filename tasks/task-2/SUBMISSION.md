# ShifoHalqa · UzHack Task 2 submission draft

## MVP link and demo access

https://shifohalqa.vercel.app/

Open the link in a private browser window. The demo uses synthetic patient and doctor profiles. Select **Shifokor sifatida kirish** for the doctor role or **Bemor sifatida kirish** for the patient role. Both roles in the same browser share a demo workspace. Use **Demo haqida → Yangi demo ish joyini boshlash** for a fresh workspace.

## What works

1. As the doctor, enable the **Dori tugadi** notification in the sample plan and select **Rejani biriktirish**.
2. Return to the home page and open the patient role in the same browser. Select **Icha olmadim → Dori tugadi → Sababni yuborish** to report that the medication ran out.
3. Switch back to the doctor role. Open **Dori tugadi → Ko‘rib chiqish**, write a reply under **Bemorga javob**, and select **Qaydni tasdiqlash**.
4. Return to the patient role. The reply and the reviewed evidence level, L4, appear on that medication report.

The demo also includes manual blood pressure and step entries, daily and weekly plan progress, the revocable **Yaqinim** daily summary link, and a chair-stand exercise. For a camera-free exercise demo, assign **Mashqni biriktirish** as the doctor, then select **O‘tirib-turish mashqi → CDC namunasini sinash** as the patient. The public sample has two complete repetitions. A confirmed sample is labeled L2. MediaPipe processes the video in the browser.

## What is simulated

The accounts, care plans and DoriMos package images use synthetic examples. DoriMos runs on the supplied images. A blurred image prompts a retry, and the 10 mg example can be reviewed against the sample 5 mg plan. The submission uses the browser app. Native Android and the Telegram service are optional project additions. This demo is designed for synthetic data only.

## AI use

We used Codex to implement, review and test the software. MediaPipe Pose measures movement in the browser. Gemini Decisions checks image and text quality, and Gemini Interactions extracts the name and strength from synthetic medication packages. Deterministic application rules compare the confirmed result with the plan and place exceptions in the review queue. The doctor decides how to respond to the selected record.
