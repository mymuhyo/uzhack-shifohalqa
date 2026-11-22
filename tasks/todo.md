# Task List: Task 2 To‘liq Demo Halqasi

Plan: [tasks/plan.md](plan.md) · Spec: [docs/specs/task2-full-demo.md](../docs/specs/task2-full-demo.md)

## Phase 1: Foundation (`steps-and-plan`)

- [x] **Task 1: Qadam maqsadi uchun DB sxema, shifokor rejasi va shifokor ko‘rinishi**
- [x] **Task 2: Qadamlar uchun Mobil API (`POST /api/mobile/v1/steps`) va Web qadam paneli**
- [x] **Task 3: Android qadam sensori (`TYPE_STEP_COUNTER`), demo simulyatsiya va auto-sync**

### Checkpoint: Foundation
- [x] `npm run verify` o‘tdi
- [x] `cd android && ./gradlew :app:testDebugUnitTest :app:assembleDebug` o‘tdi

## Phase 2: Exercise Voice, Skeleton & AI (`exercise-voice-ai`)

- [x] **Task 4: Ichki o‘zbekcha ovoz kliplari + Web skelet va ovozli sanoq**
- [x] **Task 5: Android ovozli sanoq, harakat paytida tezkor maslahat va yakuniy AI murabbiy**

### Checkpoint: Exercise Voice & AI
- [x] Web va Androidda 5 ta mashqda skelet + ichki o‘zbekcha ovoz + AI murabbiy ishlaydi

## Phase 3: DoriMos Real Camera (`dorimos-real-camera`)

- [x] **Task 6: Web va Server DoriMos real kamera/galereya yuklash**
- [x] **Task 7: Mobil API (`POST /api/mobile/v1/dorimos`) va Android real kamera DoriMos**

### Checkpoint: DoriMos Real Camera
- [x] Web va Androidda real kamera rasmi + sintetik namuna DoriMos bilan tekshiriladi

## Phase 4: Telegram Bot Upgrade (`telegram-patient-doctor`)

- [x] **Task 8: Telegram bemor ulanishi, `/holat` va bildirishnoma jadvallari (SQL + Web)**
- [x] **Task 9: Python Telegram bot — `/holat`, inline dori tasdiqlash va ikki tomonlama xabarlar**

### Checkpoint: Telegram Bot
- [x] `pytest services/telegram_bot/tests` va `npm run verify` toza o‘tadi

## Phase 5: UX Polish & Final Verification (`demo-ux-polish`)

- [x] **Task 10: Web/Android demo UX silliqlash, hujjatlar va yakuniy tekshiruv**

### Checkpoint: Complete
- [x] Barcha unit, lint, build, Python va Android tekshiruvlari yakuniy tahrirdan keyin o‘tdi
