# Implementation Plan: Task 2 To‘liq Demo Halqasi

Source spec: [docs/specs/task2-full-demo.md](../docs/specs/task2-full-demo.md)

## Overview
Mavjud Next.js + Neon, Kotlin/Compose Android va Python Telegram bot komponentlarini yagona uzluksiz demo halqasiga birlashtiramiz: shifokor dori/bosim/kunlik qadam/5 mashq rejasini biriktiradi, bemor (asosiy urg‘u Android + qulay veb) qadamni auto-sync, DoriMos’ni real kamera, mashqlarni esa skelet + ichki o‘zbekcha ovoz + jonli/yakuniy AI maslahat bilan bajaradi, Telegram bot esa status, inline dori tasdiqlash va ikki tomonlama xabarlarni yuritadi.

## Architecture Decisions
- **O‘zbekcha ovoz kliplari (Web + Android):** Tizim TTS (`uz-UZ`) ga suyanmasdan `public/audio/uz/` va `android/app/src/main/res/raw/` ichiga kichik o‘zbekcha audio kliplarni joylaymiz; `AudioCoach` avval klipni chaladi, topilmasa signal (`AudioContext` / `ToneGenerator`) ga tushadi.
- **Additive DB schema (`schema.sql`):**
  - `shifohalqa.plans.daily_step_goal` (default `3000`) va `daily_step_counts.source` (`self_report | device_sensor | demo_sim`) hamda `step_goal_alerts` / ko‘rik holati.
  - `shifohalqa.telegram_patient_links` / `telegram_patient_pairings` hamda `telegram_notices` (shifokor red/pain/step ogohlantirishlari va bemorga shifokor javobi bildirishnomalari).
- **DoriMos real kamera:** Mavjud 4 sintetik namuna saqlanadi; `POST /api/demo/dorimos` va yangi `POST /api/mobile/v1/dorimos` real JPEG/PNG (`multipart/form-data`) ni `readMedicationBox` orqali Vercel/OpenCode/Gemini/Cloudflare zanjirida tekshiradi.
- **AI provider zanjiri:** Mavjud `completion-fallback.ts` (`vercel` → `opencode_go` → `gemini`) va `dorimos.ts` (`cloudflare` → `gemini` → `openrouter` → `opencode` → fallback) kontrakti saqlanadi; Android uchun ham AI murabbiy va DoriMos endpointlari bir xil server zanjiridan foydalanadi.

## Dependency Graph & Phases

### Phase 1: Foundation (`steps-and-plan`)
1. **Task 1:** DB sxema (`schema.sql`) + Klinik tiplar va qadam maqsadi (`daily_step_goal`, `device_sensor`/`demo_sim`) + Shifokor formasi va kunlik qadam/bajarilish xabarnomasi.
2. **Task 2:** Mobil API qadam sinxronizatsiyasi (`POST /api/mobile/v1/steps`, `GET /api/mobile/v1/today` da qadam maqsadi + bugungi qadam) + Web bemor qadam ko‘rinishi.
3. **Task 3:** Android qadam sensori (`Sensor.TYPE_STEP_COUNTER` + `ACTIVITY_RECOGNITION`), demo simulyatsiya (`+500 qadam`) va avtomatik serverga sinxronizatsiya.
- **Checkpoint 1:** `npm run verify` + Android `:app:testDebugUnitTest :app:assembleDebug` o‘tadi; shifokor qadam maqsadi belgilaydi, Android/Web auto-sync natijasini shifokor ko‘radi.

### Phase 2: Exercise Voice, Skeleton & AI (`exercise-voice-ai`) — Phase 3 bilan parallel bo‘lishi mumkin
4. **Task 4:** O‘zbekcha ovoz kliplari aktivlarini tayyorlash va Web `audio-coach.ts` + `exercise-client.tsx` (skeletni CDC/yuklangan videoda ham chizish, ovozli sanoqni sukut bo‘yicha yoqish, 5 mashqda ham o‘zbekcha ovoz + jonli maslahat).
5. **Task 5:** Android mashq ovozi (`UzbekAudioCoach` — `res/raw` kliplari + `ToneGenerator` zaxira) va harakat paytida tezkor form/amplituda ovozli maslahati + yakuniy AI murabbiy bog‘lanishi (5 ta mashq hammasi faol).
- **Checkpoint 2:** Veb va Androidda 5 ta mashq skelet + o‘zbekcha ovoz + jonli ko‘rsatma + AI murabbiy bilan ishlaydi.

### Phase 3: DoriMos Real Camera (`dorimos-real-camera`)
6. **Task 6:** Server + Web DoriMos real kamera/fayl yuklash (`POST /api/demo/dorimos` multipart JPEG/PNG + `dorimos-check.tsx` kamera/galereya tugmasi, namuna qutilarni saqlagan holda).
7. **Task 7:** Mobil API `POST /api/mobile/v1/dorimos` + Android DoriMos ekrani (`CameraX` / rasm olish + namuna qutilar + AI o‘qish + tasdiqlash → L2).
- **Checkpoint 3:** Web va Androidda real rasm ham, sintetik namuna ham DoriMos’dan o‘tib shifokor navbatiga tushadi.

### Phase 4: Telegram Bot Upgrade (`telegram-patient-doctor`)
8. **Task 8:** Web + SQL bemor Telegram ulashish kodi, bemor javobi bildirishnomasi navbati va `/holat` ma’lumotlari (`telegram-store.ts`, `schema.sql`).
9. **Task 9:** Python Telegram bot (`app.py`, `store.py`, `worker.py`, `tests/`) — bemor/shifokor ulanishi, `/holat` (dori, bosim, qadam vs maqsad, mashq), inline «Ichdim» / «Icha olmadim» tugmalari, ikki tomonlama xabarnomalar.
- **Checkpoint 4:** `pytest services/telegram_bot/tests` va `npm run verify` toza o‘tadi.

### Phase 5: UX Polish & End-to-End Verification (`demo-ux-polish`)
10. **Task 10:** Veb bemor/shifokor UX qulaylashtirish (bir sahifada tezkor navigatsiya, AI/ovoz holati aniq ko‘rinishi, Android bilan tez ulash), `docs/INTERFACES.md` + `tasks/task-2/` hujjatlarini moslash va to‘liq regressiya tekshiruvi.
- **Checkpoint 5 (Final):** `npm run verify`, `pytest`, Android `:app:testDebugUnitTest :app:lintDebug :app:assembleDebug` va lokal DB/Playwright E2E tekshiruvi.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|---|---|---|
| Production Neon DB sxemasi lokal `schema.sql` dan orqada qolishi | High | Barcha SQL o‘zgarishlarini `ADD COLUMN IF NOT EXISTS` bilan additive qilish; prod DBga qo‘llashdan oldin egasi ruxsatini olish va test Neon branchda sinash |
| Real telefonda `ACTIVITY_RECOGNITION` yoki `uz-UZ` TTS yo‘qligi | High | Bundled audio kliplar (`res/raw` + `public/audio/uz/`) + sensor ruxsati berilmasa/emulatorda aniq demo simulyatsiya (`+500 qadam`) tugmasi |
| Real kamera DoriMos rasmlari katta (>6 MB) bo‘lishi | Med | Client tomonda (Web canvas / Android Bitmap) rasmni ≤1280px JPEG ga siqib yuborish |
| Mavjud E2E/unit testlar sinishi | High | Sintetik namuna oqimlarini (CDC klipi, 4 ta namuna quti, shifokor default shakli) saqlash va har bosqichdan keyin test yugurtirish |
