# Texnik spetsifikatsiya: Task 2 To‘liq Demo Halqasi

Manba maqsad: [docs/intent/task2-full-demo.md](../intent/task2-full-demo.md)

## 1. Capability Map (Modullar xaritasi)

| Module ID | Mas’uliyat | Bog‘liqlik |
|---|---|---|
| `steps-and-plan` | Shifokor kunlik qadam maqsadi, `daily_step_counts` manba/auto-sync, `/api/mobile/v1/steps`, Android `TYPE_STEP_COUNTER` + simulyatsiya + auto-sync, shifokor ko‘rigi/xabarnomasi | — |
| `exercise-voice-ai` | Barcha 5 mashq uchun skelet overlay (jonli + namuna/video), ilova ichidagi o‘zbekcha ovoz kliplari (`public/audio/uz/` + `res/raw/`), harakat paytida tezkor maslahat va AI murabbiy (Vercel → OpenCode → Gemini → Cloudflare) | — |
| `dorimos-real-camera` | Mavjud 4 namuna qutini saqlagan holda real kamera/galereya JPEG/PNG yuklash (`POST /api/demo/dorimos` + `POST /api/mobile/v1/dorimos`), Web va Android DoriMos ekrani | — |
| `telegram-patient-doctor` | Bemor va shifokor Telegram ulanishi, `/holat` kunlik hisobot (dori, bosim, qadam, mashq), inline «Ichdim» / «Icha olmadim» tugmalari, ikki tomonlama bildirishnomalar (shifokorga qizil/og‘riq/qadam, bemorga shifokor javobi) | `steps-and-plan` |
| `demo-ux-polish` | Veb bemor/shifokor navigatsiya qulayligi, Android asosiy bemor ekranlari bilan sinxronlik, `docs/INTERFACES.md` va demo walkthrough yangilanishi | `steps-and-plan`, `exercise-voice-ai`, `dorimos-real-camera`, `telegram-patient-doctor` |

**Qurilish tartibi:** `steps-and-plan` → (`exercise-voice-ai`, `dorimos-real-camera`) parallel → `telegram-patient-doctor` → `demo-ux-polish`.

---

## 2. Maqsad va Arxitektura (Objective & Architecture)

Demo tizimi 3 ta kirish nuqtasini bitta `workspace_id` ostida bog‘laydi:
1. **Veb-ilova (`src/`)**: Shifokor boshqaruv paneli (dori, bosim, kunlik qadam maqsadi, 5 ta mashq, murojaatlar navbati, javob yozish) hamda qulaylashtirilgan zaxira bemor ko‘rinishi.
2. **Android ilova (`android/`)**: Asosiy bemor tajribasi — kunlik qadam sensori (`TYPE_STEP_COUNTER`) + demo simulyatsiya va auto-sync, dori/bosim, real kamera + namuna DoriMos, 5 ta mashq (MediaPipe Full/Heavy, skelet overlay, ichki o‘zbekcha ovoz kliplari, harakat paytidagi ko‘rsatma + AI murabbiy).
3. **Telegram bot (`services/telegram_bot/`)**: Shifokor va bemor chatini ulash, `/holat`, inline dori tasdiqlash, va `worker.py` orqali ikki tomonlama xabarnomalar.

### Muhim texnik qarorlar
- **O‘zbekcha ovoz (`uz-UZ` tizim TTS’siz):** `speechSynthesis` (Web) va `TextToSpeech` (Android) da `uz-UZ` ovozi ko‘p qurilmalarda mavjud emas. Shuning uchun qisqa o‘zbekcha audio kliplar (`1..20`, `ready`, `deeper`, `trunk_lean`, `elbow_drift`, `shoulder_tilt`, `lost`, `done`) bir marta generatsiya qilinib `public/audio/uz/` va `android/app/src/main/res/raw/` ga joylanadi. Ikkala platforma avval shu ichki kliplarni ijro etadi (0 tarmoq kechikishi), zaxira sifatida `AudioContext`/`ToneGenerator` signalini chaladi.
- **Qadamlar manbasi va auto-sync:** `shifohalqa.plans` ga `daily_step_goal integer` (default `3000`, `100..50000`) qo‘shiladi. `shifohalqa.daily_step_counts` da `source` (`'self_report' | 'device_sensor' | 'demo_sim'`) va `ai_mode` kengaytiriladi (additive migratsiya). Android `Sensor.TYPE_STEP_COUNTER` (yoki `ACTIVITY_RECOGNITION` rad etilsa / emulatorda demo `+500 qadam` tugmasi) o‘qigan qiymatni Room/SharedPreferences ga yozadi va `POST /api/mobile/v1/steps` orqali avtomatik sinxronlaydi (debounce + WorkManager/ilova ochilganda).
- **AI zanjiri:** Mavjud [completion-fallback.ts](file:///home/muhyo/Projects/uzhack/src/lib/ai/completion-fallback.ts) va [dorimos.ts](file:///home/muhyo/Projects/uzhack/src/lib/ai/dorimos.ts) dagi Vercel AI Gateway → OpenCode / OpenCode Go → Gemini → Cloudflare tartibi saqlanadi. Harakat paytidagi maslahat 0-kechikish uchun deterministik biomexanik qoidalardan chiqadi; mashq yakunida esa server AI murabbiy shaxsiy tavsiya qaytaradi.
- **DoriMos real kamera:** `POST /api/demo/dorimos` ham JSON (`sampleId`), ham `multipart/form-data` (`image` JPEG/PNG ≤ 6 MB) qabul qiladi. `POST /api/mobile/v1/dorimos` Android uchun Bearer token bilan xuddi shu `readMedicationBox` + `issueBoxConfirmation` + `saveDorimosEvidence` oqimini beradi.

---

## 3. Buyruqlar va Tekshiruv (Commands & Testing Strategy)

- **Web tekshiruvi:** `npm run verify` (`next typegen && tsc --noEmit && eslint . && vitest run tests/unit && next build`)
- **Web E2E (DB bilan):** `SHIFO_E2E_DATABASE_URL=<non-prod-neon> npm run e2e` (bazasiz: `npm run e2e`)
- **Telegram bot:** `uv run --project services/telegram_bot --locked pytest services/telegram_bot/tests`
- **Android unit + lint + APK:** `cd android && ./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug`
- **Android qurilma/emulator UI test (ulangan qurilma bo‘lsa):** `cd android && ./gradlew :app:connectedDebugAndroidTest`

---

## 4. Loyiha tuzilmasi va Kod uslubi

- `schema.sql` — idempotent `CREATE TABLE IF NOT EXISTS` va `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / constraint yangilanishlari.
- `src/lib/` — Zod sxemalar bilan kirish/chiqish validatsiyasi, `Asia/Tashkent` sanasi, `workspace_id` bo‘yicha izolyatsiya.
- `src/app/api/mobile/v1/` — Bearer token (`androidPatient(request)`), `mobileJson(..., status)` va `no-store`.
- `android/app/src/main/java/uz/shifohalqa/android/` — Compose ekranlar, `MobileApi` HTTP chaqiruvlar, Room/WorkManager offline kesh.
- `services/telegram_bot/shifo_telegram/` — `aiohttp` + `aiogram` + `asyncpg` + idempotent `update_id` qayta ishlash.

---

## 5. Chegaralar (Boundaries)

- **Always:** Zod/Pydantic/Kotlin model validatsiyasini saqlash; barcha SQL so‘rovlarni `workspace_id` bilan cheklash; ichki shifokor izohini (`doctor_note`) bemor/Telegram/Android/Yaqinim javoblariga chiqarmaslik; barcha 5 mashqni saqlash.
- **Ask first:** Production Neon bazaga `schema.sql` qo‘llash; `origin/main` ga push qilish va Vercel/Railway relizini chiqarish.
- **Never:** `.env.local` yoki API kalitlarini Git’ga qo‘shish; `git push --force` / `git reset --hard`; mavjud E2E/unit testlarni o‘chirish yoki `@ts-ignore` qo‘yish.

---

## 6. Muvaffaqiyat mezonlari (Success Criteria)

1. Shifokor vebda dori, bosim, kunlik qadam maqsadi (masalan 3000) va 5 ta mashqdan istaganini yuklaydi; bemorning bajarilgan/bajarilmagan holatini ko‘radi.
2. Android ilovasida: qadam sensori + `+500` simulyatsiya ishlaydi va serverga avtomatik sinxronlanadi; DoriMos real kamera/galereya + namuna qutini o‘qib `L2` saqlaydi; 5 ta mashqda jonli skelet, o‘zbekcha ovozli sanoq (`uz-UZ` TTS’siz ham), harakat paytidagi ogohlantirish va yakuniy AI murabbiy ishlaydi.
3. Veb bemor sahifasida ham 5 ta mashq (skelet jonli va namuna videoda + o‘zbekcha ovozli sanoq), qadam/reja holati va real kamera DoriMos qulay ishlaydi.
4. Telegram botda `/start` (shifokor yoki bemor ulash), `/holat`, inline «Ichdim» / «Icha olmadim» va ikki tomonlama bildirishnomalar ishlaydi.
5. `npm run verify`, `pytest` va Android `:app:testDebugUnitTest :app:lintDebug :app:assembleDebug` toza o‘tadi.

---

## 7. Ochiq qarorlar (Open Questions)

1. O‘zbekcha ovoz kliplarini (`.mp3` / `.wav` / `.ogg`) qanday generatsiya qilamiz: mavjud Gemini TTS / `edge-tts` orqali tabiiy o‘zbekcha (yoki aniq fonetik) kliplar yaratib repoga qo‘shamizmi? (Buni amalga oshirishda avval muhitdagi vositalarni tekshiramiz.)
2. Android ilovani haqiqiy ulangan telefonda (`adb devices`) sinab ko‘ramizmi yoki hozircha emulator/APK build bilan tekshiramizmi?
